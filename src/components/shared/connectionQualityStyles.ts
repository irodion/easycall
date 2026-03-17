export type ConnectionQuality = 'good' | 'fair' | 'poor';

export const CONNECTION_QUALITY_THRESHOLDS = { GOOD: 70, FAIR: 30 } as const;

export function mapConnectionQuality(percentage: number): ConnectionQuality {
  if (percentage >= CONNECTION_QUALITY_THRESHOLDS.GOOD) return 'good';
  if (percentage >= CONNECTION_QUALITY_THRESHOLDS.FAIR) return 'fair';
  return 'poor';
}

export const connectionQualityColors: Record<ConnectionQuality, string> = {
  good: 'text-success',
  fair: 'text-warning',
  poor: 'text-error',
};

export const connectionQualityI18nKeys: Record<ConnectionQuality, string> = {
  good: 'connection.good',
  fair: 'connection.fair',
  poor: 'connection.poor',
};
