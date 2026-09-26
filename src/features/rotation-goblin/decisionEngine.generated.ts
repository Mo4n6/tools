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
  "generatedAt": "2026-09-26T01:51:28Z",
  "asOf": "2026-09-25",
  "benchmark": "SPY",
  "trainingStart": "2016-09-30",
  "trainingEnd": "2026-03-20",
  "matureTrainingRows": 8145,
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
    "trendStructure": 0.535459,
    "momentumState": 0.041879,
    "relativePerformance": 0.0,
    "drawdownRecovery": 0.422662
  },
  "componentWeights": {
    "relativeMomentum": 0.09,
    "trendStructure": 0.449821,
    "momentumState": 0.089315,
    "relativePerformance": 0.045,
    "drawdownRecovery": 0.325864
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
        "averageTopBottomMonthlyRelativeSpreadPct": -0.0471,
        "positiveFoldShare": 0.4,
        "averagePredictionTargetCorrelation": 0.0114,
        "foldSpreads": [
          0.2428,
          -0.3442,
          -0.2585,
          0.1939,
          -0.0697
        ]
      },
      "trendStructure": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.0821,
        "positiveFoldShare": 1.0,
        "averagePredictionTargetCorrelation": 0.1522,
        "foldSpreads": [
          0.3892,
          1.2454,
          0.4705,
          0.8512,
          2.4544
        ]
      },
      "momentumState": {
        "averageTopBottomMonthlyRelativeSpreadPct": 0.2116,
        "positiveFoldShare": 0.4,
        "averagePredictionTargetCorrelation": 0.013,
        "foldSpreads": [
          -0.346,
          0.8804,
          -0.2075,
          -0.3775,
          1.1086
        ]
      },
      "relativePerformance": {
        "averageTopBottomMonthlyRelativeSpreadPct": -0.4945,
        "positiveFoldShare": 0.0,
        "averagePredictionTargetCorrelation": -0.0665,
        "foldSpreads": [
          -1.2791,
          -0.0865,
          -0.5544,
          -0.2272,
          -0.3254
        ]
      },
      "drawdownRecovery": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.0677,
        "positiveFoldShare": 0.8,
        "averagePredictionTargetCorrelation": 0.1878,
        "foldSpreads": [
          0.8924,
          1.3259,
          0.8934,
          -0.0702,
          2.2971
        ]
      }
    },
    "combinedOutOfSample": {
      "learned": {
        "averageSpreadPct": 1.0152,
        "positiveFolds": 5,
        "foldSpreads": [
          0.4865,
          1.221,
          0.6553,
          0.6404,
          2.0729
        ]
      },
      "prior": {
        "averageSpreadPct": 0.696,
        "positiveFolds": 5,
        "foldSpreads": [
          0.6006,
          0.7375,
          0.0333,
          0.7947,
          1.314
        ]
      },
      "relative3m": {
        "averageSpreadPct": 0.4829,
        "positiveFolds": 2,
        "foldSpreads": [
          1.6772,
          1.3297,
          -0.2566,
          -0.2501,
          -0.0856
        ]
      },
      "relative3mTrend": {
        "averageSpreadPct": 0.5294,
        "positiveFolds": 3,
        "foldSpreads": [
          1.6119,
          1.3371,
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
    "asOf": "2026-09-25",
    "decisionScore": 89.5,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 23.3,
      "trendStructure": 97.2,
      "momentumState": 95.4,
      "relativePerformance": 79.5,
      "drawdownRecovery": 96.8
    },
    "historicalEdgeMonthlyPct": 0.334
  },
  {
    "ticker": "XLK",
    "asOf": "2026-09-25",
    "decisionScore": 88.5,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 23.1,
      "trendStructure": 97.2,
      "momentumState": 95.4,
      "relativePerformance": 92.2,
      "drawdownRecovery": 92.3
    },
    "historicalEdgeMonthlyPct": 0.306
  },
  {
    "ticker": "SMH",
    "asOf": "2026-09-25",
    "decisionScore": 83.7,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 6.5,
      "trendStructure": 97.2,
      "momentumState": 64.7,
      "relativePerformance": 91.0,
      "drawdownRecovery": 90.6
    },
    "historicalEdgeMonthlyPct": 0.257
  },
  {
    "ticker": "XLE",
    "asOf": "2026-09-25",
    "decisionScore": 83.4,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 46.5,
      "trendStructure": 93.0,
      "momentumState": 91.2,
      "relativePerformance": 45.7,
      "drawdownRecovery": 83.5
    },
    "historicalEdgeMonthlyPct": 0.193
  },
  {
    "ticker": "XLV",
    "asOf": "2026-09-25",
    "decisionScore": 71.2,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 71.5,
      "trendStructure": 78.5,
      "momentumState": 45.2,
      "relativePerformance": 14.0,
      "drawdownRecovery": 76.2
    },
    "historicalEdgeMonthlyPct": -0.116
  },
  {
    "ticker": "EEM",
    "asOf": "2026-09-25",
    "decisionScore": 70.3,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 33.9,
      "trendStructure": 77.8,
      "momentumState": 66.8,
      "relativePerformance": 68.4,
      "drawdownRecovery": 71.2
    },
    "historicalEdgeMonthlyPct": -0.129
  },
  {
    "ticker": "EFA",
    "asOf": "2026-09-25",
    "decisionScore": 62.3,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 43.0,
      "trendStructure": 61.3,
      "momentumState": 50.3,
      "relativePerformance": 62.5,
      "drawdownRecovery": 72.2
    },
    "historicalEdgeMonthlyPct": -0.205
  },
  {
    "ticker": "GLD",
    "asOf": "2026-09-25",
    "decisionScore": 51.7,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 80.0,
      "trendStructure": 44.9,
      "momentumState": 63.4,
      "relativePerformance": 29.0,
      "drawdownRecovery": 53.1
    },
    "historicalEdgeMonthlyPct": -0.258
  },
  {
    "ticker": "KMLM",
    "asOf": "2026-09-25",
    "decisionScore": 50.9,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 20.0,
      "trendStructure": 59.9,
      "momentumState": 94.1,
      "relativePerformance": 68.7,
      "drawdownRecovery": 32.6
    },
    "historicalEdgeMonthlyPct": -0.246
  },
  {
    "ticker": "XLF",
    "asOf": "2026-09-25",
    "decisionScore": 45.3,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 84.7,
      "trendStructure": 44.5,
      "momentumState": 61.0,
      "relativePerformance": 62.5,
      "drawdownRecovery": 28.7
    },
    "historicalEdgeMonthlyPct": -0.285
  },
  {
    "ticker": "IWM",
    "asOf": "2026-09-25",
    "decisionScore": 44.6,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 76.0,
      "trendStructure": 46.4,
      "momentumState": 63.4,
      "relativePerformance": 72.0,
      "drawdownRecovery": 24.6
    },
    "historicalEdgeMonthlyPct": -0.288
  },
  {
    "ticker": "XLB",
    "asOf": "2026-09-25",
    "decisionScore": 39.5,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 80.0,
      "trendStructure": 23.1,
      "momentumState": 63.4,
      "relativePerformance": 27.7,
      "drawdownRecovery": 46.2
    },
    "historicalEdgeMonthlyPct": -0.317
  },
  {
    "ticker": "UUP",
    "asOf": "2026-09-25",
    "decisionScore": 34.9,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 26.7,
      "trendStructure": 40.1,
      "momentumState": 62.0,
      "relativePerformance": 17.3,
      "drawdownRecovery": 25.1
    },
    "historicalEdgeMonthlyPct": -0.316
  },
  {
    "ticker": "IYR",
    "asOf": "2026-09-25",
    "decisionScore": 31.2,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 68.3,
      "trendStructure": 29.4,
      "momentumState": 69.7,
      "relativePerformance": 24.3,
      "drawdownRecovery": 13.8
    },
    "historicalEdgeMonthlyPct": -0.363
  },
  {
    "ticker": "XLI",
    "asOf": "2026-09-25",
    "decisionScore": 31.0,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 73.9,
      "trendStructure": 25.0,
      "momentumState": 6.3,
      "relativePerformance": 24.3,
      "drawdownRecovery": 35.0
    },
    "historicalEdgeMonthlyPct": -0.34
  },
  {
    "ticker": "XLU",
    "asOf": "2026-09-25",
    "decisionScore": 24.7,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 89.0,
      "trendStructure": 17.3,
      "momentumState": 69.7,
      "relativePerformance": 32.7,
      "drawdownRecovery": 3.5
    },
    "historicalEdgeMonthlyPct": -0.404
  },
  {
    "ticker": "TLT",
    "asOf": "2026-09-25",
    "decisionScore": 19.9,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 92.0,
      "trendStructure": 0.6,
      "momentumState": 69.7,
      "relativePerformance": 32.7,
      "drawdownRecovery": 11.1
    },
    "historicalEdgeMonthlyPct": -0.507
  }
];
