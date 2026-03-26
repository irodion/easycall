import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { auth, db, getFirebaseMessaging } from '@/services/firebase';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { Icon } from '@/components/shared/Icon';
import { LanguageSelector } from '@/components/shared/LanguageSelector';
import { PairingCodeDisplay } from '@/components/shared/PairingCodeDisplay';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { UninstallGuide } from '@/components/shared/UninstallGuide';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { resetAppData } from '@/utils/resetAppData';
import type { UserSettings } from '@/types/user';

interface SettingsScreenProps {
  settings: UserSettings;
  userId: string;
  displayName: string;
}

export function SettingsScreen({ settings, userId, displayName }: SettingsScreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fontLabelId = 'font-size-label';
  const [saveError, setSaveError] = useState<string | null>(null);
  const { canInstall, install } = useInstallPrompt();
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [savingName, setSavingName] = useState(false);
  const [messagingSupported, setMessagingSupported] = useState<boolean | null>(null);

  useEffect(() => {
    void getFirebaseMessaging().then((m) => setMessagingSupported(m !== null));
  }, []);

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || savingName) return;
    setSaveError(null);
    setSavingName(true);
    try {
      await updateDoc(doc(db, 'users', userId), { displayName: trimmed });
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: trimmed });
      }
      setEditingName(false);
    } catch {
      setSaveError(t('setName.error'));
    } finally {
      setSavingName(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setResetConfirmOpen(false);
    await resetAppData();
  };

  const saveSettings = async (partial: Partial<UserSettings>) => {
    setSaveError(null);
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(partial)) {
      payload[`settings.${key}`] = value;
    }
    try {
      await updateDoc(doc(db, 'users', userId), payload);
    } catch {
      setSaveError(t('settings.saveError'));
    }
  };

  const handleReviewSetup = async () => {
    try {
      await updateDoc(doc(db, 'users', userId), { onboardingComplete: false });
      // AuthGuard's onSnapshot will reactively detect the change and show OnboardingFlow
      void navigate('/elderly');
    } catch {
      setSaveError(t('settings.saveError'));
    }
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-base-200/30 to-base-100 p-6 flex flex-col gap-6"
      style={{ paddingBottom: 'max(1.5rem, var(--safe-bottom, 0px))' }}
    >
      <EasyCallText as="h1" variant="heading">
        {t('settings.title')}
      </EasyCallText>

      {saveError && (
        <div role="alert" className="alert alert-error">
          <EasyCallText as="span" variant="body">
            {saveError}
          </EasyCallText>
        </div>
      )}

      <section data-testid="name-section">
        <EasyCallText as="h2" variant="button" className="font-bold mb-2">
          {t('settings.yourName')}
        </EasyCallText>
        {editingName ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="edit-name-input" className="sr-only">
              {t('setName.nameLabel')}
            </label>
            <input
              id="edit-name-input"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={t('setName.namePlaceholder')}
              className="input input-bordered w-full text-[length:var(--text-body)] min-h-14"
              autoFocus
            />
            <div className="flex gap-2">
              <EasyCallButton
                size="large"
                disabled={!nameInput.trim() || savingName}
                onClick={() => void handleSaveName()}
                className="flex-1"
              >
                {savingName ? t('setName.saving') : t('setName.save')}
              </EasyCallButton>
              <EasyCallButton
                variant="secondary"
                size="large"
                disabled={savingName}
                onClick={() => {
                  setEditingName(false);
                  setNameInput(displayName);
                }}
                className="flex-1"
              >
                {t('common.cancel')}
              </EasyCallButton>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setNameInput(displayName);
              setEditingName(true);
            }}
            className="flex items-center gap-2 min-h-14 min-w-14 px-4 py-2 bg-base-200 rounded-xl w-full text-left"
            aria-label={t('settings.changeName')}
          >
            <EasyCallText as="span" variant="body" className="flex-1">
              {displayName || t('settings.noName')}
            </EasyCallText>
            <Icon name="settings" size={18} />
          </button>
        )}
      </section>

      <section>
        <EasyCallText as="h2" variant="button" className="font-bold mb-3" id={fontLabelId}>
          {t('settings.textSize')}
        </EasyCallText>
        <div role="radiogroup" aria-labelledby={fontLabelId} className="flex flex-col gap-3">
          <label
            htmlFor="font-large"
            className="flex items-center gap-3 cursor-pointer min-h-14 min-w-14"
          >
            <input
              id="font-large"
              type="radio"
              name="fontSize"
              value="large"
              checked={settings.fontSize === 'large'}
              onChange={() => void saveSettings({ fontSize: 'large' })}
              className="radio radio-primary"
            />
            <EasyCallText as="span" variant="body">
              {t('settings.large')}
            </EasyCallText>
          </label>
          <label
            htmlFor="font-xlarge"
            className="flex items-center gap-3 cursor-pointer min-h-14 min-w-14"
          >
            <input
              id="font-xlarge"
              type="radio"
              name="fontSize"
              value="x-large"
              checked={settings.fontSize === 'x-large'}
              onChange={() => void saveSettings({ fontSize: 'x-large' })}
              className="radio radio-primary"
            />
            <EasyCallText as="span" variant="body">
              {t('settings.extraLarge')}
            </EasyCallText>
          </label>
        </div>
      </section>

      <LanguageSelector
        value={settings.language}
        onChange={(language) => void saveSettings({ language })}
      />

      <section data-testid="pairing-code-section">
        <EasyCallText as="h2" variant="button" className="font-bold mb-2">
          {t('settings.pairingCode')}
        </EasyCallText>
        <PairingCodeDisplay userId={userId} />
      </section>

      <section data-testid="connection-mode-section">
        <EasyCallText as="h2" variant="button" className="font-bold mb-2">
          {t('settings.connectionMode')}
        </EasyCallText>
        <div className="flex items-center gap-2 px-4 py-3 bg-base-200 rounded-xl min-h-14">
          <EasyCallText as="span" variant="body">
            {settings.restrictedNetworkMode
              ? t('settings.connectionModeRelay')
              : t('settings.connectionModeP2P')}
          </EasyCallText>
        </div>
      </section>

      {messagingSupported !== null && (
        <section data-testid="notification-status-section">
          <EasyCallText as="h2" variant="button" className="font-bold mb-2">
            {t('settings.notifications')}
          </EasyCallText>
          <div className="flex items-center gap-2 px-4 py-3 bg-base-200 rounded-xl min-h-14">
            <span
              className={`inline-block w-3 h-3 rounded-full ${
                !messagingSupported || typeof Notification === 'undefined'
                  ? 'bg-warning'
                  : Notification.permission === 'granted'
                    ? 'bg-success'
                    : Notification.permission === 'denied'
                      ? 'bg-error'
                      : 'bg-warning'
              }`}
              aria-hidden="true"
            />
            <EasyCallText as="span" variant="body">
              {!messagingSupported || typeof Notification === 'undefined'
                ? t('settings.notificationsUnsupported')
                : Notification.permission === 'granted'
                  ? t('settings.notificationsEnabled')
                  : Notification.permission === 'denied'
                    ? t('settings.notificationsBlocked')
                    : t('settings.notificationsDefault')}
            </EasyCallText>
          </div>
        </section>
      )}

      {/* Bottom actions — pushed down via mt-auto */}
      <div className="mt-auto flex flex-col gap-3">
        <Link
          to="/elderly/add-contact"
          className="btn btn-primary min-h-14 w-full font-bold text-[length:var(--text-button)]"
          aria-label={t('settings.addContact')}
        >
          {t('settings.addContact')}
        </Link>

        <button
          type="button"
          onClick={() => void handleReviewSetup()}
          className="btn bg-base-200 hover:bg-base-300 min-h-14 w-full font-bold text-[length:var(--text-body)]"
        >
          {t('settings.reviewSetup')}
        </button>

        {canInstall && (
          <button
            type="button"
            onClick={() => void install()}
            className="btn bg-base-200 hover:bg-base-300 min-h-14 w-full font-bold text-[length:var(--text-body)]"
          >
            {t('settings.installApp')}
          </button>
        )}

        <button
          type="button"
          onClick={() => setResetConfirmOpen(true)}
          disabled={resetting}
          className="btn btn-error min-h-14 w-full font-bold text-[length:var(--text-body)]"
        >
          {resetting ? t('resetApp.resetting') : t('resetApp.resetButton')}
        </button>

        <UninstallGuide />

        <ConfirmDialog
          open={resetConfirmOpen}
          message={t('resetApp.confirmMessage')}
          onConfirm={() => void handleReset()}
          onCancel={() => setResetConfirmOpen(false)}
        />

        <Link
          to="/elderly"
          className="min-h-14 min-w-14 px-5 py-3 bg-base-200 text-base-content font-bold text-[length:var(--text-body)] rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2"
          aria-label={t('common.back')}
        >
          <Icon name="arrow-left" size={22} /> {t('common.back')}
        </Link>
      </div>
    </div>
  );
}
