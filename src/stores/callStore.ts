import { create } from 'zustand';

export interface IncomingCallData {
  callerName: string;
  callerPhotoURL: string;
  roomId: string;
  elderlyUserId: string;
}

interface CallState {
  isRinging: boolean;
  incomingCall: IncomingCallData | null;
  setIncomingCall: (data: IncomingCallData) => void;
  clearIncomingCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  isRinging: false,
  incomingCall: null,
  setIncomingCall: (data) =>
    set((state) => {
      if (state.incomingCall?.roomId === data.roomId) return state;
      return { isRinging: true, incomingCall: data };
    }),
  clearIncomingCall: () => set({ isRinging: false, incomingCall: null }),
}));
