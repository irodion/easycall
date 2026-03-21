import { describe, it, expect, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { UninstallGuide } from './UninstallGuide';

const originalUserAgent = navigator.userAgent;

function mockUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(navigator, 'userAgent', {
    value: originalUserAgent,
    writable: true,
    configurable: true,
  });
});

describe('UninstallGuide', () => {
  it('renders the toggle button', () => {
    renderWithProviders(<UninstallGuide />);
    expect(screen.getByRole('button', { name: /how to remove from device/i })).toBeInTheDocument();
  });

  it('starts collapsed (no instructions visible)', () => {
    renderWithProviders(<UninstallGuide />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('expands to show instructions on click', () => {
    renderWithProviders(<UninstallGuide />);
    fireEvent.click(screen.getByRole('button', { name: /how to remove/i }));
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('collapses on second click', () => {
    renderWithProviders(<UninstallGuide />);
    const btn = screen.getByRole('button', { name: /how to remove/i });
    fireEvent.click(btn);
    expect(screen.getByRole('list')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('sets aria-expanded correctly', () => {
    renderWithProviders(<UninstallGuide />);
    const btn = screen.getByRole('button', { name: /how to remove/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows iOS steps on iOS user agent', () => {
    mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    renderWithProviders(<UninstallGuide />);
    fireEvent.click(screen.getByRole('button', { name: /how to remove/i }));
    expect(
      screen.getByText(/long-press the easycall icon on your home screen/i),
    ).toBeInTheDocument();
  });

  it('shows iOS steps on iPadOS user agent (desktop-class UA with touch)', () => {
    mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15');
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      writable: true,
      configurable: true,
    });
    renderWithProviders(<UninstallGuide />);
    fireEvent.click(screen.getByRole('button', { name: /how to remove/i }));
    expect(
      screen.getByText(/long-press the easycall icon on your home screen/i),
    ).toBeInTheDocument();
    // Restore
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      writable: true,
      configurable: true,
    });
  });

  it('shows Android steps on Android user agent', () => {
    mockUserAgent('Mozilla/5.0 (Linux; Android 14)');
    renderWithProviders(<UninstallGuide />);
    fireEvent.click(screen.getByRole('button', { name: /how to remove/i }));
    expect(screen.getByText(/long-press the easycall icon/i)).toBeInTheDocument();
    expect(screen.getByText(/uninstall/i)).toBeInTheDocument();
  });

  it('shows desktop steps by default', () => {
    mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X)');
    renderWithProviders(<UninstallGuide />);
    fireEvent.click(screen.getByRole('button', { name: /how to remove/i }));
    expect(screen.getByText(/three dots/i)).toBeInTheDocument();
  });

  it('passes vitest-axe accessibility check (collapsed)', async () => {
    const { container } = renderWithProviders(<UninstallGuide />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('passes vitest-axe accessibility check (expanded)', async () => {
    const { container } = renderWithProviders(<UninstallGuide />);
    fireEvent.click(screen.getByRole('button', { name: /how to remove/i }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
