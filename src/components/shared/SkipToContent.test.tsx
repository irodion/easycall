import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { SkipToContent } from './SkipToContent';

describe('SkipToContent', () => {
  it('renders with sr-only class (visually hidden by default)', () => {
    renderWithProviders(<SkipToContent />);
    const link = screen.getByText('Skip to content');
    expect(link.className).toContain('sr-only');
  });

  it('links to #main-content', () => {
    renderWithProviders(<SkipToContent />);
    const link = screen.getByText('Skip to content');
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('has correct text content', () => {
    renderWithProviders(<SkipToContent />);
    expect(screen.getByText('Skip to content')).toBeInTheDocument();
  });

  it('passes accessibility checks', async () => {
    const { container } = renderWithProviders(
      <main id="main-content">
        <SkipToContent />
      </main>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
