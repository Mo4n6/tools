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
  "generatedAt": "2026-10-10T02:36:32Z",
  "asOf": "2026-10-09",
  "benchmark": "SPY",
  "trainingStart": "2016-10-14",
  "trainingEnd": "2026-04-02",
  "matureTrainingRows": 8147,
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
    "trendStructure": 0.536684,
    "momentumState": 0.041349,
    "relativePerformance": 0.0,
    "drawdownRecovery": 0.421968
  },
  "componentWeights": {
    "relativeMomentum": 0.09,
    "trendStructure": 0.450678,
    "momentumState": 0.088944,
    "relativePerformance": 0.045,
    "drawdownRecovery": 0.325377
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
        "averagePredictionTargetCorrelation": 0.0097,
        "foldSpreads": [
          0.351,
          -0.4568,
          -0.2549,
          0.2583,
          -0.0651
        ]
      },
      "trendStructure": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.0971,
        "positiveFoldShare": 1.0,
        "averagePredictionTargetCorrelation": 0.1472,
        "foldSpreads": [
          0.3439,
          1.4404,
          0.5973,
          0.638,
          2.4659
        ]
      },
      "momentumState": {
        "averageTopBottomMonthlyRelativeSpreadPct": 0.2113,
        "positiveFoldShare": 0.4,
        "averagePredictionTargetCorrelation": 0.022,
        "foldSpreads": [
          -0.2277,
          0.7667,
          -0.0259,
          -0.4239,
          0.9675
        ]
      },
      "relativePerformance": {
        "averageTopBottomMonthlyRelativeSpreadPct": -0.4576,
        "positiveFoldShare": 0.0,
        "averagePredictionTargetCorrelation": -0.0669,
        "foldSpreads": [
          -1.056,
          -0.2378,
          -0.1494,
          -0.3307,
          -0.5142
        ]
      },
      "drawdownRecovery": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.0782,
        "positiveFoldShare": 0.8,
        "averagePredictionTargetCorrelation": 0.1894,
        "foldSpreads": [
          0.9654,
          1.2605,
          1.0773,
          -0.2152,
          2.3031
        ]
      }
    },
    "combinedOutOfSample": {
      "learned": {
        "averageSpreadPct": 0.944,
        "positiveFolds": 4,
        "foldSpreads": [
          -0.5547,
          1.4654,
          0.9379,
          0.6149,
          2.2564
        ]
      },
      "prior": {
        "averageSpreadPct": 0.7941,
        "positiveFolds": 5,
        "foldSpreads": [
          0.748,
          0.8275,
          0.3084,
          0.7543,
          1.3321
        ]
      },
      "relative3m": {
        "averageSpreadPct": 0.4228,
        "positiveFolds": 3,
        "foldSpreads": [
          1.5008,
          1.1898,
          0.0531,
          -0.404,
          -0.2255
        ]
      },
      "relative3mTrend": {
        "averageSpreadPct": 0.472,
        "positiveFolds": 3,
        "foldSpreads": [
          1.4485,
          1.1972,
          0.005,
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
    "ticker": "PDBC",
    "asOf": "2026-10-09",
    "decisionScore": 95.6,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 98.8,
      "trendStructure": 97.2,
      "momentumState": 99.4,
      "relativePerformance": 56.3,
      "drawdownRecovery": 96.8
    },
    "historicalEdgeMonthlyPct": 0.338
  },
  {
    "ticker": "XLE",
    "asOf": "2026-10-09",
    "decisionScore": 92.8,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 96.7,
      "trendStructure": 97.2,
      "momentumState": 87.3,
      "relativePerformance": 56.3,
      "drawdownRecovery": 92.3
    },
    "historicalEdgeMonthlyPct": 0.295
  },
  {
    "ticker": "XLK",
    "asOf": "2026-10-09",
    "decisionScore": 92.6,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 67.7,
      "trendStructure": 97.2,
      "momentumState": 80.5,
      "relativePerformance": 99.0,
      "drawdownRecovery": 95.7
    },
    "historicalEdgeMonthlyPct": 0.329
  },
  {
    "ticker": "SMH",
    "asOf": "2026-10-09",
    "decisionScore": 84.8,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 17.3,
      "trendStructure": 97.2,
      "momentumState": 65.7,
      "relativePerformance": 91.1,
      "drawdownRecovery": 90.6
    },
    "historicalEdgeMonthlyPct": 0.251
  },
  {
    "ticker": "EEM",
    "asOf": "2026-10-09",
    "decisionScore": 71.9,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 80.1,
      "trendStructure": 78.1,
      "momentumState": 66.9,
      "relativePerformance": 6.8,
      "drawdownRecovery": 71.6
    },
    "historicalEdgeMonthlyPct": -0.128
  },
  {
    "ticker": "KMLM",
    "asOf": "2026-10-09",
    "decisionScore": 70.0,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 85.4,
      "trendStructure": 77.7,
      "momentumState": 98.5,
      "relativePerformance": 11.0,
      "drawdownRecovery": 55.5
    },
    "historicalEdgeMonthlyPct": -0.132
  },
  {
    "ticker": "XLV",
    "asOf": "2026-10-09",
    "decisionScore": 64.5,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 42.1,
      "trendStructure": 73.9,
      "momentumState": 77.9,
      "relativePerformance": 43.7,
      "drawdownRecovery": 56.8
    },
    "historicalEdgeMonthlyPct": -0.158
  },
  {
    "ticker": "EFA",
    "asOf": "2026-10-09",
    "decisionScore": 54.3,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 94.3,
      "trendStructure": 49.2,
      "momentumState": 34.1,
      "relativePerformance": 10.0,
      "drawdownRecovery": 62.1
    },
    "historicalEdgeMonthlyPct": -0.248
  },
  {
    "ticker": "UUP",
    "asOf": "2026-10-09",
    "decisionScore": 53.7,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 59.2,
      "trendStructure": 51.7,
      "momentumState": 85.0,
      "relativePerformance": 45.3,
      "drawdownRecovery": 47.4
    },
    "historicalEdgeMonthlyPct": -0.252
  },
  {
    "ticker": "XLF",
    "asOf": "2026-10-09",
    "decisionScore": 50.1,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 86.4,
      "trendStructure": 54.6,
      "momentumState": 57.5,
      "relativePerformance": 64.8,
      "drawdownRecovery": 29.8
    },
    "historicalEdgeMonthlyPct": -0.26
  },
  {
    "ticker": "IWM",
    "asOf": "2026-10-09",
    "decisionScore": 44.0,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 93.1,
      "trendStructure": 49.2,
      "momentumState": 34.1,
      "relativePerformance": 47.7,
      "drawdownRecovery": 25.6
    },
    "historicalEdgeMonthlyPct": -0.292
  },
  {
    "ticker": "GLD",
    "asOf": "2026-10-09",
    "decisionScore": 37.9,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 83.4,
      "trendStructure": 18.0,
      "momentumState": 1.8,
      "relativePerformance": 9.2,
      "drawdownRecovery": 66.8
    },
    "historicalEdgeMonthlyPct": -0.338
  },
  {
    "ticker": "XLI",
    "asOf": "2026-10-09",
    "decisionScore": 29.8,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 84.0,
      "trendStructure": 20.8,
      "momentumState": 12.7,
      "relativePerformance": 34.3,
      "drawdownRecovery": 31.3
    },
    "historicalEdgeMonthlyPct": -0.354
  },
  {
    "ticker": "XLB",
    "asOf": "2026-10-09",
    "decisionScore": 29.2,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 69.4,
      "trendStructure": 26.1,
      "momentumState": 1.8,
      "relativePerformance": 17.9,
      "drawdownRecovery": 31.3
    },
    "historicalEdgeMonthlyPct": -0.348
  },
  {
    "ticker": "IYR",
    "asOf": "2026-10-09",
    "decisionScore": 24.2,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 75.4,
      "trendStructure": 22.0,
      "momentumState": 18.8,
      "relativePerformance": 34.3,
      "drawdownRecovery": 13.1
    },
    "historicalEdgeMonthlyPct": -0.396
  },
  {
    "ticker": "TLT",
    "asOf": "2026-10-09",
    "decisionScore": 20.2,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 89.1,
      "trendStructure": 11.8,
      "momentumState": 18.8,
      "relativePerformance": 34.3,
      "drawdownRecovery": 11.1
    },
    "historicalEdgeMonthlyPct": -0.431
  },
  {
    "ticker": "XLU",
    "asOf": "2026-10-09",
    "decisionScore": 11.6,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 58.6,
      "trendStructure": 0.6,
      "momentumState": 2.9,
      "relativePerformance": 34.3,
      "drawdownRecovery": 13.1
    },
    "historicalEdgeMonthlyPct": -0.532
  }
];
