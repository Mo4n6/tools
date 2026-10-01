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
  "generatedAt": "2026-10-01T02:18:33Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 762.63,
  "asOf": "2026-09-30",
  "ret3m": 2.52,
  "ret12m": 16.15,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 61.5,
    "asOf": "2026-09-30",
    "rsi14w": 57.6,
    "rsiTrend": "down",
    "relativeRsi": 52.44,
    "relativeTrend": "down",
    "ret3m": 17.15,
    "rel1m": -2.96,
    "rel3m": 14.27,
    "rel6m": -13.7,
    "rel12m": 20.62,
    "drawdown52w": -6.16,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 53.4,
    "asOf": "2026-09-30",
    "rsi14w": 44.01,
    "rsiTrend": "down",
    "relativeRsi": 34.93,
    "relativeTrend": "down",
    "ret3m": -2.17,
    "rel1m": -6.83,
    "rel3m": -4.58,
    "rel6m": -7.58,
    "rel12m": -13.73,
    "drawdown52w": -8.49,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 48.7,
    "asOf": "2026-09-30",
    "rsi14w": 41.94,
    "rsiTrend": "down",
    "relativeRsi": 36.18,
    "relativeTrend": "down",
    "ret3m": -4.11,
    "rel1m": -6.84,
    "rel3m": -6.46,
    "rel6m": -16.62,
    "rel12m": -4.27,
    "drawdown52w": -8.84,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 39.44,
    "asOf": "2026-09-30",
    "rsi14w": 32.27,
    "rsiTrend": "down",
    "relativeRsi": 31.84,
    "relativeTrend": "down",
    "ret3m": -11.26,
    "rel1m": -5.61,
    "rel3m": -13.44,
    "rel6m": -26.07,
    "rel12m": -19.77,
    "drawdown52w": -15.64,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 168.42,
    "asOf": "2026-09-30",
    "rsi14w": 60.4,
    "rsiTrend": "down",
    "relativeRsi": 53.54,
    "relativeTrend": "down",
    "ret3m": 5.97,
    "rel1m": -0.54,
    "rel3m": 3.37,
    "rel6m": -1.73,
    "rel12m": 8.48,
    "drawdown52w": -3.77,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 166.98,
    "asOf": "2026-09-30",
    "rsi14w": 40.98,
    "rsiTrend": "down",
    "relativeRsi": 30.84,
    "relativeTrend": "down",
    "ret3m": -8.69,
    "rel1m": -4.08,
    "rel3m": -10.93,
    "rel6m": -11.95,
    "rel12m": -4.99,
    "drawdown52w": -10.23,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 195.75,
    "asOf": "2026-09-30",
    "rsi14w": 66.98,
    "rsiTrend": "up",
    "relativeRsi": 66.72,
    "relativeTrend": "up",
    "ret3m": 5.58,
    "rel1m": 5.43,
    "rel3m": 2.99,
    "rel6m": 25.27,
    "rel12m": 20.86,
    "drawdown52w": -1.01,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 609.0,
    "asOf": "2026-09-30",
    "rsi14w": 62.64,
    "rsiTrend": "up",
    "relativeRsi": 61.23,
    "relativeTrend": "up",
    "ret3m": -1.85,
    "rel1m": 9.77,
    "rel3m": -4.26,
    "rel6m": 34.77,
    "rel12m": 63.01,
    "drawdown52w": -8.96,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 277.89,
    "asOf": "2026-09-30",
    "rsi14w": 45.42,
    "rsiTrend": "down",
    "relativeRsi": 34.18,
    "relativeTrend": "down",
    "ret3m": -6.92,
    "rel1m": -4.9,
    "rel3m": -9.2,
    "rel6m": -4.45,
    "rel12m": 0.03,
    "drawdown52w": -8.68,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 95.04,
    "asOf": "2026-09-30",
    "rsi14w": 37.12,
    "rsiTrend": "down",
    "relativeRsi": 33.76,
    "relativeTrend": "down",
    "ret3m": -6.78,
    "rel1m": -6.4,
    "rel3m": -9.07,
    "rel6m": -13.67,
    "rel12m": -13.26,
    "drawdown52w": -10.74,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 103.89,
    "asOf": "2026-09-30",
    "rsi14w": 50.84,
    "rsiTrend": "down",
    "relativeRsi": 38.6,
    "relativeTrend": "down",
    "ret3m": 0.84,
    "rel1m": -2.99,
    "rel3m": -1.63,
    "rel6m": -7.81,
    "rel12m": -0.52,
    "drawdown52w": -4.52,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 66.79,
    "asOf": "2026-09-30",
    "rsi14w": 55.23,
    "rsiTrend": "down",
    "relativeRsi": 49.88,
    "relativeTrend": "flat",
    "ret3m": 0.47,
    "rel1m": -0.01,
    "rel3m": -2.0,
    "rel6m": 0.31,
    "rel12m": 10.23,
    "drawdown52w": -6.21,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 380.84,
    "asOf": "2026-09-30",
    "rsi14w": 42.49,
    "rsiTrend": "down",
    "relativeRsi": 36.41,
    "relativeTrend": "down",
    "ret3m": 2.76,
    "rel1m": -6.44,
    "rel3m": 0.24,
    "rel6m": -24.9,
    "rel12m": -6.97,
    "drawdown52w": -23.2,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 77.78,
    "asOf": "2026-09-30",
    "rsi14w": 29.57,
    "rsiTrend": "down",
    "relativeRsi": 27.78,
    "relativeTrend": "down",
    "ret3m": -8.33,
    "rel1m": -5.07,
    "rel3m": -10.58,
    "rel6m": -22.09,
    "rel12m": -21.86,
    "drawdown52w": -12.06,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.3,
    "asOf": "2026-09-30",
    "rsi14w": 64.51,
    "rsiTrend": "flat",
    "relativeRsi": 57.54,
    "relativeTrend": "flat",
    "ret3m": 22.31,
    "rel1m": 3.83,
    "rel3m": 19.3,
    "rel6m": -5.45,
    "rel12m": 28.05,
    "drawdown52w": -3.98,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 31.09,
    "asOf": "2026-09-30",
    "rsi14w": 68.04,
    "rsiTrend": "up",
    "relativeRsi": 56.34,
    "relativeTrend": "up",
    "ret3m": 12.89,
    "rel1m": 4.32,
    "rel3m": 10.12,
    "rel6m": -6.46,
    "rel12m": 4.34,
    "drawdown52w": -0.06,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 28.77,
    "asOf": "2026-09-30",
    "rsi14w": 65.61,
    "rsiTrend": "up",
    "relativeRsi": 48.1,
    "relativeTrend": "up",
    "ret3m": 0.98,
    "rel1m": 2.65,
    "rel3m": -1.5,
    "rel6m": -12.13,
    "rel12m": -6.99,
    "drawdown52w": 0.0,
    "above200d": true
  }
];
