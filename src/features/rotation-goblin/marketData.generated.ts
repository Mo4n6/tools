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
  "generatedAt": "2026-09-26T01:51:14Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 771.35,
  "asOf": "2026-09-25",
  "ret3m": 6.07,
  "ret12m": 17.94,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 62.04,
    "asOf": "2026-09-25",
    "rsi14w": 59.06,
    "rsiTrend": "down",
    "relativeRsi": 52.18,
    "relativeTrend": "flat",
    "ret3m": 15.92,
    "rel1m": -0.96,
    "rel3m": 9.28,
    "rel6m": -14.98,
    "rel12m": 19.78,
    "drawdown52w": -5.34,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 54.84,
    "asOf": "2026-09-25",
    "rsi14w": 50.68,
    "rsiTrend": "down",
    "relativeRsi": 37.87,
    "relativeTrend": "down",
    "ret3m": 2.73,
    "rel1m": -6.41,
    "rel3m": -3.15,
    "rel6m": -6.31,
    "rel12m": -11.89,
    "drawdown52w": -6.02,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 49.8,
    "asOf": "2026-09-25",
    "rsi14w": 46.25,
    "rsiTrend": "down",
    "relativeRsi": 37.71,
    "relativeTrend": "down",
    "ret3m": -3.04,
    "rel1m": -7.65,
    "rel3m": -8.6,
    "rel6m": -14.88,
    "rel12m": -3.37,
    "drawdown52w": -6.78,
    "above200d": false
  },
  {
    "ticker": "XLU",
    "price": 39.51,
    "asOf": "2026-09-25",
    "rsi14w": 32.48,
    "rsiTrend": "down",
    "relativeRsi": 30.1,
    "relativeTrend": "down",
    "ret3m": -13.85,
    "rel1m": -9.38,
    "rel3m": -18.78,
    "rel6m": -26.47,
    "rel12m": -20.1,
    "drawdown52w": -15.49,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 170.7,
    "asOf": "2026-09-25",
    "rsi14w": 63.94,
    "rsiTrend": "down",
    "relativeRsi": 53.96,
    "relativeTrend": "flat",
    "ret3m": 6.87,
    "rel1m": -2.18,
    "rel3m": 0.75,
    "rel6m": -1.73,
    "rel12m": 7.9,
    "drawdown52w": -2.46,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 170.43,
    "asOf": "2026-09-25",
    "rsi14w": 45.11,
    "rsiTrend": "down",
    "relativeRsi": 32.31,
    "relativeTrend": "down",
    "ret3m": -5.69,
    "rel1m": -6.12,
    "rel3m": -11.09,
    "rel6m": -11.61,
    "rel12m": -4.0,
    "drawdown52w": -8.38,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 196.27,
    "asOf": "2026-09-25",
    "rsi14w": 67.58,
    "rsiTrend": "up",
    "relativeRsi": 65.35,
    "relativeTrend": "up",
    "ret3m": 8.5,
    "rel1m": 6.47,
    "rel3m": 2.28,
    "rel6m": 23.55,
    "rel12m": 20.13,
    "drawdown52w": -0.75,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 606.56,
    "asOf": "2026-09-25",
    "rsi14w": 62.3,
    "rsiTrend": "up",
    "relativeRsi": 59.63,
    "relativeTrend": "up",
    "ret3m": -0.83,
    "rel1m": 8.12,
    "rel3m": -6.5,
    "rel6m": 32.53,
    "rel12m": 60.67,
    "drawdown52w": -9.32,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 281.97,
    "asOf": "2026-09-25",
    "rsi14w": 48.66,
    "rsiTrend": "down",
    "relativeRsi": 34.84,
    "relativeTrend": "down",
    "ret3m": -5.71,
    "rel1m": -6.31,
    "rel3m": -11.11,
    "rel6m": -4.7,
    "rel12m": -0.03,
    "drawdown52w": -7.34,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 96.63,
    "asOf": "2026-09-25",
    "rsi14w": 40.09,
    "rsiTrend": "down",
    "relativeRsi": 34.37,
    "relativeTrend": "down",
    "ret3m": -6.97,
    "rel1m": -7.92,
    "rel3m": -12.3,
    "rel6m": -12.79,
    "rel12m": -12.42,
    "drawdown52w": -9.24,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 105.56,
    "asOf": "2026-09-25",
    "rsi14w": 55.65,
    "rsiTrend": "down",
    "relativeRsi": 39.96,
    "relativeTrend": "down",
    "ret3m": 2.95,
    "rel1m": -3.41,
    "rel3m": -2.95,
    "rel6m": -5.74,
    "rel12m": -0.01,
    "drawdown52w": -2.99,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 67.98,
    "asOf": "2026-09-25",
    "rsi14w": 58.76,
    "rsiTrend": "flat",
    "relativeRsi": 51.39,
    "relativeTrend": "flat",
    "ret3m": 1.18,
    "rel1m": 0.27,
    "rel3m": -4.62,
    "rel6m": 2.51,
    "rel12m": 10.64,
    "drawdown52w": -4.54,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 393.41,
    "asOf": "2026-09-25",
    "rsi14w": 46.94,
    "rsiTrend": "down",
    "relativeRsi": 38.89,
    "relativeTrend": "down",
    "ret3m": 5.29,
    "rel1m": -7.49,
    "rel3m": -0.73,
    "rel6m": -18.29,
    "rel12m": -2.84,
    "drawdown52w": -20.67,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 79.32,
    "asOf": "2026-09-25",
    "rsi14w": 33.58,
    "rsiTrend": "down",
    "relativeRsi": 28.76,
    "relativeTrend": "down",
    "ret3m": -8.15,
    "rel1m": -5.3,
    "rel3m": -13.41,
    "rel6m": -21.56,
    "rel12m": -20.95,
    "drawdown52w": -10.32,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.5,
    "asOf": "2026-09-25",
    "rsi14w": 66.77,
    "rsiTrend": "up",
    "relativeRsi": 57.43,
    "relativeTrend": "up",
    "ret3m": 22.87,
    "rel1m": 6.26,
    "rel3m": 15.84,
    "rel6m": -4.67,
    "rel12m": 27.42,
    "drawdown52w": -2.99,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 30.9,
    "asOf": "2026-09-25",
    "rsi14w": 67.0,
    "rsiTrend": "up",
    "relativeRsi": 53.65,
    "relativeTrend": "up",
    "ret3m": 13.31,
    "rel1m": 5.13,
    "rel3m": 6.82,
    "rel6m": -7.31,
    "rel12m": 2.21,
    "drawdown52w": -0.68,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 28.62,
    "asOf": "2026-09-25",
    "rsi14w": 63.4,
    "rsiTrend": "up",
    "relativeRsi": 43.66,
    "relativeTrend": "up",
    "ret3m": 0.56,
    "rel1m": 1.19,
    "rel3m": -5.2,
    "rel6m": -14.37,
    "rel12m": -8.77,
    "drawdown52w": -0.24,
    "above200d": true
  }
];
