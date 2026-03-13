import { useState } from 'react';
import { useNavigate } from 'react-router';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '@/services/firebase';
import { EasyCallButton } from './EasyCallButton';
import { EasyCallText } from './EasyCallText';

export function RoleSelector() {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectRole = async (role: 'elderly' | 'caregiver') => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setError('Not signed in. Please try again.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'users', uid),
        { role, onboardingComplete: false },
        { merge: true }
      );
      void navigate(role === 'elderly' ? '/elderly' : '/caregiver');
    } catch (err) {
      setError(`Failed to save role: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center gap-8 p-8">
      <EasyCallText as="h1" variant="heading" className="text-center">
        Who are you?
      </EasyCallText>
      {error && (
        <div role="alert" className="alert alert-error w-full max-w-sm">
          <EasyCallText as="span" variant="body">{error}</EasyCallText>
        </div>
      )}
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <EasyCallButton
          size="default"
          variant="primary"
          onClick={() => { void handleSelectRole('elderly'); }}
          disabled={isSaving}
          aria-label="I am an elderly user"
        >
          I am an elderly user
        </EasyCallButton>
        <EasyCallButton
          size="default"
          variant="secondary"
          onClick={() => { void handleSelectRole('caregiver'); }}
          disabled={isSaving}
          aria-label="I am a family caregiver"
        >
          I am a family caregiver
        </EasyCallButton>
      </div>
    </div>
  );
}
