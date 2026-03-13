import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { EasyCallButton } from './EasyCallButton';

describe('EasyCallButton', () => {
  it('renders children text', () => {
    render(<EasyCallButton>Call Now</EasyCallButton>);
    expect(screen.getByRole('button', { name: 'Call Now' })).toBeInTheDocument();
  });

  it('has btn DaisyUI class and default variant class', () => {
    render(<EasyCallButton>OK</EasyCallButton>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('btn');
    expect(btn).toHaveClass('btn-primary');
  });

  it('applies btn-error class for danger variant', () => {
    render(<EasyCallButton variant="danger">End</EasyCallButton>);
    expect(screen.getByRole('button')).toHaveClass('btn-error');
  });

  it('applies btn-secondary class for secondary variant', () => {
    render(<EasyCallButton variant="secondary">Cancel</EasyCallButton>);
    expect(screen.getByRole('button')).toHaveClass('btn-secondary');
  });

  it('has touch-target-min class by default', () => {
    render(<EasyCallButton>OK</EasyCallButton>);
    expect(screen.getByRole('button')).toHaveClass('touch-target-min');
  });

  it('has touch-target-primary class for large size', () => {
    render(<EasyCallButton size="large">OK</EasyCallButton>);
    expect(screen.getByRole('button')).toHaveClass('touch-target-primary');
  });

  it('has touch-target-call class for call size', () => {
    render(<EasyCallButton size="call">Answer</EasyCallButton>);
    expect(screen.getByRole('button')).toHaveClass('touch-target-call');
  });

  it('has font-bold and button font-size class', () => {
    render(<EasyCallButton>OK</EasyCallButton>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('font-bold');
    expect(btn.className).toMatch(/text-\[length:var\(--text-button\)\]/);
  });

  it('is keyboard-accessible with role=button', () => {
    render(<EasyCallButton>OK</EasyCallButton>);
    const btn = screen.getByRole('button');
    expect(btn.tagName).toBe('BUTTON');
  });

  it('passes vitest-axe with text content', async () => {
    const { container } = render(<EasyCallButton>OK</EasyCallButton>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('passes vitest-axe with aria-label', async () => {
    const { container } = render(
      <EasyCallButton aria-label="Call contact">📞</EasyCallButton>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<EasyCallButton onClick={handleClick}>OK</EasyCallButton>);
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('disabled state: has disabled attr and does not call onClick', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <EasyCallButton disabled onClick={handleClick}>
        OK
      </EasyCallButton>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
