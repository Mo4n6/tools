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
  "generatedAt": "2026-10-07T02:38:01Z",
  "asOf": "2026-10-06",
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
    "ticker": "PDBC",
    "asOf": "2026-10-06",
    "decisionScore": 95.5,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 91.1,
      "trendStructure": 97.2,
      "momentumState": 98.5,
      "relativePerformance": 71.8,
      "drawdownRecovery": 96.8
    },
    "historicalEdgeMonthlyPct": 0.332
  },
  {
    "ticker": "XLE",
    "asOf": "2026-10-06",
    "decisionScore": 90.5,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 96.8,
      "trendStructure": 92.2,
      "momentumState": 87.3,
      "relativePerformance": 22.3,
      "drawdownRecovery": 96.8
    },
    "historicalEdgeMonthlyPct": 0.277
  },
  {
    "ticker": "XLK",
    "asOf": "2026-10-06",
    "decisionScore": 87.8,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 9.2,
      "trendStructure": 97.2,
      "momentumState": 76.4,
      "relativePerformance": 99.0,
      "drawdownRecovery": 98.4
    },
    "historicalEdgeMonthlyPct": 0.317
  },
  {
    "ticker": "SMH",
    "asOf": "2026-10-06",
    "decisionScore": 86.8,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 2.8,
      "trendStructure": 97.2,
      "momentumState": 93.8,
      "relativePerformance": 88.4,
      "drawdownRecovery": 93.5
    },
    "historicalEdgeMonthlyPct": 0.293
  },
  {
    "ticker": "EEM",
    "asOf": "2026-10-06",
    "decisionScore": 75.0,
    "signal": "STRONG",
    "componentScores": {
      "relativeMomentum": 69.0,
      "trendStructure": 77.0,
      "momentumState": 91.2,
      "relativePerformance": 52.5,
      "drawdownRecovery": 72.3
    },
    "historicalEdgeMonthlyPct": -0.12
  },
  {
    "ticker": "KMLM",
    "asOf": "2026-10-06",
    "decisionScore": 74.1,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 70.0,
      "trendStructure": 82.2,
      "momentumState": 81.8,
      "relativePerformance": 71.2,
      "drawdownRecovery": 61.9
    },
    "historicalEdgeMonthlyPct": -0.066
  },
  {
    "ticker": "XLV",
    "asOf": "2026-10-06",
    "decisionScore": 68.1,
    "signal": "CONSTRUCTIVE",
    "componentScores": {
      "relativeMomentum": 77.7,
      "trendStructure": 74.7,
      "momentumState": 83.1,
      "relativePerformance": 5.3,
      "drawdownRecovery": 60.6
    },
    "historicalEdgeMonthlyPct": -0.15
  },
  {
    "ticker": "EFA",
    "asOf": "2026-10-06",
    "decisionScore": 54.4,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 75.4,
      "trendStructure": 53.7,
      "momentumState": 24.4,
      "relativePerformance": 38.2,
      "drawdownRecovery": 60.6
    },
    "historicalEdgeMonthlyPct": -0.243
  },
  {
    "ticker": "IWM",
    "asOf": "2026-10-06",
    "decisionScore": 47.0,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 92.5,
      "trendStructure": 53.7,
      "momentumState": 33.0,
      "relativePerformance": 70.5,
      "drawdownRecovery": 25.6
    },
    "historicalEdgeMonthlyPct": -0.279
  },
  {
    "ticker": "XLF",
    "asOf": "2026-10-06",
    "decisionScore": 44.6,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 98.0,
      "trendStructure": 50.7,
      "momentumState": 66.0,
      "relativePerformance": 40.8,
      "drawdownRecovery": 15.4
    },
    "historicalEdgeMonthlyPct": -0.302
  },
  {
    "ticker": "UUP",
    "asOf": "2026-10-06",
    "decisionScore": 42.5,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 33.1,
      "trendStructure": 52.6,
      "momentumState": 85.0,
      "relativePerformance": 15.4,
      "drawdownRecovery": 22.3
    },
    "historicalEdgeMonthlyPct": -0.294
  },
  {
    "ticker": "GLD",
    "asOf": "2026-10-06",
    "decisionScore": 42.1,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 83.7,
      "trendStructure": 26.3,
      "momentumState": 1.8,
      "relativePerformance": 25.6,
      "drawdownRecovery": 66.8
    },
    "historicalEdgeMonthlyPct": -0.311
  },
  {
    "ticker": "XLB",
    "asOf": "2026-10-06",
    "decisionScore": 42.0,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 83.7,
      "trendStructure": 26.1,
      "momentumState": 33.0,
      "relativePerformance": 20.4,
      "drawdownRecovery": 58.4
    },
    "historicalEdgeMonthlyPct": -0.302
  },
  {
    "ticker": "XLI",
    "asOf": "2026-10-06",
    "decisionScore": 33.7,
    "signal": "WEAK",
    "componentScores": {
      "relativeMomentum": 84.5,
      "trendStructure": 21.4,
      "momentumState": 55.2,
      "relativePerformance": 18.5,
      "drawdownRecovery": 32.7
    },
    "historicalEdgeMonthlyPct": -0.345
  },
  {
    "ticker": "IYR",
    "asOf": "2026-10-06",
    "decisionScore": 29.8,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 92.5,
      "trendStructure": 20.7,
      "momentumState": 73.1,
      "relativePerformance": 34.9,
      "drawdownRecovery": 11.7
    },
    "historicalEdgeMonthlyPct": -0.381
  },
  {
    "ticker": "TLT",
    "asOf": "2026-10-06",
    "decisionScore": 22.6,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 89.1,
      "trendStructure": 11.2,
      "momentumState": 73.1,
      "relativePerformance": 34.9,
      "drawdownRecovery": 3.5
    },
    "historicalEdgeMonthlyPct": -0.432
  },
  {
    "ticker": "XLU",
    "asOf": "2026-10-06",
    "decisionScore": 13.0,
    "signal": "AVOID",
    "componentScores": {
      "relativeMomentum": 73.5,
      "trendStructure": 0.6,
      "momentumState": 1.8,
      "relativePerformance": 34.9,
      "drawdownRecovery": 13.7
    },
    "historicalEdgeMonthlyPct": -0.531
  }
];
