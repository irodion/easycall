import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { ConnectionQualityIndicator } from './ConnectionQualityIndicator';
import type { ConnectionQuality } from './connectionQualityStyles';

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('ConnectionQualityIndicator', () => {
  it('returns null when quality is null', () => {
    const { container } = renderWithI18n(<ConnectionQualityIndicator quality={null} />);
    expect(container.innerHTML).toBe('');
  });

  it.each<ConnectionQuality>(['good', 'fair', 'poor'])(
    'renders role="status" for %s quality',
    (quality) => {
      renderWithI18n(<ConnectionQualityIndicator quality={quality} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    },
  );

  it('has aria-label "Good connection" for good', () => {
    renderWithI18n(<ConnectionQualityIndicator quality="good" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Good connection');
  });

  it('has aria-label "Fair connection" for fair', () => {
    renderWithI18n(<ConnectionQualityIndicator quality="fair" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Fair connection');
  });

  it('has aria-label "Poor connection" for poor', () => {
    renderWithI18n(<ConnectionQualityIndicator quality="poor" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Poor connection');
  });

  it('applies text-success class for good', () => {
    renderWithI18n(<ConnectionQualityIndicator quality="good" />);
    expect(screen.getByRole('status').className).toContain('text-success');
  });

  it('applies text-warning class for fair', () => {
    renderWithI18n(<ConnectionQualityIndicator quality="fair" />);
    expect(screen.getByRole('status').className).toContain('text-warning');
  });

  it('applies text-error class for poor', () => {
    renderWithI18n(<ConnectionQualityIndicator quality="poor" />);
    expect(screen.getByRole('status').className).toContain('text-error');
  });

  it('fills all 3 bars for good', () => {
    const { container } = renderWithI18n(<ConnectionQualityIndicator quality="good" />);
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(3);
    rects.forEach((rect) => {
      expect(rect.getAttribute('fill')).toBe('currentColor');
    });
  });

  it('fills 2 bars for fair (third is outlined)', () => {
    const { container } = renderWithI18n(<ConnectionQualityIndicator quality="fair" />);
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(3);
    expect(rects[0]!.getAttribute('fill')).toBe('currentColor');
    expect(rects[1]!.getAttribute('fill')).toBe('currentColor');
    expect(rects[2]!.getAttribute('fill')).toBe('none');
  });

  it('fills 1 bar for poor (second and third are outlined)', () => {
    const { container } = renderWithI18n(<ConnectionQualityIndicator quality="poor" />);
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(3);
    expect(rects[0]!.getAttribute('fill')).toBe('currentColor');
    expect(rects[1]!.getAttribute('fill')).toBe('none');
    expect(rects[2]!.getAttribute('fill')).toBe('none');
  });

  it('forwards className prop', () => {
    renderWithI18n(<ConnectionQualityIndicator quality="good" className="extra-class" />);
    expect(screen.getByRole('status').className).toContain('extra-class');
  });

  it.each<ConnectionQuality>(['good', 'fair', 'poor'])(
    'passes vitest-axe for %s',
    async (quality) => {
      const { container } = renderWithI18n(<ConnectionQualityIndicator quality={quality} />);
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
