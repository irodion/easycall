import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '@/services/firebase';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { DEFAULT_USER_SETTINGS } from '@/types/user';
import { hashPin } from '@/utils/pinHash';
import { LanguageSelector } from '@/components/shared/LanguageSelector';
import type { UserSettings } from '@/types/user';

interface ElderlyUserSettingsProps {
  elderlyUserId: string;
}

export function ElderlyUserSettings({ elderlyUserId }: ElderlyUserSettingsProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [pendingLockEnabled, setPendingLockEnabled] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);

  // Reset state when elderlyUserId changes (prop-to-state pattern)
  const [prevElderlyUserId, setPrevElderlyUserId] = useState(elderlyUserId);
  if (prevElderlyUserId !== elderlyUserId) {
    setPrevElderlyUserId(elderlyUserId);
    setLoadError(null);
    setSettings(null);
  }

  useEffect(() => {
    const ref = doc(db, 'users', elderlyUserId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const raw = snap.exists() ? ((snap.data()['settings'] as Partial<UserSettings>) ?? {}) : {};
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

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-[var(--space-md)] p-[var(--space-md)]">
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
      <div
        className="flex justify-center p-[var(--space-md)]"
        role="status"
        aria-label={t('common.loading')}
      >
        <span className="loading loading-spinner loading-lg" aria-hidden="true" />
      </div>
    );
  }

  const updateSettings = async (partial: Partial<UserSettings>) => {
    const previous = settings;
    const updated = { ...settings, ...partial };
    setSettings(updated);
    const ref = doc(db, 'users', elderlyUserId);
    try {
      await updateDoc(ref, { settings: updated });
    } catch {
      setSettings(previous);
      throw new Error('Settings write failed');
    }
  };

  return (
    <div className="flex flex-col gap-[var(--space-lg)] p-[var(--space-md)]">
      <fieldset>
        <legend className="text-[length:var(--text-heading)] font-bold mb-[var(--space-sm)]">
          {t('elderlySettings.fontSize')}
        </legend>
        <div className="flex gap-[var(--space-sm)]">
          {(['large', 'x-large'] as const).map((size) => (
            <EasyCallButton
              key={size}
              variant={settings.fontSize === size ? 'primary' : 'secondary'}
              onClick={() => updateSettings({ fontSize: size })}
            >
              {size === 'large' ? t('elderlySettings.large') : t('elderlySettings.xLarge')}
            </EasyCallButton>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-[var(--space-sm)]">
        <label htmlFor="ringtone-volume" className="text-[length:var(--text-heading)] font-bold">
          {t('elderlySettings.ringtoneVolume')}
        </label>
        <input
          id="ringtone-volume"
          type="range"
          min="0"
          max="100"
          step="5"
          value={settings.ringtoneVolume}
          onChange={(e) => updateSettings({ ringtoneVolume: Number(e.target.value) })}
          className="range range-primary touch-target-min"
          aria-label={t('elderlySettings.ringtoneVolume')}
        />
        <span className="text-[length:var(--text-body)] text-center">
          {t('elderlySettings.volumePercent', { value: settings.ringtoneVolume })}
        </span>
      </div>

      <fieldset>
        <legend className="text-[length:var(--text-heading)] font-bold mb-[var(--space-sm)]">
          {t('elderlySettings.appLock')}
        </legend>
        <label className="flex items-center gap-[var(--space-sm)] cursor-pointer min-h-14">
          <input
            type="checkbox"
            className="toggle toggle-primary min-h-14 min-w-14"
            checked={settings.appLockEnabled || pendingLockEnabled}
            onChange={(e) => {
              if (e.target.checked) {
                setPendingLockEnabled(true);
              } else {
                setPendingLockEnabled(false);
                updateSettings({ appLockEnabled: false, appLockPinHash: null });
                setPin('');
                setPinConfirm('');
                setPinError(null);
              }
            }}
            aria-label={t('elderlySettings.enableAppLock')}
          />
          <span className="text-[length:var(--text-body)]">
            {settings.appLockEnabled || pendingLockEnabled
              ? t('elderlySettings.enabled')
              : t('elderlySettings.disabled')}
          </span>
        </label>

        {(settings.appLockEnabled || pendingLockEnabled) && (
          <div className="flex flex-col gap-[var(--space-sm)] mt-[var(--space-sm)]">
            <label htmlFor="lock-pin" className="text-[length:var(--text-body)] font-bold">
              {t('elderlySettings.setPin')}
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
            <label htmlFor="lock-pin-confirm" className="text-[length:var(--text-body)] font-bold">
              {t('elderlySettings.confirmPin')}
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
            <EasyCallButton
              onClick={() => {
                if (pin.length !== 4) {
                  setPinError(t('elderlySettings.pinLengthError'));
                  return;
                }
                if (pin !== pinConfirm) {
                  setPinError(t('elderlySettings.pinMismatchError'));
                  return;
                }
                setPinSaving(true);
                void (async () => {
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
                })();
              }}
              disabled={pinSaving}
            >
              {t('elderlySettings.savePin')}
            </EasyCallButton>
          </div>
        )}
      </fieldset>

      <LanguageSelector
        value={settings.language}
        onChange={(language) => updateSettings({ language })}
        name="elderly-language"
      />
    </div>
  );
}
