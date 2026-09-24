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
  "generatedAt": "2026-09-24T01:36:14Z",
  "benchmark": "SPY",
  "live": true,
  "canonicalHistory": "technical-state-history.json",
  "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 767.81,
  "asOf": "2026-09-23",
  "ret3m": 4.97,
  "ret12m": 16.38,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 62.37,
    "asOf": "2026-09-23",
    "rsi14w": 59.92,
    "rsiTrend": "flat",
    "relativeRsi": 53.21,
    "relativeTrend": "flat",
    "ret3m": 17.12,
    "rel1m": -1.39,
    "rel3m": 11.57,
    "rel6m": -12.08,
    "rel12m": 25.74,
    "drawdown52w": -4.84,
    "above200d": true
  },
  {
    "ticker": "XLF",
    "price": 54.54,
    "asOf": "2026-09-23",
    "rsi14w": 49.24,
    "rsiTrend": "down",
    "relativeRsi": 37.7,
    "relativeTrend": "down",
    "ret3m": 1.89,
    "rel1m": -6.75,
    "rel3m": -2.94,
    "rel6m": -5.66,
    "rel12m": -11.85,
    "drawdown52w": -6.54,
    "above200d": true
  },
  {
    "ticker": "XLB",
    "price": 50.28,
    "asOf": "2026-09-23",
    "rsi14w": 48.4,
    "rsiTrend": "down",
    "relativeRsi": 39.94,
    "relativeTrend": "down",
    "ret3m": -0.7,
    "rel1m": -6.15,
    "rel3m": -5.37,
    "rel6m": -9.45,
    "rel12m": -3.15,
    "drawdown52w": -5.89,
    "above200d": true
  },
  {
    "ticker": "XLU",
    "price": 39.75,
    "asOf": "2026-09-23",
    "rsi14w": 33.16,
    "rsiTrend": "down",
    "relativeRsi": 30.92,
    "relativeTrend": "down",
    "ret3m": -11.16,
    "rel1m": -6.86,
    "rel3m": -15.33,
    "rel6m": -23.57,
    "rel12m": -17.13,
    "drawdown52w": -14.98,
    "above200d": false
  },
  {
    "ticker": "XLV",
    "price": 168.8,
    "asOf": "2026-09-23",
    "rsi14w": 62.22,
    "rsiTrend": "down",
    "relativeRsi": 52.84,
    "relativeTrend": "down",
    "ret3m": 11.35,
    "rel1m": -3.47,
    "rel3m": 6.12,
    "rel6m": -0.16,
    "rel12m": 7.39,
    "drawdown52w": -3.55,
    "above200d": true
  },
  {
    "ticker": "XLI",
    "price": 170.1,
    "asOf": "2026-09-23",
    "rsi14w": 44.61,
    "rsiTrend": "down",
    "relativeRsi": 32.74,
    "relativeTrend": "down",
    "ret3m": -4.26,
    "rel1m": -5.87,
    "rel3m": -8.76,
    "rel6m": -10.94,
    "rel12m": -3.52,
    "drawdown52w": -8.55,
    "above200d": false
  },
  {
    "ticker": "XLK",
    "price": 195.34,
    "asOf": "2026-09-23",
    "rsi14w": 67.09,
    "rsiTrend": "up",
    "relativeRsi": 65.33,
    "relativeTrend": "up",
    "ret3m": 6.18,
    "rel1m": 6.13,
    "rel3m": 1.19,
    "rel6m": 21.42,
    "rel12m": 20.55,
    "drawdown52w": -1.22,
    "above200d": true
  },
  {
    "ticker": "SMH",
    "price": 601.41,
    "asOf": "2026-09-23",
    "rsi14w": 61.61,
    "rsiTrend": "up",
    "relativeRsi": 59.24,
    "relativeTrend": "up",
    "ret3m": -2.83,
    "rel1m": 9.09,
    "rel3m": -7.43,
    "rel6m": 29.01,
    "rel12m": 60.89,
    "drawdown52w": -10.09,
    "above200d": true
  },
  {
    "ticker": "IWM",
    "price": 281.92,
    "asOf": "2026-09-23",
    "rsi14w": 48.62,
    "rsiTrend": "down",
    "relativeRsi": 35.73,
    "relativeTrend": "down",
    "ret3m": -4.73,
    "rel1m": -5.91,
    "rel3m": -9.24,
    "rel6m": -3.6,
    "rel12m": 0.12,
    "drawdown52w": -7.35,
    "above200d": true
  },
  {
    "ticker": "IYR",
    "price": 97.24,
    "asOf": "2026-09-23",
    "rsi14w": 41.27,
    "rsiTrend": "down",
    "relativeRsi": 35.63,
    "relativeTrend": "down",
    "ret3m": -4.88,
    "rel1m": -6.95,
    "rel3m": -9.35,
    "rel6m": -11.16,
    "rel12m": -11.38,
    "drawdown52w": -8.67,
    "above200d": false
  },
  {
    "ticker": "EFA",
    "price": 104.8,
    "asOf": "2026-09-23",
    "rsi14w": 53.73,
    "rsiTrend": "down",
    "relativeRsi": 39.22,
    "relativeTrend": "down",
    "ret3m": 2.28,
    "rel1m": -3.68,
    "rel3m": -2.52,
    "rel6m": -5.66,
    "rel12m": -0.33,
    "drawdown52w": -3.69,
    "above200d": true
  },
  {
    "ticker": "EEM",
    "price": 67.71,
    "asOf": "2026-09-23",
    "rsi14w": 58.2,
    "rsiTrend": "up",
    "relativeRsi": 51.52,
    "relativeTrend": "up",
    "ret3m": 0.8,
    "rel1m": 0.36,
    "rel3m": -3.93,
    "rel6m": 0.86,
    "rel12m": 11.37,
    "drawdown52w": -4.92,
    "above200d": true
  },
  {
    "ticker": "GLD",
    "price": 392.88,
    "asOf": "2026-09-23",
    "rsi14w": 46.74,
    "rsiTrend": "down",
    "relativeRsi": 39.28,
    "relativeTrend": "down",
    "ret3m": 7.37,
    "rel1m": -8.67,
    "rel3m": 2.28,
    "rel6m": -17.71,
    "rel12m": -2.17,
    "drawdown52w": -20.77,
    "above200d": false
  },
  {
    "ticker": "TLT",
    "price": 80.46,
    "asOf": "2026-09-23",
    "rsi14w": 37.03,
    "rsiTrend": "down",
    "relativeRsi": 31.13,
    "relativeTrend": "down",
    "ret3m": -6.85,
    "rel1m": -2.96,
    "rel3m": -11.27,
    "rel6m": -18.97,
    "rel12m": -18.49,
    "drawdown52w": -9.03,
    "above200d": false
  },
  {
    "ticker": "PDBC",
    "price": 19.61,
    "asOf": "2026-09-23",
    "rsi14w": 67.98,
    "rsiTrend": "up",
    "relativeRsi": 58.85,
    "relativeTrend": "up",
    "ret3m": 21.2,
    "rel1m": 4.6,
    "rel3m": 15.51,
    "rel6m": 0.39,
    "rel12m": 31.38,
    "drawdown52w": -2.44,
    "above200d": true
  },
  {
    "ticker": "KMLM",
    "price": 31.07,
    "asOf": "2026-09-23",
    "rsi14w": 67.87,
    "rsiTrend": "up",
    "relativeRsi": 55.47,
    "relativeTrend": "up",
    "ret3m": 11.92,
    "rel1m": 5.31,
    "rel3m": 6.67,
    "rel6m": -3.52,
    "rel12m": 3.27,
    "drawdown52w": -0.13,
    "above200d": true
  },
  {
    "ticker": "UUP",
    "price": 28.65,
    "asOf": "2026-09-23",
    "rsi14w": 63.83,
    "rsiTrend": "up",
    "relativeRsi": 44.92,
    "relativeTrend": "up",
    "ret3m": 0.7,
    "rel1m": 2.15,
    "rel3m": -4.02,
    "rel6m": -11.71,
    "rel12m": -7.63,
    "drawdown52w": 0.0,
    "above200d": true
  }
];
