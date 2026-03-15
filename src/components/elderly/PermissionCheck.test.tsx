import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { PermissionCheck } from './PermissionCheck';

vi.mock('@/hooks/useMediaPermissions');

describe('PermissionCheck', () => {
  it('shows loading spinner when checking', async () => {
    const { useMediaPermissions } = await import('@/hooks/useMediaPermissions');
    vi.mocked(useMediaPermissions).mockReturnValue({ status: 'checking', retry: vi.fn() });
    renderWithProviders(<PermissionCheck onReady={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('spinner has accessible label when checking', async () => {
    const { useMediaPermissions } = await import('@/hooks/useMediaPermissions');
    vi.mocked(useMediaPermissions).mockReturnValue({ status: 'checking', retry: vi.fn() });
    const { container } = renderWithProviders(<PermissionCheck onReady={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows instruction text when prompt', async () => {
    const { useMediaPermissions } = await import('@/hooks/useMediaPermissions');
    vi.mocked(useMediaPermissions).mockReturnValue({ status: 'prompt', retry: vi.fn() });
    renderWithProviders(<PermissionCheck onReady={vi.fn()} />);
    expect(screen.getByText(/Tap ALLOW when asked/i)).toBeInTheDocument();
  });

  it('shows denied state with Try Again button', async () => {
    const { useMediaPermissions } = await import('@/hooks/useMediaPermissions');
    const retry = vi.fn();
    vi.mocked(useMediaPermissions).mockReturnValue({ status: 'denied', retry });
    renderWithProviders(<PermissionCheck onReady={vi.fn()} />);
    expect(
      screen.getByText(/camera.*blocked|blocked.*camera|permission.*denied|denied/i),
    ).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(btn);
    expect(retry).toHaveBeenCalled();
  });

  it('shows no-device message', async () => {
    const { useMediaPermissions } = await import('@/hooks/useMediaPermissions');
    vi.mocked(useMediaPermissions).mockReturnValue({ status: 'no-device', retry: vi.fn() });
    renderWithProviders(<PermissionCheck onReady={vi.fn()} />);
    expect(screen.getByText(/camera or microphone not found/i)).toBeInTheDocument();
  });

  it('calls onReady when granted', async () => {
    const { useMediaPermissions } = await import('@/hooks/useMediaPermissions');
    vi.mocked(useMediaPermissions).mockReturnValue({ status: 'granted', retry: vi.fn() });
    const onReady = vi.fn();
    await act(async () => {
      renderWithProviders(<PermissionCheck onReady={onReady} />);
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('passes vitest-axe when denied', async () => {
    const { useMediaPermissions } = await import('@/hooks/useMediaPermissions');
    vi.mocked(useMediaPermissions).mockReturnValue({ status: 'denied', retry: vi.fn() });
    const { container } = renderWithProviders(<PermissionCheck onReady={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
