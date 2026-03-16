import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { auth } from '@/services/firebase';
import { EasyCallText } from '@/components/shared/EasyCallText';

const DISMISS_KEY = 'easycall_account_banner_dismissed';

function isLinked(): boolean {
  return (
    auth.currentUser?.providerData.some((p) => p.providerId === 'password') ?? false
  );
}

export function AccountBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === 'true',
  );

  if (isLinked() || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="alert alert-info w-full flex items-center justify-between gap-3">
      <EasyCallText as="span" variant="body" className="flex-1">
        {t('accountBanner.message')}
      </EasyCallText>
      <div className="flex gap-2">
        <Link
          to="/caregiver/account"
          className="btn btn-primary btn-sm min-h-10 font-bold text-[length:var(--text-body)]"
        >
          {t('accountBanner.setupEmail')}
        </Link>
        <button
          type="button"
          className="btn btn-ghost btn-sm min-h-10"
          onClick={handleDismiss}
          aria-label={t('accountBanner.dismiss')}
        >
          {t('accountBanner.dismiss')}
        </button>
      </div>
    </div>
  );
}
