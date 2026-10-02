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
  "generatedAt": "2026-10-02T02:30:04Z",
  "asOf": "2026-10-01",
  "benchmark": "SPY",
  "trainingStart": "2016-10-07",
  "trainingEnd": "2026-03-20",
  "matureTrainingRows": 8129,
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
    "trendStructure": 0.539698,
    "momentumState": 0.050026,
    "relativePerformance": 0.0,
    "drawdownRecovery": 0.410276
  },
  "componentWeights": {
    "relativeMomentum": 0.09,
    "trendStructure": 0.452789,
    "momentumState": 0.095018,
    "relativePerformance": 0.045,
    "drawdownRecovery": 0.317193
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
        "averageTopBottomMonthlyRelativeSpreadPct": -0.0533,
        "positiveFoldShare": 0.4,
        "averagePredictionTargetCorrelation": 0.0097,
        "foldSpreads": [
          0.3332,
          -0.4742,
          -0.2924,
          0.2641,
          -0.0974
        ]
      },
      "trendStructure": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.1231,
        "positiveFoldShare": 1.0,
        "averagePredictionTargetCorrelation": 0.1531,
        "foldSpreads": [
          0.3594,
          1.4243,
          0.4456,
          0.9062,
          2.4801
        ]
      },
      "momentumState": {
        "averageTopBottomMonthlyRelativeSpreadPct": 0.2603,
        "positiveFoldShare": 0.4,
        "averagePredictionTargetCorrelation": 0.0164,
        "foldSpreads": [
          -0.1541,
          0.9387,
          -0.2474,
          -0.3684,
          1.1326
        ]
      },
      "relativePerformance": {
        "averageTopBottomMonthlyRelativeSpreadPct": -0.4758,
        "positiveFoldShare": 0.0,
        "averagePredictionTargetCorrelation": -0.0677,
        "foldSpreads": [
          -1.1868,
          -0.1388,
          -0.5684,
          -0.2432,
          -0.2419
        ]
      },
      "drawdownRecovery": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.0672,
        "positiveFoldShare": 0.8,
        "averagePredictionTargetCorrelation": 0.1886,
        "foldSpreads": [
          1.0247,
          1.2358,
          0.885,
          -0.0973,
          2.288
        ]
      }
    },
    "combinedOutOfSample": {
      "learned": {
        "averageSpreadPct": 0.9226,
        "positiveFolds": 4,
        "foldSpreads": [
          -0.0795,
          1.275,
          0.6915,
          0.6159,
          2.1103
        ]
      },
      "prior": {
        "averageSpreadPct": 0.7545,
        "positiveFolds": 4,
        "foldSpreads": [
          0.5983,
          1.0481,
          -0.0088,
          0.7941,
          1.3409
        ]
      },
      "relative3m": {
        "averageSpreadPct": 0.4784,
        "positiveFolds": 2,
        "foldSpreads": [
          1.6149,
          1.3695,
          -0.2566,
          -0.2501,
          -0.0856
        ]
      },
      "relative3mTrend": {
        "averageSpreadPct": 0.5249,
        "positiveFolds": 3,
        "foldSpreads": [
          1.5496,
          1.3769,
          -0.3047,
          -0.0841,
          0.0869
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
    "asOf": "2026-10-01",
    "decisionScore": 91.8,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 68.8,
      "trendStructure": 97.2,
      "momentumState": 92.3,
      "relativePerformance": 46.9,
      "drawdownRecovery": 96.8
    },
    "historicalEdgeMonthlyPct": 0.33
  },
  {
    "ticker": "XLK",
    "asOf": "2026-10-01",
    "decisionScore": 89.3,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 8.3,
      "trendStructure": 97.2,
      "momentumState": 93.7,
      "relativePerformance": 99.0,
      "drawdownRecovery": 98.4
    },
    "historicalEdgeMonthlyPct": 0.336
  },
  {
    "ticker": "XLE",
    "asOf": "2026-10-01",
    "decisionScore": 85.5,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 98.8,
      "trendStructure": 93.0,
      "momentumState": 56.9,
      "relativePerformance": 55.9,
      "drawdownRecovery": 83.6
    },
    "historicalEdgeMonthlyPct": 0.202
  },
  {
    "ticker": "SMH",
    "asOf": "2026-10-01",
    "decisionScore": 82.8,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 2.1,
      "trendStructure": 97.2,
      "momentumState": 61.1,
      "relativePerformance": 85.5,
      "drawdownRecovery": 91.2
    },
    "historicalEdgeMonthlyPct": 0.264
  },
  {
    "ticker": "KMLM",
    "asOf": "2026-10-01",
    "decisionScore": 73.5,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 57.4,
      "trendStructure": 77.5,
      "momentumState": 95.4,
      "relativePerformance": 76.3,
      "drawdownRecovery": 65.3
    },
    "historicalEdgeMonthlyPct": -0.123
  },
  {
    "ticker": "EEM",
    "asOf": "2026-10-01",
    "decisionScore": 71.2,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 39.2,
      "trendStructure": 79.0,
      "momentumState": 66.4,
      "relativePerformance": 55.0,
      "drawdownRecovery": 73.0
    },
    "historicalEdgeMonthlyPct": -0.121
  },
  {
    "ticker": "XLV",
    "asOf": "2026-10-01",
    "decisionScore": 70.0,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 71.9,
      "trendStructure": 79.3,
      "momentumState": 90.3,
      "relativePerformance": 6.9,
      "drawdownRecovery": 59.0
    },
    "historicalEdgeMonthlyPct": -0.125
  },
  {
    "ticker": "EFA",
    "asOf": "2026-10-01",
    "decisionScore": 54.2,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 75.0,
      "trendStructure": 47.2,
      "momentumState": 67.8,
      "relativePerformance": 10.8,
      "drawdownRecovery": 60.4
    },
    "historicalEdgeMonthlyPct": -0.245
  },
  {
    "ticker": "UUP",
    "asOf": "2026-10-01",
    "decisionScore": 48.8,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 22.0,
      "trendStructure": 51.5,
      "momentumState": 80.4,
      "relativePerformance": 18.4,
      "drawdownRecovery": 47.4
    },
    "historicalEdgeMonthlyPct": -0.256
  },
  {
    "ticker": "GLD",
    "asOf": "2026-10-01",
    "decisionScore": 40.9,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 66.1,
      "trendStructure": 26.6,
      "momentumState": 5.4,
      "relativePerformance": 25.3,
      "drawdownRecovery": 66.9
    },
    "historicalEdgeMonthlyPct": -0.304
  },
  {
    "ticker": "IWM",
    "asOf": "2026-10-01",
    "decisionScore": 40.9,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 78.0,
      "trendStructure": 42.2,
      "momentumState": 67.8,
      "relativePerformance": 8.0,
      "drawdownRecovery": 25.2
    },
    "historicalEdgeMonthlyPct": -0.303
  },
  {
    "ticker": "XLF",
    "asOf": "2026-10-01",
    "decisionScore": 39.9,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 86.7,
      "trendStructure": 50.3,
      "momentumState": 23.4,
      "relativePerformance": 42.1,
      "drawdownRecovery": 16.4
    },
    "historicalEdgeMonthlyPct": -0.308
  },
  {
    "ticker": "IYR",
    "asOf": "2026-10-01",
    "decisionScore": 29.3,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 88.3,
      "trendStructure": 20.3,
      "momentumState": 73.1,
      "relativePerformance": 32.8,
      "drawdownRecovery": 11.8
    },
    "historicalEdgeMonthlyPct": -0.383
  },
  {
    "ticker": "XLB",
    "asOf": "2026-10-01",
    "decisionScore": 24.8,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 74.0,
      "trendStructure": 16.6,
      "momentumState": 23.4,
      "relativePerformance": 28.1,
      "drawdownRecovery": 22.6
    },
    "historicalEdgeMonthlyPct": -0.383
  },
  {
    "ticker": "TLT",
    "asOf": "2026-10-01",
    "decisionScore": 24.0,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 73.3,
      "trendStructure": 11.7,
      "momentumState": 73.1,
      "relativePerformance": 32.8,
      "drawdownRecovery": 11.8
    },
    "historicalEdgeMonthlyPct": -0.421
  },
  {
    "ticker": "XLI",
    "asOf": "2026-10-01",
    "decisionScore": 23.3,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 89.4,
      "trendStructure": 25.7,
      "momentumState": 1.8,
      "relativePerformance": 23.5,
      "drawdownRecovery": 7.6
    },
    "historicalEdgeMonthlyPct": -0.396
  },
  {
    "ticker": "XLU",
    "asOf": "2026-10-01",
    "decisionScore": 20.6,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 71.8,
      "trendStructure": 18.0,
      "momentumState": 35.8,
      "relativePerformance": 32.8,
      "drawdownRecovery": 3.5
    },
    "historicalEdgeMonthlyPct": -0.413
  }
];
