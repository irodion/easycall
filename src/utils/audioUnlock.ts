/**
 * Audio unlock utility for mobile browsers.
 *
 * Mobile browsers require a user gesture (tap/click) before AudioContext
 * can produce sound. This module listens for the first interaction and
 * plays a silent buffer to "unlock" an AudioContext that can be reused
 * later (e.g. for incoming-call ringtones triggered by Firestore events).
 */

let ctx: AudioContext | null = null;

/** Create an AudioContext and play a silent buffer to unlock audio.
 *  Re-creates the context if the previous one was closed (e.g. by the
 *  browser while the PWA was backgrounded). */
export function unlockAudio(): void {
  if (typeof AudioContext === 'undefined') return;
  // Skip if we already have a usable context
  if (ctx && ctx.state !== 'closed') return;
  try {
    ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // AudioContext not available — silent no-op
  }
}

/** Returns the pre-unlocked AudioContext, or null if not yet unlocked. */
export function getUnlockedContext(): AudioContext | null {
  return ctx;
}

/** Reset internal state (for testing only). */
export function _resetForTesting(): void {
  if (ctx && ctx.state !== 'closed') {
    void ctx.close().catch(() => {});
  }
  ctx = null;
}

// Re-unlock on every user interaction. unlockAudio() short-circuits when
// the context is still usable, so this is cheap. Keeping the listeners
// alive ensures re-creation if the browser closed the context while
// the PWA was backgrounded.
if (typeof document !== 'undefined') {
  const handler = () => unlockAudio();
  document.addEventListener('touchend', handler, { passive: true });
  document.addEventListener('click', handler);
}
