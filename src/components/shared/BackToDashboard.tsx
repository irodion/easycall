import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/shared/Icon';

export function BackToDashboard() {
  const { t } = useTranslation();
  return (
    <Link
      to="/caregiver"
      className="btn btn-ghost touch-target-min min-h-14 self-start text-[length:var(--text-button)]"
    >
      <Icon name="arrow-left" size={20} className="rtl:scale-x-[-1]" />
      {t('dashboard.backToDashboard')}
    </Link>
  );
}
