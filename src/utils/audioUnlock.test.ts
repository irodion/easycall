import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('audioUnlock', () => {
  let mockConnect: ReturnType<typeof vi.fn>;
  let mockStart: ReturnType<typeof vi.fn>;
  let mockCreateBuffer: ReturnType<typeof vi.fn>;
  let mockCreateBufferSource: ReturnType<typeof vi.fn>;
  let mockClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();

    mockConnect = vi.fn();
    mockStart = vi.fn();
    mockClose = vi.fn().mockResolvedValue(undefined);

    const mockSource = {
      buffer: null,
      connect: mockConnect,
      start: mockStart,
    };
    const mockBuffer = {};
    mockCreateBuffer = vi.fn(() => mockBuffer);
    mockCreateBufferSource = vi.fn(() => mockSource);

    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        destination = {};
        createBuffer = mockCreateBuffer;
        createBufferSource = mockCreateBufferSource;
        close = mockClose;
      },
    );
  });

  it('unlockAudio creates AudioContext and plays silent buffer', async () => {
    const { unlockAudio, getUnlockedContext } = await import('./audioUnlock');

    unlockAudio();

    expect(mockCreateBuffer).toHaveBeenCalledWith(1, 1, 22050);
    expect(mockConnect).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalledWith(0);
    expect(getUnlockedContext()).not.toBeNull();
  });

  it('getUnlockedContext returns null before unlock', async () => {
    const { getUnlockedContext } = await import('./audioUnlock');
    expect(getUnlockedContext()).toBeNull();
  });

  it('unlockAudio is idempotent — second call is a no-op', async () => {
    const { unlockAudio, getUnlockedContext } = await import('./audioUnlock');

    unlockAudio();
    const firstCtx = getUnlockedContext();

    unlockAudio();
    const secondCtx = getUnlockedContext();

    expect(firstCtx).toBe(secondCtx);
    expect(mockCreateBuffer).toHaveBeenCalledTimes(1);
  });

  it('handles missing AudioContext gracefully', async () => {
    vi.stubGlobal('AudioContext', undefined);

    const { unlockAudio, getUnlockedContext } = await import('./audioUnlock');

    unlockAudio();

    expect(getUnlockedContext()).toBeNull();
  });

  it('_resetForTesting clears internal state', async () => {
    const { unlockAudio, getUnlockedContext, _resetForTesting } = await import('./audioUnlock');

    unlockAudio();
    expect(getUnlockedContext()).not.toBeNull();

    _resetForTesting();
    expect(getUnlockedContext()).toBeNull();
  });

  it('re-creates context when previous one was closed', async () => {
    let instanceState = 'running';
    vi.stubGlobal(
      'AudioContext',
      class {
        state = instanceState;
        destination = {};
        createBuffer = mockCreateBuffer;
        createBufferSource = mockCreateBufferSource;
        close = mockClose;
      },
    );

    const { unlockAudio, getUnlockedContext } = await import('./audioUnlock');

    unlockAudio();
    const firstCtx = getUnlockedContext();
    expect(firstCtx).not.toBeNull();

    // Simulate browser closing the context while backgrounded
    (firstCtx as unknown as { state: string }).state = 'closed';
    instanceState = 'running';

    unlockAudio();
    const secondCtx = getUnlockedContext();

    expect(secondCtx).not.toBeNull();
    expect(secondCtx).not.toBe(firstCtx);
    expect(mockCreateBuffer).toHaveBeenCalledTimes(2);
  });
});
