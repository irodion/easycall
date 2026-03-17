import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

const mockValidatePairingCode = vi.fn();
vi.mock('@/services/callSignaling', () => ({
  validatePairingCode: (...args: unknown[]) => mockValidatePairingCode(...args),
}));

import { PairElderlyUser } from './PairElderlyUser';

describe('PairElderlyUser', () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders input with inputMode=numeric', () => {
    renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    const input = screen.getByLabelText(/6-digit code/i);
    expect(input).toHaveAttribute('inputMode', 'numeric');
  });

  it('submit button disabled when code.length < 6', () => {
    renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    expect(screen.getByRole('button', { name: /link account/i })).toBeDisabled();
  });

  it('submit button enabled when code.length === 6', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText(/6-digit code/i), '123456');
    expect(screen.getByRole('button', { name: /link account/i })).toBeEnabled();
  });

  it('filters out non-numeric chars', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    const input = screen.getByLabelText(/6-digit code/i);
    await user.type(input, 'abc123def456');
    expect(input).toHaveValue('123456');
  });

  it('submit calls validatePairingCode with code', async () => {
    mockValidatePairingCode.mockResolvedValue({ elderlyUserId: 'elderly-1' });

    const user = userEvent.setup();
    renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText(/6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /link account/i }));

    expect(mockValidatePairingCode).toHaveBeenCalledWith('123456');
  });

  it('success: calls onSuccess with elderlyUserId', async () => {
    mockValidatePairingCode.mockResolvedValue({ elderlyUserId: 'elderly-1' });

    const user = userEvent.setup();
    renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText(/6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /link account/i }));

    expect(onSuccess).toHaveBeenCalledWith('elderly-1');
  });

  it('error: renders friendly error for Firebase "internal" error code', async () => {
    const functionsError = Object.assign(new Error('internal'), { code: 'functions/internal' });
    mockValidatePairingCode.mockRejectedValue(functionsError);

    const user = userEvent.setup();
    renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText(/6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /link account/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Invalid or expired code. Please check and try again.',
    );
  });

  it('error: renders friendly error for "already-exists" error code', async () => {
    const functionsError = Object.assign(new Error('already-exists'), {
      code: 'functions/already-exists',
    });
    mockValidatePairingCode.mockRejectedValue(functionsError);

    const user = userEvent.setup();
    renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText(/6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /link account/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('This code has already been used.');
  });

  it('does not submit when code is empty via form submit', () => {
    renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    // Directly submit the form to bypass the disabled button and exercise the !code.trim() guard
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    expect(mockValidatePairingCode).not.toHaveBeenCalled();
  });

  it('does not double-submit while loading', async () => {
    let resolveValidate!: (value: { elderlyUserId: string }) => void;
    mockValidatePairingCode.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveValidate = resolve;
        }),
    );

    const user = userEvent.setup();
    renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText(/6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /link account/i }));

    // Button should now show "Linking..." and be disabled
    const linkingBtn = screen.getByRole('button', { name: /linking/i });
    expect(linkingBtn).toBeDisabled();

    // Attempt a second click while still loading
    await user.click(linkingBtn);
    expect(mockValidatePairingCode).toHaveBeenCalledTimes(1);

    resolveValidate({ elderlyUserId: 'elderly-1' });
  });

  it('shows generic error for non-Error rejection', async () => {
    mockValidatePairingCode.mockRejectedValue('string error');

    const user = userEvent.setup();
    renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText(/6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /link account/i }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('passes vitest-axe', async () => {
    const { container } = renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
