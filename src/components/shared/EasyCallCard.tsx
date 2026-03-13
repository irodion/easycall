import type { ReactNode } from 'react';

interface EasyCallCardProps {
  onClick?: () => void;
  children: ReactNode;
  'aria-label'?: string;
  className?: string;
}

export function EasyCallCard({
  onClick,
  children,
  'aria-label': ariaLabel,
  className,
}: EasyCallCardProps) {
  const baseClass = `card card-body${className ? ` ${className}` : ''}`;

  if (onClick) {
    return (
      <button
        type="button"
        className={`${baseClass} touch-target-min min-h-14 min-w-14`}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    );
  }

  return (
    <div className={baseClass} aria-label={ariaLabel}>
      {children}
    </div>
  );
}
