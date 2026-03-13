import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/services/firebase';
import { AuthGuard } from '@/components/shared/AuthGuard';
import { RoleSelector } from '@/components/shared/RoleSelector';
import { InstallPrompt } from '@/components/shared/InstallPrompt';
import { HomeScreen } from '@/components/elderly/HomeScreen';
import { SettingsScreen } from '@/components/elderly/SettingsScreen';
import { AddContact } from '@/components/elderly/AddContact';
import { CallScreen } from '@/components/elderly/CallScreen';
import { Dashboard } from '@/components/caregiver/Dashboard';
import { ManageContacts } from '@/components/caregiver/ManageContacts';
import type { UserSettings } from '@/types/user';

function ManageContactsPage() {
  const { elderlyUserId } = useParams<{ elderlyUserId: string }>();
  if (!elderlyUserId) return null;
  return <ManageContacts elderlyUserId={elderlyUserId} />;
}

const defaultSettings: UserSettings = {
  fontSize: 'large',
  highContrast: false,
  ringtoneVolume: 80,
  autoAnswer: false,
};

function AuthenticatedApp() {
  const [userId, setUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUserId(user?.uid ?? null);
    });
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={<RoleSelector />} />
        <Route element={<AuthGuard requiredRole="elderly" />}>
          <Route
            path="/elderly"
            element={userId ? <HomeScreen userId={userId} /> : null}
          />
          <Route
            path="/elderly/settings"
            element={
              userId ? (
                <SettingsScreen
                  userId={userId}
                  settings={settings}
                  onSettingsChange={(s: UserSettings) => { setSettings(s); }}
                />
              ) : null
            }
          />
          <Route
            path="/elderly/add-contact"
            element={userId ? <AddContact userId={userId} /> : null}
          />
          <Route path="/call/:contactId" element={<CallScreen />} />
        </Route>
        <Route element={<AuthGuard requiredRole="caregiver" />}>
          <Route
            path="/caregiver"
            element={userId ? <Dashboard userId={userId} /> : null}
          />
          <Route
            path="/caregiver/manage/:elderlyUserId"
            element={<ManageContactsPage />}
          />
          <Route path="/caregiver/pair" element={<div>Pairing (Phase 2)</div>} />
        </Route>
      </Routes>
      <InstallPrompt />
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
