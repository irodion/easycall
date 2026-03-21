import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EasyCallText } from './EasyCallText';

function detectPlatform(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  // iPadOS 13+ reports a macOS UA — detect via touch support
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

function PlatformSteps({ platform }: { platform: 'ios' | 'android' | 'desktop' }) {
  const { t } = useTranslation();

  const steps: string[] = [];
  if (platform === 'ios') {
    steps.push(t('resetApp.ios.step1'), t('resetApp.ios.step2'), t('resetApp.ios.step3'));
  } else if (platform === 'android') {
    steps.push(t('resetApp.android.step1'), t('resetApp.android.step2'));
  } else {
    steps.push(
      t('resetApp.desktop.step1'),
      t('resetApp.desktop.step2'),
      t('resetApp.desktop.step3'),
    );
  }

  return (
    <ol className="list-decimal list-inside flex flex-col gap-1">
      {steps.map((step, i) => (
        <li key={i}>
          <EasyCallText as="span" variant="body">
            {step}
          </EasyCallText>
        </li>
      ))}
    </ol>
  );
}

export function UninstallGuide() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const platform = detectPlatform();

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="btn btn-ghost min-h-14 w-full font-bold text-[length:var(--text-body)] justify-between"
      >
        {t('resetApp.howToRemove')}
        <span aria-hidden="true" className="transition-transform duration-200">
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>
      {expanded && (
        <div className="card bg-base-200 mt-2">
          <div className="card-body gap-3 py-4">
            <EasyCallText as="p" variant="body">
              {t('resetApp.removeDescription')}
            </EasyCallText>
            <PlatformSteps platform={platform} />
          </div>
        </div>
      )}
    </div>
  );
}
