import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaPermissions } from '@/hooks/useMediaPermissions';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { EasyCallButton } from '@/components/shared/EasyCallButton';

interface PermissionCheckProps {
  onReady: () => void;
}

export function PermissionCheck({ onReady }: PermissionCheckProps) {
  const { t } = useTranslation();
  const { status, retry } = useMediaPermissions();
  const firedRef = useRef(false);

  useEffect(() => {
    if (status === 'granted' && !firedRef.current) {
      firedRef.current = true;
      onReady();
    }
  }, [status, onReady]);

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <div role="status" aria-label={t('permissions.checking')}>
          <span className="loading loading-spinner loading-lg text-primary" />
          <span className="sr-only">{t('permissions.checking')}</span>
        </div>
      </div>
    );
  }

  if (status === 'prompt') {
    return (
      <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center gap-6 p-8">
        <EasyCallText as="h1" variant="heading" className="text-center">
          {t('permissions.cameraAndMic')}
        </EasyCallText>
        <EasyCallText as="p" variant="body" className="text-center text-[length:var(--text-body)]">
          {t('permissions.allowPrompt')}
        </EasyCallText>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center gap-6 p-8">
        <EasyCallText as="h1" variant="heading" className="text-center">
          {t('permissions.blocked')}
        </EasyCallText>
        <EasyCallText as="p" variant="body" className="text-center">
          {t('permissions.blockedHint')}
        </EasyCallText>
        <EasyCallButton onClick={retry} aria-label={t('permissions.tryAgain')}>
          {t('permissions.tryAgain')}
        </EasyCallButton>
      </div>
    );
  }

  if (status === 'no-device') {
    return (
      <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center gap-6 p-8">
        <EasyCallText as="h1" variant="heading" className="text-center">
          {t('permissions.noCamera')}
        </EasyCallText>
        <EasyCallText as="p" variant="body" className="text-center">
          {t('permissions.noCameraHint')}
        </EasyCallText>
      </div>
    );
  }

  return null;
}
