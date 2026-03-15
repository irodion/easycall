import { describe, it, expect, beforeEach } from 'vitest';
import { useCallStore } from './callStore';

const mockCall = {
  callerName: 'Alex',
  callerPhotoURL: 'https://example.com/alex.jpg',
  roomId: 'easycall-rose-alex-k8m2p1',
  elderlyUserId: 'user-1',
};

describe('callStore', () => {
  beforeEach(() => {
    useCallStore.setState({ isRinging: false, incomingCall: null });
  });

  it('initial state: not ringing, no call data', () => {
    const state = useCallStore.getState();
    expect(state.isRinging).toBe(false);
    expect(state.incomingCall).toBeNull();
  });

  it('setIncomingCall: sets ringing=true and stores call data', () => {
    useCallStore.getState().setIncomingCall(mockCall);
    const state = useCallStore.getState();
    expect(state.isRinging).toBe(true);
    expect(state.incomingCall).toEqual(mockCall);
  });

  it('clearIncomingCall: resets to initial state', () => {
    useCallStore.getState().setIncomingCall(mockCall);
    useCallStore.getState().clearIncomingCall();
    const state = useCallStore.getState();
    expect(state.isRinging).toBe(false);
    expect(state.incomingCall).toBeNull();
  });

  it('setIncomingCall: ignores duplicate call with same roomId', () => {
    useCallStore.getState().setIncomingCall(mockCall);
    const stateAfterFirst = useCallStore.getState();

    // Call again with same roomId — state should be identical (same reference)
    useCallStore.getState().setIncomingCall({ ...mockCall, callerName: 'Different' });
    const stateAfterSecond = useCallStore.getState();

    expect(stateAfterSecond.incomingCall).toBe(stateAfterFirst.incomingCall);
    expect(stateAfterSecond.incomingCall?.callerName).toBe('Alex');
  });
});
