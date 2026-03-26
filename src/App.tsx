import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import '@/utils/audioUnlock';
import { auth, db } from '@/services/firebase';
import { AuthGuard } from '@/components/shared/AuthGuard';
import { RoleSelector } from '@/components/shared/RoleSelector';
import { InstallPrompt } from '@/components/shared/InstallPrompt';
import { AppLock } from '@/components/shared/AppLock';
import { IncomingCallScreen } from '@/components/elderly/IncomingCallScreen';
import { useIncomingCall } from '@/hooks/useIncomingCall';
import { usePresence } from '@/hooks/usePresence';
import { useAppLock } from '@/hooks/useAppLock';
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate';
import { HomeScreen } from '@/components/elderly/HomeScreen';
import { SettingsScreen } from '@/components/elderly/SettingsScreen';
import { AddContact } from '@/components/elderly/AddContact';
import { CallScreen } from '@/components/elderly/CallScreen';
import { CallHistory } from '@/components/elderly/CallHistory';
import { Dashboard } from '@/components/caregiver/Dashboard';
import { ManageContacts } from '@/components/caregiver/ManageContacts';
import { PairElderlyUser } from '@/components/caregiver/PairElderlyUser';
import { ElderlyUserSettings } from '@/components/caregiver/ElderlyUserSettings';
import { CaregiverAccount } from '@/components/caregiver/CaregiverAccount';
import { LoginForm } from '@/components/shared/LoginForm';
import { ForgotPasswordForm } from '@/components/shared/ForgotPasswordForm';
import { DEFAULT_USER_SETTINGS } from '@/types/user';
import type { UserSettings } from '@/types/user';
import { SkipToContent } from '@/components/shared/SkipToContent';
import { loadLanguage, RTL_LANGUAGES } from '@/i18n';

function ManageContactsPage({ userId }: { userId: string }) {
  const { elderlyUserId } = useParams<{ elderlyUserId: string }>();
  if (!elderlyUserId) return null;
  return <ManageContacts elderlyUserId={elderlyUserId} caregiverUserId={userId} />;
}

function CaregiverSettingsPage() {
  const { elderlyUserId } = useParams<{ elderlyUserId: string }>();
  if (!elderlyUserId) return null;
  return <ElderlyUserSettings elderlyUserId={elderlyUserId} />;
}

function PairElderlyUserPage() {
  const navigate = useNavigate();
  return (
    <PairElderlyUser
      onSuccess={(elderlyUserId) => void navigate(`/caregiver/settings/${elderlyUserId}`)}
    />
  );
}

function AuthenticatedApp() {
  const [userId, setUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUserId(user?.uid ?? null);
    });
  }, []);

  // Reset settings when userId changes (prop-to-state pattern)
  const [prevUserId, setPrevUserId] = useState(userId);
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    setSettings(DEFAULT_USER_SETTINGS);
    setDisplayName('');
  }

  // Sync settings from Firestore in real-time
  useEffect(() => {
    if (!userId) return;
    const ref = doc(db, 'users', userId);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setSettings(DEFAULT_USER_SETTINGS);
        return;
      }
      const data = snap.data();
      const raw = (data['settings'] as Partial<UserSettings>) ?? {};
      const incoming = { ...DEFAULT_USER_SETTINGS, ...raw };
      setSettings((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(incoming)) return prev;
        return incoming;
      });
      const name = typeof data['displayName'] === 'string' ? data['displayName'] : '';
      setDisplayName((prev) => (prev === name ? prev : name));
    });
    return () => {
      unsubscribe();
    };
  }, [userId]);

  useEffect(() => {
    void loadLanguage(settings.language);
    document.documentElement.lang = settings.language;
    document.documentElement.dir = RTL_LANGUAGES.includes(settings.language) ? 'rtl' : 'ltr';
  }, [settings.language]);

  useEffect(() => {
    document.documentElement.dataset.fontSize = settings.fontSize;
  }, [settings.fontSize]);

  useIncomingCall(userId);
  const { setInCall } = usePresence(userId);
  useServiceWorkerUpdate();

  const lockState = useAppLock({ settings, userId });

  return (
    <>
      <SkipToContent />
      <AppLock
        isLocked={lockState.isLocked}
        failedAttempts={lockState.failedAttempts}
        cooldownRemaining={lockState.cooldownRemaining}
        onPinSubmit={lockState.unlockWithPin}
      >
        <main id="main-content">
          <Routes>
            <Route path="/" element={<RoleSelector />} />
            <Route path="/login" element={<LoginForm />} />
            <Route path="/forgot-password" element={<ForgotPasswordForm />} />
            <Route element={<AuthGuard requiredRole="elderly" />}>
              <Route path="/elderly" element={userId ? <HomeScreen userId={userId} /> : null} />
              <Route
                path="/elderly/settings"
                element={
                  userId ? (
                    <SettingsScreen userId={userId} settings={settings} displayName={displayName} />
                  ) : null
                }
              />
              <Route
                path="/elderly/add-contact"
                element={userId ? <AddContact userId={userId} /> : null}
              />
              <Route
                path="/elderly/history"
                element={userId ? <CallHistory userId={userId} /> : null}
              />
              <Route
                path="/call/:contactId"
                element={
                  <CallScreen
                    setInCall={setInCall}
                    restrictedNetworkMode={settings.restrictedNetworkMode}
                  />
                }
              />
              <Route
                path="/call-room/:roomId"
                element={
                  <CallScreen
                    setInCall={setInCall}
                    restrictedNetworkMode={settings.restrictedNetworkMode}
                  />
                }
              />
            </Route>
            <Route element={<AuthGuard requiredRole="caregiver" />}>
              <Route path="/caregiver" element={userId ? <Dashboard userId={userId} /> : null} />
              <Route
                path="/caregiver/manage/:elderlyUserId"
                element={userId ? <ManageContactsPage userId={userId} /> : null}
              />
              <Route path="/caregiver/pair" element={<PairElderlyUserPage />} />
              <Route
                path="/caregiver/settings/:elderlyUserId"
                element={<CaregiverSettingsPage />}
              />
              <Route path="/caregiver/account" element={<CaregiverAccount />} />
            </Route>
          </Routes>
        </main>
        <InstallPrompt />
      </AppLock>
      <IncomingCallScreen
        ringtoneVolume={settings.ringtoneVolume}
        restrictedNetworkMode={settings.restrictedNetworkMode}
      />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthenticatedApp />
    </BrowserRouter>
  );
}

export default App;
