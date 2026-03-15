import { useTranslation } from 'react-i18next';
import { EasyCallText } from './EasyCallText';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import type { SupportedLanguage } from '@/i18n';

interface LanguageSelectorProps {
  value: SupportedLanguage;
  onChange: (language: SupportedLanguage) => void;
  name?: string;
}

export function LanguageSelector({ value, onChange, name = 'language' }: LanguageSelectorProps) {
  const { t } = useTranslation();
  const labelId = `${name}-label`;

  return (
    <section>
      <EasyCallText as="h2" variant="button" className="font-bold mb-3" id={labelId}>
        {t('settings.language')}
      </EasyCallText>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col gap-3">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <label
            key={lang.code}
            htmlFor={`${name}-${lang.code}`}
            className="flex items-center gap-3 cursor-pointer min-h-14 min-w-14"
          >
            <input
              id={`${name}-${lang.code}`}
              type="radio"
              name={name}
              value={lang.code}
              checked={value === lang.code}
              onChange={() => onChange(lang.code)}
              className="radio radio-primary"
            />
            <EasyCallText as="span" variant="body">
              {lang.name}
            </EasyCallText>
          </label>
        ))}
      </div>
    </section>
  );
}
