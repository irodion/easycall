import { useTranslation } from 'react-i18next';
import type { ConnectionQuality } from './connectionQualityStyles';
import { connectionQualityColors, connectionQualityI18nKeys } from './connectionQualityStyles';

interface ConnectionQualityIndicatorProps {
  quality: ConnectionQuality | null;
  className?: string;
}

const FILLED_BARS: Record<ConnectionQuality, number> = {
  good: 3,
  fair: 2,
  poor: 1,
};

const BARS = [
  { x: 4, y: 14, height: 8 },
  { x: 10, y: 8, height: 14 },
  { x: 16, y: 2, height: 20 },
];

export function ConnectionQualityIndicator({ quality, className }: ConnectionQualityIndicatorProps) {
  const { t } = useTranslation();

  if (quality === null) return null;

  const filledCount = FILLED_BARS[quality];

  return (
    <div
      role="status"
      aria-label={t(connectionQualityI18nKeys[quality])}
      className={`${connectionQualityColors[quality]}${className ? ` ${className}` : ''}`}
    >
      <span className="sr-only">{t(connectionQualityI18nKeys[quality])}</span>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        {BARS.map((bar, idx) => {
          const filled = filledCount >= idx + 1;
          return (
            <rect
              key={idx}
              x={bar.x}
              y={bar.y}
              width={4}
              height={bar.height}
              rx={1}
              fill={filled ? 'currentColor' : 'none'}
              stroke={filled ? undefined : 'currentColor'}
              strokeWidth={filled ? undefined : 1.5}
            />
          );
        })}
      </svg>
    </div>
  );
}
