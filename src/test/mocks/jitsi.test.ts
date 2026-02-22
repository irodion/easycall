import { describe, it, expect, beforeEach } from 'vitest';
import { MockJitsiMeetExternalAPI } from './jitsi';

describe('MockJitsiMeetExternalAPI', () => {
  let api: MockJitsiMeetExternalAPI;

  beforeEach(() => {
    api = new MockJitsiMeetExternalAPI('meet.jit.si', {
      roomName: 'test-room',
    });
  });

  it('can be instantiated with domain and options', () => {
    expect(api.domain).toBe('meet.jit.si');
    expect(api.options.roomName).toBe('test-room');
  });

  it('registers event listeners via addListener', () => {
    const listener = () => {};
    api.addListener('videoConferenceJoined', listener);
    expect(api.listeners.get('videoConferenceJoined')?.has(listener)).toBe(
      true,
    );
  });

  it('emits events to registered listeners via _emit', () => {
    const received: unknown[] = [];
    api.addListener('participantJoined', (data) => received.push(data));

    const payload = { id: 'user-1', displayName: 'Alice' };
    api._emit('participantJoined', payload);

    expect(received).toEqual([payload]);
  });

  it('tracks executed commands', () => {
    api.executeCommand('toggleAudio');
    api.executeCommand('hangup');

    expect(api.getExecutedCommands()).toEqual([
      { command: 'toggleAudio', args: [] },
      { command: 'hangup', args: [] },
    ]);
  });

  it('removes listeners via removeListener', () => {
    const listener = () => {};
    api.addListener('readyToClose', listener);
    api.removeListener('readyToClose', listener);

    expect(api.listeners.get('readyToClose')?.has(listener)).toBeFalsy();
  });

  it('dispose() cleans up all listeners', () => {
    api.addListener('videoConferenceJoined', () => {});
    api.addListener('participantLeft', () => {});

    api.dispose();

    expect(api.listeners.size).toBe(0);
  });

  it('exposes isAudioMuted and isVideoMuted', async () => {
    expect(await api.isAudioMuted()).toBe(false);
    expect(await api.isVideoMuted()).toBe(false);
  });

  it('is available on window.JitsiMeetExternalAPI', () => {
    expect(window.JitsiMeetExternalAPI).toBe(MockJitsiMeetExternalAPI);
  });
});
