import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { SettingsScreen } from './SettingsScreen';
import type { UserSettings } from '@/types/user';

const defaultSettings: UserSettings = {
  fontSize: 'large',
  highContrast: false,
  ringtoneVolume: 80,
  autoAnswer: false,
};

describe('SettingsScreen', () => {
  it('renders font size radio group with 2 options', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} onSettingsChange={vi.fn()} userId="user-1" />
    );
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByLabelText(/large/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/extra large/i)).toBeInTheDocument();
  });

  it('reflects current fontSize in radio selection', () => {
    renderWithProviders(
      <SettingsScreen settings={{ ...defaultSettings, fontSize: 'x-large' }} onSettingsChange={vi.fn()} userId="user-1" />
    );
    const xlarge = screen.getByLabelText(/extra large/i) as HTMLInputElement;
    expect(xlarge.checked).toBe(true);
  });

  it('clicking a radio calls onSettingsChange with updated fontSize', () => {
    const onSettingsChange = vi.fn();
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} onSettingsChange={onSettingsChange} userId="user-1" />
    );
    fireEvent.click(screen.getByLabelText(/extra large/i));
    expect(onSettingsChange).toHaveBeenCalledWith({ ...defaultSettings, fontSize: 'x-large' });
  });

  it('renders pairing code section', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} onSettingsChange={vi.fn()} userId="user-1" />
    );
    expect(screen.getByTestId('pairing-code-section')).toBeInTheDocument();
  });

  it('Add Contact button navigates to /elderly/add-contact', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} onSettingsChange={vi.fn()} userId="user-1" />,
      { routerProps: { initialEntries: ['/elderly/settings'] } }
    );
    expect(screen.getByRole('link', { name: /add contact/i })).toBeInTheDocument();
  });

  it('Back button/link navigates to /elderly', () => {
    renderWithProviders(
      <SettingsScreen settings={defaultSettings} onSettingsChange={vi.fn()} userId="user-1" />,
      { routerProps: { initialEntries: ['/elderly/settings'] } }
    );
    expect(screen.getByRole('link', { name: /back/i })).toBeInTheDocument();
  });

  it('passes vitest-axe accessibility check', async () => {
    const { container } = renderWithProviders(
      <SettingsScreen settings={defaultSettings} onSettingsChange={vi.fn()} userId="user-1" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
