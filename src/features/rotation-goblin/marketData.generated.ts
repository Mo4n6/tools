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
  "generatedAt": "2026-10-02T02:29:47Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 763.99,
  "asOf": "2026-10-01",
  "ret3m": 2.83,
  "ret12m": 15.92,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 62.7,
    "asOf": "2026-10-01",
    "rsi14w": 60.29,
    "rsiTrend": "down",
    "relativeRsi": 54.13,
    "relativeTrend": "down",
    "ret3m": 18.51,
    "rel1m": -3.14,
    "rel3m": 15.25,
    "rel6m": -8.07,
    "rel12m": 24.54,
    "drawdown52w": -4.33,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 53.46,
    "asOf": "2026-10-01",
    "rsi14w": 44.25,
    "rsiTrend": "down",
    "relativeRsi": 34.81,
    "relativeTrend": "down",
    "ret3m": -3.54,
    "rel1m": -6.71,
    "rel3m": -6.2,
    "rel6m": -7.08,
    "rel12m": -13.04,
    "drawdown52w": -8.39,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 48.54,
    "asOf": "2026-10-01",
    "rsi14w": 41.38,
    "rsiTrend": "down",
    "relativeRsi": 35.52,
    "relativeTrend": "down",
    "ret3m": -6.24,
    "rel1m": -6.85,
    "rel3m": -8.83,
    "rel6m": -17.23,
    "rel12m": -4.86,
    "drawdown52w": -9.14,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 39.68,
    "asOf": "2026-10-01",
    "rsi14w": 33.52,
    "rsiTrend": "down",
    "relativeRsi": 32.6,
    "relativeTrend": "down",
    "ret3m": -12.65,
    "rel1m": -6.59,
    "rel3m": -15.06,
    "rel6m": -25.55,
    "rel12m": -19.26,
    "drawdown52w": -15.13,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 166.2,
    "asOf": "2026-10-01",
    "rsi14w": 57.31,
    "rsiTrend": "down",
    "relativeRsi": 50.72,
    "relativeTrend": "down",
    "ret3m": 1.89,
    "rel1m": -3.34,
    "rel3m": -0.92,
    "rel6m": -3.21,
    "rel12m": 4.74,
    "drawdown52w": -5.03,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 168.64,
    "asOf": "2026-10-01",
    "rsi14w": 42.87,
    "rsiTrend": "down",
    "relativeRsi": 32.15,
    "relativeTrend": "down",
    "ret3m": -8.06,
    "rel1m": -2.63,
    "rel3m": -10.59,
    "rel6m": -12.03,
    "rel12m": -4.59,
    "drawdown52w": -9.34,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 197.81,
    "asOf": "2026-10-01",
    "rsi14w": 68.43,
    "rsiTrend": "up",
    "relativeRsi": 67.98,
    "relativeTrend": "up",
    "ret3m": 9.66,
    "rel1m": 7.26,
    "rel3m": 6.64,
    "rel6m": 25.41,
    "rel12m": 21.71,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 617.81,
    "asOf": "2026-10-01",
    "rsi14w": 63.83,
    "rsiTrend": "up",
    "relativeRsi": 62.46,
    "relativeTrend": "up",
    "ret3m": 4.31,
    "rel1m": 12.71,
    "rel3m": 1.43,
    "rel6m": 34.5,
    "rel12m": 63.81,
    "drawdown52w": -7.64,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 279.02,
    "asOf": "2026-10-01",
    "rsi14w": 46.27,
    "rsiTrend": "down",
    "relativeRsi": 34.65,
    "relativeTrend": "down",
    "ret3m": -5.99,
    "rel1m": -4.24,
    "rel3m": -8.58,
    "rel6m": -4.12,
    "rel12m": 0.49,
    "drawdown52w": -8.31,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 94.47,
    "asOf": "2026-10-01",
    "rsi14w": 36.16,
    "rsiTrend": "down",
    "relativeRsi": 32.89,
    "relativeTrend": "down",
    "ret3m": -8.5,
    "rel1m": -7.6,
    "rel3m": -11.02,
    "rel6m": -13.99,
    "rel12m": -14.0,
    "drawdown52w": -11.27,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 102.82,
    "asOf": "2026-10-01",
    "rsi14w": 48.18,
    "rsiTrend": "down",
    "relativeRsi": 35.41,
    "relativeTrend": "down",
    "ret3m": -1.49,
    "rel1m": -3.96,
    "rel3m": -4.2,
    "rel6m": -9.62,
    "rel12m": -1.75,
    "drawdown52w": -5.51,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 66.81,
    "asOf": "2026-10-01",
    "rsi14w": 55.28,
    "rsiTrend": "down",
    "relativeRsi": 49.54,
    "relativeTrend": "down",
    "ret3m": 1.69,
    "rel1m": -0.48,
    "rel3m": -1.11,
    "rel6m": 0.14,
    "rel12m": 10.04,
    "drawdown52w": -6.18,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 382.76,
    "asOf": "2026-10-01",
    "rsi14w": 43.12,
    "rsiTrend": "down",
    "relativeRsi": 36.77,
    "relativeTrend": "down",
    "ret3m": 1.22,
    "rel1m": -4.04,
    "rel3m": -1.57,
    "rel6m": -25.4,
    "rel12m": -7.11,
    "drawdown52w": -22.82,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 77.71,
    "asOf": "2026-10-01",
    "rsi14w": 30.13,
    "rsiTrend": "down",
    "relativeRsi": 27.93,
    "relativeTrend": "down",
    "ret3m": -8.04,
    "rel1m": -5.21,
    "rel3m": -10.57,
    "rel6m": -21.32,
    "rel12m": -21.24,
    "drawdown52w": -11.79,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.56,
    "asOf": "2026-10-01",
    "rsi14w": 67.11,
    "rsiTrend": "flat",
    "relativeRsi": 58.76,
    "relativeTrend": "flat",
    "ret3m": 23.25,
    "rel1m": 2.13,
    "rel3m": 19.85,
    "rel6m": -2.39,
    "rel12m": 30.52,
    "drawdown52w": -2.69,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 31.16,
    "asOf": "2026-10-01",
    "rsi14w": 68.41,
    "rsiTrend": "up",
    "relativeRsi": 56.4,
    "relativeTrend": "up",
    "ret3m": 13.6,
    "rel1m": 1.82,
    "rel3m": 10.47,
    "rel6m": -5.0,
    "rel12m": 4.86,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 28.96,
    "asOf": "2026-10-01",
    "rsi14w": 68.06,
    "rsiTrend": "up",
    "relativeRsi": 49.27,
    "relativeTrend": "up",
    "ret3m": 2.19,
    "rel1m": 2.11,
    "rel3m": -0.63,
    "rel6m": -10.88,
    "rel12m": -6.08,
    "drawdown52w": 0.0,
    "above200d": true
  }
];
