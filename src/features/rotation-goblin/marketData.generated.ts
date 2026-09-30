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
  "generatedAt": "2026-09-30T02:17:58Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 764.2,
  "asOf": "2026-09-29",
  "ret3m": 2.59,
  "ret12m": 16.72,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 61.54,
    "asOf": "2026-09-29",
    "rsi14w": 57.71,
    "rsiTrend": "down",
    "relativeRsi": 52.3,
    "relativeTrend": "down",
    "ret3m": 16.56,
    "rel1m": -0.82,
    "rel3m": 13.62,
    "rel6m": -17.2,
    "rel12m": 17.9,
    "drawdown52w": -6.1,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 54.01,
    "asOf": "2026-09-29",
    "rsi14w": 46.61,
    "rsiTrend": "down",
    "relativeRsi": 36.66,
    "relativeTrend": "down",
    "ret3m": 1.1,
    "rel1m": -6.31,
    "rel3m": -1.45,
    "rel6m": -7.46,
    "rel12m": -12.73,
    "drawdown52w": -7.44,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 49.1,
    "asOf": "2026-09-29",
    "rsi14w": 43.41,
    "rsiTrend": "down",
    "relativeRsi": 37.02,
    "relativeTrend": "down",
    "ret3m": -2.96,
    "rel1m": -6.85,
    "rel3m": -5.41,
    "rel6m": -17.02,
    "rel12m": -3.58,
    "drawdown52w": -8.09,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 39.71,
    "asOf": "2026-09-29",
    "rsi14w": 33.69,
    "rsiTrend": "down",
    "relativeRsi": 32.68,
    "relativeTrend": "down",
    "ret3m": -11.77,
    "rel1m": -5.99,
    "rel3m": -14.0,
    "rel6m": -27.87,
    "rel12m": -19.38,
    "drawdown52w": -15.07,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 170.73,
    "asOf": "2026-09-29",
    "rsi14w": 63.96,
    "rsiTrend": "down",
    "relativeRsi": 55.55,
    "relativeTrend": "flat",
    "ret3m": 8.02,
    "rel1m": 0.56,
    "rel3m": 5.29,
    "rel6m": -1.52,
    "rel12m": 9.76,
    "drawdown52w": -2.45,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 169.13,
    "asOf": "2026-09-29",
    "rsi14w": 43.46,
    "rsiTrend": "down",
    "relativeRsi": 32.9,
    "relativeTrend": "down",
    "ret3m": -8.45,
    "rel1m": -3.86,
    "rel3m": -10.76,
    "rel6m": -10.68,
    "rel12m": -3.94,
    "drawdown52w": -9.07,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 194.5,
    "asOf": "2026-09-29",
    "rsi14w": 65.57,
    "rsiTrend": "up",
    "relativeRsi": 65.39,
    "relativeTrend": "up",
    "ret3m": 2.21,
    "rel1m": 5.31,
    "rel3m": -0.37,
    "rel6m": 25.81,
    "rel12m": 20.14,
    "drawdown52w": -1.64,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 606.9,
    "asOf": "2026-09-29",
    "rsi14w": 62.35,
    "rsiTrend": "up",
    "relativeRsi": 60.67,
    "relativeTrend": "up",
    "ret3m": -7.47,
    "rel1m": 10.19,
    "rel3m": -9.8,
    "rel6m": 37.74,
    "rel12m": 62.08,
    "drawdown52w": -9.27,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 279.01,
    "asOf": "2026-09-29",
    "rsi14w": 46.26,
    "rsiTrend": "down",
    "relativeRsi": 34.58,
    "relativeTrend": "down",
    "ret3m": -6.89,
    "rel1m": -5.01,
    "rel3m": -9.24,
    "rel6m": -3.71,
    "rel12m": 0.06,
    "drawdown52w": -8.31,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 96.12,
    "asOf": "2026-09-29",
    "rsi14w": 39.09,
    "rsiTrend": "down",
    "relativeRsi": 35.28,
    "relativeTrend": "down",
    "ret3m": -5.3,
    "rel1m": -5.98,
    "rel3m": -7.69,
    "rel6m": -13.96,
    "rel12m": -12.62,
    "drawdown52w": -9.72,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 104.54,
    "asOf": "2026-09-29",
    "rsi14w": 52.61,
    "rsiTrend": "down",
    "relativeRsi": 39.84,
    "relativeTrend": "down",
    "ret3m": 0.64,
    "rel1m": -2.54,
    "rel3m": -1.9,
    "rel6m": -7.12,
    "rel12m": 0.0,
    "drawdown52w": -3.92,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 67.4,
    "asOf": "2026-09-29",
    "rsi14w": 56.98,
    "rsiTrend": "flat",
    "relativeRsi": 51.56,
    "relativeTrend": "flat",
    "ret3m": -1.48,
    "rel1m": 0.81,
    "rel3m": -3.96,
    "rel6m": 1.82,
    "rel12m": 11.7,
    "drawdown52w": -5.35,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 382.89,
    "asOf": "2026-09-29",
    "rsi14w": 43.16,
    "rsiTrend": "down",
    "relativeRsi": 36.78,
    "relativeTrend": "down",
    "ret3m": 3.94,
    "rel1m": -5.96,
    "rel3m": 1.32,
    "rel6m": -24.01,
    "rel12m": -5.39,
    "drawdown52w": -22.79,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 78.23,
    "asOf": "2026-09-29",
    "rsi14w": 30.64,
    "rsiTrend": "down",
    "relativeRsi": 28.21,
    "relativeTrend": "down",
    "ret3m": -8.43,
    "rel1m": -4.85,
    "rel3m": -10.74,
    "rel6m": -24.09,
    "rel12m": -21.15,
    "drawdown52w": -11.55,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.09,
    "asOf": "2026-09-29",
    "rsi14w": 62.3,
    "rsiTrend": "flat",
    "relativeRsi": 55.76,
    "relativeTrend": "flat",
    "ret3m": 20.21,
    "rel1m": 4.25,
    "rel3m": 17.18,
    "rel6m": -10.24,
    "rel12m": 25.03,
    "drawdown52w": -5.02,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 30.99,
    "asOf": "2026-09-29",
    "rsi14w": 67.5,
    "rsiTrend": "up",
    "relativeRsi": 55.55,
    "relativeTrend": "up",
    "ret3m": 12.61,
    "rel1m": 5.0,
    "rel3m": 9.77,
    "rel6m": -9.84,
    "rel12m": 3.35,
    "drawdown52w": -0.39,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 28.75,
    "asOf": "2026-09-29",
    "rsi14w": 65.33,
    "rsiTrend": "up",
    "relativeRsi": 47.4,
    "relativeTrend": "up",
    "ret3m": 1.2,
    "rel1m": 2.46,
    "rel3m": -1.36,
    "rel6m": -15.46,
    "rel12m": -7.7,
    "drawdown52w": 0.0,
    "above200d": true
  }
];
