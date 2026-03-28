import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';

export type BillingSeverity = 'warning' | 'critical';

export interface BillingAlert {
  costAmount: number;
  budgetAmount: number;
  currencyCode: string;
  thresholdExceeded: number;
  severity: BillingSeverity;
  updatedAt: Timestamp | null;
}

const DISMISS_KEY_PREFIX = 'easycall_billing_alert_dismissed_';

function getSeverity(threshold: number): BillingSeverity {
  if (threshold >= 0.9) return 'critical'; // billing auto-disabled at 90%
  return 'warning';
}

export function useBillingAlert(): {
  alert: BillingAlert | null;
  dismissed: boolean;
  dismiss: () => void;
} {
  const [alert, setAlert] = useState<BillingAlert | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const ref = doc(db, 'config', 'billingAlert');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setAlert(null);
          return;
        }
        const data = snap.data();
        const thresholdExceeded = data['thresholdExceeded'] as number;
        const newAlert: BillingAlert = {
          costAmount: data['costAmount'] as number,
          budgetAmount: data['budgetAmount'] as number,
          currencyCode: data['currencyCode'] as string,
          thresholdExceeded,
          severity: getSeverity(thresholdExceeded),
          updatedAt: (data['updatedAt'] as Timestamp) ?? null,
        };
        setAlert(newAlert);
        const key = `${DISMISS_KEY_PREFIX}${thresholdExceeded}`;
        setDismissed(localStorage.getItem(key) === 'true');
      },
      (err) => {
        // nosemgrep: no-console-log-sensitive — logs Firestore listener error, not user data
        console.error('Billing alert listener error:', err);
        setAlert(null);
      },
    );
    return unsubscribe;
  }, []);

  const dismiss = useCallback(() => {
    if (alert) {
      localStorage.setItem(`${DISMISS_KEY_PREFIX}${alert.thresholdExceeded}`, 'true');
      setDismissed(true);
    }
  }, [alert]);

  return { alert, dismissed, dismiss };
}
