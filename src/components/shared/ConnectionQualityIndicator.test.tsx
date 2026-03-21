import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { ConnectionQualityIndicator } from './ConnectionQualityIndicator';
import type { ConnectionQuality } from './connectionQualityStyles';

describe('ConnectionQualityIndicator', () => {
  it('returns null when quality is null', () => {
    const { container } = renderWithProviders(<ConnectionQualityIndicator quality={null} />);
    expect(container.innerHTML).toBe('');
  });

  it.each<ConnectionQuality>(['good', 'fair', 'poor'])(
    'renders role="status" for %s quality',
    (quality) => {
      renderWithProviders(<ConnectionQualityIndicator quality={quality} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    },
  );

  it('has accessible name "Good connection" for good', () => {
    renderWithProviders(<ConnectionQualityIndicator quality="good" />);
    const status = screen.getByRole('status', { name: /good connection/i });
    expect(status).toHaveTextContent('Good connection');
  });

  it('has accessible name "Fair connection" for fair', () => {
    renderWithProviders(<ConnectionQualityIndicator quality="fair" />);
    const status = screen.getByRole('status', { name: /fair connection/i });
    expect(status).toHaveTextContent('Fair connection');
  });

  it('has accessible name "Poor connection" for poor', () => {
    renderWithProviders(<ConnectionQualityIndicator quality="poor" />);
    const status = screen.getByRole('status', { name: /poor connection/i });
    expect(status).toHaveTextContent('Poor connection');
  });

  it('applies text-success class for good', () => {
    renderWithProviders(<ConnectionQualityIndicator quality="good" />);
    expect(screen.getByRole('status').className).toContain('text-success');
  });

  it('applies text-warning class for fair', () => {
    renderWithProviders(<ConnectionQualityIndicator quality="fair" />);
    expect(screen.getByRole('status').className).toContain('text-warning');
  });

  it('applies text-error class for poor', () => {
    renderWithProviders(<ConnectionQualityIndicator quality="poor" />);
    expect(screen.getByRole('status').className).toContain('text-error');
  });

  it('fills all 3 bars for good', () => {
    const { container } = renderWithProviders(<ConnectionQualityIndicator quality="good" />);
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(3);
    rects.forEach((rect) => {
      expect(rect.getAttribute('fill')).toBe('currentColor');
    });
  });

  it('fills 2 bars for fair (third is outlined)', () => {
    const { container } = renderWithProviders(<ConnectionQualityIndicator quality="fair" />);
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(3);
    expect(rects[0]!.getAttribute('fill')).toBe('currentColor');
    expect(rects[1]!.getAttribute('fill')).toBe('currentColor');
    expect(rects[2]!.getAttribute('fill')).toBe('none');
  });

  it('fills 1 bar for poor (second and third are outlined)', () => {
    const { container } = renderWithProviders(<ConnectionQualityIndicator quality="poor" />);
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(3);
    expect(rects[0]!.getAttribute('fill')).toBe('currentColor');
    expect(rects[1]!.getAttribute('fill')).toBe('none');
    expect(rects[2]!.getAttribute('fill')).toBe('none');
  });

  it('forwards className prop', () => {
    renderWithProviders(<ConnectionQualityIndicator quality="good" className="extra-class" />);
    expect(screen.getByRole('status').className).toContain('extra-class');
  });

  it.each<ConnectionQuality>(['good', 'fair', 'poor'])(
    'passes vitest-axe for %s',
    async (quality) => {
      const { container } = renderWithProviders(<ConnectionQualityIndicator quality={quality} />);
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
