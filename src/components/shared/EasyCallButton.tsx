import type { ReactNode } from 'react';

interface EasyCallButtonProps {
  variant?: 'primary' | 'danger' | 'secondary';
  size?: 'default' | 'large' | 'call';
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}

const variantClass: Record<NonNullable<EasyCallButtonProps['variant']>, string> = {
  primary: 'btn-primary shadow-sm',
  danger: 'btn-error shadow-sm',
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
  type = 'button',
  onClick,
  disabled,
  className,
  'aria-label': ariaLabel,
  children,
}: EasyCallButtonProps) {
  const handleClick = () => {
    navigator.vibrate?.(30);
    onClick?.();
  };

  return (
    <button
      type={type}
      className={`btn ${variantClass[variant]} ${sizeClass[size]} font-bold text-[length:var(--text-button)] active:shadow-none active:translate-y-px transition-all duration-150${className ? ` ${className}` : ''}`}
      onClick={handleClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
