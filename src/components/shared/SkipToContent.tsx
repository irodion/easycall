import { useTranslation } from 'react-i18next';

export function SkipToContent() {
  const { t } = useTranslation();

  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:p-4 focus:bg-base-100 focus:text-base-content focus:rounded-lg focus:shadow-lg"
    >
      {t('skipToContent')}
    </a>
  );
}
