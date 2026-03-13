import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
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

  it('error: renders error message with role=alert', async () => {
    mockValidatePairingCode.mockRejectedValue(new Error('Pairing code has expired.'));

    const user = userEvent.setup();
    renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText(/6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /link account/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Pairing code has expired.');
  });

  it('passes vitest-axe', async () => {
    const { container } = renderWithProviders(<PairElderlyUser onSuccess={onSuccess} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
