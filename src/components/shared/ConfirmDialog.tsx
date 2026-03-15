import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EasyCallButton } from './EasyCallButton';
import { EasyCallText } from './EasyCallText';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, message, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, onCancel);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('confirmDialog.ariaLabel')}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6"
    >
      <div className="bg-base-100 rounded-2xl p-6 max-w-sm w-full flex flex-col gap-6 shadow-xl">
        <EasyCallText as="p" variant="body" className="text-center">
          {message}
        </EasyCallText>
        <div className="flex gap-3 justify-center">
          <EasyCallButton variant="secondary" onClick={onCancel} aria-label={t('common.cancel')}>
            {t('common.cancel')}
          </EasyCallButton>
          <EasyCallButton variant="danger" onClick={onConfirm} aria-label={t('common.confirm')}>
            {t('common.confirm')}
          </EasyCallButton>
        </div>
      </div>
    </div>
  );
}
