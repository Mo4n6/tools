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
  "generatedAt": "2026-10-10T02:48:16Z",
  "asOf": "2026-10-09",
  "benchmark": "SPY",
  "trainingStart": "2016-10-14",
  "trainingEnd": "2026-04-10",
  "matureTrainingRows": 8164,
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
    "trendStructure": 0.527024,
    "momentumState": 0.064533,
    "relativePerformance": 0.0,
    "drawdownRecovery": 0.408442
  },
  "componentWeights": {
    "relativeMomentum": 0.09,
    "trendStructure": 0.443917,
    "momentumState": 0.105173,
    "relativePerformance": 0.045,
    "drawdownRecovery": 0.31591
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
        "averageTopBottomMonthlyRelativeSpreadPct": -0.0789,
        "positiveFoldShare": 0.6,
        "averagePredictionTargetCorrelation": 0.0061,
        "foldSpreads": [
          0.1646,
          -0.5205,
          -0.2405,
          0.1653,
          0.0368
        ]
      },
      "trendStructure": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.0636,
        "positiveFoldShare": 1.0,
        "averagePredictionTargetCorrelation": 0.1429,
        "foldSpreads": [
          0.378,
          1.4415,
          0.6251,
          0.5725,
          2.3011
        ]
      },
      "momentumState": {
        "averageTopBottomMonthlyRelativeSpreadPct": 0.2171,
        "positiveFoldShare": 0.6,
        "averagePredictionTargetCorrelation": 0.021,
        "foldSpreads": [
          -0.3846,
          0.8188,
          0.0128,
          -0.3545,
          0.9929
        ]
      },
      "relativePerformance": {
        "averageTopBottomMonthlyRelativeSpreadPct": -0.4531,
        "positiveFoldShare": 0.0,
        "averagePredictionTargetCorrelation": -0.0654,
        "foldSpreads": [
          -1.0433,
          -0.1397,
          -0.0852,
          -0.3423,
          -0.6552
        ]
      },
      "drawdownRecovery": {
        "averageTopBottomMonthlyRelativeSpreadPct": 1.0304,
        "positiveFoldShare": 0.8,
        "averagePredictionTargetCorrelation": 0.186,
        "foldSpreads": [
          0.8772,
          1.0712,
          1.1045,
          -0.244,
          2.3431
        ]
      }
    },
    "combinedOutOfSample": {
      "learned": {
        "averageSpreadPct": 0.8779,
        "positiveFolds": 4,
        "foldSpreads": [
          -0.2329,
          0.9752,
          0.9462,
          0.627,
          2.0742
        ]
      },
      "prior": {
        "averageSpreadPct": 0.7087,
        "positiveFolds": 5,
        "foldSpreads": [
          0.5391,
          0.6716,
          0.3548,
          0.6441,
          1.3341
        ]
      },
      "relative3m": {
        "averageSpreadPct": 0.4106,
        "positiveFolds": 3,
        "foldSpreads": [
          1.3996,
          1.2411,
          0.0884,
          -0.4327,
          -0.2432
        ]
      },
      "relative3mTrend": {
        "averageSpreadPct": 0.472,
        "positiveFolds": 3,
        "foldSpreads": [
          1.3644,
          1.2486,
          0.0462,
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
    "asOf": "2026-10-09",
    "decisionScore": 95.1,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 98.4,
      "trendStructure": 97.2,
      "momentumState": 99.4,
      "relativePerformance": 54.6,
      "drawdownRecovery": 95.6
    },
    "historicalEdgeMonthlyPct": 0.326
  },
  {
    "ticker": "XLK",
    "asOf": "2026-10-09",
    "decisionScore": 92.9,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 67.6,
      "trendStructure": 97.2,
      "momentumState": 82.4,
      "relativePerformance": 99.0,
      "drawdownRecovery": 96.7
    },
    "historicalEdgeMonthlyPct": 0.316
  },
  {
    "ticker": "XLE",
    "asOf": "2026-10-09",
    "decisionScore": 92.7,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 96.2,
      "trendStructure": 97.2,
      "momentumState": 88.3,
      "relativePerformance": 54.6,
      "drawdownRecovery": 92.3
    },
    "historicalEdgeMonthlyPct": 0.282
  },
  {
    "ticker": "SMH",
    "asOf": "2026-10-09",
    "decisionScore": 84.4,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 15.8,
      "trendStructure": 97.2,
      "momentumState": 65.7,
      "relativePerformance": 96.6,
      "drawdownRecovery": 90.6
    },
    "historicalEdgeMonthlyPct": 0.24
  },
  {
    "ticker": "EEM",
    "asOf": "2026-10-09",
    "decisionScore": 72.5,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 78.4,
      "trendStructure": 78.2,
      "momentumState": 71.3,
      "relativePerformance": 10.1,
      "drawdownRecovery": 71.9
    },
    "historicalEdgeMonthlyPct": -0.131
  },
  {
    "ticker": "KMLM",
    "asOf": "2026-10-09",
    "decisionScore": 71.1,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 87.8,
      "trendStructure": 77.1,
      "momentumState": 98.5,
      "relativePerformance": 14.1,
      "drawdownRecovery": 56.8
    },
    "historicalEdgeMonthlyPct": -0.135
  },
  {
    "ticker": "XLV",
    "asOf": "2026-10-09",
    "decisionScore": 62.2,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 48.1,
      "trendStructure": 69.0,
      "momentumState": 75.8,
      "relativePerformance": 43.2,
      "drawdownRecovery": 54.7
    },
    "historicalEdgeMonthlyPct": -0.166
  },
  {
    "ticker": "UUP",
    "asOf": "2026-10-09",
    "decisionScore": 54.0,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 59.1,
      "trendStructure": 48.6,
      "momentumState": 86.0,
      "relativePerformance": 45.3,
      "drawdownRecovery": 50.7
    },
    "historicalEdgeMonthlyPct": -0.252
  },
  {
    "ticker": "EFA",
    "asOf": "2026-10-09",
    "decisionScore": 52.4,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 95.3,
      "trendStructure": 48.1,
      "momentumState": 32.9,
      "relativePerformance": 8.8,
      "drawdownRecovery": 58.9
    },
    "historicalEdgeMonthlyPct": -0.251
  },
  {
    "ticker": "XLF",
    "asOf": "2026-10-09",
    "decisionScore": 51.4,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 84.2,
      "trendStructure": 56.4,
      "momentumState": 57.5,
      "relativePerformance": 64.8,
      "drawdownRecovery": 31.1
    },
    "historicalEdgeMonthlyPct": -0.257
  },
  {
    "ticker": "IWM",
    "asOf": "2026-10-09",
    "decisionScore": 43.3,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 92.1,
      "trendStructure": 48.1,
      "momentumState": 32.9,
      "relativePerformance": 47.7,
      "drawdownRecovery": 25.5
    },
    "historicalEdgeMonthlyPct": -0.294
  },
  {
    "ticker": "GLD",
    "asOf": "2026-10-09",
    "decisionScore": 35.6,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 82.1,
      "trendStructure": 17.3,
      "momentumState": 1.9,
      "relativePerformance": 6.3,
      "drawdownRecovery": 63.5
    },
    "historicalEdgeMonthlyPct": -0.343
  },
  {
    "ticker": "XLI",
    "asOf": "2026-10-09",
    "decisionScore": 30.1,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 86.3,
      "trendStructure": 20.4,
      "momentumState": 13.6,
      "relativePerformance": 34.6,
      "drawdownRecovery": 32.7
    },
    "historicalEdgeMonthlyPct": -0.355
  },
  {
    "ticker": "XLB",
    "asOf": "2026-10-09",
    "decisionScore": 29.2,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 70.2,
      "trendStructure": 26.1,
      "momentumState": 1.9,
      "relativePerformance": 17.3,
      "drawdownRecovery": 32.7
    },
    "historicalEdgeMonthlyPct": -0.351
  },
  {
    "ticker": "IYR",
    "asOf": "2026-10-09",
    "decisionScore": 23.1,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 73.9,
      "trendStructure": 20.9,
      "momentumState": 17.8,
      "relativePerformance": 34.6,
      "drawdownRecovery": 11.7
    },
    "historicalEdgeMonthlyPct": -0.398
  },
  {
    "ticker": "TLT",
    "asOf": "2026-10-09",
    "decisionScore": 21.1,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 89.1,
      "trendStructure": 12.0,
      "momentumState": 17.8,
      "relativePerformance": 34.6,
      "drawdownRecovery": 13.7
    },
    "historicalEdgeMonthlyPct": -0.428
  },
  {
    "ticker": "XLU",
    "asOf": "2026-10-09",
    "decisionScore": 11.3,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 60.9,
      "trendStructure": 0.6,
      "momentumState": 2.9,
      "relativePerformance": 34.6,
      "drawdownRecovery": 11.7
    },
    "historicalEdgeMonthlyPct": -0.53
  }
];
