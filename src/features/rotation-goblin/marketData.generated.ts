export type GeneratedTrend = 'up' | 'flat' | 'down';

export type GeneratedTechnicalRow = {
  ticker: string;
  price: number | null;
  asOf: string;
  rsi14w: number;
  rsiTrend: GeneratedTrend;
  relativeRsi: number;
  relativeTrend: GeneratedTrend;
  ret3m: number;
  rel1m: number;
  rel3m: number;
  rel6m: number;
  rel12m: number;
  drawdown52w: number;
  above200d: boolean;
};

export const marketDataMeta = {
  "source": "Yahoo primary",
  "generatedAt": "2026-09-22T19:23:47Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 773.5,
  "asOf": "2026-09-21",
  "ret3m": 4.17,
  "ret12m": 18.38,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 62.46,
    "asOf": "2026-09-21",
    "rsi14w": 60.16,
    "rsiTrend": "down",
    "relativeRsi": 52.58,
    "relativeTrend": "down",
    "ret3m": 16.23,
    "rel1m": -3.07,
    "rel3m": 11.57,
    "rel6m": -10.4,
    "rel12m": 22.01,
    "drawdown52w": -4.7,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 55.9,
    "asOf": "2026-09-21",
    "rsi14w": 56.21,
    "rsiTrend": "down",
    "relativeRsi": 41.4,
    "relativeTrend": "down",
    "ret3m": 4.47,
    "rel1m": -3.12,
    "rel3m": 0.28,
    "rel6m": -3.82,
    "rel12m": -11.1,
    "drawdown52w": -4.2,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 49.71,
    "asOf": "2026-09-21",
    "rsi14w": 45.86,
    "rsiTrend": "down",
    "relativeRsi": 37.1,
    "relativeTrend": "down",
    "ret3m": -3.26,
    "rel1m": -6.31,
    "rel3m": -7.13,
    "rel6m": -10.59,
    "rel12m": -5.46,
    "drawdown52w": -6.95,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 40.66,
    "asOf": "2026-09-21",
    "rsi14w": 36.01,
    "rsiTrend": "down",
    "relativeRsi": 32.18,
    "relativeTrend": "down",
    "ret3m": -8.41,
    "rel1m": -7.97,
    "rel3m": -12.08,
    "rel6m": -22.44,
    "rel12m": -15.74,
    "drawdown52w": -13.03,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 169.01,
    "asOf": "2026-09-21",
    "rsi14w": 62.42,
    "rsiTrend": "down",
    "relativeRsi": 51.73,
    "relativeTrend": "down",
    "ret3m": 13.06,
    "rel1m": -3.21,
    "rel3m": 8.53,
    "rel6m": -1.78,
    "rel12m": 6.07,
    "drawdown52w": -3.43,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 169.98,
    "asOf": "2026-09-21",
    "rsi14w": 44.43,
    "rsiTrend": "down",
    "relativeRsi": 31.48,
    "relativeTrend": "down",
    "ret3m": -6.25,
    "rel1m": -6.76,
    "rel3m": -10.0,
    "rel6m": -11.59,
    "rel12m": -4.53,
    "drawdown52w": -8.62,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 194.85,
    "asOf": "2026-09-21",
    "rsi14w": 66.82,
    "rsiTrend": "up",
    "relativeRsi": 63.78,
    "relativeTrend": "up",
    "ret3m": 1.52,
    "rel1m": 4.78,
    "rel3m": -2.54,
    "rel6m": 20.59,
    "rel12m": 19.98,
    "drawdown52w": -1.46,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 596.03,
    "asOf": "2026-09-21",
    "rsi14w": 60.87,
    "rsiTrend": "up",
    "relativeRsi": 57.53,
    "relativeTrend": "up",
    "ret3m": -10.9,
    "rel1m": 4.18,
    "rel3m": -14.46,
    "rel6m": 29.24,
    "rel12m": 59.33,
    "drawdown52w": -10.9,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 285.58,
    "asOf": "2026-09-21",
    "rsi14w": 51.61,
    "rsiTrend": "down",
    "relativeRsi": 36.9,
    "relativeTrend": "down",
    "ret3m": -3.98,
    "rel1m": -5.4,
    "rel3m": -7.82,
    "rel6m": -1.15,
    "rel12m": -0.47,
    "drawdown52w": -6.15,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 98.9,
    "asOf": "2026-09-21",
    "rsi14w": 45.3,
    "rsiTrend": "down",
    "relativeRsi": 36.83,
    "relativeTrend": "down",
    "ret3m": -1.95,
    "rel1m": -6.48,
    "rel3m": -5.87,
    "rel6m": -10.62,
    "rel12m": -11.47,
    "drawdown52w": -7.11,
    "above200d": true
  },
  {
    "ticker": "EFA",
    "price": 106.13,
    "asOf": "2026-09-21",
    "rsi14w": 56.94,
    "rsiTrend": "down",
    "relativeRsi": 40.73,
    "relativeTrend": "down",
    "ret3m": 1.48,
    "rel1m": -2.77,
    "rel3m": -2.58,
    "rel6m": -3.9,
    "rel12m": -0.69,
    "drawdown52w": -2.46,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 68.83,
    "asOf": "2026-09-21",
    "rsi14w": 60.44,
    "rsiTrend": "flat",
    "relativeRsi": 53.4,
    "relativeTrend": "up",
    "ret3m": -3.34,
    "rel1m": 1.61,
    "rel3m": -7.21,
    "rel6m": 3.74,
    "rel12m": 11.57,
    "drawdown52w": -3.34,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 398.38,
    "asOf": "2026-09-21",
    "rsi14w": 48.81,
    "rsiTrend": "down",
    "relativeRsi": 40.09,
    "relativeTrend": "down",
    "ret3m": 3.59,
    "rel1m": -5.65,
    "rel3m": -0.56,
    "rel6m": -19.6,
    "rel12m": 0.27,
    "drawdown52w": -19.67,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 81.8,
    "asOf": "2026-09-21",
    "rsi14w": 42.92,
    "rsiTrend": "up",
    "relativeRsi": 32.45,
    "relativeTrend": "flat",
    "ret3m": -3.88,
    "rel1m": -1.92,
    "rel3m": -7.73,
    "rel6m": -18.63,
    "rel12m": -18.98,
    "drawdown52w": -7.52,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.44,
    "asOf": "2026-09-21",
    "rsi14w": 66.12,
    "rsiTrend": "flat",
    "relativeRsi": 56.65,
    "relativeTrend": "flat",
    "ret3m": 18.83,
    "rel1m": 3.07,
    "rel3m": 14.07,
    "rel6m": -6.42,
    "rel12m": 27.54,
    "drawdown52w": -3.28,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 30.69,
    "asOf": "2026-09-21",
    "rsi14w": 65.21,
    "rsiTrend": "up",
    "relativeRsi": 52.04,
    "relativeTrend": "up",
    "ret3m": 9.69,
    "rel1m": 3.22,
    "rel3m": 5.3,
    "rel6m": -8.46,
    "rel12m": 0.68,
    "drawdown52w": -1.35,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 28.48,
    "asOf": "2026-09-21",
    "rsi14w": 61.24,
    "rsiTrend": "up",
    "relativeRsi": 42.13,
    "relativeTrend": "up",
    "ret3m": 0.42,
    "rel1m": 0.36,
    "rel3m": -3.6,
    "rel6m": -14.16,
    "rel12m": -9.04,
    "drawdown52w": -0.42,
    "above200d": true
  }
];
