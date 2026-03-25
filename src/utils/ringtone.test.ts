import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRingtone } from './ringtone';

vi.mock('@/utils/audioUnlock', () => ({
  getUnlockedContext: vi.fn(() => null),
}));

describe('createRingtone', () => {
  let audioInstances: Array<{
    loop: boolean;
    volume: number;
    currentTime: number;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    audioInstances = [];

    class MockAudio {
      loop = false;
      volume = 1;
      currentTime = 0;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      constructor() {
        audioInstances.push(this);
      }
    }
    vi.stubGlobal('Audio', MockAudio);
    vi.stubGlobal('navigator', { vibrate: vi.fn() });
  });

  const lastAudio = () => audioInstances[audioInstances.length - 1]!;

  it('creates Audio with /ringtone.mp3 and sets volume', () => {
    const ringtone = createRingtone(60);
    ringtone.play();

    expect(lastAudio().loop).toBe(true);
    expect(lastAudio().volume).toBeCloseTo(0.6);
  });

  it('clamps volume to 0-1 range', () => {
    createRingtone(150);
    expect(lastAudio().volume).toBe(1);

    createRingtone(-10);
    expect(audioInstances[1]!.volume).toBe(0);
  });

  it('pause stops audio and resets currentTime', () => {
    const ringtone = createRingtone(80);
    ringtone.play();
    ringtone.pause();

    expect(lastAudio().pause).toHaveBeenCalled();
    expect(lastAudio().currentTime).toBe(0);
  });

  it('setVolume updates audio volume', () => {
    const ringtone = createRingtone(80);
    ringtone.setVolume(40);
    expect(lastAudio().volume).toBeCloseTo(0.4);
  });

  it('calls navigator.vibrate on play and stop vibration on pause', () => {
    const ringtone = createRingtone(80);
    ringtone.play();

    expect(navigator.vibrate).toHaveBeenCalledWith([500, 200, 500, 200, 500, 200, 500]);

    ringtone.pause();

    expect(navigator.vibrate).toHaveBeenCalledWith(0);
  });

  it('fallback uses latest volume after setVolume called before play rejects', async () => {
    let rejectPlay: (err: Error) => void;
    class DelayedFailAudio {
      loop = false;
      volume = 1;
      currentTime = 0;
      play = vi.fn(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectPlay = reject;
          }),
      );
      pause = vi.fn();
    }
    vi.stubGlobal('Audio', DelayedFailAudio);

    const mockGainNode = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
    const mockOscillator = {
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const mockCtx = {
      state: 'running',
      createGain: vi.fn(() => mockGainNode),
      createOscillator: vi.fn(() => mockOscillator),
      destination: {},
      currentTime: 0,
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal(
      'AudioContext',
      class {
        state = mockCtx.state;
        createGain = mockCtx.createGain;
        createOscillator = mockCtx.createOscillator;
        destination = mockCtx.destination;
        currentTime = mockCtx.currentTime;
        close = mockCtx.close;
      },
    );

    const ringtone = createRingtone(80);
    ringtone.play();

    // Volume changes while play() is still pending
    ringtone.setVolume(30);

    // Now play() rejects — fallback should use 30, not 80
    rejectPlay!(new Error('NotAllowedError'));

    await vi.waitFor(() => {
      expect(mockCtx.createGain).toHaveBeenCalled();
    });

    expect(mockGainNode.gain.value).toBeCloseTo(0.3);
  });

  it('falls back to synthetic ringtone when Audio.play() rejects', async () => {
    class FailAudio {
      loop = false;
      volume = 1;
      currentTime = 0;
      play = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
      pause = vi.fn();
    }
    vi.stubGlobal('Audio', FailAudio);

    const mockGainNode = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
    const mockOscillator = {
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const mockCtx = {
      state: 'running',
      createGain: vi.fn(() => mockGainNode),
      createOscillator: vi.fn(() => mockOscillator),
      destination: {},
      currentTime: 0,
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal(
      'AudioContext',
      class {
        state = mockCtx.state;
        createGain = mockCtx.createGain;
        createOscillator = mockCtx.createOscillator;
        destination = mockCtx.destination;
        currentTime = mockCtx.currentTime;
        close = mockCtx.close;
      },
    );

    const ringtone = createRingtone(70);
    ringtone.play();

    await vi.waitFor(() => {
      expect(mockCtx.createGain).toHaveBeenCalled();
    });

    expect(mockGainNode.gain.value).toBeCloseTo(0.7);
  });

  it('falls back to synthetic ringtone when Audio constructor is unavailable', () => {
    vi.stubGlobal('Audio', undefined);

    const mockGainNode = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
    const mockOscillator = {
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const mockCtx = {
      state: 'running',
      createGain: vi.fn(() => mockGainNode),
      createOscillator: vi.fn(() => mockOscillator),
      destination: {},
      currentTime: 0,
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal(
      'AudioContext',
      class {
        state = mockCtx.state;
        createGain = mockCtx.createGain;
        createOscillator = mockCtx.createOscillator;
        destination = mockCtx.destination;
        currentTime = mockCtx.currentTime;
        close = mockCtx.close;
      },
    );

    const ringtone = createRingtone(50);
    ringtone.play();

    expect(mockCtx.createGain).toHaveBeenCalled();
    expect(mockGainNode.gain.value).toBeCloseTo(0.5);
  });

  describe('shared AudioContext', () => {
    it('uses shared context from getUnlockedContext when available', async () => {
      vi.stubGlobal('Audio', undefined);

      const mockGainNode = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
      const mockOscillator = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const sharedCtx = {
        state: 'running',
        createGain: vi.fn(() => mockGainNode),
        createOscillator: vi.fn(() => mockOscillator),
        destination: {},
        currentTime: 0,
        close: vi.fn().mockResolvedValue(undefined),
        resume: vi.fn().mockResolvedValue(undefined),
      };

      const { getUnlockedContext } = await import('@/utils/audioUnlock');
      vi.mocked(getUnlockedContext).mockReturnValue(sharedCtx as unknown as AudioContext);

      const ringtone = createRingtone(60);
      ringtone.play();

      expect(sharedCtx.createGain).toHaveBeenCalled();
      expect(mockGainNode.gain.value).toBeCloseTo(0.6);
    });

    it('does not close shared context on pause', async () => {
      vi.stubGlobal('Audio', undefined);

      const mockGainNode = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
      const mockOscillator = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const sharedCtx = {
        state: 'running',
        createGain: vi.fn(() => mockGainNode),
        createOscillator: vi.fn(() => mockOscillator),
        destination: {},
        currentTime: 0,
        close: vi.fn().mockResolvedValue(undefined),
        resume: vi.fn().mockResolvedValue(undefined),
      };

      const { getUnlockedContext } = await import('@/utils/audioUnlock');
      vi.mocked(getUnlockedContext).mockReturnValue(sharedCtx as unknown as AudioContext);

      const ringtone = createRingtone(60);
      ringtone.play();
      ringtone.pause();

      expect(sharedCtx.close).not.toHaveBeenCalled();
    });

    it('resumes suspended shared context', async () => {
      vi.stubGlobal('Audio', undefined);

      const mockGainNode = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
      const mockOscillator = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const sharedCtx = {
        state: 'suspended',
        createGain: vi.fn(() => mockGainNode),
        createOscillator: vi.fn(() => mockOscillator),
        destination: {},
        currentTime: 0,
        close: vi.fn().mockResolvedValue(undefined),
        resume: vi.fn().mockResolvedValue(undefined),
      };

      const { getUnlockedContext } = await import('@/utils/audioUnlock');
      vi.mocked(getUnlockedContext).mockReturnValue(sharedCtx as unknown as AudioContext);

      const ringtone = createRingtone(60);
      ringtone.play();

      expect(sharedCtx.resume).toHaveBeenCalled();
    });

    it('creates new context when shared context is closed', async () => {
      vi.stubGlobal('Audio', undefined);

      const sharedCtx = {
        state: 'closed',
      };

      const { getUnlockedContext } = await import('@/utils/audioUnlock');
      vi.mocked(getUnlockedContext).mockReturnValue(sharedCtx as unknown as AudioContext);

      const mockGainNode = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
      const mockOscillator = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const newCtxClose = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal(
        'AudioContext',
        class {
          state = 'running';
          createGain = vi.fn(() => mockGainNode);
          createOscillator = vi.fn(() => mockOscillator);
          destination = {};
          currentTime = 0;
          close = newCtxClose;
        },
      );

      const ringtone = createRingtone(60);
      ringtone.play();
      ringtone.pause();

      // Should close the locally-created context
      expect(newCtxClose).toHaveBeenCalled();
    });
  });
});
