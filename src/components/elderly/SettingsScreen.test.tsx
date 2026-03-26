import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { SettingsScreen } from './SettingsScreen';
import type { UserSettings } from '@/types/user';

const mockResetAppData = vi.fn().mockResolvedValue(undefined);
const mockGetFirebaseMessaging = vi.fn().mockResolvedValue({});

vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockReturnValue('doc-ref'),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  getFirestore: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  updateProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
  app: {},
  auth: { currentUser: { uid: 'user-1' } },
  getFirebaseMessaging: () => mockGetFirebaseMessaging(),
}));

vi.mock('@/hooks/usePairingCode', () => ({
  usePairingCode: () => ({
    code: '123456',
    expiresIn: '09:30',
    loading: false,
  }),
}));

vi.mock('@/utils/resetAppData', () => ({
  resetAppData: () => mockResetAppData(),
}));

const defaultSettings: UserSettings = {
  fontSize: 'large',
  highContrast: false,
  ringtoneVolume: 80,
  autoAnswer: false,
  appLockEnabled: false,
  appLockPinHash: null,
  language: 'en',
  restrictedNetworkMode: false,
};

describe('SettingsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders font size radio group with 2 options', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
    );
    expect(screen.getAllByRole('radiogroup').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('radio', { name: 'Large' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Extra Large' })).toBeInTheDocument();
  });

  it('reflects current fontSize in radio selection', () => {
    renderWithProviders(
      <SettingsScreen
        settings={{ ...defaultSettings, fontSize: 'x-large' }}
        userId="user-1"
        displayName="Test User"
      />,
    );
    const xlarge = screen.getByRole('radio', { name: 'Extra Large' }) as HTMLInputElement;
    expect(xlarge.checked).toBe(true);
  });

  it('writes fontSize change to Firestore via updateDoc', async () => {
    const { updateDoc } = await import('firebase/firestore');
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Extra Large' }));
    expect(updateDoc).toHaveBeenCalledWith('doc-ref', {
      'settings.fontSize': 'x-large',
    });
  });

  it('writes language change to Firestore via updateDoc', async () => {
    const { updateDoc } = await import('firebase/firestore');
    vi.mocked(updateDoc).mockClear();
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
    );
    fireEvent.click(screen.getByText('Español'));
    expect(updateDoc).toHaveBeenCalledWith('doc-ref', {
      'settings.language': 'es',
    });
  });

  it('renders pairing code section with PairingCodeDisplay', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
    );
    expect(screen.getByTestId('pairing-code-section')).toBeInTheDocument();
    // PairingCodeDisplay should render the code from the mock
    expect(screen.getByText('123456')).toBeInTheDocument();
  });

  it('Back button/link navigates to /elderly', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
      {
        routerProps: { initialEntries: ['/elderly/settings'] },
      },
    );
    const link = screen.getByRole('link', { name: /back/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/elderly');
  });

  it('renders language radio group with 5 options', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
    );
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Español')).toBeInTheDocument();
    expect(screen.getByText('עברית')).toBeInTheDocument();
    expect(screen.getByText('Русский')).toBeInTheDocument();
    expect(screen.getByText('Deutsch')).toBeInTheDocument();
  });

  it('reflects current language selection', () => {
    renderWithProviders(
      <SettingsScreen
        settings={{ ...defaultSettings, language: 'he' }}
        userId="user-1"
        displayName="Test User"
      />,
    );
    const hebrewRadio = screen.getByRole('radio', { name: 'עברית' }) as HTMLInputElement;
    expect(hebrewRadio.checked).toBe(true);
  });

  it('renders Reset App button', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
    );
    expect(screen.getByRole('button', { name: /reset app/i })).toBeInTheDocument();
  });

  it('opens confirm dialog when Reset App clicked', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /reset app/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/sign you out and remove all app data/i)).toBeInTheDocument();
  });

  it('calls resetAppData when confirmed', async () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /reset app/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => {
      expect(mockResetAppData).toHaveBeenCalled();
    });
  });

  it('closes dialog on cancel without calling resetAppData', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /reset app/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockResetAppData).not.toHaveBeenCalled();
  });

  it('renders UninstallGuide toggle', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
    );
    expect(screen.getByRole('button', { name: /how to remove/i })).toBeInTheDocument();
  });

  it('displays P2P connection mode when restrictedNetworkMode is false', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
    );
    expect(screen.getByTestId('connection-mode-section')).toBeInTheDocument();
    expect(screen.getByText('Direct (P2P)')).toBeInTheDocument();
  });

  it('displays Relay connection mode when restrictedNetworkMode is true', () => {
    renderWithProviders(
      <SettingsScreen
        settings={{ ...defaultSettings, restrictedNetworkMode: true }}
        userId="user-1"
        displayName="Test User"
      />,
    );
    expect(screen.getByText('Relay')).toBeInTheDocument();
  });

  describe('notification status', () => {
    const origNotification = globalThis.Notification;

    afterEach(() => {
      Object.defineProperty(globalThis, 'Notification', {
        value: origNotification,
        writable: true,
        configurable: true,
      });
    });

    it('shows "Enabled" when permission granted and messaging supported', async () => {
      Object.defineProperty(globalThis, 'Notification', {
        value: { permission: 'granted' },
        writable: true,
        configurable: true,
      });
      mockGetFirebaseMessaging.mockResolvedValue({});
      renderWithProviders(
        <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
      );
      await waitFor(() => {
        expect(screen.getByTestId('notification-status-section')).toBeInTheDocument();
      });
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });

    it('shows "Not supported" when permission granted but messaging unsupported', async () => {
      Object.defineProperty(globalThis, 'Notification', {
        value: { permission: 'granted' },
        writable: true,
        configurable: true,
      });
      mockGetFirebaseMessaging.mockResolvedValue(null);
      renderWithProviders(
        <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
      );
      await waitFor(() => {
        expect(screen.getByText('Not supported')).toBeInTheDocument();
      });
    });

    it('shows "Blocked" when Notification.permission is denied', async () => {
      Object.defineProperty(globalThis, 'Notification', {
        value: { permission: 'denied' },
        writable: true,
        configurable: true,
      });
      mockGetFirebaseMessaging.mockResolvedValue({});
      renderWithProviders(
        <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
      );
      await waitFor(() => {
        expect(screen.getByText('Blocked')).toBeInTheDocument();
      });
    });

    it('shows "Not set" when Notification.permission is default', async () => {
      Object.defineProperty(globalThis, 'Notification', {
        value: { permission: 'default' },
        writable: true,
        configurable: true,
      });
      mockGetFirebaseMessaging.mockResolvedValue({});
      renderWithProviders(
        <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
      );
      await waitFor(() => {
        expect(screen.getByText('Not set')).toBeInTheDocument();
      });
    });

    it('shows "Not supported" when Notification API is unavailable', async () => {
      Object.defineProperty(globalThis, 'Notification', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      mockGetFirebaseMessaging.mockResolvedValue(null);
      renderWithProviders(
        <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
      );
      await waitFor(() => {
        expect(screen.getByText('Not supported')).toBeInTheDocument();
      });
    });
  });

  it('passes vitest-axe accessibility check', async () => {
    const { container } = renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" displayName="Test User" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
