import type {
  JitsiEvent,
  JitsiCommand,
  JitsiMeetExternalAPIOptions,
} from '@/types/jitsi';

type ListenerFn = (data: unknown) => void;

export class MockJitsiMeetExternalAPI {
  readonly domain: string;
  readonly options: Omit<JitsiMeetExternalAPIOptions, 'domain'>;
  readonly listeners = new Map<string, Set<ListenerFn>>();
  private readonly commands: Array<{ command: string; args: unknown[] }> = [];

  constructor(
    domain: string,
    options: Omit<JitsiMeetExternalAPIOptions, 'domain'>,
  ) {
    this.domain = domain;
    this.options = options;
  }

  addListener(event: JitsiEvent, listener: ListenerFn): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  removeListener(event: JitsiEvent, listener: ListenerFn): void {
    this.listeners.get(event)?.delete(listener);
  }

  executeCommand(command: JitsiCommand, ...args: unknown[]): void {
    this.commands.push({ command, args });
  }

  dispose(): void {
    this.listeners.clear();
    this.commands.length = 0;
  }

  isAudioMuted(): Promise<boolean> {
    return Promise.resolve(false);
  }

  isVideoMuted(): Promise<boolean> {
    return Promise.resolve(false);
  }

  /** Test helper: emit an event to all registered listeners */
  _emit(event: JitsiEvent, data: unknown): void {
    this.listeners.get(event)?.forEach((listener) => listener(data));
  }

  /** Test helper: get the list of executed commands */
  getExecutedCommands(): Array<{ command: string; args: unknown[] }> {
    return [...this.commands];
  }
}

// Make available on window for code that loads Jitsi via script tag
window.JitsiMeetExternalAPI =
  MockJitsiMeetExternalAPI as unknown as typeof window.JitsiMeetExternalAPI;
