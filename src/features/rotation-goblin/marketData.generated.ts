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
  "generatedAt": "2026-10-13T03:45:41Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 778.1,
  "asOf": "2026-10-12",
  "ret3m": 3.75,
  "ret12m": 17.18,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 66.01,
    "asOf": "2026-10-12",
    "rsi14w": 65.92,
    "rsiTrend": "flat",
    "relativeRsi": 57.44,
    "relativeTrend": "flat",
    "ret3m": 16.6,
    "rel1m": -0.12,
    "rel3m": 12.38,
    "rel6m": 2.74,
    "rel12m": 32.03,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 55.05,
    "asOf": "2026-10-12",
    "rsi14w": 51.93,
    "rsiTrend": "down",
    "relativeRsi": 39.49,
    "relativeTrend": "down",
    "ret3m": -1.66,
    "rel1m": -5.45,
    "rel3m": -5.22,
    "rel6m": -5.85,
    "rel12m": -10.51,
    "drawdown52w": -5.66,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 49.44,
    "asOf": "2026-10-12",
    "rsi14w": 45.45,
    "rsiTrend": "down",
    "relativeRsi": 35.65,
    "relativeTrend": "down",
    "ret3m": -1.92,
    "rel1m": -4.48,
    "rel3m": -5.47,
    "rel6m": -16.2,
    "rel12m": -3.12,
    "drawdown52w": -7.46,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 41.63,
    "asOf": "2026-10-12",
    "rsi14w": 44.15,
    "rsiTrend": "up",
    "relativeRsi": 37.93,
    "relativeTrend": "flat",
    "ret3m": -8.22,
    "rel1m": -3.07,
    "rel3m": -11.53,
    "rel6m": -20.18,
    "rel12m": -19.31,
    "drawdown52w": -10.96,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 171.99,
    "asOf": "2026-10-12",
    "rsi14w": 62.74,
    "rsiTrend": "up",
    "relativeRsi": 53.52,
    "relativeTrend": "flat",
    "ret3m": 9.07,
    "rel1m": 2.3,
    "rel3m": 5.13,
    "rel6m": 2.82,
    "rel12m": 3.49,
    "drawdown52w": -1.73,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 169.15,
    "asOf": "2026-10-12",
    "rsi14w": 43.4,
    "rsiTrend": "flat",
    "relativeRsi": 29.6,
    "relativeTrend": "down",
    "ret3m": -6.01,
    "rel1m": -3.59,
    "rel3m": -9.41,
    "rel6m": -13.64,
    "rel12m": -4.76,
    "drawdown52w": -9.06,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 196.36,
    "asOf": "2026-10-12",
    "rsi14w": 65.28,
    "rsiTrend": "up",
    "relativeRsi": 60.21,
    "relativeTrend": "up",
    "ret3m": 7.06,
    "rel1m": 2.64,
    "rel3m": 3.19,
    "rel6m": 18.59,
    "rel12m": 16.07,
    "drawdown52w": -2.79,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 590.99,
    "asOf": "2026-10-12",
    "rsi14w": 56.87,
    "rsiTrend": "up",
    "relativeRsi": 53.08,
    "relativeTrend": "up",
    "ret3m": -1.55,
    "rel1m": 1.85,
    "rel3m": -5.11,
    "rel6m": 16.95,
    "rel12m": 46.55,
    "drawdown52w": -11.65,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 277.9,
    "asOf": "2026-10-12",
    "rsi14w": 45.16,
    "rsiTrend": "down",
    "relativeRsi": 30.4,
    "relativeTrend": "down",
    "ret3m": -5.39,
    "rel1m": -5.5,
    "rel3m": -8.81,
    "rel6m": -7.56,
    "rel12m": -2.27,
    "drawdown52w": -8.67,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 96.86,
    "asOf": "2026-10-12",
    "rsi14w": 42.76,
    "rsiTrend": "down",
    "relativeRsi": 35.06,
    "relativeTrend": "down",
    "ret3m": -5.8,
    "rel1m": -5.1,
    "rel3m": -9.21,
    "rel6m": -13.5,
    "rel12m": -10.68,
    "drawdown52w": -9.03,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 103.05,
    "asOf": "2026-10-12",
    "rsi14w": 48.49,
    "rsiTrend": "down",
    "relativeRsi": 31.63,
    "relativeTrend": "down",
    "ret3m": -0.88,
    "rel1m": -5.37,
    "rel3m": -4.46,
    "rel6m": -10.67,
    "rel12m": -3.22,
    "drawdown52w": -5.29,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 66.15,
    "asOf": "2026-10-12",
    "rsi14w": 53.05,
    "rsiTrend": "flat",
    "relativeRsi": 43.34,
    "relativeTrend": "down",
    "ret3m": 0.73,
    "rel1m": -4.46,
    "rel3m": -2.91,
    "rel6m": -4.48,
    "rel12m": 6.72,
    "drawdown52w": -7.11,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 382.15,
    "asOf": "2026-10-12",
    "rsi14w": 43.38,
    "rsiTrend": "down",
    "relativeRsi": 34.61,
    "relativeTrend": "down",
    "ret3m": 2.69,
    "rel1m": -6.1,
    "rel3m": -1.03,
    "rel6m": -22.99,
    "rel12m": -10.76,
    "drawdown52w": -22.94,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 78.05,
    "asOf": "2026-10-12",
    "rsi14w": 32.84,
    "rsiTrend": "down",
    "relativeRsi": 26.71,
    "relativeTrend": "down",
    "ret3m": -6.06,
    "rel1m": -5.05,
    "rel3m": -9.46,
    "rel6m": -19.22,
    "rel12m": -21.85,
    "drawdown52w": -11.4,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.86,
    "asOf": "2026-10-12",
    "rsi14w": 68.62,
    "rsiTrend": "flat",
    "relativeRsi": 58.56,
    "relativeTrend": "down",
    "ret3m": 16.28,
    "rel1m": -1.67,
    "rel3m": 12.07,
    "rel6m": 0.89,
    "rel12m": 30.99,
    "drawdown52w": -1.19,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 31.34,
    "asOf": "2026-10-12",
    "rsi14w": 69.15,
    "rsiTrend": "up",
    "relativeRsi": 54.2,
    "relativeTrend": "flat",
    "ret3m": 8.78,
    "rel1m": -0.98,
    "rel3m": 4.85,
    "rel6m": -3.22,
    "rel12m": 4.45,
    "drawdown52w": -0.25,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 29.13,
    "asOf": "2026-10-12",
    "rsi14w": 70.25,
    "rsiTrend": "up",
    "relativeRsi": 46.44,
    "relativeTrend": "up",
    "ret3m": 2.61,
    "rel1m": 1.68,
    "rel3m": -1.1,
    "rel6m": -6.66,
    "rel12m": -8.29,
    "drawdown52w": 0.0,
    "above200d": true
  }
];
