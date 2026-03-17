import type { PresenceState } from '@/types/user';

export const presenceTextStyles: Record<PresenceState, string> = {
  online: 'text-success',
  'in-call': 'text-warning',
  offline: 'text-base-content/60',
};

export const presenceI18nKeys: Record<PresenceState, string> = {
  online: 'presence.online',
  'in-call': 'presence.inCall',
  offline: 'presence.offline',
};
