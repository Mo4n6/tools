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
  "generatedAt": "2026-09-23T00:33:04Z",
  "asOf": "2026-09-21",
  "benchmark": "SPY",
  "trainingStart": "2016-09-23",
  "trainingEnd": "2026-03-20",
  "matureTrainingRows": 8161,
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
    "trendStructure": 0.526841,
    "momentumState": 0.04745,
    "relativePerformance": 0.0,
    "drawdownRecovery": 0.425709
  },
  "componentWeights": {
    "relativeMomentum": 0.09,
    "trendStructure": 0.443789,
    "momentumState": 0.093215,
    "relativePerformance": 0.045,
    "drawdownRecovery": 0.327996
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
        "averageTopBottomMonthlyRelativeSpreadPct": -0.0484,
        "positiveFoldShare": 0.4,
        "averagePredictionTargetCorrelation": 0.0079,
        "foldSpreads": [
          0.2979,
          -0.4291,
          -0.3067,
          0.2591,
          -0.0631
        ]
      },
      "trendStructure": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.0443,
        "positiveFoldShare": 1.0,
        "averagePredictionTargetCorrelation": 0.1498,
        "foldSpreads": [
          0.2828,
          1.2654,
          0.395,
          0.849,
          2.4291
        ]
      },
      "momentumState": {
        "averageTopBottomMonthlyRelativeSpreadPct": 0.2351,
        "positiveFoldShare": 0.4,
        "averagePredictionTargetCorrelation": 0.0146,
        "foldSpreads": [
          -0.2666,
          0.9427,
          -0.2903,
          -0.3508,
          1.1406
        ]
      },
      "relativePerformance": {
        "averageTopBottomMonthlyRelativeSpreadPct": -0.5152,
        "positiveFoldShare": 0.0,
        "averagePredictionTargetCorrelation": -0.0671,
        "foldSpreads": [
          -1.2443,
          -0.1302,
          -0.598,
          -0.2842,
          -0.3195
        ]
      },
      "drawdownRecovery": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.0548,
        "positiveFoldShare": 0.8,
        "averagePredictionTargetCorrelation": 0.1872,
        "foldSpreads": [
          0.8787,
          1.2901,
          0.8882,
          -0.0876,
          2.3045
        ]
      }
    },
    "combinedOutOfSample": {
      "learned": {
        "averageSpreadPct": 0.9376,
        "positiveFolds": 5,
        "foldSpreads": [
          0.2231,
          1.365,
          0.4279,
          0.6226,
          2.0496
        ]
      },
      "prior": {
        "averageSpreadPct": 0.6684,
        "positiveFolds": 4,
        "foldSpreads": [
          0.4884,
          0.8463,
          -0.071,
          0.8111,
          1.2673
        ]
      },
      "relative3m": {
        "averageSpreadPct": 0.4886,
        "positiveFolds": 2,
        "foldSpreads": [
          1.6772,
          1.4502,
          -0.3487,
          -0.2501,
          -0.0856
        ]
      },
      "relative3mTrend": {
        "averageSpreadPct": 0.5353,
        "positiveFolds": 3,
        "foldSpreads": [
          1.6119,
          1.4577,
          -0.396,
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
    "asOf": "2026-09-21",
    "decisionScore": 89.7,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 44.8,
      "trendStructure": 94.0,
      "momentumState": 92.3,
      "relativePerformance": 79.3,
      "drawdownRecovery": 96.8
    },
    "historicalEdgeMonthlyPct": 0.31
  },
  {
    "ticker": "XLK",
    "asOf": "2026-09-21",
    "decisionScore": 88.3,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 25.8,
      "trendStructure": 97.2,
      "momentumState": 79.3,
      "relativePerformance": 90.8,
      "drawdownRecovery": 95.7
    },
    "historicalEdgeMonthlyPct": 0.326
  },
  {
    "ticker": "SMH",
    "asOf": "2026-09-21",
    "decisionScore": 82.3,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 17.1,
      "trendStructure": 97.2,
      "momentumState": 40.8,
      "relativePerformance": 91.7,
      "drawdownRecovery": 90.6
    },
    "historicalEdgeMonthlyPct": 0.255
  },
  {
    "ticker": "XLE",
    "asOf": "2026-09-21",
    "decisionScore": 82.3,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 82.8,
      "trendStructure": 93.0,
      "momentumState": 51.6,
      "relativePerformance": 30.5,
      "drawdownRecovery": 83.6
    },
    "historicalEdgeMonthlyPct": 0.183
  },
  {
    "ticker": "EEM",
    "asOf": "2026-09-21",
    "decisionScore": 73.9,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 37.8,
      "trendStructure": 81.6,
      "momentumState": 64.2,
      "relativePerformance": 74.6,
      "drawdownRecovery": 76.2
    },
    "historicalEdgeMonthlyPct": -0.055
  },
  {
    "ticker": "XLV",
    "asOf": "2026-09-21",
    "decisionScore": 63.7,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 87.0,
      "trendStructure": 61.5,
      "momentumState": 93.2,
      "relativePerformance": 47.4,
      "drawdownRecovery": 54.1
    },
    "historicalEdgeMonthlyPct": -0.207
  },
  {
    "ticker": "IWM",
    "asOf": "2026-09-21",
    "decisionScore": 62.0,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 74.7,
      "trendStructure": 76.8,
      "momentumState": 61.0,
      "relativePerformance": 35.1,
      "drawdownRecovery": 42.5
    },
    "historicalEdgeMonthlyPct": -0.164
  },
  {
    "ticker": "EFA",
    "asOf": "2026-09-21",
    "decisionScore": 59.7,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 58.0,
      "trendStructure": 62.1,
      "momentumState": 73.4,
      "relativePerformance": 4.8,
      "drawdownRecovery": 60.5
    },
    "historicalEdgeMonthlyPct": -0.218
  },
  {
    "ticker": "XLF",
    "asOf": "2026-09-21",
    "decisionScore": 58.7,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 75.1,
      "trendStructure": 56.0,
      "momentumState": 91.2,
      "relativePerformance": 7.8,
      "drawdownRecovery": 55.4
    },
    "historicalEdgeMonthlyPct": -0.223
  },
  {
    "ticker": "GLD",
    "asOf": "2026-09-21",
    "decisionScore": 57.5,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 79.2,
      "trendStructure": 45.9,
      "momentumState": 36.0,
      "relativePerformance": 30.4,
      "drawdownRecovery": 77.2
    },
    "historicalEdgeMonthlyPct": -0.228
  },
  {
    "ticker": "KMLM",
    "asOf": "2026-09-21",
    "decisionScore": 54.7,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 37.5,
      "trendStructure": 59.8,
      "momentumState": 32.6,
      "relativePerformance": 69.9,
      "drawdownRecovery": 56.6
    },
    "historicalEdgeMonthlyPct": -0.228
  },
  {
    "ticker": "XLI",
    "asOf": "2026-09-21",
    "decisionScore": 43.6,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 94.1,
      "trendStructure": 44.5,
      "momentumState": 24.3,
      "relativePerformance": 24.4,
      "drawdownRecovery": 36.6
    },
    "historicalEdgeMonthlyPct": -0.286
  },
  {
    "ticker": "UUP",
    "asOf": "2026-09-21",
    "decisionScore": 34.6,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 36.4,
      "trendStructure": 36.0,
      "momentumState": 68.6,
      "relativePerformance": 16.3,
      "drawdownRecovery": 25.1
    },
    "historicalEdgeMonthlyPct": -0.32
  },
  {
    "ticker": "XLB",
    "asOf": "2026-09-21",
    "decisionScore": 30.8,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 74.7,
      "trendStructure": 20.2,
      "momentumState": 24.3,
      "relativePerformance": 19.2,
      "drawdownRecovery": 36.6
    },
    "historicalEdgeMonthlyPct": -0.346
  },
  {
    "ticker": "IYR",
    "asOf": "2026-09-21",
    "decisionScore": 28.1,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 84.0,
      "trendStructure": 22.9,
      "momentumState": 24.3,
      "relativePerformance": 12.0,
      "drawdownRecovery": 23.0
    },
    "historicalEdgeMonthlyPct": -0.363
  },
  {
    "ticker": "XLU",
    "asOf": "2026-09-21",
    "decisionScore": 23.4,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 88.1,
      "trendStructure": 25.4,
      "momentumState": 17.1,
      "relativePerformance": 32.7,
      "drawdownRecovery": 3.5
    },
    "historicalEdgeMonthlyPct": -0.393
  },
  {
    "ticker": "TLT",
    "asOf": "2026-09-21",
    "decisionScore": 14.9,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 64.5,
      "trendStructure": 0.6,
      "momentumState": 4.2,
      "relativePerformance": 27.8,
      "drawdownRecovery": 21.9
    },
    "historicalEdgeMonthlyPct": -0.502
  }
];
