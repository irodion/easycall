import { useEffect, useState, type ReactNode } from 'react';
import { Outlet, Navigate } from 'react-router';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';
import { RoleSelector } from './RoleSelector';

interface AuthGuardProps {
  requiredRole: 'elderly' | 'caregiver';
  children?: ReactNode;
}

type AuthState = 'loading' | 'no-role' | 'correct-role' | 'wrong-role';

export function AuthGuard({ requiredRole, children }: AuthGuardProps) {
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    let unsubDoc: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      // Clean up previous Firestore listener when auth state changes
      unsubDoc?.();
      unsubDoc = undefined;

      if (!user) {
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
        doc(db, 'users', user.uid),
        (snap) => {
          const role = snap.data()?.['role'];
          // Only accept known roles; malformed values fall through to no-role
          if (role !== 'elderly' && role !== 'caregiver') {
            setAuthState('no-role');
          } else if (role === requiredRole) {
            setAuthState('correct-role');
          } else {
            setAuthState('wrong-role');
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

  if (authState === 'wrong-role') {
    const redirectPath = requiredRole === 'elderly' ? '/caregiver' : '/elderly';
    return <Navigate to={redirectPath} replace />;
  }

  // correct-role: render children or Outlet
  return children ? <>{children}</> : <Outlet />;
}
