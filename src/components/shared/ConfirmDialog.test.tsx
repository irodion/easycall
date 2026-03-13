import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('does not render when open is false', () => {
    renderWithProviders(
      <ConfirmDialog
        open={false}
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
  });

  it('renders message when open is true', () => {
    renderWithProviders(
      <ConfirmDialog
        open={true}
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('calls onConfirm when Confirm button clicked', () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open={true}
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onCancel when Cancel button clicked', () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open={true}
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('passes vitest-axe when open', async () => {
    const { container } = renderWithProviders(
      <ConfirmDialog
        open={true}
        message="Are you sure you want to delete this contact?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
