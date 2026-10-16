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
  "generatedAt": "2026-10-16T01:35:40Z",
  "asOf": "2026-10-15",
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
    "trendStructure": 0.51187,
    "momentumState": 0.077061,
    "relativePerformance": 0.0,
    "drawdownRecovery": 0.411069
  },
  "componentWeights": {
    "relativeMomentum": 0.09,
    "trendStructure": 0.433309,
    "momentumState": 0.113942,
    "relativePerformance": 0.045,
    "drawdownRecovery": 0.317748
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
        "averageTopBottomMonthlyRelativeSpreadPct": -0.0656,
        "positiveFoldShare": 0.4,
        "averagePredictionTargetCorrelation": 0.0064,
        "foldSpreads": [
          0.1785,
          -0.5605,
          -0.1553,
          0.2301,
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
        "averageTopBottomMonthlyRelativeSpreadPct": 0.2635,
        "positiveFoldShare": 0.6,
        "averagePredictionTargetCorrelation": 0.0254,
        "foldSpreads": [
          -0.2306,
          0.8396,
          0.1201,
          -0.3936,
          0.9818
        ]
      },
      "relativePerformance": {
        "averageTopBottomMonthlyRelativeSpreadPct": -0.4523,
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
        "averageTopBottomMonthlyRelativeSpreadPct": 1.054,
        "positiveFoldShare": 0.8,
        "averagePredictionTargetCorrelation": 0.1903,
        "foldSpreads": [
          0.8761,
          1.0821,
          1.2271,
          -0.2513,
          2.3361
        ]
      }
    },
    "combinedOutOfSample": {
      "learned": {
        "averageSpreadPct": 1.0236,
        "positiveFolds": 4,
        "foldSpreads": [
          -0.1452,
          1.1235,
          1.0957,
          0.7641,
          2.2798
        ]
      },
      "prior": {
        "averageSpreadPct": 0.7258,
        "positiveFolds": 5,
        "foldSpreads": [
          0.5636,
          0.5657,
          0.511,
          0.6638,
          1.3248
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
    "ticker": "PDBC",
    "asOf": "2026-10-15",
    "decisionScore": 95.4,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 87.6,
      "trendStructure": 97.2,
      "momentumState": 98.5,
      "relativePerformance": 77.1,
      "drawdownRecovery": 96.7
    },
    "historicalEdgeMonthlyPct": 0.318
  },
  {
    "ticker": "XLE",
    "asOf": "2026-10-15",
    "decisionScore": 88.9,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 25.2,
      "trendStructure": 97.2,
      "momentumState": 91.4,
      "relativePerformance": 74.8,
      "drawdownRecovery": 96.7
    },
    "historicalEdgeMonthlyPct": 0.3
  },
  {
    "ticker": "XLK",
    "asOf": "2026-10-15",
    "decisionScore": 83.2,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 84.1,
      "trendStructure": 93.0,
      "momentumState": 36.3,
      "relativePerformance": 97.4,
      "drawdownRecovery": 84.5
    },
    "historicalEdgeMonthlyPct": 0.18
  },
  {
    "ticker": "SMH",
    "asOf": "2026-10-15",
    "decisionScore": 82.2,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 64.4,
      "trendStructure": 89.3,
      "momentumState": 45.3,
      "relativePerformance": 90.4,
      "drawdownRecovery": 89.6
    },
    "historicalEdgeMonthlyPct": 0.138
  },
  {
    "ticker": "XLV",
    "asOf": "2026-10-15",
    "decisionScore": 74.9,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 60.4,
      "trendStructure": 83.7,
      "momentumState": 84.5,
      "relativePerformance": 87.1,
      "drawdownRecovery": 61.8
    },
    "historicalEdgeMonthlyPct": -0.061
  },
  {
    "ticker": "KMLM",
    "asOf": "2026-10-15",
    "decisionScore": 69.1,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 76.4,
      "trendStructure": 75.3,
      "momentumState": 88.3,
      "relativePerformance": 38.0,
      "drawdownRecovery": 56.0
    },
    "historicalEdgeMonthlyPct": -0.149
  },
  {
    "ticker": "XLF",
    "asOf": "2026-10-15",
    "decisionScore": 54.8,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 43.2,
      "trendStructure": 54.4,
      "momentumState": 70.4,
      "relativePerformance": 3.7,
      "drawdownRecovery": 60.2
    },
    "historicalEdgeMonthlyPct": -0.237
  },
  {
    "ticker": "EEM",
    "asOf": "2026-10-15",
    "decisionScore": 47.3,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 82.9,
      "trendStructure": 68.0,
      "momentumState": 32.5,
      "relativePerformance": 39.9,
      "drawdownRecovery": 15.4
    },
    "historicalEdgeMonthlyPct": -0.254
  },
  {
    "ticker": "UUP",
    "asOf": "2026-10-15",
    "decisionScore": 42.2,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 26.4,
      "trendStructure": 50.1,
      "momentumState": 94.7,
      "relativePerformance": 5.2,
      "drawdownRecovery": 22.3
    },
    "historicalEdgeMonthlyPct": -0.293
  },
  {
    "ticker": "EFA",
    "asOf": "2026-10-15",
    "decisionScore": 40.2,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 73.6,
      "trendStructure": 23.2,
      "momentumState": 26.8,
      "relativePerformance": 39.9,
      "drawdownRecovery": 58.9
    },
    "historicalEdgeMonthlyPct": -0.31
  },
  {
    "ticker": "GLD",
    "asOf": "2026-10-15",
    "decisionScore": 38.5,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 85.6,
      "trendStructure": 17.9,
      "momentumState": 1.8,
      "relativePerformance": 28.2,
      "drawdownRecovery": 67.9
    },
    "historicalEdgeMonthlyPct": -0.336
  },
  {
    "ticker": "IWM",
    "asOf": "2026-10-15",
    "decisionScore": 34.0,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 73.0,
      "trendStructure": 45.2,
      "momentumState": 6.4,
      "relativePerformance": 49.7,
      "drawdownRecovery": 15.4
    },
    "historicalEdgeMonthlyPct": -0.335
  },
  {
    "ticker": "XLB",
    "asOf": "2026-10-15",
    "decisionScore": 30.5,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 32.0,
      "trendStructure": 24.7,
      "momentumState": 12.6,
      "relativePerformance": 10.1,
      "drawdownRecovery": 47.5
    },
    "historicalEdgeMonthlyPct": -0.335
  },
  {
    "ticker": "IYR",
    "asOf": "2026-10-15",
    "decisionScore": 28.4,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 60.7,
      "trendStructure": 31.1,
      "momentumState": 14.9,
      "relativePerformance": 25.1,
      "drawdownRecovery": 20.9
    },
    "historicalEdgeMonthlyPct": -0.353
  },
  {
    "ticker": "XLI",
    "asOf": "2026-10-15",
    "decisionScore": 21.3,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 79.4,
      "trendStructure": 22.2,
      "momentumState": 9.1,
      "relativePerformance": 25.1,
      "drawdownRecovery": 7.5
    },
    "historicalEdgeMonthlyPct": -0.404
  },
  {
    "ticker": "TLT",
    "asOf": "2026-10-15",
    "decisionScore": 11.4,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 59.3,
      "trendStructure": 0.6,
      "momentumState": 9.1,
      "relativePerformance": 29.7,
      "drawdownRecovery": 10.8
    },
    "historicalEdgeMonthlyPct": -0.521
  },
  {
    "ticker": "XLU",
    "asOf": "2026-10-15",
    "decisionScore": 8.4,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 16.5,
      "trendStructure": 3.1,
      "momentumState": 0.3,
      "relativePerformance": 33.0,
      "drawdownRecovery": 12.8
    },
    "historicalEdgeMonthlyPct": -0.516
  }
];
