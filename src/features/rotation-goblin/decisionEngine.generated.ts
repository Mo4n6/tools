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
  "generatedAt": "2026-10-17T01:35:40Z",
  "asOf": "2026-10-16",
  "benchmark": "SPY",
  "trainingStart": "2016-10-21",
  "trainingEnd": "2026-04-10",
  "matureTrainingRows": 8148,
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
    "trendStructure": 0.510022,
    "momentumState": 0.074608,
    "relativePerformance": 0.0,
    "drawdownRecovery": 0.41537
  },
  "componentWeights": {
    "relativeMomentum": 0.09,
    "trendStructure": 0.432016,
    "momentumState": 0.112226,
    "relativePerformance": 0.045,
    "drawdownRecovery": 0.320759
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
        "averageTopBottomMonthlyRelativeSpreadPct": -0.0697,
        "positiveFoldShare": 0.4,
        "averagePredictionTargetCorrelation": 0.0063,
        "foldSpreads": [
          0.1785,
          -0.5605,
          -0.14,
          0.1945,
          -0.021
        ]
      },
      "trendStructure": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.05,
        "positiveFoldShare": 1.0,
        "averagePredictionTargetCorrelation": 0.1453,
        "foldSpreads": [
          0.3211,
          1.3738,
          0.6277,
          0.5918,
          2.3356
        ]
      },
      "momentumState": {
        "averageTopBottomMonthlyRelativeSpreadPct": 0.256,
        "positiveFoldShare": 0.6,
        "averagePredictionTargetCorrelation": 0.026,
        "foldSpreads": [
          -0.2306,
          0.815,
          0.1157,
          -0.413,
          0.9928
        ]
      },
      "relativePerformance": {
        "averageTopBottomMonthlyRelativeSpreadPct": -0.4522,
        "positiveFoldShare": 0.2,
        "averagePredictionTargetCorrelation": -0.0621,
        "foldSpreads": [
          -1.0387,
          -0.321,
          0.0081,
          -0.2265,
          -0.6832
        ]
      },
      "drawdownRecovery": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.0689,
        "positiveFoldShare": 0.8,
        "averagePredictionTargetCorrelation": 0.1904,
        "foldSpreads": [
          0.9506,
          1.0821,
          1.2271,
          -0.2513,
          2.3361
        ]
      }
    },
    "combinedOutOfSample": {
      "learned": {
        "averageSpreadPct": 0.9399,
        "positiveFolds": 4,
        "foldSpreads": [
          -0.2528,
          0.8315,
          1.0957,
          0.7623,
          2.2628
        ]
      },
      "prior": {
        "averageSpreadPct": 0.7148,
        "positiveFolds": 5,
        "foldSpreads": [
          0.5916,
          0.5557,
          0.4823,
          0.6484,
          1.2962
        ]
      },
      "relative3m": {
        "averageSpreadPct": 0.4072,
        "positiveFolds": 3,
        "foldSpreads": [
          1.3996,
          1.1013,
          0.211,
          -0.4327,
          -0.2432
        ]
      },
      "relative3mTrend": {
        "averageSpreadPct": 0.4684,
        "positiveFolds": 3,
        "foldSpreads": [
          1.3644,
          1.1087,
          0.1681,
          -0.2517,
          -0.0475
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
    "asOf": "2026-10-16",
    "decisionScore": 90.8,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 24.9,
      "trendStructure": 97.2,
      "momentumState": 96.1,
      "relativePerformance": 93.6,
      "drawdownRecovery": 98.4
    },
    "historicalEdgeMonthlyPct": 0.317
  },
  {
    "ticker": "PDBC",
    "asOf": "2026-10-16",
    "decisionScore": 89.4,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 24.9,
      "trendStructure": 97.2,
      "momentumState": 91.4,
      "relativePerformance": 74.8,
      "drawdownRecovery": 98.4
    },
    "historicalEdgeMonthlyPct": 0.309
  },
  {
    "ticker": "SMH",
    "asOf": "2026-10-16",
    "decisionScore": 83.2,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 58.7,
      "trendStructure": 90.1,
      "momentumState": 31.2,
      "relativePerformance": 77.7,
      "drawdownRecovery": 99.7
    },
    "historicalEdgeMonthlyPct": 0.22
  },
  {
    "ticker": "XLK",
    "asOf": "2026-10-16",
    "decisionScore": 79.5,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 80.6,
      "trendStructure": 89.3,
      "momentumState": 46.9,
      "relativePerformance": 55.5,
      "drawdownRecovery": 80.8
    },
    "historicalEdgeMonthlyPct": 0.056
  },
  {
    "ticker": "KMLM",
    "asOf": "2026-10-16",
    "decisionScore": 72.7,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 83.0,
      "trendStructure": 75.3,
      "momentumState": 98.5,
      "relativePerformance": 82.4,
      "drawdownRecovery": 56.0
    },
    "historicalEdgeMonthlyPct": -0.133
  },
  {
    "ticker": "XLV",
    "asOf": "2026-10-16",
    "decisionScore": 60.2,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 16.8,
      "trendStructure": 83.7,
      "momentumState": 83.5,
      "relativePerformance": 99.0,
      "drawdownRecovery": 27.1
    },
    "historicalEdgeMonthlyPct": -0.106
  },
  {
    "ticker": "XLF",
    "asOf": "2026-10-16",
    "decisionScore": 56.5,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 26.3,
      "trendStructure": 64.9,
      "momentumState": 57.7,
      "relativePerformance": 17.2,
      "drawdownRecovery": 58.9
    },
    "historicalEdgeMonthlyPct": -0.219
  },
  {
    "ticker": "EEM",
    "asOf": "2026-10-16",
    "decisionScore": 46.0,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 81.4,
      "trendStructure": 67.6,
      "momentumState": 24.4,
      "relativePerformance": 39.9,
      "drawdownRecovery": 15.4
    },
    "historicalEdgeMonthlyPct": -0.265
  },
  {
    "ticker": "UUP",
    "asOf": "2026-10-16",
    "decisionScore": 43.5,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 45.8,
      "trendStructure": 50.1,
      "momentumState": 83.5,
      "relativePerformance": 27.2,
      "drawdownRecovery": 22.3
    },
    "historicalEdgeMonthlyPct": -0.294
  },
  {
    "ticker": "IWM",
    "asOf": "2026-10-16",
    "decisionScore": 40.1,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 74.3,
      "trendStructure": 45.2,
      "momentumState": 37.7,
      "relativePerformance": 49.7,
      "drawdownRecovery": 23.0
    },
    "historicalEdgeMonthlyPct": -0.308
  },
  {
    "ticker": "GLD",
    "asOf": "2026-10-16",
    "decisionScore": 37.4,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 81.8,
      "trendStructure": 17.9,
      "momentumState": 1.8,
      "relativePerformance": 6.2,
      "drawdownRecovery": 67.9
    },
    "historicalEdgeMonthlyPct": -0.339
  },
  {
    "ticker": "EFA",
    "asOf": "2026-10-16",
    "decisionScore": 37.1,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 43.3,
      "trendStructure": 23.2,
      "momentumState": 11.2,
      "relativePerformance": 66.7,
      "drawdownRecovery": 58.9
    },
    "historicalEdgeMonthlyPct": -0.316
  },
  {
    "ticker": "XLB",
    "asOf": "2026-10-16",
    "decisionScore": 31.6,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 38.6,
      "trendStructure": 24.7,
      "momentumState": 5.0,
      "relativePerformance": 46.6,
      "drawdownRecovery": 46.1
    },
    "historicalEdgeMonthlyPct": -0.335
  },
  {
    "ticker": "IYR",
    "asOf": "2026-10-16",
    "decisionScore": 25.3,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 40.8,
      "trendStructure": 31.1,
      "momentumState": 2.9,
      "relativePerformance": 25.1,
      "drawdownRecovery": 20.9
    },
    "historicalEdgeMonthlyPct": -0.365
  },
  {
    "ticker": "XLI",
    "asOf": "2026-10-16",
    "decisionScore": 12.8,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 16.1,
      "trendStructure": 14.7,
      "momentumState": 14.9,
      "relativePerformance": 21.0,
      "drawdownRecovery": 7.5
    },
    "historicalEdgeMonthlyPct": -0.439
  },
  {
    "ticker": "XLU",
    "asOf": "2026-10-16",
    "decisionScore": 10.2,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 8.8,
      "trendStructure": 3.1,
      "momentumState": 23.2,
      "relativePerformance": 29.7,
      "drawdownRecovery": 12.8
    },
    "historicalEdgeMonthlyPct": -0.502
  },
  {
    "ticker": "TLT",
    "asOf": "2026-10-16",
    "decisionScore": 8.3,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 37.4,
      "trendStructure": 0.6,
      "momentumState": 2.9,
      "relativePerformance": 21.0,
      "drawdownRecovery": 10.8
    },
    "historicalEdgeMonthlyPct": -0.531
  }
];
