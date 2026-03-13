import { useEffect, useState, type ReactNode } from 'react';
import { Outlet, Navigate } from 'react-router';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
          setAuthState('loading'); // will re-trigger on next auth change
        } catch {
          setAuthState('no-role');
        }
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const data = userDoc.exists() ? userDoc.data() : undefined;
        const role = data?.['role'] as string | undefined;

        if (!role) {
          setAuthState('no-role');
        } else if (role === requiredRole) {
          setAuthState('correct-role');
        } else {
          setAuthState('wrong-role');
        }
      } catch {
        setAuthState('no-role');
      }
    });

    return unsubscribe;
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
