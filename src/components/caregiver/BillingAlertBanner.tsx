import { useTranslation } from 'react-i18next';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { useBillingAlert, type BillingSeverity } from '@/hooks/useBillingAlert';

const alertClasses: Record<BillingSeverity, string> = {
  warning: 'alert alert-warning',
  error: 'alert alert-error',
  critical: 'alert alert-error',
};

export function BillingAlertBanner() {
  const { t } = useTranslation();
  const { alert, dismissed, dismiss } = useBillingAlert();

  if (!alert || dismissed) return null;

  return (
    <div
      className={`${alertClasses[alert.severity]} w-full flex items-center justify-between gap-3`}
      role="alert"
    >
      <EasyCallText as="span" variant="body" className="flex-1">
        {t(`billingAlert.${alert.severity}`, {
          cost: alert.costAmount.toFixed(2),
          budget: alert.budgetAmount.toFixed(2),
          currency: alert.currencyCode,
        })}
      </EasyCallText>
      <button
        type="button"
        className="btn btn-outline btn-sm min-h-14 min-w-14"
        onClick={dismiss}
        aria-label={t('common.dismiss')}
      >
        {t('common.dismiss')}
      </button>
    </div>
  );
}
