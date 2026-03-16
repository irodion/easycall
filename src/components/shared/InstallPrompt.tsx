import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { EasyCallButton } from './EasyCallButton';

export function InstallPrompt() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      flushSync(() => {
        setDeferredPrompt(e as unknown as BeforeInstallPromptEvent);
      });
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    const prompt = deferredPrompt;
    if (!prompt) return;
    try {
      await prompt.prompt();
      await prompt.userChoice;
      setDeferredPrompt(null);
    } catch {
      // prompt() or userChoice failed — keep deferredPrompt so the user can retry
    }
  };

  return (
    <div
      id="install-prompt"
      role="dialog"
      aria-label={t('installPrompt.ariaLabel')}
      className="fixed bottom-0 left-0 right-0 p-6 bg-base-100 border-t border-base-300 shadow-xl z-50 flex flex-col items-center gap-4"
    >
      <p className="text-[length:var(--text-body)] font-bold text-center">
        {t('installPrompt.title')}
      </p>
      <p className="text-[length:var(--text-body)] text-center text-base-content/70">
        {t('installPrompt.description')}
      </p>
      <div className="flex gap-3">
        <EasyCallButton
          size="large"
          onClick={handleInstall}
          aria-label={t('installPrompt.installApp')}
        >
          {t('common.install')}
        </EasyCallButton>
        <EasyCallButton
          variant="secondary"
          size="large"
          onClick={() => setDismissed(true)}
          aria-label={t('common.dismiss')}
        >
          {t('common.dismiss')}
        </EasyCallButton>
      </div>
    </div>
  );
}
