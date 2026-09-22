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
  "generatedAt": "",
  "asOf": "",
  "benchmark": "SPY",
  "trainingStart": "",
  "trainingEnd": "",
  "matureTrainingRows": 0,
  "target": "pending calibration",
  "targetUnit": "percentage points of ETF-vs-SPY relative return per month",
  "featurePolicy": "price-derived point-in-time features only; valuation excluded",
  "weightPolicy": "pending calibration",
  "priorWeights": {
    "relativeMomentum": 0.3,
    "trendStructure": 0.25,
    "momentumState": 0.2,
    "relativePerformance": 0.15,
    "drawdownRecovery": 0.1
  },
  "evidenceWeights": {
    "relativeMomentum": 0.3,
    "trendStructure": 0.25,
    "momentumState": 0.2,
    "relativePerformance": 0.15,
    "drawdownRecovery": 0.1
  },
  "componentWeights": {
    "relativeMomentum": 0.3,
    "trendStructure": 0.25,
    "momentumState": 0.2,
    "relativePerformance": 0.15,
    "drawdownRecovery": 0.1
  },
  "componentLabels": {
    "relativeMomentum": "Relative Momentum",
    "trendStructure": "Trend Structure",
    "momentumState": "Momentum State",
    "relativePerformance": "Relative Performance",
    "drawdownRecovery": "Drawdown / Recovery"
  },
  "componentFeatures": {
    "relativeMomentum": [],
    "trendStructure": [],
    "momentumState": [],
    "relativePerformance": [],
    "drawdownRecovery": []
  },
  "featureDescriptions": {},
  "walkForward": {
    "purgeDays": 190,
    "foldCount": 0,
    "componentSummary": {}
  },
  "note": "Placeholder overwritten by Decision Engine calibration workflow."
} as const;

export const decisionEngineRows: DecisionEngineRow[] = [
  {
    "ticker": "XLE",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "XLF",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "XLB",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "XLU",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "XLV",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "XLI",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "XLK",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "SMH",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "IWM",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "IYR",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "EFA",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "EEM",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "GLD",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "TLT",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "PDBC",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "KMLM",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  },
  {
    "ticker": "UUP",
    "asOf": "",
    "decisionScore": 50,
    "signal": "WATCH",
    "componentScores": {
      "relativeMomentum": 50,
      "trendStructure": 50,
      "momentumState": 50,
      "relativePerformance": 50,
      "drawdownRecovery": 50
    },
    "historicalEdgeMonthlyPct": 0
  }
];
