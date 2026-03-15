import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { LanguageSelector } from '@/components/shared/LanguageSelector';
import type { UserSettings } from '@/types/user';

interface SettingsScreenProps {
  settings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
  userId: string;
}

export function SettingsScreen({ settings, onSettingsChange }: SettingsScreenProps) {
  const { t } = useTranslation();
  const fontLabelId = 'font-size-label';

  return (
    <div className="min-h-screen bg-base-100 p-6 flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link
          to="/elderly"
          className="btn btn-ghost touch-target-min min-h-14 min-w-14 font-bold text-[length:var(--text-button)]"
          aria-label={t('common.back')}
        >
          ← {t('common.back')}
        </Link>
        <EasyCallText as="h1" variant="heading">
          {t('settings.title')}
        </EasyCallText>
      </div>

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
              onChange={() => onSettingsChange({ ...settings, fontSize: 'large' })}
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
              onChange={() => onSettingsChange({ ...settings, fontSize: 'x-large' })}
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
        onChange={(language) => onSettingsChange({ ...settings, language })}
      />

      <section data-testid="pairing-code-section">
        <EasyCallText as="h2" variant="button" className="font-bold mb-2">
          {t('settings.pairingCode')}
        </EasyCallText>
        <EasyCallText variant="body" className="text-base-content/60">
          {t('common.loading')}
        </EasyCallText>
      </section>

      <div className="mt-auto">
        <Link
          to="/elderly/add-contact"
          className="btn btn-primary min-h-14 w-full font-bold text-[length:var(--text-button)]"
          aria-label={t('settings.addContact')}
        >
          {t('settings.addContact')}
        </Link>
      </div>
    </div>
  );
}
