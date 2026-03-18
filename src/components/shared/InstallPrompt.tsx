import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';

export function InstallPrompt() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

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

  // Slide-in animation after mount
  useEffect(() => {
    if (deferredPrompt && !dismissed) {
      const timer = setTimeout(() => setVisible(true), 100);
      return () => clearTimeout(timer);
    }
    setVisible(false);
  }, [deferredPrompt, dismissed]);

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

  const handleDismiss = () => {
    setVisible(false);
    // Wait for slide-out animation before removing from DOM
    setTimeout(() => setDismissed(true), 200);
  };

  return (
    <div
      id="install-prompt"
      role="dialog"
      aria-label={t('installPrompt.ariaLabel')}
      className={`fixed bottom-4 start-4 end-4 z-50 transition-all duration-300 ease-out ${
        visible
          ? 'translate-y-0 opacity-100'
          : 'translate-y-8 opacity-0'
      }`}
    >
      <div className="bg-primary text-primary-content rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3">
        {/* App icon */}
        <div className="shrink-0 w-10 h-10 bg-primary-content/20 rounded-xl flex items-center justify-center">
          <svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
        </div>

        {/* Text */}
        <p className="flex-1 text-sm font-semibold leading-tight">
          {t('installPrompt.title')}
        </p>

        {/* Install button */}
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="shrink-0 min-h-11 min-w-11 px-4 py-2 bg-primary-content text-primary font-bold text-sm rounded-xl active:scale-95 transition-transform"
          aria-label={t('installPrompt.installApp')}
        >
          {t('common.install')}
        </button>

        {/* Dismiss X */}
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-primary-content/10 active:scale-95 transition-all"
          aria-label={t('common.dismiss')}
        >
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
