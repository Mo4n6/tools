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
  "generatedAt": "2026-10-03T02:14:50Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 769.64,
  "asOf": "2026-10-02",
  "ret3m": 2.7,
  "ret12m": 16.38,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 62.82,
    "asOf": "2026-10-02",
    "rsi14w": 60.5,
    "rsiTrend": "down",
    "relativeRsi": 53.62,
    "relativeTrend": "down",
    "ret3m": 18.94,
    "rel1m": -3.73,
    "rel3m": 15.82,
    "rel6m": -8.92,
    "rel12m": 24.28,
    "drawdown52w": -4.15,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 53.49,
    "asOf": "2026-10-02",
    "rsi14w": 44.37,
    "rsiTrend": "down",
    "relativeRsi": 33.66,
    "relativeTrend": "down",
    "ret3m": -4.38,
    "rel1m": -7.67,
    "rel3m": -6.9,
    "rel6m": -7.79,
    "rel12m": -12.56,
    "drawdown52w": -8.33,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 48.86,
    "asOf": "2026-10-02",
    "rsi14w": 42.52,
    "rsiTrend": "down",
    "relativeRsi": 35.42,
    "relativeTrend": "down",
    "ret3m": -5.57,
    "rel1m": -8.07,
    "rel3m": -8.05,
    "rel6m": -17.14,
    "rel12m": -3.6,
    "drawdown52w": -8.54,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 39.83,
    "asOf": "2026-10-02",
    "rsi14w": 34.4,
    "rsiTrend": "down",
    "relativeRsi": 31.96,
    "relativeTrend": "down",
    "ret3m": -11.43,
    "rel1m": -6.75,
    "rel3m": -13.76,
    "rel6m": -26.12,
    "rel12m": -20.05,
    "drawdown52w": -14.81,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 166.18,
    "asOf": "2026-10-02",
    "rsi14w": 57.29,
    "rsiTrend": "down",
    "relativeRsi": 49.44,
    "relativeTrend": "down",
    "ret3m": 3.0,
    "rel1m": -4.35,
    "rel3m": 0.29,
    "rel6m": -3.24,
    "rel12m": 1.19,
    "drawdown52w": -5.05,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 169.95,
    "asOf": "2026-10-02",
    "rsi14w": 44.49,
    "rsiTrend": "down",
    "relativeRsi": 32.21,
    "relativeTrend": "down",
    "ret3m": -8.17,
    "rel1m": -2.19,
    "rel3m": -10.58,
    "rel6m": -11.56,
    "rel12m": -3.97,
    "drawdown52w": -8.63,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 199.81,
    "asOf": "2026-10-02",
    "rsi14w": 69.46,
    "rsiTrend": "up",
    "relativeRsi": 68.36,
    "relativeTrend": "up",
    "ret3m": 8.97,
    "rel1m": 8.05,
    "rel3m": 6.11,
    "rel6m": 24.87,
    "rel12m": 21.26,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 630.6,
    "asOf": "2026-10-02",
    "rsi14w": 65.42,
    "rsiTrend": "up",
    "relativeRsi": 63.68,
    "relativeTrend": "up",
    "ret3m": 4.35,
    "rel1m": 13.61,
    "rel3m": 1.61,
    "rel6m": 36.28,
    "rel12m": 62.88,
    "drawdown52w": -5.73,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 281.52,
    "asOf": "2026-10-02",
    "rsi14w": 48.28,
    "rsiTrend": "down",
    "relativeRsi": 35.09,
    "relativeTrend": "down",
    "ret3m": -5.57,
    "rel1m": -4.79,
    "rel3m": -8.05,
    "rel6m": -4.54,
    "rel12m": 0.77,
    "drawdown52w": -7.48,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 94.77,
    "asOf": "2026-10-02",
    "rsi14w": 36.66,
    "rsiTrend": "down",
    "relativeRsi": 32.44,
    "relativeTrend": "down",
    "ret3m": -7.51,
    "rel1m": -7.03,
    "rel3m": -9.94,
    "rel6m": -15.49,
    "rel12m": -14.11,
    "drawdown52w": -10.99,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 103.96,
    "asOf": "2026-10-02",
    "rsi14w": 51.03,
    "rsiTrend": "down",
    "relativeRsi": 36.31,
    "relativeTrend": "down",
    "ret3m": -1.42,
    "rel1m": -3.7,
    "rel3m": -4.01,
    "rel6m": -8.64,
    "rel12m": -1.86,
    "drawdown52w": -4.46,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 67.67,
    "asOf": "2026-10-02",
    "rsi14w": 57.8,
    "rsiTrend": "flat",
    "relativeRsi": 50.81,
    "relativeTrend": "flat",
    "ret3m": 0.15,
    "rel1m": -0.06,
    "rel3m": -2.48,
    "rel6m": 1.91,
    "rel12m": 10.15,
    "drawdown52w": -4.97,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 380.14,
    "asOf": "2026-10-02",
    "rsi14w": 42.27,
    "rsiTrend": "down",
    "relativeRsi": 35.26,
    "relativeTrend": "down",
    "ret3m": -0.52,
    "rel1m": -6.4,
    "rel3m": -3.13,
    "rel6m": -24.94,
    "rel12m": -8.26,
    "drawdown52w": -23.34,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 77.48,
    "asOf": "2026-10-02",
    "rsi14w": 29.59,
    "rsiTrend": "down",
    "relativeRsi": 26.79,
    "relativeTrend": "down",
    "ret3m": -8.24,
    "rel1m": -5.86,
    "rel3m": -10.66,
    "rel6m": -22.54,
    "rel12m": -21.98,
    "drawdown52w": -12.05,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.44,
    "asOf": "2026-10-02",
    "rsi14w": 66.08,
    "rsiTrend": "flat",
    "relativeRsi": 57.3,
    "relativeTrend": "flat",
    "ret3m": 20.75,
    "rel1m": 1.15,
    "rel3m": 17.57,
    "rel6m": -5.93,
    "rel12m": 29.4,
    "drawdown52w": -3.28,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 31.08,
    "asOf": "2026-10-02",
    "rsi14w": 67.99,
    "rsiTrend": "up",
    "relativeRsi": 54.92,
    "relativeTrend": "up",
    "ret3m": 12.81,
    "rel1m": 1.59,
    "rel3m": 9.85,
    "rel6m": -7.02,
    "rel12m": 4.61,
    "drawdown52w": -0.26,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 28.89,
    "asOf": "2026-10-02",
    "rsi14w": 67.2,
    "rsiTrend": "up",
    "relativeRsi": 46.83,
    "relativeTrend": "up",
    "ret3m": 2.01,
    "rel1m": 1.71,
    "rel3m": -0.67,
    "rel6m": -12.08,
    "rel12m": -6.65,
    "drawdown52w": -0.24,
    "above200d": true
  }
];
