import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

export function InstallPrompt() {
  const { t } = useTranslation();
  const { canInstall, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleDismiss = useCallback(() => {
    setAnimateIn(false);
    // Wait for slide-out animation before removing from DOM
    setTimeout(() => setDismissed(true), 300);
  }, []);

  // Slide-in animation after mount
  const shouldShow = canInstall && !dismissed;
  useEffect(() => {
    if (!shouldShow) return;
    const timer = setTimeout(() => setAnimateIn(true), 100);
    return () => clearTimeout(timer);
  }, [shouldShow]);

  // Dismiss on outside click
  useEffect(() => {
    if (!shouldShow) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        handleDismiss();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 200);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [shouldShow, handleDismiss]);

  // Reset animation when prompt is no longer shown
  const visible = shouldShow && animateIn;

  if (!canInstall || dismissed) return null;

  return (
    <div
      ref={dialogRef}
      id="install-prompt"
      role="dialog"
      aria-label={t('installPrompt.ariaLabel')}
      className={`fixed start-4 end-4 z-50 transition-all duration-300 ease-out ${
        visible
          ? 'translate-y-0 opacity-100'
          : '-translate-y-8 opacity-0'
      }`}
      style={{ top: 'max(1rem, var(--safe-top, 0px))' }}
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
        <p className="flex-1 text-[length:var(--text-body)] font-semibold leading-tight">
          {t('installPrompt.title')}
        </p>

        {/* Install button */}
        <button
          type="button"
          onClick={() => void install()}
          className="shrink-0 min-h-14 min-w-14 px-4 py-2 bg-primary-content text-primary font-bold text-[length:var(--text-body)] rounded-xl active:scale-95 transition-transform"
          aria-label={t('installPrompt.installApp')}
        >
          {t('common.install')}
        </button>

        {/* Dismiss X */}
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 min-h-14 min-w-14 flex items-center justify-center rounded-xl hover:bg-primary-content/10 active:scale-95 transition-all"
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
