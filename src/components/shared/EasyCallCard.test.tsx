import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { EasyCallCard } from './EasyCallCard';

describe('EasyCallCard', () => {
  it('renders children', () => {
    render(<EasyCallCard>Card content</EasyCallCard>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('has card DaisyUI class', () => {
    const { container } = render(<EasyCallCard>Content</EasyCallCard>);
    expect(container.firstChild).toHaveClass('card');
  });

  it('renders as div when no onClick provided', () => {
    const { container } = render(<EasyCallCard>Content</EasyCallCard>);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('renders as button when onClick is provided', () => {
    render(<EasyCallCard onClick={() => {}}>Content</EasyCallCard>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('button variant has touch-target-min class', () => {
    render(<EasyCallCard onClick={() => {}}>Content</EasyCallCard>);
    expect(screen.getByRole('button')).toHaveClass('touch-target-min');
  });

  it('button variant is keyboard accessible', () => {
    render(
      <EasyCallCard onClick={() => {}} aria-label="Contact card">
        Content
      </EasyCallCard>,
    );
    const btn = screen.getByRole('button', { name: 'Contact card' });
    expect(btn).toBeInTheDocument();
  });

  it('calls onClick when button is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<EasyCallCard onClick={handleClick}>Content</EasyCallCard>);
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('passes vitest-axe as div', async () => {
    const { container } = render(<EasyCallCard>Card content</EasyCallCard>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('passes vitest-axe as button', async () => {
    const { container } = render(
      <EasyCallCard onClick={() => {}} aria-label="Contact card">
        Content
      </EasyCallCard>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('accepts className prop', () => {
    const { container } = render(<EasyCallCard className="extra-class">Content</EasyCallCard>);
    expect(container.firstChild).toHaveClass('extra-class');
  });
});
