import type { ReactNode } from 'react';
import type { UserSettings } from '@/types/user';

type FontSize = UserSettings['fontSize'];

interface EasyCallTextProps {
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'span' | 'label';
  fontSize?: FontSize;
  variant?: 'body' | 'heading' | 'button' | 'display';
  children: ReactNode;
  className?: string;
  id?: string;
}

const variantClass: Record<NonNullable<EasyCallTextProps['variant']>, string> = {
  body: 'text-[length:var(--text-body)]',
  heading: 'text-[length:var(--text-heading)]',
  button: 'text-[length:var(--text-button)]',
  display: 'text-[length:var(--text-display)]',
};

export function EasyCallText({
  as: Tag = 'p',
  fontSize,
  variant = 'body',
  children,
  className,
  id,
}: EasyCallTextProps) {
  const classes = [
    variantClass[variant],
    fontSize === 'x-large' ? 'text-xl' : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <Tag className={classes} id={id}>{children}</Tag>;
}
