import { useTranslation } from 'react-i18next';
import type { PresenceState } from '@/types/user';
import { presenceI18nKeys } from './presenceStyles';

interface StatusIndicatorProps {
  state: PresenceState;
  size?: 'sm' | 'md';
  className?: string;
}

const stateStyles: Record<PresenceState, string> = {
  online: 'bg-success',
  'in-call': 'bg-warning',
  offline: 'bg-base-content/30',
};

const sizeStyles: Record<NonNullable<StatusIndicatorProps['size']>, string> = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
};

export function StatusIndicator({ state, size = 'sm', className }: StatusIndicatorProps) {
  const { t } = useTranslation();

  return (
    <span
      role="status"
      aria-label={t(presenceI18nKeys[state])}
      className={`inline-block rounded-full ring-2 ring-base-100 ${stateStyles[state]} ${sizeStyles[size]}${className ? ` ${className}` : ''}`}
    />
  );
}
