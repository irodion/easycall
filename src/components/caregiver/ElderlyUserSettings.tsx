import { useEffect, useState, useRef } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '@/services/firebase';
import { BackToDashboard } from '@/components/shared/BackToDashboard';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { DEFAULT_USER_SETTINGS } from '@/types/user';
import { hashPin } from '@/utils/pinHash';
import { LanguageSelector } from '@/components/shared/LanguageSelector';
import type { UserSettings } from '@/types/user';

const PAGE_CLASS =
  'min-h-screen bg-gradient-to-b from-base-200/30 to-base-100 flex flex-col p-[var(--space-md)]';
const PAGE_STYLE = { paddingBottom: 'max(1.25rem, var(--safe-bottom, 0px))' } as const;
const FONT_SIZE_LABEL_ID = 'font-size-label';

interface ElderlyUserSettingsProps {
  elderlyUserId: string;
}

export function ElderlyUserSettings({ elderlyUserId }: ElderlyUserSettingsProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [pendingLockEnabled, setPendingLockEnabled] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [localVolume, setLocalVolume] = useState<number | null>(null);
  const volumeCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Reset state when elderlyUserId changes (prop-to-state pattern)
  const [prevElderlyUserId, setPrevElderlyUserId] = useState(elderlyUserId);
  if (prevElderlyUserId !== elderlyUserId) {
    setPrevElderlyUserId(elderlyUserId);
    setLoadError(null);
    setSettings(null);
    setLocalVolume(null);
    if (volumeCommitRef.current) {
      clearTimeout(volumeCommitRef.current);
      volumeCommitRef.current = null;
    }
  }

  useEffect(() => {
    const ref = doc(db, 'users', elderlyUserId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const name = typeof data['displayName'] === 'string' ? data['displayName'] : null;
        setDisplayName((prev) => (prev === name ? prev : name));
        const raw = (data['settings'] as Partial<UserSettings>) ?? {};
        const incoming: UserSettings = { ...DEFAULT_USER_SETTINGS, ...raw };
        setLoadError(null);
        setSettings((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(incoming)) return prev;
          return incoming;
        });
      },
      () => {
        setLoadError(t('elderlySettings.loadError'));
      },
    );

    const timeout = setTimeout(() => {
      setSettings((prev) => {
        if (prev === null) setLoadError(t('elderlySettings.loadError'));
        return prev;
      });
    }, 10_000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [elderlyUserId, t, retryToken]);

  // Clean up pending volume commit on unmount
  useEffect(() => {
    return () => {
      if (volumeCommitRef.current) clearTimeout(volumeCommitRef.current);
    };
  }, []);

  if (loadError) {
    return (
      <div className={`${PAGE_CLASS} items-center gap-[var(--space-md)]`} style={PAGE_STYLE}>
        <BackToDashboard />
        <p role="alert" className="text-error text-[length:var(--text-body)]">
          {loadError}
        </p>
        <EasyCallButton onClick={() => setRetryToken((n) => n + 1)}>
          {t('common.retry')}
        </EasyCallButton>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={`${PAGE_CLASS} gap-[var(--space-md)]`} style={PAGE_STYLE}>
        <BackToDashboard />
        <div className="flex justify-center" role="status" aria-label={t('common.loading')}>
          <span className="loading loading-spinner loading-lg" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const updateSettings = async (partial: Partial<UserSettings>) => {
    const current = settingsRef.current;
    if (!current) return;
    const updated = { ...current, ...partial };
    setSettings(updated);
    const ref = doc(db, 'users', elderlyUserId);
    try {
      await updateDoc(ref, { settings: updated });
    } catch {
      setSettings(current);
      throw new Error('Settings write failed');
    }
  };

  const commitVolume = (value: number) => {
    if (volumeCommitRef.current) clearTimeout(volumeCommitRef.current);
    volumeCommitRef.current = setTimeout(() => {
      void updateSettings({ ringtoneVolume: value });
      setLocalVolume(null);
      volumeCommitRef.current = null;
    }, 300);
  };

  const handleSavePin = async () => {
    if (pin.length !== 4) {
      setPinError(t('elderlySettings.pinLengthError'));
      return;
    }
    if (pin !== pinConfirm) {
      setPinError(t('elderlySettings.pinMismatchError'));
      return;
    }
    setPinSaving(true);
    try {
      const hash = await hashPin(pin, elderlyUserId);
      await updateSettings({ appLockEnabled: true, appLockPinHash: hash });
      setPendingLockEnabled(false);
      setPin('');
      setPinConfirm('');
      setPinError(null);
    } catch {
      setPinError(t('elderlySettings.pinSaveError'));
    } finally {
      setPinSaving(false);
    }
  };

  const displayedVolume = localVolume ?? settings.ringtoneVolume;

  return (
    <div className={`${PAGE_CLASS} gap-[var(--space-lg)]`} style={PAGE_STYLE}>
      <BackToDashboard />

      <EasyCallText as="h1" variant="heading">
        {displayName
          ? t('elderlySettings.settingsFor', { name: displayName })
          : t('settings.title')}
      </EasyCallText>

      <section>
        <EasyCallText as="h2" variant="button" className="font-bold mb-3" id={FONT_SIZE_LABEL_ID}>
          {t('elderlySettings.fontSize')}
        </EasyCallText>
        <div role="radiogroup" aria-labelledby={FONT_SIZE_LABEL_ID} className="flex flex-col gap-3">
          {(['large', 'x-large'] as const).map((size) => (
            <label
              key={size}
              htmlFor={`elderly-font-${size}`}
              className="flex items-center gap-3 cursor-pointer min-h-14 min-w-14"
            >
              <input
                id={`elderly-font-${size}`}
                type="radio"
                name="elderly-fontSize"
                value={size}
                checked={settings.fontSize === size}
                onChange={() => void updateSettings({ fontSize: size })}
                className="radio radio-primary"
              />
              <EasyCallText as="span" variant="body">
                {size === 'large' ? t('elderlySettings.large') : t('elderlySettings.xLarge')}
              </EasyCallText>
            </label>
          ))}
        </div>
      </section>

      <section>
        <label htmlFor="ringtone-volume">
          <EasyCallText as="span" variant="button" className="font-bold">
            {t('elderlySettings.ringtoneVolume')}
          </EasyCallText>
        </label>
        <div className="flex flex-col gap-[var(--space-sm)] mt-3">
          <input
            id="ringtone-volume"
            type="range"
            min="0"
            max="100"
            step="5"
            value={displayedVolume}
            onChange={(e) => {
              const value = Number(e.target.value);
              setLocalVolume(value);
              commitVolume(value);
            }}
            className="range range-primary touch-target-min"
            aria-label={t('elderlySettings.ringtoneVolume')}
          />
          <EasyCallText as="span" variant="body" className="text-center">
            {t('elderlySettings.volumePercent', { value: displayedVolume })}
          </EasyCallText>
        </div>
      </section>

      <section>
        <EasyCallText as="h2" variant="button" className="font-bold mb-3">
          {t('elderlySettings.appLock')}
        </EasyCallText>
        <label className="flex items-center gap-[var(--space-sm)] cursor-pointer min-h-14">
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={settings.appLockEnabled || pendingLockEnabled}
            onChange={(e) => {
              if (e.target.checked) {
                setPendingLockEnabled(true);
              } else {
                setPendingLockEnabled(false);
                void updateSettings({ appLockEnabled: false, appLockPinHash: null });
                setPin('');
                setPinConfirm('');
                setPinError(null);
              }
            }}
            aria-label={t('elderlySettings.enableAppLock')}
          />
          <EasyCallText as="span" variant="body">
            {settings.appLockEnabled || pendingLockEnabled
              ? t('elderlySettings.enabled')
              : t('elderlySettings.disabled')}
          </EasyCallText>
        </label>

        {(settings.appLockEnabled || pendingLockEnabled) && (
          <div className="flex flex-col gap-[var(--space-sm)] mt-[var(--space-sm)]">
            <label htmlFor="lock-pin">
              <EasyCallText as="span" variant="body" className="font-bold">
                {t('elderlySettings.setPin')}
              </EasyCallText>
            </label>
            <input
              id="lock-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                setPinError(null);
              }}
              className="input input-bordered w-full max-w-xs min-h-14"
              placeholder={t('elderlySettings.pinPlaceholder')}
              aria-label={t('elderlySettings.setPin')}
            />
            <label htmlFor="lock-pin-confirm">
              <EasyCallText as="span" variant="body" className="font-bold">
                {t('elderlySettings.confirmPin')}
              </EasyCallText>
            </label>
            <input
              id="lock-pin-confirm"
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              value={pinConfirm}
              onChange={(e) => {
                setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4));
                setPinError(null);
              }}
              className="input input-bordered w-full max-w-xs min-h-14"
              placeholder={t('elderlySettings.confirmPinPlaceholder')}
              aria-label={t('elderlySettings.confirmPin')}
            />
            {pinError && (
              <p className="text-error text-[length:var(--text-body)]" role="alert">
                {pinError}
              </p>
            )}
            <EasyCallButton onClick={() => void handleSavePin()} disabled={pinSaving}>
              {t('elderlySettings.savePin')}
            </EasyCallButton>
          </div>
        )}
      </section>

      <LanguageSelector
        value={settings.language}
        onChange={(language) => void updateSettings({ language })}
        name="elderly-language"
      />
    </div>
  );
}
