import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { DEFAULT_USER_SETTINGS } from '@/types/user';
import type { UserSettings } from '@/types/user';

interface ElderlyUserSettingsProps {
  elderlyUserId: string;
}

export function ElderlyUserSettings({ elderlyUserId }: ElderlyUserSettingsProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);

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
      <div className="flex justify-center p-[var(--space-md)]" role="status" aria-label="Loading settings">
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
        <label
          htmlFor="ringtone-volume"
          className="text-[length:var(--text-heading)] font-bold"
        >
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
    </div>
  );
}
