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
  history: { month: string; value: number }[];
};

export const marketDataMeta = {
  "source": "Yahoo fallback",
  "generatedAt": "2026-09-22T16:39:15Z",
  "benchmark": "SPY",
  "live": true,
  "note": "Technicals are automated. Rotation history uses automated sponsor valuation where applicable and technical-only scoring for non-earnings assets."
} as const;

export const benchmarkSnapshot = {
  "ticker": "SPY",
  "price": 772.97,
  "asOf": "2026-09-22",
  "ret3m": 5.63,
  "ret12m": 17.72,
  "above200d": true
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {
    "ticker": "XLE",
    "price": 62.55,
    "asOf": "2026-09-22",
    "rsi14w": 60.4,
    "rsiTrend": "down",
    "relativeRsi": 52.8,
    "relativeTrend": "flat",
    "ret3m": 15.54,
    "rel1m": -2.3,
    "rel3m": 9.38,
    "rel6m": -10.34,
    "rel12m": 24.53,
    "drawdown52w": -4.56,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 52
      }
    ]
  },
  {
    "ticker": "XLF",
    "price": 54.8899,
    "asOf": "2026-09-22",
    "rsi14w": 50.9,
    "rsiTrend": "down",
    "relativeRsi": 37.6,
    "relativeTrend": "down",
    "ret3m": 2.23,
    "rel1m": -5.3,
    "rel3m": -3.22,
    "rel6m": -5.35,
    "rel12m": -12.41,
    "drawdown52w": -5.94,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 41
      }
    ]
  },
  {
    "ticker": "XLB",
    "price": 50.225,
    "asOf": "2026-09-22",
    "rsi14w": 48.2,
    "rsiTrend": "down",
    "relativeRsi": 38.6,
    "relativeTrend": "down",
    "ret3m": -0.81,
    "rel1m": -6.88,
    "rel3m": -6.1,
    "rel6m": -10.15,
    "rel12m": -3.9,
    "drawdown52w": -5.99,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 37
      }
    ]
  },
  {
    "ticker": "XLU",
    "price": 40.765,
    "asOf": "2026-09-22",
    "rsi14w": 36.4,
    "rsiTrend": "down",
    "relativeRsi": 32.5,
    "relativeTrend": "down",
    "ret3m": -8.89,
    "rel1m": -5.12,
    "rel3m": -13.74,
    "rel6m": -22.15,
    "rel12m": -15.58,
    "drawdown52w": -12.81,
    "above200d": false,
    "history": [
      {
        "month": "09-22",
        "value": 22
      }
    ]
  },
  {
    "ticker": "XLV",
    "price": 170.1,
    "asOf": "2026-09-22",
    "rsi14w": 63.4,
    "rsiTrend": "down",
    "relativeRsi": 53.0,
    "relativeTrend": "down",
    "ret3m": 12.2,
    "rel1m": -3.37,
    "rel3m": 6.22,
    "rel6m": -0.06,
    "rel12m": 7.5,
    "drawdown52w": -2.81,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 55
      }
    ]
  },
  {
    "ticker": "XLI",
    "price": 169.89,
    "asOf": "2026-09-22",
    "rsi14w": 44.3,
    "rsiTrend": "down",
    "relativeRsi": 31.5,
    "relativeTrend": "down",
    "ret3m": -4.38,
    "rel1m": -6.61,
    "rel3m": -9.48,
    "rel6m": -11.65,
    "rel12m": -4.28,
    "drawdown52w": -8.67,
    "above200d": false,
    "history": [
      {
        "month": "09-22",
        "value": 23
      }
    ]
  },
  {
    "ticker": "XLK",
    "price": 195.33,
    "asOf": "2026-09-22",
    "rsi14w": 67.1,
    "rsiTrend": "up",
    "relativeRsi": 64.3,
    "relativeTrend": "up",
    "ret3m": 6.17,
    "rel1m": 5.42,
    "rel3m": 0.51,
    "rel6m": 20.61,
    "rel12m": 19.74,
    "drawdown52w": -1.22,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 66
      }
    ]
  },
  {
    "ticker": "SMH",
    "price": 602.46,
    "asOf": "2026-09-22",
    "rsi14w": 61.8,
    "rsiTrend": "up",
    "relativeRsi": 58.7,
    "relativeTrend": "up",
    "ret3m": -3.15,
    "rel1m": 6.23,
    "rel3m": -8.31,
    "rel6m": 29.86,
    "rel12m": 62.61,
    "drawdown52w": -9.93,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 79
      }
    ]
  },
  {
    "ticker": "IWM",
    "price": 286.795,
    "asOf": "2026-09-22",
    "rsi14w": 52.6,
    "rsiTrend": "down",
    "relativeRsi": 38.0,
    "relativeTrend": "down",
    "ret3m": -2.63,
    "rel1m": -5.27,
    "rel3m": -7.82,
    "rel6m": -1.74,
    "rel12m": 1.28,
    "drawdown52w": -5.75,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 51
      }
    ]
  },
  {
    "ticker": "IYR",
    "price": 98.94,
    "asOf": "2026-09-22",
    "rsi14w": 45.4,
    "rsiTrend": "down",
    "relativeRsi": 37.0,
    "relativeTrend": "down",
    "ret3m": -3.22,
    "rel1m": -5.95,
    "rel3m": -8.38,
    "rel6m": -10.21,
    "rel12m": -10.43,
    "drawdown52w": -7.07,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 36
      }
    ]
  },
  {
    "ticker": "EFA",
    "price": 106.045,
    "asOf": "2026-09-22",
    "rsi14w": 56.7,
    "rsiTrend": "down",
    "relativeRsi": 40.7,
    "relativeTrend": "down",
    "ret3m": 3.5,
    "rel1m": -3.19,
    "rel3m": -2.02,
    "rel6m": -5.18,
    "rel12m": 0.18,
    "drawdown52w": -2.54,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 52
      }
    ]
  },
  {
    "ticker": "EEM",
    "price": 68.71,
    "asOf": "2026-09-22",
    "rsi14w": 60.2,
    "rsiTrend": "flat",
    "relativeRsi": 53.2,
    "relativeTrend": "up",
    "ret3m": 2.29,
    "rel1m": 1.16,
    "rel3m": -3.16,
    "rel6m": 1.67,
    "rel12m": 12.26,
    "drawdown52w": -3.51,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 66
      }
    ]
  },
  {
    "ticker": "GLD",
    "price": 396.81,
    "asOf": "2026-09-22",
    "rsi14w": 48.2,
    "rsiTrend": "down",
    "relativeRsi": 39.7,
    "relativeTrend": "down",
    "ret3m": 5.17,
    "rel1m": -7.38,
    "rel3m": -0.44,
    "rel6m": -17.15,
    "rel12m": -0.62,
    "drawdown52w": -19.98,
    "above200d": false,
    "history": [
      {
        "month": "09-22",
        "value": 17
      }
    ]
  },
  {
    "ticker": "TLT",
    "price": 81.565,
    "asOf": "2026-09-22",
    "rsi14w": 41.7,
    "rsiTrend": "down",
    "relativeRsi": 32.1,
    "relativeTrend": "flat",
    "ret3m": -4.28,
    "rel1m": -1.39,
    "rel3m": -9.38,
    "rel6m": -18.49,
    "rel12m": -18.6,
    "drawdown52w": -7.78,
    "above200d": false,
    "history": [
      {
        "month": "09-22",
        "value": 7
      }
    ]
  },
  {
    "ticker": "PDBC",
    "price": 19.455,
    "asOf": "2026-09-22",
    "rsi14w": 66.3,
    "rsiTrend": "up",
    "relativeRsi": 56.8,
    "relativeTrend": "up",
    "ret3m": 20.24,
    "rel1m": 3.08,
    "rel3m": 13.83,
    "rel6m": -1.07,
    "rel12m": 29.47,
    "drawdown52w": -3.21,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 54
      }
    ]
  },
  {
    "ticker": "KMLM",
    "price": 30.78,
    "asOf": "2026-09-22",
    "rsi14w": 66.1,
    "rsiTrend": "up",
    "relativeRsi": 52.6,
    "relativeTrend": "up",
    "ret3m": 10.88,
    "rel1m": 3.63,
    "rel3m": 4.97,
    "rel6m": -5.06,
    "rel12m": 1.62,
    "drawdown52w": -1.06,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 46
      }
    ]
  },
  {
    "ticker": "UUP",
    "price": 28.525,
    "asOf": "2026-09-22",
    "rsi14w": 62.0,
    "rsiTrend": "up",
    "relativeRsi": 42.6,
    "relativeTrend": "up",
    "ret3m": 0.26,
    "rel1m": 1.03,
    "rel3m": -5.08,
    "rel6m": -12.69,
    "rel12m": -8.64,
    "drawdown52w": -0.26,
    "above200d": true,
    "history": [
      {
        "month": "09-22",
        "value": 30
      }
    ]
  }
];
