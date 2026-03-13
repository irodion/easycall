import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaPermissions } from './useMediaPermissions';

describe('useMediaPermissions', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let permissionsQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getUserMedia = vi.fn();
    permissionsQuery = vi.fn().mockResolvedValue({ state: 'prompt' });

    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
      permissions: { query: permissionsQuery },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with status checking', () => {
    getUserMedia.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useMediaPermissions());
    expect(result.current.status).toBe('checking');
  });

  it('status becomes granted when getUserMedia resolves with stream', async () => {
    const mockTrack = { stop: vi.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    getUserMedia.mockResolvedValue(mockStream);

    const { result } = renderHook(() => useMediaPermissions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe('granted');
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it('status becomes denied when getUserMedia rejects with NotAllowedError', async () => {
    const error = new Error('Not allowed');
    error.name = 'NotAllowedError';
    getUserMedia.mockRejectedValue(error);

    const { result } = renderHook(() => useMediaPermissions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe('denied');
  });

  it('status becomes no-device when getUserMedia rejects with NotFoundError', async () => {
    const error = new Error('Not found');
    error.name = 'NotFoundError';
    getUserMedia.mockRejectedValue(error);

    const { result } = renderHook(() => useMediaPermissions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe('no-device');
  });

  it('retry resets to checking then re-attempts getUserMedia', async () => {
    const error = new Error('Not allowed');
    error.name = 'NotAllowedError';
    getUserMedia.mockRejectedValueOnce(error);

    const mockTrack = { stop: vi.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    getUserMedia.mockResolvedValueOnce(mockStream);

    const { result } = renderHook(() => useMediaPermissions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.status).toBe('denied');

    act(() => { result.current.retry(); });
    expect(result.current.status).toBe('checking');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.status).toBe('granted');
  });

  it('skips getUserMedia if permissions.query returns granted for both', async () => {
    permissionsQuery.mockResolvedValue({ state: 'granted' });

    const { result } = renderHook(() => useMediaPermissions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe('granted');
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
