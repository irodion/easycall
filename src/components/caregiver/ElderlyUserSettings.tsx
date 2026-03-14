import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { DEFAULT_USER_SETTINGS } from '@/types/user';
import { hashPin } from '@/utils/pinHash';
import type { UserSettings } from '@/types/user';

interface ElderlyUserSettingsProps {
  elderlyUserId: string;
}

export function ElderlyUserSettings({ elderlyUserId }: ElderlyUserSettingsProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);

  useEffect(() => {
    const ref = doc(db, 'users', elderlyUserId);
    const unsubscribe = onSnapshot(ref, (snap) => {
      const incoming = snap.exists()
        ? ((snap.data()['settings'] as UserSettings) ?? DEFAULT_USER_SETTINGS)
        : DEFAULT_USER_SETTINGS;
      setSettings((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(incoming)) return prev;
        return incoming;
      });
    });
    return unsubscribe;
  }, [elderlyUserId]);

  if (!settings) {
    return (
      <div
        className="flex justify-center p-[var(--space-md)]"
        role="status"
        aria-label="Loading settings"
      >
        <span className="loading loading-spinner loading-lg" aria-hidden="true" />
      </div>
    );
  }

  const updateSettings = (partial: Partial<UserSettings>) => {
    const previous = settings;
    const updated = { ...settings, ...partial };
    setSettings(updated);
    const ref = doc(db, 'users', elderlyUserId);
    updateDoc(ref, { settings: updated }).catch(() => {
      setSettings(previous);
    });
  };

  return (
    <div className="flex flex-col gap-[var(--space-lg)] p-[var(--space-md)]">
      <fieldset>
        <legend className="text-[length:var(--text-heading)] font-bold mb-[var(--space-sm)]">
          Font Size
        </legend>
        <div className="flex gap-[var(--space-sm)]">
          {(['large', 'x-large'] as const).map((size) => (
            <EasyCallButton
              key={size}
              variant={settings.fontSize === size ? 'primary' : 'secondary'}
              onClick={() => updateSettings({ fontSize: size })}
            >
              {size === 'large' ? 'Large' : 'X-Large'}
            </EasyCallButton>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-[var(--space-sm)]">
        <label htmlFor="ringtone-volume" className="text-[length:var(--text-heading)] font-bold">
          Ringtone Volume
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
          aria-label="Ringtone volume"
        />
        <span className="text-[length:var(--text-body)] text-center">
          {settings.ringtoneVolume}%
        </span>
      </div>

      <fieldset>
        <legend className="text-[length:var(--text-heading)] font-bold mb-[var(--space-sm)]">
          App Lock
        </legend>
        <label className="flex items-center gap-[var(--space-sm)] cursor-pointer">
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={settings.appLockEnabled}
            onChange={(e) => {
              if (e.target.checked) {
                updateSettings({ appLockEnabled: true });
              } else {
                updateSettings({ appLockEnabled: false, appLockPinHash: null });
                setPin('');
                setPinConfirm('');
                setPinError(null);
              }
            }}
            aria-label="Enable app lock"
          />
          <span className="text-[length:var(--text-body)]">
            {settings.appLockEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </label>

        {settings.appLockEnabled && (
          <div className="flex flex-col gap-[var(--space-sm)] mt-[var(--space-sm)]">
            <label htmlFor="lock-pin" className="text-[length:var(--text-body)] font-bold">
              Set PIN
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
              className="input input-bordered w-full max-w-xs"
              placeholder="4-digit PIN"
              aria-label="PIN"
            />
            <label htmlFor="lock-pin-confirm" className="text-[length:var(--text-body)] font-bold">
              Confirm PIN
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
              className="input input-bordered w-full max-w-xs"
              placeholder="Confirm PIN"
              aria-label="Confirm PIN"
            />
            {pinError && (
              <p className="text-error text-[length:var(--text-body)]" role="alert">
                {pinError}
              </p>
            )}
            <EasyCallButton
              onClick={() => {
                if (pin.length !== 4) {
                  setPinError('PIN must be exactly 4 digits');
                  return;
                }
                if (pin !== pinConfirm) {
                  setPinError('PINs do not match');
                  return;
                }
                setPinSaving(true);
                void hashPin(pin)
                  .then((hash) => {
                    updateSettings({ appLockPinHash: hash });
                    setPin('');
                    setPinConfirm('');
                    setPinError(null);
                  })
                  .catch(() => {
                    setPinError('Failed to save PIN. Please try again.');
                  })
                  .finally(() => {
                    setPinSaving(false);
                  });
              }}
              disabled={pinSaving}
            >
              Save PIN
            </EasyCallButton>
          </div>
        )}
      </fieldset>
    </div>
  );
}
