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
  "generatedAt": "2026-10-10T02:48:02Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 778.57,
  "asOf": "2026-10-09",
  "ret3m": 4.18,
  "ret12m": 16.92,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 65.08,
    "asOf": "2026-10-09",
    "rsi14w": 64.42,
    "rsiTrend": "down",
    "relativeRsi": 55.97,
    "relativeTrend": "down",
    "ret3m": 15.38,
    "rel1m": -2.1,
    "rel3m": 10.75,
    "rel6m": 0.55,
    "rel12m": 28.7,
    "drawdown52w": -0.7,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 54.73,
    "asOf": "2026-10-09",
    "rsi14w": 50.47,
    "rsiTrend": "down",
    "relativeRsi": 37.39,
    "relativeTrend": "down",
    "ret3m": -2.04,
    "rel1m": -6.23,
    "rel3m": -5.98,
    "rel6m": -5.74,
    "rel12m": -11.14,
    "drawdown52w": -6.21,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 49.43,
    "asOf": "2026-10-09",
    "rsi14w": 45.39,
    "rsiTrend": "down",
    "relativeRsi": 35.44,
    "relativeTrend": "down",
    "ret3m": -1.82,
    "rel1m": -5.01,
    "rel3m": -5.77,
    "rel6m": -16.71,
    "rel12m": -4.24,
    "drawdown52w": -7.48,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 41.41,
    "asOf": "2026-10-09",
    "rsi14w": 43.05,
    "rsiTrend": "flat",
    "relativeRsi": 36.87,
    "relativeTrend": "flat",
    "ret3m": -8.76,
    "rel1m": -4.74,
    "rel3m": -12.42,
    "rel6m": -22.38,
    "rel12m": -19.76,
    "drawdown52w": -11.43,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 170.81,
    "asOf": "2026-10-09",
    "rsi14w": 61.68,
    "rsiTrend": "up",
    "relativeRsi": 52.22,
    "relativeTrend": "up",
    "ret3m": 6.23,
    "rel1m": 0.5,
    "rel3m": 1.96,
    "rel6m": 1.51,
    "rel12m": 2.79,
    "drawdown52w": -2.4,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 169.25,
    "asOf": "2026-10-09",
    "rsi14w": 43.54,
    "rsiTrend": "down",
    "relativeRsi": 29.6,
    "relativeTrend": "down",
    "ret3m": -5.91,
    "rel1m": -3.39,
    "rel3m": -9.69,
    "rel6m": -13.88,
    "rel12m": -5.9,
    "drawdown52w": -9.01,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 198.78,
    "asOf": "2026-10-09",
    "rsi14w": 68.22,
    "rsiTrend": "up",
    "relativeRsi": 63.42,
    "relativeTrend": "up",
    "ret3m": 9.78,
    "rel1m": 4.32,
    "rel3m": 5.37,
    "rel6m": 21.31,
    "rel12m": 17.58,
    "drawdown52w": -1.59,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 603.33,
    "asOf": "2026-10-09",
    "rsi14w": 59.41,
    "rsiTrend": "up",
    "relativeRsi": 55.6,
    "relativeTrend": "flat",
    "ret3m": 3.02,
    "rel1m": 4.56,
    "rel3m": -1.11,
    "rel6m": 19.91,
    "rel12m": 49.58,
    "drawdown52w": -9.8,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 278.94,
    "asOf": "2026-10-09",
    "rsi14w": 46.06,
    "rsiTrend": "down",
    "relativeRsi": 30.98,
    "relativeTrend": "down",
    "ret3m": -4.71,
    "rel1m": -5.62,
    "rel3m": -8.53,
    "rel6m": -6.84,
    "rel12m": -2.32,
    "drawdown52w": -8.33,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 96.1,
    "asOf": "2026-10-09",
    "rsi14w": 40.58,
    "rsiTrend": "down",
    "relativeRsi": 33.0,
    "relativeTrend": "down",
    "ret3m": -6.83,
    "rel1m": -5.97,
    "rel3m": -10.57,
    "rel6m": -14.69,
    "rel12m": -11.65,
    "drawdown52w": -9.74,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 103.4,
    "asOf": "2026-10-09",
    "rsi14w": 49.48,
    "rsiTrend": "down",
    "relativeRsi": 32.25,
    "relativeTrend": "down",
    "ret3m": 0.15,
    "rel1m": -4.98,
    "rel3m": -3.87,
    "rel6m": -10.74,
    "rel12m": -3.46,
    "drawdown52w": -4.97,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 66.8,
    "asOf": "2026-10-09",
    "rsi14w": 55.07,
    "rsiTrend": "down",
    "relativeRsi": 45.23,
    "relativeTrend": "down",
    "ret3m": 3.57,
    "rel1m": -3.19,
    "rel3m": -0.59,
    "rel6m": -3.72,
    "rel12m": 6.91,
    "drawdown52w": -6.19,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 384.58,
    "asOf": "2026-10-09",
    "rsi14w": 44.27,
    "rsiTrend": "down",
    "relativeRsi": 35.27,
    "relativeTrend": "down",
    "ret3m": 4.75,
    "rel1m": -5.79,
    "rel3m": 0.55,
    "rel6m": -23.61,
    "rel12m": -11.65,
    "drawdown52w": -22.45,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 77.98,
    "asOf": "2026-10-09",
    "rsi14w": 32.43,
    "rsiTrend": "down",
    "relativeRsi": 26.22,
    "relativeTrend": "down",
    "ret3m": -6.03,
    "rel1m": -5.89,
    "rel3m": -9.8,
    "rel6m": -19.88,
    "rel12m": -21.8,
    "drawdown52w": -11.48,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.66,
    "asOf": "2026-10-09",
    "rsi14w": 67.41,
    "rsiTrend": "down",
    "relativeRsi": 57.26,
    "relativeTrend": "down",
    "ret3m": 16.33,
    "rel1m": -4.79,
    "rel3m": 11.66,
    "rel6m": 0.59,
    "rel12m": 28.82,
    "drawdown52w": -2.19,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 31.02,
    "asOf": "2026-10-09",
    "rsi14w": 67.26,
    "rsiTrend": "flat",
    "relativeRsi": 52.34,
    "relativeTrend": "down",
    "ret3m": 8.12,
    "rel1m": -3.19,
    "rel3m": 3.78,
    "rel6m": -4.21,
    "rel12m": 3.74,
    "drawdown52w": -1.27,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 29.02,
    "asOf": "2026-10-09",
    "rsi14w": 68.87,
    "rsiTrend": "up",
    "relativeRsi": 45.16,
    "relativeTrend": "up",
    "ret3m": 1.82,
    "rel1m": 0.52,
    "rel3m": -2.26,
    "rel6m": -8.17,
    "rel12m": -7.8,
    "drawdown52w": -0.07,
    "above200d": true
  }
];
