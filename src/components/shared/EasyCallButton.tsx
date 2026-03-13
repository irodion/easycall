import type { ReactNode } from 'react';

interface EasyCallButtonProps {
  variant?: 'primary' | 'danger' | 'secondary';
  size?: 'default' | 'large' | 'call';
  onClick?: () => void;
  disabled?: boolean;
  'aria-label'?: string;
  children: ReactNode;
}

const variantClass: Record<NonNullable<EasyCallButtonProps['variant']>, string> = {
  primary: 'btn-primary',
  danger: 'btn-error',
  secondary: 'btn-secondary',
};

const sizeClass: Record<NonNullable<EasyCallButtonProps['size']>, string> = {
  default: 'touch-target-min',
  large: 'touch-target-primary',
  call: 'touch-target-call',
};

export function EasyCallButton({
  variant = 'primary',
  size = 'default',
  onClick,
  disabled,
  'aria-label': ariaLabel,
  children,
}: EasyCallButtonProps) {
  return (
    <button
      type="button"
      className={`btn ${variantClass[variant]} ${sizeClass[size]} font-bold text-[length:var(--text-button)]`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
