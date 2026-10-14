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
  "generatedAt": "2026-10-14T02:05:40Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 778.01,
  "asOf": "2026-10-13",
  "ret3m": 3.33,
  "ret12m": 20.43,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 67.2,
    "asOf": "2026-10-13",
    "rsi14w": 67.66,
    "rsiTrend": "flat",
    "relativeRsi": 59.13,
    "relativeTrend": "flat",
    "ret3m": 19.65,
    "rel1m": 2.2,
    "rel3m": 15.79,
    "rel6m": 8.08,
    "rel12m": 34.69,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 54.82,
    "asOf": "2026-10-13",
    "rsi14w": 50.89,
    "rsiTrend": "down",
    "relativeRsi": 38.18,
    "relativeTrend": "down",
    "ret3m": -2.73,
    "rel1m": -5.89,
    "rel3m": -5.87,
    "rel6m": -5.31,
    "rel12m": -11.35,
    "drawdown52w": -6.06,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 49.72,
    "asOf": "2026-10-13",
    "rsi14w": 46.85,
    "rsiTrend": "down",
    "relativeRsi": 37.16,
    "relativeTrend": "down",
    "ret3m": -1.09,
    "rel1m": -3.49,
    "rel3m": -4.28,
    "rel6m": -14.39,
    "rel12m": -3.21,
    "drawdown52w": -6.93,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 41.87,
    "asOf": "2026-10-13",
    "rsi14w": 45.31,
    "rsiTrend": "up",
    "relativeRsi": 38.96,
    "relativeTrend": "up",
    "ret3m": -6.73,
    "rel1m": -1.61,
    "rel3m": -9.73,
    "rel6m": -18.88,
    "rel12m": -20.71,
    "drawdown52w": -10.45,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 169.66,
    "asOf": "2026-10-13",
    "rsi14w": 60.03,
    "rsiTrend": "flat",
    "relativeRsi": 51.07,
    "relativeTrend": "down",
    "ret3m": 7.59,
    "rel1m": -0.96,
    "rel3m": 4.13,
    "rel6m": 2.08,
    "rel12m": 0.79,
    "drawdown52w": -3.06,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 168.67,
    "asOf": "2026-10-13",
    "rsi14w": 42.73,
    "rsiTrend": "flat",
    "relativeRsi": 29.16,
    "relativeTrend": "down",
    "ret3m": -6.07,
    "rel1m": -2.91,
    "rel3m": -9.1,
    "rel6m": -13.14,
    "rel12m": -5.5,
    "drawdown52w": -9.32,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 196.28,
    "asOf": "2026-10-13",
    "rsi14w": 65.19,
    "rsiTrend": "up",
    "relativeRsi": 60.13,
    "relativeTrend": "up",
    "ret3m": 8.22,
    "rel1m": 4.03,
    "rel3m": 4.73,
    "rel6m": 18.11,
    "rel12m": 17.69,
    "drawdown52w": -2.83,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 588.12,
    "asOf": "2026-10-13",
    "rsi14w": 56.31,
    "rsiTrend": "up",
    "relativeRsi": 52.53,
    "relativeTrend": "up",
    "ret3m": -0.45,
    "rel1m": 5.95,
    "rel3m": -3.66,
    "rel6m": 15.56,
    "rel12m": 50.58,
    "drawdown52w": -12.08,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 276.7,
    "asOf": "2026-10-13",
    "rsi14w": 44.16,
    "rsiTrend": "down",
    "relativeRsi": 29.67,
    "relativeTrend": "down",
    "ret3m": -6.2,
    "rel1m": -6.0,
    "rel3m": -9.23,
    "rel6m": -8.09,
    "rel12m": -2.39,
    "drawdown52w": -9.07,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 96.62,
    "asOf": "2026-10-13",
    "rsi14w": 42.09,
    "rsiTrend": "down",
    "relativeRsi": 34.5,
    "relativeTrend": "down",
    "ret3m": -6.25,
    "rel1m": -5.31,
    "rel3m": -9.27,
    "rel6m": -13.49,
    "rel12m": -12.27,
    "drawdown52w": -9.25,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 103.47,
    "asOf": "2026-10-13",
    "rsi14w": 49.68,
    "rsiTrend": "down",
    "relativeRsi": 32.91,
    "relativeTrend": "down",
    "ret3m": -1.13,
    "rel1m": -4.64,
    "rel3m": -4.31,
    "rel6m": -9.93,
    "rel12m": -3.66,
    "drawdown52w": -4.91,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 65.74,
    "asOf": "2026-10-13",
    "rsi14w": 51.85,
    "rsiTrend": "flat",
    "relativeRsi": 42.18,
    "relativeTrend": "down",
    "ret3m": 0.26,
    "rel1m": -2.81,
    "rel3m": -2.97,
    "rel6m": -5.71,
    "rel12m": 7.16,
    "drawdown52w": -7.68,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 381.67,
    "asOf": "2026-10-13",
    "rsi14w": 43.21,
    "rsiTrend": "down",
    "relativeRsi": 34.49,
    "relativeTrend": "down",
    "ret3m": 2.5,
    "rel1m": -5.22,
    "rel3m": -0.8,
    "rel6m": -23.84,
    "rel12m": -14.14,
    "drawdown52w": -23.03,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 78.37,
    "asOf": "2026-10-13",
    "rsi14w": 34.64,
    "rsiTrend": "down",
    "relativeRsi": 28.06,
    "relativeTrend": "down",
    "ret3m": -5.86,
    "rel1m": -5.15,
    "rel3m": -8.89,
    "rel6m": -18.32,
    "rel12m": -24.86,
    "drawdown52w": -11.04,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.98,
    "asOf": "2026-10-13",
    "rsi14w": 69.3,
    "rsiTrend": "down",
    "relativeRsi": 59.28,
    "relativeTrend": "down",
    "ret3m": 16.37,
    "rel1m": -1.46,
    "rel3m": 12.62,
    "rel6m": 3.29,
    "rel12m": 30.97,
    "drawdown52w": -0.6,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 31.33,
    "asOf": "2026-10-13",
    "rsi14w": 69.09,
    "rsiTrend": "flat",
    "relativeRsi": 54.17,
    "relativeTrend": "down",
    "ret3m": 8.67,
    "rel1m": -0.8,
    "rel3m": 5.17,
    "rel6m": -1.33,
    "rel12m": 1.23,
    "drawdown52w": -0.29,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 29.02,
    "asOf": "2026-10-13",
    "rsi14w": 68.87,
    "rsiTrend": "up",
    "relativeRsi": 45.38,
    "relativeTrend": "flat",
    "ret3m": 2.73,
    "rel1m": 0.5,
    "rel3m": -0.58,
    "rel6m": -5.66,
    "rel12m": -10.65,
    "drawdown52w": -0.38,
    "above200d": true
  }
];
