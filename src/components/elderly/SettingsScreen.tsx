import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { Icon } from '@/components/shared/Icon';
import { LanguageSelector } from '@/components/shared/LanguageSelector';
import { PairingCodeDisplay } from '@/components/shared/PairingCodeDisplay';
import type { UserSettings } from '@/types/user';

interface SettingsScreenProps {
  settings: UserSettings;
  userId: string;
}

export function SettingsScreen({ settings, userId }: SettingsScreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fontLabelId = 'font-size-label';
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveSettings = async (partial: Partial<UserSettings>) => {
    setSaveError(null);
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(partial)) {
      payload[`settings.${key}`] = value;
    }
    try {
      await updateDoc(doc(db, 'users', userId), payload);
    } catch {
      setSaveError(t('settings.saveError'));
    }
  };

  const handleReviewSetup = async () => {
    try {
      await updateDoc(doc(db, 'users', userId), { onboardingComplete: false });
      // Navigate to trigger AuthGuard to show onboarding
      void navigate('/elderly');
      // Reload so AuthGuard re-evaluates onboardingComplete
      window.location.reload();
    } catch {
      setSaveError(t('settings.saveError'));
    }
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-base-200/30 to-base-100 p-6 flex flex-col gap-6"
      style={{ paddingBottom: 'max(1.5rem, var(--safe-bottom, 0px))' }}
    >
      <EasyCallText as="h1" variant="heading">
        {t('settings.title')}
      </EasyCallText>

      {saveError && (
        <div role="alert" className="alert alert-error">
          <EasyCallText as="span" variant="body">
            {saveError}
          </EasyCallText>
        </div>
      )}

      <section>
        <EasyCallText as="h2" variant="button" className="font-bold mb-3" id={fontLabelId}>
          {t('settings.textSize')}
        </EasyCallText>
        <div role="radiogroup" aria-labelledby={fontLabelId} className="flex flex-col gap-3">
          <label
            htmlFor="font-large"
            className="flex items-center gap-3 cursor-pointer min-h-14 min-w-14"
          >
            <input
              id="font-large"
              type="radio"
              name="fontSize"
              value="large"
              checked={settings.fontSize === 'large'}
              onChange={() => void saveSettings({ fontSize: 'large' })}
              className="radio radio-primary"
            />
            <EasyCallText as="span" variant="body">
              {t('settings.large')}
            </EasyCallText>
          </label>
          <label
            htmlFor="font-xlarge"
            className="flex items-center gap-3 cursor-pointer min-h-14 min-w-14"
          >
            <input
              id="font-xlarge"
              type="radio"
              name="fontSize"
              value="x-large"
              checked={settings.fontSize === 'x-large'}
              onChange={() => void saveSettings({ fontSize: 'x-large' })}
              className="radio radio-primary"
            />
            <EasyCallText as="span" variant="body">
              {t('settings.extraLarge')}
            </EasyCallText>
          </label>
        </div>
      </section>

      <LanguageSelector
        value={settings.language}
        onChange={(language) => void saveSettings({ language })}
      />

      <section data-testid="pairing-code-section">
        <EasyCallText as="h2" variant="button" className="font-bold mb-2">
          {t('settings.pairingCode')}
        </EasyCallText>
        <PairingCodeDisplay userId={userId} />
      </section>

      {/* Bottom actions — pushed down via mt-auto */}
      <div className="mt-auto flex flex-col gap-3">
        <Link
          to="/elderly/add-contact"
          className="btn btn-primary min-h-14 w-full font-bold text-[length:var(--text-button)]"
          aria-label={t('settings.addContact')}
        >
          {t('settings.addContact')}
        </Link>

        <button
          type="button"
          onClick={() => void handleReviewSetup()}
          className="btn bg-base-200 hover:bg-base-300 min-h-14 w-full font-bold text-[length:var(--text-body)]"
        >
          {t('settings.reviewSetup')}
        </button>

        <Link
          to="/elderly"
          className="min-h-14 min-w-14 px-5 py-3 bg-base-200 text-base-content font-bold text-[length:var(--text-body)] rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2"
          aria-label={t('common.back')}
        >
          <Icon name="arrow-left" size={22} /> {t('common.back')}
        </Link>
      </div>
    </div>
  );
}
