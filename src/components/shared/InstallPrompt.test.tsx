import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitForElementToBeRemoved } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { InstallPrompt } from './InstallPrompt';

function createFakeBeforeInstallPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  }) as unknown as BeforeInstallPromptEvent;
  return event;
}

describe('InstallPrompt', () => {
  it('renders nothing before beforeinstallprompt fires', () => {
    const { container } = renderWithProviders(<InstallPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('shows install overlay after beforeinstallprompt event fires', () => {
    renderWithProviders(<InstallPrompt />);
    const fakeEvent = createFakeBeforeInstallPromptEvent();
    window.dispatchEvent(fakeEvent);
    expect(screen.getByText(/Install EasyCall/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
  });

  it('calls event.prompt() when Install button clicked', () => {
    renderWithProviders(<InstallPrompt />);
    const fakeEvent = createFakeBeforeInstallPromptEvent();
    window.dispatchEvent(fakeEvent);
    const installBtn = screen.getByRole('button', { name: /install/i });
    fireEvent.click(installBtn);
    expect(fakeEvent.prompt).toHaveBeenCalled();
  });

  it('hides overlay after userChoice resolves (accepted)', async () => {
    renderWithProviders(<InstallPrompt />);
    const fakeEvent = createFakeBeforeInstallPromptEvent('accepted');
    window.dispatchEvent(fakeEvent);
    fireEvent.click(screen.getByRole('button', { name: /install/i }));
    await waitForElementToBeRemoved(() => screen.queryByText(/Install EasyCall/i));
  });

  it('hides overlay after userChoice resolves (dismissed)', async () => {
    renderWithProviders(<InstallPrompt />);
    const fakeEvent = createFakeBeforeInstallPromptEvent('dismissed');
    window.dispatchEvent(fakeEvent);
    fireEvent.click(screen.getByRole('button', { name: /install/i }));
    await waitForElementToBeRemoved(() => screen.queryByText(/Install EasyCall/i));
  });

  it('passes vitest-axe accessibility check', async () => {
    const { container } = renderWithProviders(<InstallPrompt />);
    const fakeEvent = createFakeBeforeInstallPromptEvent();
    window.dispatchEvent(fakeEvent);
    expect(await axe(container)).toHaveNoViolations();
  });
});
