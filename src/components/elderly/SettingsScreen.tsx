import { Link } from 'react-router';
import { EasyCallText } from '@/components/shared/EasyCallText';
import type { UserSettings } from '@/types/user';

interface SettingsScreenProps {
  settings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
  userId: string;
}

export function SettingsScreen({ settings, onSettingsChange }: SettingsScreenProps) {
  const labelId = 'font-size-label';

  return (
    <div className="min-h-screen bg-base-100 p-6 flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link
          to="/elderly"
          className="btn btn-ghost touch-target-min min-h-14 min-w-14 font-bold text-[length:var(--text-button)]"
          aria-label="Back"
        >
          ← Back
        </Link>
        <EasyCallText as="h1" variant="heading">Settings</EasyCallText>
      </div>

      <section>
        <EasyCallText as="h2" variant="button" className="font-bold mb-3" id={labelId}>
          Text Size
        </EasyCallText>
        <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col gap-3">
          <div className="flex items-center gap-3 min-h-14">
            <input
              id="font-large"
              type="radio"
              name="fontSize"
              value="large"
              checked={settings.fontSize === 'large'}
              onChange={() => onSettingsChange({ ...settings, fontSize: 'large' })}
              className="radio radio-primary"
              aria-label="Standard text"
            />
            <EasyCallText as="span" variant="body" aria-hidden="true">Large</EasyCallText>
          </div>
          <label htmlFor="font-xlarge" className="flex items-center gap-3 cursor-pointer min-h-14">
            <input
              id="font-xlarge"
              type="radio"
              name="fontSize"
              value="x-large"
              checked={settings.fontSize === 'x-large'}
              onChange={() => onSettingsChange({ ...settings, fontSize: 'x-large' })}
              className="radio radio-primary"
              aria-label="Extra Large"
            />
            <EasyCallText as="span" variant="body" aria-hidden="true">Extra Large</EasyCallText>
          </label>
        </div>
      </section>

      <section data-testid="pairing-code-section">
        <EasyCallText as="h2" variant="button" className="font-bold mb-2">
          Pairing Code
        </EasyCallText>
        <EasyCallText variant="body" className="text-base-content/60">
          Loading...
        </EasyCallText>
      </section>

      <div className="mt-auto">
        <Link
          to="/elderly/add-contact"
          className="btn btn-primary min-h-14 w-full font-bold text-[length:var(--text-button)]"
          aria-label="Add Contact"
        >
          Add Contact
        </Link>
      </div>
    </div>
  );
}
