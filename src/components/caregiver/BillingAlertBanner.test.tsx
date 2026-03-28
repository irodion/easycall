import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import type { BillingAlert, BillingSeverity } from '@/hooks/useBillingAlert';

const mockDismiss = vi.fn();
const mockHook = {
  alert: null as BillingAlert | null,
  dismissed: false,
  dismiss: mockDismiss,
};

vi.mock('@/hooks/useBillingAlert', () => ({
  useBillingAlert: () => mockHook,
}));

function makeAlert(severity: BillingSeverity, threshold: number): BillingAlert {
  return {
    costAmount: 12,
    budgetAmount: 20,
    currencyCode: 'ILS',
    thresholdExceeded: threshold,
    severity,
    updatedAt: null,
  };
}

describe('BillingAlertBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.alert = null;
    mockHook.dismissed = false;
  });

  it('renders nothing when alert is null', async () => {
    const { BillingAlertBanner } = await import('./BillingAlertBanner');
    const { container } = renderWithProviders(<BillingAlertBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when dismissed is true', async () => {
    mockHook.alert = makeAlert('warning', 0.6);
    mockHook.dismissed = true;

    const { BillingAlertBanner } = await import('./BillingAlertBanner');
    const { container } = renderWithProviders(<BillingAlertBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('renders warning-styled alert at 60%', async () => {
    mockHook.alert = makeAlert('warning', 0.6);

    const { BillingAlertBanner } = await import('./BillingAlertBanner');
    renderWithProviders(<BillingAlertBanner />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.className).toContain('alert-warning');
  });

  it('renders critical-styled alert at 90%', async () => {
    mockHook.alert = makeAlert('critical', 0.9);

    const { BillingAlertBanner } = await import('./BillingAlertBanner');
    renderWithProviders(<BillingAlertBanner />);

    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('alert-error');
  });

  it('renders critical alert at 100%', async () => {
    mockHook.alert = makeAlert('critical', 1.0);

    const { BillingAlertBanner } = await import('./BillingAlertBanner');
    renderWithProviders(<BillingAlertBanner />);

    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('alert-error');
  });

  it('dismiss button calls dismiss', async () => {
    mockHook.alert = makeAlert('warning', 0.6);

    const { BillingAlertBanner } = await import('./BillingAlertBanner');
    renderWithProviders(<BillingAlertBanner />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(mockDismiss).toHaveBeenCalledOnce();
  });

  it('has role="alert" attribute', async () => {
    mockHook.alert = makeAlert('warning', 0.6);

    const { BillingAlertBanner } = await import('./BillingAlertBanner');
    renderWithProviders(<BillingAlertBanner />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('passes vitest-axe', async () => {
    mockHook.alert = makeAlert('warning', 0.6);

    const { BillingAlertBanner } = await import('./BillingAlertBanner');
    const { container } = renderWithProviders(<BillingAlertBanner />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
