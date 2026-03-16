import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { SettingsScreen } from './SettingsScreen';
import type { UserSettings } from '@/types/user';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockReturnValue('doc-ref'),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  getFirestore: vi.fn(),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
  app: {},
}));

vi.mock('@/hooks/usePairingCode', () => ({
  usePairingCode: () => ({
    code: '123456',
    expiresIn: '09:30',
    loading: false,
  }),
}));

const defaultSettings: UserSettings = {
  fontSize: 'large',
  highContrast: false,
  ringtoneVolume: 80,
  autoAnswer: false,
  appLockEnabled: false,
  appLockPinHash: null,
  language: 'en',
};

describe('SettingsScreen', () => {
  it('renders font size radio group with 2 options', () => {
    renderWithProviders(<SettingsScreen settings={defaultSettings} userId="user-1" />);
    expect(screen.getAllByRole('radiogroup').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('radio', { name: 'Large' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Extra Large' })).toBeInTheDocument();
  });

  it('reflects current fontSize in radio selection', () => {
    renderWithProviders(
      <SettingsScreen settings={{ ...defaultSettings, fontSize: 'x-large' }} userId="user-1" />,
    );
    const xlarge = screen.getByRole('radio', { name: 'Extra Large' }) as HTMLInputElement;
    expect(xlarge.checked).toBe(true);
  });

  it('writes fontSize change to Firestore via updateDoc', async () => {
    const { updateDoc } = await import('firebase/firestore');
    renderWithProviders(<SettingsScreen settings={defaultSettings} userId="user-1" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Extra Large' }));
    expect(updateDoc).toHaveBeenCalledWith('doc-ref', {
      settings: { ...defaultSettings, fontSize: 'x-large' },
    });
  });

  it('writes language change to Firestore via updateDoc', async () => {
    const { updateDoc } = await import('firebase/firestore');
    vi.mocked(updateDoc).mockClear();
    renderWithProviders(<SettingsScreen settings={defaultSettings} userId="user-1" />);
    fireEvent.click(screen.getByText('Español'));
    expect(updateDoc).toHaveBeenCalledWith('doc-ref', {
      settings: { ...defaultSettings, language: 'es' },
    });
  });

  it('renders pairing code section with PairingCodeDisplay', () => {
    renderWithProviders(<SettingsScreen settings={defaultSettings} userId="user-1" />);
    expect(screen.getByTestId('pairing-code-section')).toBeInTheDocument();
    // PairingCodeDisplay should render the code from the mock
    expect(screen.getByText('123456')).toBeInTheDocument();
  });

  it('Add Contact button navigates to /elderly/add-contact', () => {
    renderWithProviders(<SettingsScreen settings={defaultSettings} userId="user-1" />, {
      routerProps: { initialEntries: ['/elderly/settings'] },
    });
    const link = screen.getByRole('link', { name: /add contact/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/elderly/add-contact');
  });

  it('Back button/link navigates to /elderly', () => {
    renderWithProviders(<SettingsScreen settings={defaultSettings} userId="user-1" />, {
      routerProps: { initialEntries: ['/elderly/settings'] },
    });
    const link = screen.getByRole('link', { name: /back/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/elderly');
  });

  it('renders language radio group with 5 options', () => {
    renderWithProviders(<SettingsScreen settings={defaultSettings} userId="user-1" />);
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Español')).toBeInTheDocument();
    expect(screen.getByText('עברית')).toBeInTheDocument();
    expect(screen.getByText('Русский')).toBeInTheDocument();
    expect(screen.getByText('Deutsch')).toBeInTheDocument();
  });

  it('reflects current language selection', () => {
    renderWithProviders(
      <SettingsScreen settings={{ ...defaultSettings, language: 'he' }} userId="user-1" />,
    );
    const hebrewRadio = screen.getByRole('radio', { name: 'עברית' }) as HTMLInputElement;
    expect(hebrewRadio.checked).toBe(true);
  });

  it('passes vitest-axe accessibility check', async () => {
    const { container } = renderWithProviders(
      <SettingsScreen settings={defaultSettings} userId="user-1" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
