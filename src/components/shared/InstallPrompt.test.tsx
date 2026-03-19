import { describe, it, expect, vi } from 'vitest';
import { screen, act } from '@testing-library/react';
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

  it('shows install overlay after beforeinstallprompt event fires', async () => {
    renderWithProviders(<InstallPrompt />);
    const fakeEvent = createFakeBeforeInstallPromptEvent();
    await act(async () => {
      window.dispatchEvent(fakeEvent);
    });
    expect(screen.getByText(/Install EasyCall/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
  });

  it('calls event.prompt() when Install button clicked', async () => {
    renderWithProviders(<InstallPrompt />);
    const fakeEvent = createFakeBeforeInstallPromptEvent();
    await act(async () => {
      window.dispatchEvent(fakeEvent);
    });
    const installBtn = screen.getByRole('button', { name: /install/i });
    await act(async () => {
      installBtn.click();
    });
    expect(fakeEvent.prompt).toHaveBeenCalled();
  });

  it('hides overlay after userChoice resolves (accepted)', async () => {
    renderWithProviders(<InstallPrompt />);
    const fakeEvent = createFakeBeforeInstallPromptEvent('accepted');
    await act(async () => {
      window.dispatchEvent(fakeEvent);
    });
    await act(async () => {
      screen.getByRole('button', { name: /install/i }).click();
    });
    expect(screen.queryByText(/Install EasyCall/i)).not.toBeInTheDocument();
  });

  it('hides overlay after userChoice resolves (dismissed)', async () => {
    renderWithProviders(<InstallPrompt />);
    const fakeEvent = createFakeBeforeInstallPromptEvent('dismissed');
    await act(async () => {
      window.dispatchEvent(fakeEvent);
    });
    // "dismissed" outcome keeps prompt available — overlay stays visible
    expect(screen.getByText(/Install EasyCall/i)).toBeInTheDocument();
  });

  it('passes vitest-axe accessibility check', async () => {
    const { container } = renderWithProviders(<InstallPrompt />);
    const fakeEvent = createFakeBeforeInstallPromptEvent();
    await act(async () => {
      window.dispatchEvent(fakeEvent);
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
