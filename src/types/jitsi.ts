export interface JitsiUserInfo {
  displayName: string;
  email?: string;
  avatarURL?: string;
}

export interface JitsiMeetExternalAPIOptions {
  domain: string;
  roomName: string;
  parentNode?: HTMLElement;
  jwt?: string;
  userInfo?: JitsiUserInfo;
  configOverwrite?: Record<string, unknown>;
  interfaceConfigOverwrite?: Record<string, unknown>;
}

export type JitsiEvent =
  | 'videoConferenceJoined'
  | 'videoConferenceLeft'
  | 'participantJoined'
  | 'participantLeft'
  | 'audioMuteStatusChanged'
  | 'videoMuteStatusChanged'
  | 'incomingMessage'
  | 'readyToClose';

export type JitsiCommand =
  | 'toggleAudio'
  | 'toggleVideo'
  | 'hangup'
  | 'toggleChat'
  | 'toggleTileView'
  | 'setLargeVideoParticipant';

export interface JitsiMeetExternalAPI {
  addListener(event: JitsiEvent, listener: (data: unknown) => void): void;
  removeListener(event: JitsiEvent, listener: (data: unknown) => void): void;
  executeCommand(command: JitsiCommand, ...args: unknown[]): void;
  dispose(): void;
  isAudioMuted(): Promise<boolean>;
  isVideoMuted(): Promise<boolean>;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (
      domain: string,
      options: Omit<JitsiMeetExternalAPIOptions, 'domain'>,
    ) => JitsiMeetExternalAPI;
  }
}
