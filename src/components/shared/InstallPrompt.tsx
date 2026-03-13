import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { EasyCallButton } from './EasyCallButton';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

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

  if (!deferredPrompt) return null;

  const handleInstall = async () => {
    const prompt = deferredPrompt;
    setDeferredPrompt(null);
    await prompt.prompt();
    await prompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <div
      role="dialog"
      aria-label="Install EasyCall app"
      className="fixed bottom-0 left-0 right-0 p-6 bg-base-100 border-t border-base-300 shadow-xl z-50 flex flex-col items-center gap-4"
    >
      <p className="text-[length:var(--text-body)] font-bold text-center">Install EasyCall</p>
      <p className="text-[length:var(--text-body)] text-center text-base-content/70">
        Install this app on your device for the best experience.
      </p>
      <EasyCallButton size="large" onClick={handleInstall} aria-label="Install app">
        Install
      </EasyCallButton>
    </div>
  );
}
