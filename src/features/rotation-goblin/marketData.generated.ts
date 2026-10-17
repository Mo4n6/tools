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
  "generatedAt": "2026-10-17T01:35:20Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 763.25,
  "asOf": "2026-10-16",
  "ret3m": 3.11,
  "ret12m": 15.98,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 68.24,
    "asOf": "2026-10-16",
    "rsi14w": 69.04,
    "rsiTrend": "up",
    "relativeRsi": 62.1,
    "relativeTrend": "up",
    "ret3m": 18.48,
    "rel1m": 6.11,
    "rel3m": 14.91,
    "rel6m": 16.33,
    "rel12m": 40.21,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 55.52,
    "asOf": "2026-10-16",
    "rsi14w": 53.93,
    "rsiTrend": "flat",
    "relativeRsi": 47.23,
    "relativeTrend": "up",
    "ret3m": -0.58,
    "rel1m": -0.62,
    "rel3m": -3.57,
    "rel6m": -1.28,
    "rel12m": -8.67,
    "drawdown52w": -4.86,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 50.92,
    "asOf": "2026-10-16",
    "rsi14w": 52.14,
    "rsiTrend": "up",
    "relativeRsi": 46.68,
    "relativeTrend": "up",
    "ret3m": 2.25,
    "rel1m": 0.54,
    "rel3m": -0.83,
    "rel6m": -8.38,
    "rel12m": 0.77,
    "drawdown52w": -4.69,
    "above200d": true
  },
  {
    "ticker": "XLU",
    "price": 42.21,
    "asOf": "2026-10-16",
    "rsi14w": 46.87,
    "rsiTrend": "up",
    "relativeRsi": 43.36,
    "relativeTrend": "up",
    "ret3m": -5.38,
    "rel1m": 1.65,
    "rel3m": -8.24,
    "rel6m": -14.18,
    "rel12m": -19.42,
    "drawdown52w": -9.72,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 176.71,
    "asOf": "2026-10-16",
    "rsi14w": 66.42,
    "rsiTrend": "up",
    "relativeRsi": 60.41,
    "relativeTrend": "up",
    "ret3m": 11.39,
    "rel1m": 4.73,
    "rel3m": 8.03,
    "rel6m": 10.84,
    "rel12m": 8.66,
    "drawdown52w": -0.27,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 167.76,
    "asOf": "2026-10-16",
    "rsi14w": 41.52,
    "rsiTrend": "flat",
    "relativeRsi": 33.67,
    "relativeTrend": "flat",
    "ret3m": -5.56,
    "rel1m": -0.8,
    "rel3m": -8.41,
    "rel6m": -10.03,
    "rel12m": -4.13,
    "drawdown52w": -9.81,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 183.47,
    "asOf": "2026-10-16",
    "rsi14w": 53.09,
    "rsiTrend": "down",
    "relativeRsi": 49.94,
    "relativeTrend": "down",
    "ret3m": 4.54,
    "rel1m": -2.65,
    "rel3m": 1.39,
    "rel6m": 10.3,
    "rel12m": 11.85,
    "drawdown52w": -9.17,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 539.79,
    "asOf": "2026-10-16",
    "rsi14w": 48.29,
    "rsiTrend": "down",
    "relativeRsi": 46.01,
    "relativeTrend": "down",
    "ret3m": -3.41,
    "rel1m": -4.03,
    "rel3m": -6.32,
    "rel6m": 7.66,
    "rel12m": 36.59,
    "drawdown52w": -19.3,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 270.44,
    "asOf": "2026-10-16",
    "rsi14w": 39.59,
    "rsiTrend": "down",
    "relativeRsi": 29.05,
    "relativeTrend": "down",
    "ret3m": -7.24,
    "rel1m": -5.57,
    "rel3m": -10.04,
    "rel6m": -8.77,
    "rel12m": -5.91,
    "drawdown52w": -11.13,
    "above200d": false
  },
  {
    "ticker": "IYR",
    "price": 97.39,
    "asOf": "2026-10-16",
    "rsi14w": 44.19,
    "rsiTrend": "flat",
    "relativeRsi": 40.49,
    "relativeTrend": "up",
    "ret3m": -7.05,
    "rel1m": -1.89,
    "rel3m": -9.85,
    "rel6m": -11.37,
    "rel12m": -10.96,
    "drawdown52w": -8.53,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 103.55,
    "asOf": "2026-10-16",
    "rsi14w": 49.92,
    "rsiTrend": "down",
    "relativeRsi": 41.19,
    "relativeTrend": "flat",
    "ret3m": 0.96,
    "rel1m": -2.67,
    "rel3m": -2.09,
    "rel6m": -6.66,
    "rel12m": -1.61,
    "drawdown52w": -4.83,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 62.85,
    "asOf": "2026-10-16",
    "rsi14w": 44.73,
    "rsiTrend": "down",
    "relativeRsi": 37.94,
    "relativeTrend": "down",
    "ret3m": -1.12,
    "rel1m": -6.38,
    "rel3m": -4.1,
    "rel6m": -8.1,
    "rel12m": 2.62,
    "drawdown52w": -11.74,
    "above200d": false
  },
  {
    "ticker": "GLD",
    "price": 382.01,
    "asOf": "2026-10-16",
    "rsi14w": 43.33,
    "rsiTrend": "down",
    "relativeRsi": 38.0,
    "relativeTrend": "down",
    "ret3m": 3.92,
    "rel1m": -4.42,
    "rel3m": 0.79,
    "rel6m": -20.7,
    "rel12m": -14.98,
    "drawdown52w": -22.97,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 80.05,
    "asOf": "2026-10-16",
    "rsi14w": 42.72,
    "rsiTrend": "up",
    "relativeRsi": 39.03,
    "relativeTrend": "up",
    "ret3m": -3.44,
    "rel1m": -2.05,
    "rel3m": -6.35,
    "rel6m": -12.9,
    "rel12m": -20.34,
    "drawdown52w": -9.13,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 20.11,
    "asOf": "2026-10-16",
    "rsi14w": 70.01,
    "rsiTrend": "flat",
    "relativeRsi": 62.07,
    "relativeTrend": "flat",
    "ret3m": 15.71,
    "rel1m": 1.69,
    "rel3m": 12.22,
    "rel6m": 10.55,
    "rel12m": 36.35,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 30.98,
    "asOf": "2026-10-16",
    "rsi14w": 66.75,
    "rsiTrend": "flat",
    "relativeRsi": 55.45,
    "relativeTrend": "flat",
    "ret3m": 5.91,
    "rel1m": 0.15,
    "rel3m": 2.72,
    "rel6m": 2.87,
    "rel12m": 3.32,
    "drawdown52w": -1.4,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 28.92,
    "asOf": "2026-10-16",
    "rsi14w": 66.08,
    "rsiTrend": "up",
    "relativeRsi": 49.68,
    "relativeTrend": "up",
    "ret3m": 1.87,
    "rel1m": 1.56,
    "rel3m": -1.2,
    "rel6m": -2.15,
    "rel12m": -7.34,
    "drawdown52w": -0.72,
    "above200d": true
  }
];
