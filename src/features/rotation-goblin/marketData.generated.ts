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
  "generatedAt": "2026-10-17T01:26:59Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 771.79,
  "asOf": "2026-10-15",
  "ret3m": 4.09,
  "ret12m": 17.8,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 66.56,
    "asOf": "2026-10-15",
    "rsi14w": 66.74,
    "rsiTrend": "flat",
    "relativeRsi": 58.99,
    "relativeTrend": "flat",
    "ret3m": 16.08,
    "rel1m": 1.91,
    "rel3m": 11.52,
    "rel6m": 7.81,
    "rel12m": 34.57,
    "drawdown52w": -1.58,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 55.27,
    "asOf": "2026-10-15",
    "rsi14w": 52.89,
    "rsiTrend": "down",
    "relativeRsi": 43.11,
    "relativeTrend": "flat",
    "ret3m": -1.41,
    "rel1m": -3.35,
    "rel3m": -5.29,
    "rel6m": -3.23,
    "rel12m": -10.49,
    "drawdown52w": -5.28,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 50.56,
    "asOf": "2026-10-15",
    "rsi14w": 50.67,
    "rsiTrend": "flat",
    "relativeRsi": 42.97,
    "relativeTrend": "flat",
    "ret3m": 0.52,
    "rel1m": -1.7,
    "rel3m": -3.43,
    "rel6m": -10.89,
    "rel12m": -1.93,
    "drawdown52w": -5.36,
    "above200d": true
  },
  {
    "ticker": "XLU",
    "price": 41.65,
    "asOf": "2026-10-15",
    "rsi14w": 44.25,
    "rsiTrend": "up",
    "relativeRsi": 39.43,
    "relativeTrend": "up",
    "ret3m": -7.11,
    "rel1m": -1.04,
    "rel3m": -10.77,
    "rel6m": -17.6,
    "rel12m": -20.69,
    "drawdown52w": -10.92,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 177.19,
    "asOf": "2026-10-15",
    "rsi14w": 66.76,
    "rsiTrend": "up",
    "relativeRsi": 59.29,
    "relativeTrend": "up",
    "ret3m": 10.42,
    "rel1m": 3.33,
    "rel3m": 6.07,
    "rel6m": 10.22,
    "rel12m": 7.44,
    "drawdown52w": 0.0,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 167.89,
    "asOf": "2026-10-15",
    "rsi14w": 41.69,
    "rsiTrend": "flat",
    "relativeRsi": 29.86,
    "relativeTrend": "down",
    "ret3m": -6.17,
    "rel1m": -2.75,
    "rel3m": -9.86,
    "rel6m": -10.38,
    "rel12m": -5.93,
    "drawdown52w": -9.74,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 189.19,
    "asOf": "2026-10-15",
    "rsi14w": 57.88,
    "rsiTrend": "down",
    "relativeRsi": 53.57,
    "relativeTrend": "down",
    "ret3m": 7.87,
    "rel1m": 0.36,
    "rel3m": 3.63,
    "rel6m": 12.84,
    "rel12m": 14.68,
    "drawdown52w": -6.34,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 558.84,
    "asOf": "2026-10-15",
    "rsi14w": 51.16,
    "rsiTrend": "down",
    "relativeRsi": 48.08,
    "relativeTrend": "down",
    "ret3m": 0.42,
    "rel1m": -0.17,
    "rel3m": -3.53,
    "rel6m": 11.15,
    "rel12m": 42.69,
    "drawdown52w": -16.46,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 275.08,
    "asOf": "2026-10-15",
    "rsi14w": 42.88,
    "rsiTrend": "down",
    "relativeRsi": 30.04,
    "relativeTrend": "down",
    "ret3m": -6.2,
    "rel1m": -5.58,
    "rel3m": -9.89,
    "rel6m": -7.37,
    "rel12m": -4.85,
    "drawdown52w": -9.6,
    "above200d": false
  },
  {
    "ticker": "IYR",
    "price": 97.04,
    "asOf": "2026-10-15",
    "rsi14w": 43.25,
    "rsiTrend": "flat",
    "relativeRsi": 37.36,
    "relativeTrend": "flat",
    "ret3m": -7.85,
    "rel1m": -4.13,
    "rel3m": -11.47,
    "rel6m": -12.33,
    "rel12m": -11.39,
    "drawdown52w": -8.86,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 103.67,
    "asOf": "2026-10-15",
    "rsi14w": 50.26,
    "rsiTrend": "down",
    "relativeRsi": 37.3,
    "relativeTrend": "down",
    "ret3m": 0.33,
    "rel1m": -3.79,
    "rel3m": -3.62,
    "rel6m": -7.52,
    "rel12m": -2.55,
    "drawdown52w": -4.72,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 63.96,
    "asOf": "2026-10-15",
    "rsi14w": 47.22,
    "rsiTrend": "down",
    "relativeRsi": 38.9,
    "relativeTrend": "down",
    "ret3m": 1.06,
    "rel1m": -5.15,
    "rel3m": -2.91,
    "rel6m": -6.88,
    "rel12m": 4.51,
    "drawdown52w": -10.18,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 382.71,
    "asOf": "2026-10-15",
    "rsi14w": 43.58,
    "rsiTrend": "down",
    "relativeRsi": 36.1,
    "relativeTrend": "down",
    "ret3m": 3.88,
    "rel1m": -4.79,
    "rel3m": -0.2,
    "rel6m": -21.34,
    "rel12m": -14.68,
    "drawdown52w": -22.83,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 79.97,
    "asOf": "2026-10-15",
    "rsi14w": 42.38,
    "rsiTrend": "flat",
    "relativeRsi": 36.06,
    "relativeTrend": "flat",
    "ret3m": -4.25,
    "rel1m": -3.25,
    "rel3m": -8.02,
    "rel6m": -14.2,
    "rel12m": -21.82,
    "drawdown52w": -9.22,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.83,
    "asOf": "2026-10-15",
    "rsi14w": 68.44,
    "rsiTrend": "flat",
    "relativeRsi": 59.34,
    "relativeTrend": "flat",
    "ret3m": 14.96,
    "rel1m": -2.39,
    "rel3m": 10.44,
    "rel6m": 3.38,
    "rel12m": 32.78,
    "drawdown52w": -1.34,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 30.84,
    "asOf": "2026-10-15",
    "rsi14w": 65.03,
    "rsiTrend": "flat",
    "relativeRsi": 52.85,
    "relativeTrend": "down",
    "ret3m": 6.4,
    "rel1m": -3.17,
    "rel3m": 2.22,
    "rel6m": -2.15,
    "rel12m": 1.41,
    "drawdown52w": -1.85,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 29.0,
    "asOf": "2026-10-15",
    "rsi14w": 68.29,
    "rsiTrend": "up",
    "relativeRsi": 47.47,
    "relativeTrend": "up",
    "ret3m": 2.36,
    "rel1m": -0.48,
    "rel3m": -1.66,
    "rel6m": -4.16,
    "rel12m": -8.78,
    "drawdown52w": -0.45,
    "above200d": true
  }
];
