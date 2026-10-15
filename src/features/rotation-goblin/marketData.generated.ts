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
  "generatedAt": "2026-10-15T01:42:46Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 769.6,
  "asOf": "2026-10-14",
  "ret3m": 2.77,
  "ret12m": 17.32,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 67.63,
    "asOf": "2026-10-14",
    "rsi14w": 68.24,
    "rsiTrend": "up",
    "relativeRsi": 60.66,
    "relativeTrend": "up",
    "ret3m": 19.31,
    "rel1m": 1.3,
    "rel3m": 16.1,
    "rel6m": 11.2,
    "rel12m": 37.27,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 54.52,
    "asOf": "2026-10-14",
    "rsi14w": 49.48,
    "rsiTrend": "down",
    "relativeRsi": 39.9,
    "relativeTrend": "down",
    "ret3m": -3.59,
    "rel1m": -5.52,
    "rel3m": -6.19,
    "rel6m": -4.77,
    "rel12m": -10.36,
    "drawdown52w": -6.57,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 49.67,
    "asOf": "2026-10-14",
    "rsi14w": 46.61,
    "rsiTrend": "flat",
    "relativeRsi": 39.59,
    "relativeTrend": "down",
    "ret3m": -1.95,
    "rel1m": -3.44,
    "rel3m": -4.59,
    "rel6m": -11.79,
    "rel12m": -2.3,
    "drawdown52w": -7.03,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 41.72,
    "asOf": "2026-10-14",
    "rsi14w": 44.59,
    "rsiTrend": "up",
    "relativeRsi": 40.19,
    "relativeTrend": "up",
    "ret3m": -7.57,
    "rel1m": -0.15,
    "rel3m": -10.06,
    "rel6m": -16.83,
    "rel12m": -19.52,
    "drawdown52w": -10.77,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 173.96,
    "asOf": "2026-10-14",
    "rsi14w": 64.37,
    "rsiTrend": "up",
    "relativeRsi": 57.08,
    "relativeTrend": "up",
    "ret3m": 7.93,
    "rel1m": 2.25,
    "rel3m": 5.02,
    "rel6m": 7.41,
    "rel12m": 6.2,
    "drawdown52w": -0.6,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 167.04,
    "asOf": "2026-10-14",
    "rsi14w": 40.61,
    "rsiTrend": "flat",
    "relativeRsi": 29.34,
    "relativeTrend": "down",
    "ret3m": -7.03,
    "rel1m": -2.62,
    "rel3m": -9.53,
    "rel6m": -11.24,
    "rel12m": -4.92,
    "drawdown52w": -10.2,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 190.43,
    "asOf": "2026-10-14",
    "rsi14w": 59.04,
    "rsiTrend": "flat",
    "relativeRsi": 55.52,
    "relativeTrend": "down",
    "ret3m": 7.4,
    "rel1m": 1.86,
    "rel3m": 4.5,
    "rel6m": 14.92,
    "rel12m": 14.42,
    "drawdown52w": -5.73,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 564.74,
    "asOf": "2026-10-14",
    "rsi14w": 52.12,
    "rsiTrend": "flat",
    "relativeRsi": 49.35,
    "relativeTrend": "flat",
    "ret3m": -0.73,
    "rel1m": 2.27,
    "rel3m": -3.41,
    "rel6m": 12.81,
    "rel12m": 42.12,
    "drawdown52w": -15.57,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 271.37,
    "asOf": "2026-10-14",
    "rsi14w": 40.21,
    "rsiTrend": "down",
    "relativeRsi": 28.29,
    "relativeTrend": "down",
    "ret3m": -7.95,
    "rel1m": -6.57,
    "rel3m": -10.43,
    "rel6m": -8.39,
    "rel12m": -4.4,
    "drawdown52w": -10.82,
    "above200d": false
  },
  {
    "ticker": "IYR",
    "price": 95.93,
    "asOf": "2026-10-14",
    "rsi14w": 40.24,
    "rsiTrend": "down",
    "relativeRsi": 35.38,
    "relativeTrend": "down",
    "ret3m": -9.04,
    "rel1m": -5.17,
    "rel3m": -11.49,
    "rel6m": -12.53,
    "rel12m": -11.13,
    "drawdown52w": -9.9,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 102.75,
    "asOf": "2026-10-14",
    "rsi14w": 47.67,
    "rsiTrend": "down",
    "relativeRsi": 34.69,
    "relativeTrend": "down",
    "ret3m": -1.02,
    "rel1m": -4.3,
    "rel3m": -3.69,
    "rel6m": -8.58,
    "rel12m": -2.59,
    "drawdown52w": -5.57,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 64.39,
    "asOf": "2026-10-14",
    "rsi14w": 48.26,
    "rsiTrend": "down",
    "relativeRsi": 40.43,
    "relativeTrend": "down",
    "ret3m": 0.31,
    "rel1m": -3.88,
    "rel3m": -2.39,
    "rel6m": -5.84,
    "rel12m": 4.69,
    "drawdown52w": -9.58,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 375.99,
    "asOf": "2026-10-14",
    "rsi14w": 41.29,
    "rsiTrend": "down",
    "relativeRsi": 34.04,
    "relativeTrend": "down",
    "ret3m": 3.02,
    "rel1m": -6.35,
    "rel3m": 0.25,
    "rel6m": -22.75,
    "rel12m": -15.24,
    "drawdown52w": -24.18,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 78.89,
    "asOf": "2026-10-14",
    "rsi14w": 37.37,
    "rsiTrend": "flat",
    "relativeRsi": 33.2,
    "relativeTrend": "down",
    "ret3m": -5.2,
    "rel1m": -3.66,
    "rel3m": -7.75,
    "rel6m": -15.86,
    "rel12m": -22.31,
    "drawdown52w": -10.45,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.86,
    "asOf": "2026-10-14",
    "rsi14w": 68.62,
    "rsiTrend": "flat",
    "relativeRsi": 59.83,
    "relativeTrend": "down",
    "ret3m": 17.1,
    "rel1m": -3.0,
    "rel3m": 13.94,
    "rel6m": 4.3,
    "rel12m": 32.07,
    "drawdown52w": -1.19,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 31.28,
    "asOf": "2026-10-14",
    "rsi14w": 68.81,
    "rsiTrend": "flat",
    "relativeRsi": 55.67,
    "relativeTrend": "down",
    "ret3m": 8.01,
    "rel1m": -1.29,
    "rel3m": 5.1,
    "rel6m": 0.02,
    "rel12m": 3.09,
    "drawdown52w": -0.45,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 29.12,
    "asOf": "2026-10-14",
    "rsi14w": 70.13,
    "rsiTrend": "up",
    "relativeRsi": 49.32,
    "relativeTrend": "flat",
    "ret3m": 2.75,
    "rel1m": 1.3,
    "rel3m": -0.02,
    "rel6m": -3.44,
    "rel12m": -8.3,
    "drawdown52w": -0.03,
    "above200d": true
  }
];
