import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { AppLock } from './AppLock';

const defaultProps = {
  isLocked: true,
  failedAttempts: 0,
  cooldownRemaining: 0,
  onPinSubmit: vi.fn().mockResolvedValue(false),
};

describe('AppLock', () => {
  it('renders children when isLocked is false', () => {
    renderWithProviders(
      <AppLock {...defaultProps} isLocked={false}>
        <div data-testid="content">App Content</div>
      </AppLock>,
    );
    expect(screen.getByTestId('content')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders lock screen when isLocked is true', () => {
    renderWithProviders(
      <AppLock {...defaultProps}>
        <div data-testid="content">App Content</div>
      </AppLock>,
    );
    expect(screen.getByRole('dialog', { name: /app lock screen/i })).toBeInTheDocument();
    expect(screen.getByText('Enter PIN to unlock')).toBeInTheDocument();
  });

  it('has buttons 0-9, clear, and backspace', () => {
    renderWithProviders(
      <AppLock {...defaultProps}>
        <div />
      </AppLock>,
    );
    for (let i = 0; i <= 9; i++) {
      expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /backspace/i })).toBeInTheDocument();
  });

  it('tapping 4 digits calls onPinSubmit with the PIN string', async () => {
    const user = userEvent.setup();
    const onPinSubmit = vi.fn().mockResolvedValue(true);
    renderWithProviders(
      <AppLock {...defaultProps} onPinSubmit={onPinSubmit}>
        <div />
      </AppLock>,
    );

    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: '4' }));

    await waitFor(() => {
      expect(onPinSubmit).toHaveBeenCalledWith('1234');
    });
  });

  it('shows "Wrong PIN" after failedAttempts > 0', () => {
    renderWithProviders(
      <AppLock {...defaultProps} failedAttempts={1}>
        <div />
      </AppLock>,
    );
    expect(screen.getByText('Wrong PIN')).toBeInTheDocument();
  });

  it('shows cooldown message when cooldownRemaining > 0', () => {
    renderWithProviders(
      <AppLock {...defaultProps} cooldownRemaining={25} failedAttempts={3}>
        <div />
      </AppLock>,
    );
    expect(screen.getByText(/too many attempts.*25s/i)).toBeInTheDocument();
  });

  it('disables keypad during cooldown', () => {
    renderWithProviders(
      <AppLock {...defaultProps} cooldownRemaining={10}>
        <div />
      </AppLock>,
    );
    for (let i = 0; i <= 9; i++) {
      expect(screen.getByRole('button', { name: String(i) })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /backspace/i })).toBeDisabled();
  });

  it('clear button resets entered digits', async () => {
    const user = userEvent.setup();
    const onPinSubmit = vi.fn().mockResolvedValue(false);
    renderWithProviders(
      <AppLock {...defaultProps} onPinSubmit={onPinSubmit}>
        <div />
      </AppLock>,
    );

    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: /clear/i }));
    // Now enter 4 digits to verify it reset
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: '6' }));
    await user.click(screen.getByRole('button', { name: '7' }));
    await user.click(screen.getByRole('button', { name: '8' }));

    await waitFor(() => {
      expect(onPinSubmit).toHaveBeenCalledWith('5678');
    });
  });

  it('backspace removes last digit', async () => {
    const user = userEvent.setup();
    const onPinSubmit = vi.fn().mockResolvedValue(false);
    renderWithProviders(
      <AppLock {...defaultProps} onPinSubmit={onPinSubmit}>
        <div />
      </AppLock>,
    );

    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: /backspace/i }));
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: '5' }));

    await waitFor(() => {
      expect(onPinSubmit).toHaveBeenCalledWith('1345');
    });
  });

  it('passes vitest-axe accessibility check', async () => {
    const { container } = renderWithProviders(
      <AppLock {...defaultProps}>
        <div />
      </AppLock>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
