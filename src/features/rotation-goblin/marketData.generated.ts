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
  "generatedAt": "2026-09-25T01:46:14Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 767.18,
  "asOf": "2026-09-24",
  "ret3m": 4.74,
  "ret12m": 16.92,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 62.6,
    "asOf": "2026-09-24",
    "rsi14w": 60.54,
    "rsiTrend": "flat",
    "relativeRsi": 53.69,
    "relativeTrend": "flat",
    "ret3m": 16.42,
    "rel1m": 1.05,
    "rel3m": 11.16,
    "rel6m": -10.8,
    "rel12m": 23.49,
    "drawdown52w": -4.49,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 54.53,
    "asOf": "2026-09-24",
    "rsi14w": 49.19,
    "rsiTrend": "down",
    "relativeRsi": 37.82,
    "relativeTrend": "down",
    "ret3m": 2.38,
    "rel1m": -6.54,
    "rel3m": -2.25,
    "rel6m": -5.19,
    "rel12m": -11.88,
    "drawdown52w": -6.55,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 49.68,
    "asOf": "2026-09-24",
    "rsi14w": 45.74,
    "rsiTrend": "down",
    "relativeRsi": 38.13,
    "relativeTrend": "down",
    "ret3m": -2.45,
    "rel1m": -7.53,
    "rel3m": -6.99,
    "rel6m": -12.41,
    "rel12m": -3.74,
    "drawdown52w": -7.01,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 39.36,
    "asOf": "2026-09-24",
    "rsi14w": 32.07,
    "rsiTrend": "down",
    "relativeRsi": 30.22,
    "relativeTrend": "down",
    "ret3m": -12.93,
    "rel1m": -8.93,
    "rel3m": -16.99,
    "rel6m": -25.03,
    "rel12m": -18.28,
    "drawdown52w": -15.81,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 169.87,
    "asOf": "2026-09-24",
    "rsi14w": 63.21,
    "rsiTrend": "down",
    "relativeRsi": 54.04,
    "relativeTrend": "down",
    "ret3m": 11.2,
    "rel1m": -3.11,
    "rel3m": 6.01,
    "rel6m": 0.2,
    "rel12m": 8.7,
    "drawdown52w": -2.94,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 168.83,
    "asOf": "2026-09-24",
    "rsi14w": 42.81,
    "rsiTrend": "down",
    "relativeRsi": 31.69,
    "relativeTrend": "down",
    "ret3m": -6.06,
    "rel1m": -6.12,
    "rel3m": -10.44,
    "rel6m": -12.34,
    "rel12m": -4.02,
    "drawdown52w": -9.24,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 194.71,
    "asOf": "2026-09-24",
    "rsi14w": 66.75,
    "rsiTrend": "up",
    "relativeRsi": 64.96,
    "relativeTrend": "up",
    "ret3m": 6.49,
    "rel1m": 7.48,
    "rel3m": 1.53,
    "rel6m": 21.43,
    "rel12m": 19.08,
    "drawdown52w": -1.53,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 600.52,
    "asOf": "2026-09-24",
    "rsi14w": 61.49,
    "rsiTrend": "up",
    "relativeRsi": 59.17,
    "relativeTrend": "up",
    "ret3m": -5.71,
    "rel1m": 7.6,
    "rel3m": -9.97,
    "rel6m": 28.2,
    "rel12m": 60.15,
    "drawdown52w": -10.22,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 281.66,
    "asOf": "2026-09-24",
    "rsi14w": 48.42,
    "rsiTrend": "down",
    "relativeRsi": 35.71,
    "relativeTrend": "down",
    "ret3m": -5.52,
    "rel1m": -6.02,
    "rel3m": -9.8,
    "rel6m": -4.25,
    "rel12m": -0.21,
    "drawdown52w": -7.44,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 96.81,
    "asOf": "2026-09-24",
    "rsi14w": 40.43,
    "rsiTrend": "down",
    "relativeRsi": 35.2,
    "relativeTrend": "down",
    "ret3m": -5.17,
    "rel1m": -8.14,
    "rel3m": -9.59,
    "rel6m": -11.2,
    "rel12m": -11.31,
    "drawdown52w": -9.07,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 104.5,
    "asOf": "2026-09-24",
    "rsi14w": 52.88,
    "rsiTrend": "down",
    "relativeRsi": 38.67,
    "relativeTrend": "down",
    "ret3m": 2.19,
    "rel1m": -3.97,
    "rel3m": -2.57,
    "rel6m": -5.61,
    "rel12m": -0.39,
    "drawdown52w": -3.96,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 67.25,
    "asOf": "2026-09-24",
    "rsi14w": 57.2,
    "rsiTrend": "flat",
    "relativeRsi": 50.19,
    "relativeTrend": "flat",
    "ret3m": 0.0,
    "rel1m": 0.98,
    "rel3m": -4.66,
    "rel6m": 1.32,
    "rel12m": 10.69,
    "drawdown52w": -5.56,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 391.69,
    "asOf": "2026-09-24",
    "rsi14w": 46.32,
    "rsiTrend": "down",
    "relativeRsi": 39.02,
    "relativeTrend": "down",
    "ret3m": 6.02,
    "rel1m": -8.88,
    "rel3m": 1.22,
    "rel6m": -19.85,
    "rel12m": -3.31,
    "drawdown52w": -21.01,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 79.42,
    "asOf": "2026-09-24",
    "rsi14w": 33.85,
    "rsiTrend": "down",
    "relativeRsi": 29.55,
    "relativeTrend": "down",
    "ret3m": -8.02,
    "rel1m": -4.88,
    "rel3m": -12.18,
    "rel6m": -20.27,
    "rel12m": -20.47,
    "drawdown52w": -10.21,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.8,
    "asOf": "2026-09-24",
    "rsi14w": 69.26,
    "rsiTrend": "up",
    "relativeRsi": 60.39,
    "relativeTrend": "up",
    "ret3m": 25.48,
    "rel1m": 6.42,
    "rel3m": 19.63,
    "rel6m": -0.63,
    "rel12m": 33.49,
    "drawdown52w": -1.49,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 31.07,
    "asOf": "2026-09-24",
    "rsi14w": 67.87,
    "rsiTrend": "up",
    "relativeRsi": 55.59,
    "relativeTrend": "up",
    "ret3m": 13.39,
    "rel1m": 5.99,
    "rel3m": 8.11,
    "rel6m": -4.33,
    "rel12m": 3.08,
    "drawdown52w": -0.13,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 28.69,
    "asOf": "2026-09-24",
    "rsi14w": 64.39,
    "rsiTrend": "up",
    "relativeRsi": 45.5,
    "relativeTrend": "up",
    "ret3m": 0.56,
    "rel1m": 1.86,
    "rel3m": -4.13,
    "rel6m": -12.1,
    "rel12m": -6.64,
    "drawdown52w": 0.0,
    "above200d": true
  }
];
