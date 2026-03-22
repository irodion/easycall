import { useEffect, useState, type ReactNode } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';
import { useCaregiverPin } from '@/hooks/useCaregiverPin';
import { CaregiverPinPrompt } from './CaregiverPinPrompt';
import { RoleSelector } from './RoleSelector';
import { OnboardingFlow } from './OnboardingFlow';
import { SetNameScreen } from '@/components/elderly/SetNameScreen';

interface AuthGuardProps {
  requiredRole: 'elderly' | 'caregiver';
  children?: ReactNode;
}

type AuthState =
  | 'loading'
  | 'no-role'
  | 'onboarding'
  | 'needs-name'
  | 'correct-role'
  | 'wrong-role';

export function AuthGuard({ requiredRole, children }: AuthGuardProps) {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [user, setUser] = useState<{ uid: string; role: 'elderly' | 'caregiver' } | null>(null);
  const location = useLocation();

  useEffect(() => {
    let unsubDoc: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous Firestore listener when auth state changes
      unsubDoc?.();
      unsubDoc = undefined;

      if (!firebaseUser) {
        try {
          await signInAnonymously(auth);
          setAuthState('loading'); // will re-trigger on next auth change
        } catch {
          setAuthState('no-role');
        }
        return;
      }

      // Listen reactively so role changes (e.g. from RoleSelector) are picked up
      unsubDoc = onSnapshot(
        doc(db, 'users', firebaseUser.uid),
        (snap) => {
          const data = snap.data();
          const role = data?.['role'];
          // Only accept known roles; malformed values fall through to no-role
          if (role !== 'elderly' && role !== 'caregiver') {
            setAuthState('no-role');
            setUser(null);
          } else if (role === requiredRole) {
            const onboardingComplete = data?.['onboardingComplete'] === true;
            if (!onboardingComplete) {
              setUser({ uid: firebaseUser.uid, role });
              setAuthState('onboarding');
            } else if (role === 'elderly') {
              const displayName = data?.['displayName'];
              if (typeof displayName !== 'string' || displayName.trim() === '') {
                setUser({ uid: firebaseUser.uid, role });
                setAuthState('needs-name');
              } else {
                setAuthState('correct-role');
                setUser(null);
              }
            } else {
              setAuthState('correct-role');
              setUser(null);
            }
          } else {
            setAuthState('wrong-role');
            setUser(null);
          }
        },
        () => {
          setAuthState('no-role');
        },
      );
    });

    return () => {
      unsubAuth();
      unsubDoc?.();
    };
  }, [requiredRole]);

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <div role="status" aria-label="Loading">
          <span className="loading loading-spinner loading-lg text-primary" />
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  if (authState === 'no-role') {
    return <RoleSelector />;
  }

  if (authState === 'onboarding' && user) {
    // No onComplete callback — onSnapshot reactively handles the transition
    // when OnboardingFlow writes onboardingComplete: true to Firestore.
    // Previously, onComplete set correct-role directly, racing with onSnapshot
    // and skipping the needs-name check for elderly users.
    return <OnboardingFlow user={user} />;
  }

  if (authState === 'needs-name' && user) {
    // Let call routes through — don't block incoming/rejoining calls for
    // migrated users who haven't set their name yet.
    const isCallRoute =
      location.pathname.startsWith('/call/') || location.pathname.startsWith('/call-room/');
    if (!isCallRoute) {
      return (
        <SetNameScreen
          userId={user.uid}
          onComplete={() => {
            setAuthState('correct-role');
            setUser(null);
          }}
        />
      );
    }
  }

  if (authState === 'wrong-role') {
    const redirectPath = requiredRole === 'elderly' ? '/caregiver' : '/elderly';
    return <Navigate to={redirectPath} replace />;
  }

  // correct-role: for admin routes, enforce PIN if configured
  if (requiredRole === 'caregiver') {
    return <CaregiverPinGate>{children ? <>{children}</> : <Outlet />}</CaregiverPinGate>;
  }

  return children ? <>{children}</> : <Outlet />;
}

function CaregiverPinGate({ children }: { children: ReactNode }) {
  const caregiverPin = useCaregiverPin();

  if (caregiverPin.loading) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <div role="status" aria-label="Loading">
          <span className="loading loading-spinner loading-lg text-primary" />
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  if (caregiverPin.pinRequired && !caregiverPin.verified) {
    return (
      <CaregiverPinPrompt
        caregiverPin={caregiverPin}
        onVerified={() => {
          // PIN not needed here — verified state is managed by the hook
        }}
      />
    );
  }

  return <>{children}</>;
}
