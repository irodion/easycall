import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { doc, setDoc } from 'firebase/firestore';
import { db, ensureAuthenticated } from '@/services/firebase';
import { EasyCallButton } from './EasyCallButton';
import { EasyCallText } from './EasyCallText';

export function RoleSelector() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectRole = async (role: 'elderly' | 'caregiver') => {
    setIsSaving(true);
    setError(null);
    try {
      const user = await ensureAuthenticated();
      await setDoc(
        doc(db, 'users', user.uid),
        { role, onboardingComplete: false },
        { merge: true },
      );
      void navigate(role === 'elderly' ? '/elderly' : '/caregiver');
    } catch {
      setError(t('common.somethingWentWrong'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center gap-8 p-8">
      <EasyCallText as="h1" variant="heading" className="text-center">
        {t('roleSelector.whoAreYou')}
      </EasyCallText>
      {error && (
        <div role="alert" className="alert alert-error w-full max-w-sm">
          <EasyCallText as="span" variant="body">
            {error}
          </EasyCallText>
        </div>
      )}
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <EasyCallButton
          size="default"
          variant="primary"
          onClick={() => {
            void handleSelectRole('elderly');
          }}
          disabled={isSaving}
          aria-label={t('roleSelector.elderlyUser')}
        >
          {t('roleSelector.elderlyUser')}
        </EasyCallButton>
        <EasyCallButton
          size="default"
          variant="secondary"
          onClick={() => {
            void handleSelectRole('caregiver');
          }}
          disabled={isSaving}
          aria-label={t('roleSelector.caregiver')}
        >
          {t('roleSelector.caregiver')}
        </EasyCallButton>
      </div>
    </div>
  );
}
