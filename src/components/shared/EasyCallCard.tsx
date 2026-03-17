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
  const baseClass = `card card-body shadow-sm border border-base-200${className ? ` ${className}` : ''}`;

  if (onClick) {
    return (
      <button
        type="button"
        className={`${baseClass} hover:shadow-md transition-shadow duration-200 touch-target-min min-h-14 min-w-14`}
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
