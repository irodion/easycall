import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { auth, db } from '@/services/firebase';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';

interface SetNameScreenProps {
  userId: string;
  onComplete: () => void;
}

export function SetNameScreen({ userId, onComplete }: SetNameScreenProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', userId), {
        displayName: trimmed,
        lastDisplayNameChange: serverTimestamp(),
      });
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: trimmed });
      }
      onComplete();
    } catch {
      setError(t('setName.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-base-200/30 to-base-100 flex flex-col items-center justify-center p-[var(--space-md)] gap-[var(--space-lg)]">
      <div className="flex flex-col items-center gap-[var(--space-md)] text-center max-w-md w-full">
        <EasyCallText as="h1" variant="heading">
          {t('setName.title')}
        </EasyCallText>
        <EasyCallText as="p" variant="body">
          {t('setName.description')}
        </EasyCallText>

        <div className="w-full max-w-xs flex flex-col gap-[var(--space-sm)]">
          <label htmlFor="set-name-input" className="sr-only">
            {t('setName.nameLabel')}
          </label>
          <input
            id="set-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('setName.namePlaceholder')}
            className="input input-bordered w-full text-[length:var(--text-body)] min-h-14"
            autoFocus
          />

          {error && (
            <p role="alert" className="text-error text-[length:var(--text-body)]">
              {error}
            </p>
          )}

          <EasyCallButton
            size="large"
            disabled={!name.trim() || isSubmitting}
            onClick={() => void handleSubmit()}
            className="w-full"
          >
            {isSubmitting ? t('setName.saving') : t('setName.save')}
          </EasyCallButton>
        </div>
      </div>
    </div>
  );
}
