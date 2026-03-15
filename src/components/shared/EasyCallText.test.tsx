import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { EasyCallText } from './EasyCallText';

describe('EasyCallText', () => {
  it('renders children', () => {
    render(<EasyCallText>Hello</EasyCallText>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders as p by default', () => {
    render(<EasyCallText>Text</EasyCallText>);
    expect(screen.getByText('Text').tagName).toBe('P');
  });

  it('default variant applies body font-size class', () => {
    render(<EasyCallText>Text</EasyCallText>);
    expect(screen.getByText('Text').className).toMatch(/text-\[length:var\(--text-body\)\]/);
  });

  it('variant="heading" applies heading font-size class', () => {
    render(<EasyCallText variant="heading">Title</EasyCallText>);
    expect(screen.getByText('Title').className).toMatch(/text-\[length:var\(--text-heading\)\]/);
  });

  it('variant="button" applies button font-size class', () => {
    render(<EasyCallText variant="button">Click</EasyCallText>);
    expect(screen.getByText('Click').className).toMatch(/text-\[length:var\(--text-button\)\]/);
  });

  it('variant="display" applies display font-size class', () => {
    render(<EasyCallText variant="display">Big</EasyCallText>);
    expect(screen.getByText('Big').className).toMatch(/text-\[length:var\(--text-display\)\]/);
  });

  it('fontSize="x-large" applies text-xl scale-up class', () => {
    render(<EasyCallText fontSize="x-large">Big text</EasyCallText>);
    expect(screen.getByText('Big text')).toHaveClass('text-xl');
  });

  it('fontSize="large" does not apply text-xl', () => {
    render(<EasyCallText fontSize="large">Normal large</EasyCallText>);
    expect(screen.getByText('Normal large')).not.toHaveClass('text-xl');
  });

  it('as="h1" renders h1 element', () => {
    render(<EasyCallText as="h1">Heading</EasyCallText>);
    expect(screen.getByText('Heading').tagName).toBe('H1');
  });

  it('as="span" renders span element', () => {
    render(<EasyCallText as="span">Inline</EasyCallText>);
    expect(screen.getByText('Inline').tagName).toBe('SPAN');
  });

  it('accepts className prop', () => {
    render(<EasyCallText className="extra">Text</EasyCallText>);
    expect(screen.getByText('Text')).toHaveClass('extra');
  });

  it('passes vitest-axe', async () => {
    const { container } = render(<EasyCallText>Accessible text</EasyCallText>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('passes vitest-axe for heading variant', async () => {
    const { container } = render(
      <EasyCallText as="h1" variant="heading">
        Page title
      </EasyCallText>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
