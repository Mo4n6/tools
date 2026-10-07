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
  "generatedAt": "2026-10-07T02:37:45Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 779.09,
  "asOf": "2026-10-06",
  "ret3m": 4.78,
  "ret12m": 17.68,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 63.75,
    "asOf": "2026-10-06",
    "rsi14w": 62.21,
    "rsiTrend": "down",
    "relativeRsi": 53.87,
    "relativeTrend": "down",
    "ret3m": 15.34,
    "rel1m": -1.28,
    "rel3m": 10.08,
    "rel6m": -9.61,
    "rel12m": 25.34,
    "drawdown52w": -2.73,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 54.01,
    "asOf": "2026-10-06",
    "rsi14w": 47.1,
    "rsiTrend": "down",
    "relativeRsi": 33.22,
    "relativeTrend": "down",
    "ret3m": -1.4,
    "rel1m": -8.0,
    "rel3m": -5.9,
    "rel6m": -8.2,
    "rel12m": -13.21,
    "drawdown52w": -7.44,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 49.73,
    "asOf": "2026-10-06",
    "rsi14w": 46.8,
    "rsiTrend": "down",
    "relativeRsi": 36.75,
    "relativeTrend": "down",
    "ret3m": -0.4,
    "rel1m": -6.05,
    "rel3m": -4.94,
    "rel6m": -15.7,
    "rel12m": -4.24,
    "drawdown52w": -6.91,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 41.16,
    "asOf": "2026-10-06",
    "rsi14w": 41.84,
    "rsiTrend": "down",
    "relativeRsi": 35.72,
    "relativeTrend": "down",
    "ret3m": -8.59,
    "rel1m": -5.09,
    "rel3m": -12.76,
    "rel6m": -24.08,
    "rel12m": -19.08,
    "drawdown52w": -11.96,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 167.09,
    "asOf": "2026-10-06",
    "rsi14w": 58.23,
    "rsiTrend": "down",
    "relativeRsi": 48.26,
    "relativeTrend": "down",
    "ret3m": 3.35,
    "rel1m": -3.53,
    "rel3m": -1.37,
    "rel6m": -3.23,
    "rel12m": -0.31,
    "drawdown52w": -4.53,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 171.58,
    "asOf": "2026-10-06",
    "rsi14w": 47.15,
    "rsiTrend": "flat",
    "relativeRsi": 31.73,
    "relativeTrend": "down",
    "ret3m": -4.64,
    "rel1m": -3.2,
    "rel3m": -8.99,
    "rel6m": -11.62,
    "rel12m": -4.49,
    "drawdown52w": -7.76,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 202.0,
    "asOf": "2026-10-06",
    "rsi14w": 70.59,
    "rsiTrend": "up",
    "relativeRsi": 67.94,
    "relativeTrend": "up",
    "ret3m": 11.49,
    "rel1m": 6.49,
    "rel3m": 6.4,
    "rel6m": 24.03,
    "rel12m": 21.2,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 632.5,
    "asOf": "2026-10-06",
    "rsi14w": 65.66,
    "rsiTrend": "up",
    "relativeRsi": 62.15,
    "relativeTrend": "up",
    "ret3m": 6.66,
    "rel1m": 10.0,
    "rel3m": 1.8,
    "rel6m": 33.15,
    "rel12m": 60.14,
    "drawdown52w": -5.44,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 281.34,
    "asOf": "2026-10-06",
    "rsi14w": 48.12,
    "rsiTrend": "down",
    "relativeRsi": 32.41,
    "relativeTrend": "down",
    "ret3m": -3.89,
    "rel1m": -6.03,
    "rel3m": -8.27,
    "rel6m": -5.88,
    "rel12m": -1.76,
    "drawdown52w": -7.54,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 95.26,
    "asOf": "2026-10-06",
    "rsi14w": 38.16,
    "rsiTrend": "down",
    "relativeRsi": 31.66,
    "relativeTrend": "down",
    "ret3m": -6.64,
    "rel1m": -7.35,
    "rel3m": -10.9,
    "rel6m": -15.83,
    "rel12m": -14.54,
    "drawdown52w": -10.53,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 104.22,
    "asOf": "2026-10-06",
    "rsi14w": 51.73,
    "rsiTrend": "down",
    "relativeRsi": 33.86,
    "relativeTrend": "down",
    "ret3m": 0.83,
    "rel1m": -5.15,
    "rel3m": -3.77,
    "rel6m": -9.38,
    "rel12m": -3.66,
    "drawdown52w": -4.22,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 68.27,
    "asOf": "2026-10-06",
    "rsi14w": 59.19,
    "rsiTrend": "down",
    "relativeRsi": 49.95,
    "relativeTrend": "down",
    "ret3m": 3.08,
    "rel1m": -2.0,
    "rel3m": -1.62,
    "rel6m": 0.81,
    "rel12m": 9.08,
    "drawdown52w": -4.13,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 382.27,
    "asOf": "2026-10-06",
    "rsi14w": 43.24,
    "rsiTrend": "down",
    "relativeRsi": 34.55,
    "relativeTrend": "down",
    "ret3m": 2.09,
    "rel1m": -7.33,
    "rel3m": -2.57,
    "rel6m": -25.47,
    "rel12m": -9.17,
    "drawdown52w": -22.91,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 77.28,
    "asOf": "2026-10-06",
    "rsi14w": 29.11,
    "rsiTrend": "down",
    "relativeRsi": 25.22,
    "relativeTrend": "down",
    "ret3m": -7.3,
    "rel1m": -6.93,
    "rel3m": -11.53,
    "rel6m": -23.15,
    "rel12m": -23.12,
    "drawdown52w": -12.28,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.46,
    "asOf": "2026-10-06",
    "rsi14w": 66.2,
    "rsiTrend": "flat",
    "relativeRsi": 55.63,
    "relativeTrend": "down",
    "ret3m": 17.09,
    "rel1m": 0.95,
    "rel3m": 11.75,
    "rel6m": -6.49,
    "rel12m": 28.68,
    "drawdown52w": -3.18,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 31.41,
    "asOf": "2026-10-06",
    "rsi14w": 69.77,
    "rsiTrend": "up",
    "relativeRsi": 54.59,
    "relativeTrend": "up",
    "ret3m": 11.52,
    "rel1m": 3.35,
    "rel3m": 6.43,
    "rel6m": -7.31,
    "rel12m": 4.95,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 28.9,
    "asOf": "2026-10-06",
    "rsi14w": 67.33,
    "rsiTrend": "up",
    "relativeRsi": 44.1,
    "relativeTrend": "up",
    "ret3m": 1.9,
    "rel1m": 1.49,
    "rel3m": -2.74,
    "rel6m": -12.32,
    "rel12m": -7.61,
    "drawdown52w": -0.31,
    "above200d": true
  }
];
