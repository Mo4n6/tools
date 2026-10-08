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
  "generatedAt": "2026-10-08T02:50:53Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 777.22,
  "asOf": "2026-10-07",
  "ret3m": 3.65,
  "ret12m": 16.97,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 63.36,
    "asOf": "2026-10-07",
    "rsi14w": 61.52,
    "rsiTrend": "down",
    "relativeRsi": 53.47,
    "relativeTrend": "down",
    "ret3m": 16.27,
    "rel1m": -3.26,
    "rel3m": 12.17,
    "rel6m": -4.3,
    "rel12m": 24.7,
    "drawdown52w": -3.33,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 53.75,
    "asOf": "2026-10-07",
    "rsi14w": 45.77,
    "rsiTrend": "down",
    "relativeRsi": 32.81,
    "relativeTrend": "down",
    "ret3m": -2.88,
    "rel1m": -7.46,
    "rel3m": -6.3,
    "rel6m": -8.51,
    "rel12m": -13.08,
    "drawdown52w": -7.89,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 48.98,
    "asOf": "2026-10-07",
    "rsi14w": 43.15,
    "rsiTrend": "down",
    "relativeRsi": 34.45,
    "relativeTrend": "down",
    "ret3m": -2.1,
    "rel1m": -6.87,
    "rel3m": -5.55,
    "rel6m": -17.41,
    "rel12m": -5.04,
    "drawdown52w": -8.32,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 41.15,
    "asOf": "2026-10-07",
    "rsi14w": 41.79,
    "rsiTrend": "flat",
    "relativeRsi": 36.1,
    "relativeTrend": "down",
    "ret3m": -8.15,
    "rel1m": -6.21,
    "rel3m": -11.38,
    "rel6m": -22.83,
    "rel12m": -19.39,
    "drawdown52w": -11.99,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 168.81,
    "asOf": "2026-10-07",
    "rsi14w": 59.9,
    "rsiTrend": "flat",
    "relativeRsi": 50.5,
    "relativeTrend": "flat",
    "ret3m": 4.49,
    "rel1m": -0.32,
    "rel3m": 0.81,
    "rel6m": -1.59,
    "rel12m": 1.81,
    "drawdown52w": -3.54,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 167.84,
    "asOf": "2026-10-07",
    "rsi14w": 41.76,
    "rsiTrend": "down",
    "relativeRsi": 28.62,
    "relativeTrend": "down",
    "ret3m": -7.08,
    "rel1m": -5.15,
    "rel3m": -10.35,
    "rel6m": -14.34,
    "rel12m": -6.45,
    "drawdown52w": -9.77,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 201.39,
    "asOf": "2026-10-07",
    "rsi14w": 70.29,
    "rsiTrend": "up",
    "relativeRsi": 67.75,
    "relativeTrend": "up",
    "ret3m": 8.78,
    "rel1m": 5.5,
    "rel3m": 4.95,
    "rel6m": 23.29,
    "rel12m": 20.34,
    "drawdown52w": -0.3,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 625.03,
    "asOf": "2026-10-07",
    "rsi14w": 64.1,
    "rsiTrend": "up",
    "relativeRsi": 60.67,
    "relativeTrend": "up",
    "ret3m": 2.85,
    "rel1m": 7.1,
    "rel3m": -0.78,
    "rel6m": 27.9,
    "rel12m": 56.09,
    "drawdown52w": -6.56,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 277.7,
    "asOf": "2026-10-07",
    "rsi14w": 45.06,
    "rsiTrend": "down",
    "relativeRsi": 30.51,
    "relativeTrend": "down",
    "ret3m": -6.33,
    "rel1m": -7.11,
    "rel3m": -9.63,
    "rel6m": -7.27,
    "rel12m": -2.83,
    "drawdown52w": -8.74,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 93.89,
    "asOf": "2026-10-07",
    "rsi14w": 35.13,
    "rsiTrend": "down",
    "relativeRsi": 30.43,
    "relativeTrend": "down",
    "ret3m": -8.17,
    "rel1m": -8.88,
    "rel3m": -11.4,
    "rel6m": -16.23,
    "rel12m": -14.34,
    "drawdown52w": -11.82,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 103.1,
    "asOf": "2026-10-07",
    "rsi14w": 48.69,
    "rsiTrend": "down",
    "relativeRsi": 32.01,
    "relativeTrend": "down",
    "ret3m": -0.79,
    "rel1m": -5.94,
    "rel3m": -4.28,
    "rel6m": -11.31,
    "rel12m": -4.35,
    "drawdown52w": -5.25,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 67.37,
    "asOf": "2026-10-07",
    "rsi14w": 56.83,
    "rsiTrend": "down",
    "relativeRsi": 47.39,
    "relativeTrend": "down",
    "ret3m": 0.88,
    "rel1m": -3.78,
    "rel3m": -2.67,
    "rel6m": -3.04,
    "rel12m": 7.79,
    "drawdown52w": -5.39,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 375.88,
    "asOf": "2026-10-07",
    "rsi14w": 40.86,
    "rsiTrend": "down",
    "relativeRsi": 33.13,
    "relativeTrend": "down",
    "ret3m": -0.61,
    "rel1m": -7.56,
    "rel3m": -4.11,
    "rel6m": -25.14,
    "rel12m": -11.81,
    "drawdown52w": -24.2,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 77.15,
    "asOf": "2026-10-07",
    "rsi14w": 28.8,
    "rsiTrend": "down",
    "relativeRsi": 25.29,
    "relativeTrend": "down",
    "ret3m": -7.6,
    "rel1m": -7.36,
    "rel3m": -10.85,
    "rel6m": -21.39,
    "rel12m": -22.17,
    "drawdown52w": -12.42,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.41,
    "asOf": "2026-10-07",
    "rsi14w": 65.71,
    "rsiTrend": "down",
    "relativeRsi": 55.6,
    "relativeTrend": "down",
    "ret3m": 18.21,
    "rel1m": -1.13,
    "rel3m": 14.05,
    "rel6m": -1.25,
    "rel12m": 27.78,
    "drawdown52w": -3.43,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 31.42,
    "asOf": "2026-10-07",
    "rsi14w": 69.83,
    "rsiTrend": "up",
    "relativeRsi": 55.09,
    "relativeTrend": "flat",
    "ret3m": 11.81,
    "rel1m": 2.55,
    "rel3m": 7.88,
    "rel6m": -2.4,
    "rel12m": 5.06,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 29.04,
    "asOf": "2026-10-07",
    "rsi14w": 69.11,
    "rsiTrend": "up",
    "relativeRsi": 45.72,
    "relativeTrend": "up",
    "ret3m": 2.4,
    "rel1m": 1.99,
    "rel3m": -1.21,
    "rel6m": -8.71,
    "rel12m": -7.05,
    "drawdown52w": 0.0,
    "above200d": true
  }
];
