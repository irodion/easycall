import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { StatusIndicator } from './StatusIndicator';

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('StatusIndicator', () => {
  it('renders green dot when state=online', () => {
    const { container } = renderWithI18n(<StatusIndicator state="online" />);
    const dot = container.querySelector('span[role="status"]')!;
    expect(dot.className).toContain('bg-success');
  });

  it('renders amber dot when state=in-call', () => {
    const { container } = renderWithI18n(<StatusIndicator state="in-call" />);
    const dot = container.querySelector('span[role="status"]')!;
    expect(dot.className).toContain('bg-warning');
  });

  it('renders gray dot when state=offline', () => {
    const { container } = renderWithI18n(<StatusIndicator state="offline" />);
    const dot = container.querySelector('span[role="status"]')!;
    expect(dot.className).toContain('bg-base-content/30');
  });

  it('applies correct aria-label for online', () => {
    renderWithI18n(<StatusIndicator state="online" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Online');
  });

  it('applies correct aria-label for in-call', () => {
    renderWithI18n(<StatusIndicator state="in-call" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'In a call');
  });

  it('applies correct aria-label for offline', () => {
    renderWithI18n(<StatusIndicator state="offline" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Offline');
  });

  it('defaults to sm size (w-3 h-3)', () => {
    const { container } = renderWithI18n(<StatusIndicator state="online" />);
    const dot = container.querySelector('span[role="status"]')!;
    expect(dot.className).toContain('w-3');
    expect(dot.className).toContain('h-3');
  });

  it('applies md size (w-4 h-4) when size=md', () => {
    const { container } = renderWithI18n(<StatusIndicator state="online" size="md" />);
    const dot = container.querySelector('span[role="status"]')!;
    expect(dot.className).toContain('w-4');
    expect(dot.className).toContain('h-4');
  });

  it('passes vitest-axe accessibility check', async () => {
    const { container } = renderWithI18n(<StatusIndicator state="online" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
