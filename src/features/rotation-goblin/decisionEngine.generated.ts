export type DecisionSignal = 'STRONG' | 'CONSTRUCTIVE' | 'WATCH' | 'WEAK' | 'AVOID';

export type DecisionComponentScores = {
  relativeMomentum: number;
  trendStructure: number;
  momentumState: number;
  relativePerformance: number;
  drawdownRecovery: number;
};

export type DecisionEngineRow = {
  ticker: string;
  asOf: string;
  decisionScore: number;
  signal: DecisionSignal;
  componentScores: DecisionComponentScores;
  historicalEdgeMonthlyPct: number;
};

export const decisionEngineMeta = {
  "schemaVersion": 1,
  "generatedAt": "2026-10-06T03:15:04Z",
  "asOf": "2026-10-05",
  "benchmark": "SPY",
  "trainingStart": "2016-10-07",
  "trainingEnd": "2026-04-02",
  "matureTrainingRows": 8163,
  "target": "50% of 3M relative return / 3 months + 50% of 6M relative return / 6 months",
  "targetUnit": "percentage points of ETF-vs-SPY relative return per month",
  "featurePolicy": "price-derived point-in-time features only; valuation excluded",
  "weightPolicy": "30% pre-registered component weights + 70% purged walk-forward evidence weights derived from top-minus-bottom quintile predictive spread",
  "priorWeights": {
    "relativeMomentum": 0.3,
    "trendStructure": 0.25,
    "momentumState": 0.2,
    "relativePerformance": 0.15,
    "drawdownRecovery": 0.1
  },
  "evidenceWeights": {
    "relativeMomentum": 0.0,
    "trendStructure": 0.537522,
    "momentumState": 0.047404,
    "relativePerformance": 0.0,
    "drawdownRecovery": 0.415075
  },
  "componentWeights": {
    "relativeMomentum": 0.09,
    "trendStructure": 0.451265,
    "momentumState": 0.093183,
    "relativePerformance": 0.045,
    "drawdownRecovery": 0.320552
  },
  "componentLabels": {
    "relativeMomentum": "Relative Momentum",
    "trendStructure": "Trend Structure",
    "momentumState": "Momentum State",
    "relativePerformance": "Relative Performance",
    "drawdownRecovery": "Drawdown / Recovery"
  },
  "componentFeatures": {
    "relativeMomentum": [
      "relativeRsi14w",
      "relativeRsi14wDelta4w",
      "rel1mPct",
      "relAccel1v3"
    ],
    "trendStructure": [
      "priceVs200dPct",
      "sma200Slope20dPct",
      "sma50Vs200Pct"
    ],
    "momentumState": [
      "rsi14w",
      "rsi14wDelta4w"
    ],
    "relativePerformance": [
      "rel3mPct",
      "rel6mPct"
    ],
    "drawdownRecovery": [
      "drawdown52wPct",
      "recoveryFrom52wLowPct"
    ]
  },
  "featureDescriptions": {
    "relativeRsi14w": "14-week RSI of the ETF/SPY ratio",
    "relativeRsi14wDelta4w": "4-week change in relative RSI",
    "rel1mPct": "1-month ETF/SPY relative return",
    "relAccel1v3": "1-month relative return minus one-third of 3-month relative return",
    "priceVs200dPct": "price distance from the 200-day moving average",
    "sma200Slope20dPct": "20-session slope of the 200-day moving average",
    "sma50Vs200Pct": "50-day versus 200-day moving-average spread",
    "rsi14w": "14-week absolute RSI",
    "rsi14wDelta4w": "4-week change in absolute RSI",
    "rel3mPct": "3-month ETF/SPY relative return",
    "rel6mPct": "6-month ETF/SPY relative return",
    "drawdown52wPct": "drawdown from the 52-week high",
    "recoveryFrom52wLowPct": "recovery from the 52-week low"
  },
  "walkForward": {
    "purgeDays": 190,
    "foldCount": 5,
    "componentSummary": {
      "relativeMomentum": {
        "averageTopBottomMonthlyRelativeSpreadPct": -0.0335,
        "positiveFoldShare": 0.4,
        "averagePredictionTargetCorrelation": 0.0092,
        "foldSpreads": [
          0.3461,
          -0.4352,
          -0.2345,
          0.2017,
          -0.0457
        ]
      },
      "trendStructure": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.0945,
        "positiveFoldShare": 1.0,
        "averagePredictionTargetCorrelation": 0.1439,
        "foldSpreads": [
          0.3319,
          1.4579,
          0.5841,
          0.6386,
          2.4599
        ]
      },
      "momentumState": {
        "averageTopBottomMonthlyRelativeSpreadPct": 0.2413,
        "positiveFoldShare": 0.4,
        "averagePredictionTargetCorrelation": 0.0194,
        "foldSpreads": [
          -0.2296,
          0.8685,
          -0.0322,
          -0.4256,
          1.0254
        ]
      },
      "relativePerformance": {
        "averageTopBottomMonthlyRelativeSpreadPct": -0.447,
        "positiveFoldShare": 0.0,
        "averagePredictionTargetCorrelation": -0.069,
        "foldSpreads": [
          -1.0491,
          -0.1784,
          -0.1842,
          -0.3036,
          -0.5194
        ]
      },
      "drawdownRecovery": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.0565,
        "positiveFoldShare": 0.8,
        "averagePredictionTargetCorrelation": 0.1864,
        "foldSpreads": [
          0.9542,
          1.2804,
          1.0136,
          -0.2763,
          2.3104
        ]
      }
    },
    "combinedOutOfSample": {
      "learned": {
        "averageSpreadPct": 0.8869,
        "positiveFolds": 4,
        "foldSpreads": [
          -0.3387,
          1.144,
          0.8282,
          0.6865,
          2.1144
        ]
      },
      "prior": {
        "averageSpreadPct": 0.7507,
        "positiveFolds": 5,
        "foldSpreads": [
          0.6028,
          0.775,
          0.2827,
          0.7171,
          1.3759
        ]
      },
      "relative3m": {
        "averageSpreadPct": 0.427,
        "positiveFolds": 2,
        "foldSpreads": [
          1.5008,
          1.2985,
          -0.0348,
          -0.404,
          -0.2255
        ]
      },
      "relative3mTrend": {
        "averageSpreadPct": 0.4763,
        "positiveFolds": 2,
        "foldSpreads": [
          1.4485,
          1.306,
          -0.0821,
          -0.23,
          -0.0608
        ]
      }
    },
    "validationPolicy": "Nested weight selection; non-overlapping outer folds; same-week ranking spreads. Overlapping labels and ETFs are dependent; no significance or after-cost claims."
  },
  "note": "Decision Score is a historical technical ranking, not a return forecast. Historical edge is in-sample response calibration, not independently calibrated expected return. STRONG is a score band, not a buy instruction or probability."
} as const;

export const decisionEngineRows: DecisionEngineRow[] = [
  {
    "ticker": "XLE",
    "asOf": "2026-10-05",
    "decisionScore": 92.0,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 96.8,
      "trendStructure": 92.2,
      "momentumState": 91.2,
      "relativePerformance": 48.4,
      "drawdownRecovery": 96.8
    },
    "historicalEdgeMonthlyPct": 0.282
  },
  {
    "ticker": "XLK",
    "asOf": "2026-10-05",
    "decisionScore": 89.4,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 9.2,
      "trendStructure": 97.2,
      "momentumState": 93.8,
      "relativePerformance": 99.0,
      "drawdownRecovery": 98.4
    },
    "historicalEdgeMonthlyPct": 0.324
  },
  {
    "ticker": "PDBC",
    "asOf": "2026-10-05",
    "decisionScore": 88.0,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 95.8,
      "trendStructure": 93.0,
      "momentumState": 87.3,
      "relativePerformance": 48.4,
      "drawdownRecovery": 84.4
    },
    "historicalEdgeMonthlyPct": 0.197
  },
  {
    "ticker": "SMH",
    "asOf": "2026-10-05",
    "decisionScore": 87.8,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 9.2,
      "trendStructure": 97.2,
      "momentumState": 93.8,
      "relativePerformance": 99.0,
      "drawdownRecovery": 93.5
    },
    "historicalEdgeMonthlyPct": 0.305
  },
  {
    "ticker": "EEM",
    "asOf": "2026-10-05",
    "decisionScore": 75.2,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 69.9,
      "trendStructure": 77.0,
      "momentumState": 88.3,
      "relativePerformance": 61.6,
      "drawdownRecovery": 72.3
    },
    "historicalEdgeMonthlyPct": -0.121
  },
  {
    "ticker": "KMLM",
    "asOf": "2026-10-05",
    "decisionScore": 74.2,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 82.8,
      "trendStructure": 82.2,
      "momentumState": 81.8,
      "relativePerformance": 48.4,
      "drawdownRecovery": 61.9
    },
    "historicalEdgeMonthlyPct": -0.067
  },
  {
    "ticker": "XLV",
    "asOf": "2026-10-05",
    "decisionScore": 67.1,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 76.3,
      "trendStructure": 74.7,
      "momentumState": 63.0,
      "relativePerformance": 27.3,
      "drawdownRecovery": 60.6
    },
    "historicalEdgeMonthlyPct": -0.152
  },
  {
    "ticker": "EFA",
    "asOf": "2026-10-05",
    "decisionScore": 57.4,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 75.4,
      "trendStructure": 53.7,
      "momentumState": 56.2,
      "relativePerformance": 38.2,
      "drawdownRecovery": 60.6
    },
    "historicalEdgeMonthlyPct": -0.236
  },
  {
    "ticker": "UUP",
    "asOf": "2026-10-05",
    "decisionScore": 50.0,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 21.8,
      "trendStructure": 52.6,
      "momentumState": 85.0,
      "relativePerformance": 15.4,
      "drawdownRecovery": 49.0
    },
    "historicalEdgeMonthlyPct": -0.259
  },
  {
    "ticker": "XLF",
    "asOf": "2026-10-05",
    "decisionScore": 43.9,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 86.3,
      "trendStructure": 50.7,
      "momentumState": 66.0,
      "relativePerformance": 47.6,
      "drawdownRecovery": 15.4
    },
    "historicalEdgeMonthlyPct": -0.305
  },
  {
    "ticker": "IWM",
    "asOf": "2026-10-05",
    "decisionScore": 43.8,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 55.3,
      "trendStructure": 49.4,
      "momentumState": 24.4,
      "relativePerformance": 8.0,
      "drawdownRecovery": 43.4
    },
    "historicalEdgeMonthlyPct": -0.276
  },
  {
    "ticker": "GLD",
    "asOf": "2026-10-05",
    "decisionScore": 42.1,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 83.7,
      "trendStructure": 26.3,
      "momentumState": 6.3,
      "relativePerformance": 16.3,
      "drawdownRecovery": 66.8
    },
    "historicalEdgeMonthlyPct": -0.307
  },
  {
    "ticker": "XLB",
    "asOf": "2026-10-05",
    "decisionScore": 30.3,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 67.6,
      "trendStructure": 26.1,
      "momentumState": 6.3,
      "relativePerformance": 29.4,
      "drawdownRecovery": 32.7
    },
    "historicalEdgeMonthlyPct": -0.345
  },
  {
    "ticker": "IYR",
    "asOf": "2026-10-05",
    "decisionScore": 29.5,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 89.1,
      "trendStructure": 20.7,
      "momentumState": 73.1,
      "relativePerformance": 34.9,
      "drawdownRecovery": 11.7
    },
    "historicalEdgeMonthlyPct": -0.382
  },
  {
    "ticker": "XLI",
    "asOf": "2026-10-05",
    "decisionScore": 28.6,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 79.7,
      "trendStructure": 21.4,
      "momentumState": 1.8,
      "relativePerformance": 24.4,
      "drawdownRecovery": 32.7
    },
    "historicalEdgeMonthlyPct": -0.365
  },
  {
    "ticker": "TLT",
    "asOf": "2026-10-05",
    "decisionScore": 21.3,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 74.0,
      "trendStructure": 11.2,
      "momentumState": 73.1,
      "relativePerformance": 34.9,
      "drawdownRecovery": 3.5
    },
    "historicalEdgeMonthlyPct": -0.435
  },
  {
    "ticker": "XLU",
    "asOf": "2026-10-05",
    "decisionScore": 17.9,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 72.7,
      "trendStructure": 11.2,
      "momentumState": 38.7,
      "relativePerformance": 34.9,
      "drawdownRecovery": 3.5
    },
    "historicalEdgeMonthlyPct": -0.442
  }
];
