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
  "generatedAt": "2026-10-06T03:14:50Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 774.83,
  "asOf": "2026-10-05",
  "ret3m": 3.88,
  "ret12m": 17.03,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 63.45,
    "asOf": "2026-10-05",
    "rsi14w": 61.68,
    "rsiTrend": "down",
    "relativeRsi": 53.95,
    "relativeTrend": "down",
    "ret3m": 16.81,
    "rel1m": -1.68,
    "rel3m": 12.45,
    "rel6m": -8.85,
    "rel12m": 26.1,
    "drawdown52w": -3.19,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 53.88,
    "asOf": "2026-10-05",
    "rsi14w": 46.45,
    "rsiTrend": "down",
    "relativeRsi": 33.85,
    "relativeTrend": "down",
    "ret3m": -3.53,
    "rel1m": -8.09,
    "rel3m": -7.14,
    "rel6m": -7.96,
    "rel12m": -12.34,
    "drawdown52w": -7.67,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 49.5,
    "asOf": "2026-10-05",
    "rsi14w": 45.73,
    "rsiTrend": "down",
    "relativeRsi": 36.96,
    "relativeTrend": "down",
    "ret3m": -3.46,
    "rel1m": -5.93,
    "rel3m": -7.07,
    "rel6m": -15.9,
    "rel12m": -4.0,
    "drawdown52w": -7.35,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 39.97,
    "asOf": "2026-10-05",
    "rsi14w": 35.28,
    "rsiTrend": "down",
    "relativeRsi": 31.68,
    "relativeTrend": "down",
    "ret3m": -11.9,
    "rel1m": -6.86,
    "rel3m": -15.19,
    "rel6m": -25.74,
    "rel12m": -20.06,
    "drawdown52w": -14.51,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 167.37,
    "asOf": "2026-10-05",
    "rsi14w": 58.51,
    "rsiTrend": "down",
    "relativeRsi": 49.51,
    "relativeTrend": "down",
    "ret3m": 2.17,
    "rel1m": -3.48,
    "rel3m": -1.65,
    "rel6m": -2.39,
    "rel12m": 1.55,
    "drawdown52w": -4.37,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 170.1,
    "asOf": "2026-10-05",
    "rsi14w": 44.74,
    "rsiTrend": "down",
    "relativeRsi": 31.18,
    "relativeTrend": "down",
    "ret3m": -6.48,
    "rel1m": -2.74,
    "rel3m": -9.98,
    "rel6m": -12.11,
    "rel12m": -4.66,
    "drawdown52w": -8.55,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 200.93,
    "asOf": "2026-10-05",
    "rsi14w": 70.05,
    "rsiTrend": "up",
    "relativeRsi": 68.0,
    "relativeTrend": "up",
    "ret3m": 12.27,
    "rel1m": 7.67,
    "rel3m": 8.07,
    "rel6m": 24.59,
    "rel12m": 20.61,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 633.9,
    "asOf": "2026-10-05",
    "rsi14w": 65.84,
    "rsiTrend": "up",
    "relativeRsi": 63.42,
    "relativeTrend": "up",
    "ret3m": 9.02,
    "rel1m": 14.18,
    "rel3m": 4.94,
    "rel6m": 35.45,
    "rel12m": 60.64,
    "drawdown52w": -5.23,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 283.38,
    "asOf": "2026-10-05",
    "rsi14w": 50.02,
    "rsiTrend": "down",
    "relativeRsi": 35.05,
    "relativeTrend": "down",
    "ret3m": -4.08,
    "rel1m": -4.19,
    "rel3m": -7.66,
    "rel6m": -4.51,
    "rel12m": 0.24,
    "drawdown52w": -6.87,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 94.36,
    "asOf": "2026-10-05",
    "rsi14w": 35.93,
    "rsiTrend": "down",
    "relativeRsi": 31.24,
    "relativeTrend": "down",
    "ret3m": -9.04,
    "rel1m": -8.03,
    "rel3m": -12.44,
    "rel6m": -16.13,
    "rel12m": -14.51,
    "drawdown52w": -11.37,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 104.03,
    "asOf": "2026-10-05",
    "rsi14w": 51.22,
    "rsiTrend": "down",
    "relativeRsi": 34.74,
    "relativeTrend": "down",
    "ret3m": -0.12,
    "rel1m": -4.31,
    "rel3m": -3.86,
    "rel6m": -9.21,
    "rel12m": -2.5,
    "drawdown52w": -4.39,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 68.73,
    "asOf": "2026-10-05",
    "rsi14w": 60.2,
    "rsiTrend": "flat",
    "relativeRsi": 52.94,
    "relativeTrend": "flat",
    "ret3m": 4.58,
    "rel1m": 1.4,
    "rel3m": 0.67,
    "rel6m": 2.36,
    "rel12m": 10.74,
    "drawdown52w": -3.48,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 379.55,
    "asOf": "2026-10-05",
    "rsi14w": 42.07,
    "rsiTrend": "down",
    "relativeRsi": 34.38,
    "relativeTrend": "down",
    "ret3m": 0.55,
    "rel1m": -7.9,
    "rel3m": -3.21,
    "rel6m": -24.9,
    "rel12m": -8.59,
    "drawdown52w": -23.46,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 77.11,
    "asOf": "2026-10-05",
    "rsi14w": 28.7,
    "rsiTrend": "down",
    "relativeRsi": 25.55,
    "relativeTrend": "down",
    "ret3m": -7.71,
    "rel1m": -6.1,
    "rel3m": -11.16,
    "rel6m": -22.94,
    "rel12m": -23.01,
    "drawdown52w": -12.47,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.25,
    "asOf": "2026-10-05",
    "rsi14w": 63.82,
    "rsiTrend": "down",
    "relativeRsi": 54.86,
    "relativeTrend": "flat",
    "ret3m": 17.95,
    "rel1m": 0.37,
    "rel3m": 13.54,
    "rel6m": -7.19,
    "rel12m": 28.48,
    "drawdown52w": -4.23,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 31.29,
    "asOf": "2026-10-05",
    "rsi14w": 69.15,
    "rsiTrend": "up",
    "relativeRsi": 54.92,
    "relativeTrend": "up",
    "ret3m": 12.72,
    "rel1m": 3.82,
    "rel3m": 8.5,
    "rel6m": -7.07,
    "rel12m": 5.4,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 28.99,
    "asOf": "2026-10-05",
    "rsi14w": 68.5,
    "rsiTrend": "up",
    "relativeRsi": 46.04,
    "relativeTrend": "up",
    "ret3m": 2.08,
    "rel1m": 3.02,
    "rel3m": -1.74,
    "rel6m": -11.86,
    "rel12m": -6.98,
    "drawdown52w": 0.0,
    "above200d": true
  }
];
