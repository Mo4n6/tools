export type HistoricalChartPoint = {
  date: string;
  rsi14w: number;
  relativeRsi14w: number;
  priceVs200dPct: number;
  sma50Vs200Pct: number;
};

export const chartHistoryMeta = {
  generatedAt: '',
  latestCompletedWeekSession: '',
  frequency: 'weekly-completed-weeks-only',
  benchmark: 'SPY',
} as const;

export const historicalChartSeries: Record<string, HistoricalChartPoint[]> = {};
