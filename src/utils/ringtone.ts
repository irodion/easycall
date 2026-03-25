/**
 * Ringtone with HTML Audio fallback to Web Audio API synthesis.
 * Pattern: two-tone "ring-ring" at 440/480 Hz, repeated every 3s.
 *
 * On mobile browsers, a pre-unlocked AudioContext (from audioUnlock.ts)
 * is reused so the ringtone can play without a direct user gesture.
 */

import { getUnlockedContext } from '@/utils/audioUnlock';

export interface Ringtone {
  play: () => void;
  pause: () => void;
  setVolume: (volume: number) => void;
}

function clampVolume(v: number): number {
  return Math.max(0, Math.min(1, v / 100));
}

/** Vibration pattern: ring–pause–ring–pause–ring (Android only, no-op elsewhere). */
const VIBRATE_PATTERN = [500, 200, 500, 200, 500, 200, 500];

/**
 * @param volume 0–100 (maps to 0.0–1.0)
 */
export function createRingtone(volume: number): Ringtone {
  const normalizedVolume = clampVolume(volume);

  const audio = typeof Audio !== 'undefined' ? new Audio('/ringtone.mp3') : null;
  if (audio) {
    audio.loop = true;
    audio.volume = normalizedVolume;

    let useFallback = false;
    let fallback: Ringtone | null = null;
    let currentVolume = normalizedVolume;

    const getFallback = () => {
      if (!fallback) fallback = createSyntheticRingtone(currentVolume);
      return fallback;
    };

    return {
      play: () => {
        navigator.vibrate?.(VIBRATE_PATTERN);
        if (useFallback) {
          getFallback().play();
          return;
        }
        const promise = audio.play();
        if (promise) {
          promise.catch(() => {
            useFallback = true;
            getFallback().play();
          });
        }
      },
      pause: () => {
        navigator.vibrate?.(0);
        if (useFallback) {
          getFallback().pause();
        } else {
          audio.pause();
          audio.currentTime = 0;
        }
      },
      setVolume: (v: number) => {
        currentVolume = clampVolume(v);
        audio.volume = currentVolume;
        if (fallback) fallback.setVolume(v);
      },
    };
  }

  return createSyntheticRingtone(normalizedVolume);
}

function createSyntheticRingtone(volume: number): Ringtone {
  let ctx: AudioContext | null = null;
  let isSharedCtx = false;
  let gainNode: GainNode | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const ring = () => {
    if (!ctx || !gainNode) return;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 440;
    osc1.connect(gainNode);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.4);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 480;
    osc2.connect(gainNode);
    osc2.start(ctx.currentTime + 0.5);
    osc2.stop(ctx.currentTime + 0.9);
  };

  return {
    play: () => {
      if (ctx) return; // already playing
      try {
        const shared = getUnlockedContext();
        if (shared && shared.state !== 'closed') {
          ctx = shared;
          isSharedCtx = true;
          // Resume in case it was suspended (e.g. page went to background on iOS)
          if (ctx.state === 'suspended') void ctx.resume();
        } else {
          ctx = new AudioContext();
          isSharedCtx = false;
        }
        gainNode = ctx.createGain();
        gainNode.gain.value = volume;
        gainNode.connect(ctx.destination);
        ring();
        intervalId = setInterval(ring, 3000);
        navigator.vibrate?.(VIBRATE_PATTERN);
      } catch {
        // AudioContext not available — silent no-op
      }
    },
    pause: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (gainNode) {
        gainNode.disconnect();
        gainNode = null;
      }
      if (ctx && !isSharedCtx) {
        void ctx.close().catch(() => {});
      }
      ctx = null;
      isSharedCtx = false;
      navigator.vibrate?.(0);
    },
    setVolume: (v: number) => {
      if (gainNode) gainNode.gain.value = clampVolume(v);
    },
  };
}
