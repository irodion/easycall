import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

export function BackToDashboard() {
  const { t } = useTranslation();
  return (
    <Link
      to="/caregiver"
      className="btn btn-ghost touch-target-min min-h-14 self-start text-[length:var(--text-button)]"
    >
      &larr; {t('dashboard.backToDashboard')}
    </Link>
  );
}
