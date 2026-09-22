#!/usr/bin/env python3
"""Build Rotation Goblin's data-derived Decision Engine.

The engine is intentionally technical-only until historical valuation data can
be reconstructed without look-ahead bias.

Training data:
- point-in-time canonical technical states
- completed-week future outcomes kept in a physically separate research file

Method:
1. Join mature completed-week states to 3M/6M future relative returns.
2. Learn non-parametric decile response curves for each technical feature.
3. Combine related features into five interpretable components.
4. Measure each component's predictive spread in purged walk-forward folds.
5. Shrink evidence-derived weights toward the pre-registered 30/25/20/15/10
   architecture so one historical period cannot wildly overfit the model.
6. Fit the final response curves on all mature history and score the latest
   canonical state for each ETF.

No future outcome field is ever written into the live decision rows.
"""

from __future__ import annotations

import bisect
import datetime as dt
import json
import math
import statistics
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "src/features/rotation-goblin/technical-state-history.json"
OUTCOMES = ROOT / "src/features/rotation-goblin/research/technical-outcomes-10y.json"
OUT = ROOT / "src/features/rotation-goblin/decisionEngine.generated.ts"
RESEARCH_OUT = ROOT / "src/features/rotation-goblin/research/decision-engine-calibration.json"

TICKERS = [
    "XLE", "XLF", "XLB", "XLU", "XLV", "XLI", "XLK", "SMH", "IWM",
    "IYR", "EFA", "EEM", "GLD", "TLT", "PDBC", "KMLM", "UUP",
]

PRIOR_WEIGHTS = {
    "relativeMomentum": 0.30,
    "trendStructure": 0.25,
    "momentumState": 0.20,
    "relativePerformance": 0.15,
    "drawdownRecovery": 0.10,
}

COMPONENT_LABELS = {
    "relativeMomentum": "Relative Momentum",
    "trendStructure": "Trend Structure",
    "momentumState": "Momentum State",
    "relativePerformance": "Relative Performance",
    "drawdownRecovery": "Drawdown / Recovery",
}

COMPONENT_FEATURES = {
    "relativeMomentum": [
        "relativeRsi14w",
        "relativeRsi14wDelta4w",
        "rel1mPct",
        "relAccel1v3",
    ],
    "trendStructure": [
        "priceVs200dPct",
        "sma200Slope20dPct",
        "sma50Vs200Pct",
    ],
    "momentumState": [
        "rsi14w",
        "rsi14wDelta4w",
    ],
    "relativePerformance": [
        "rel3mPct",
        "rel6mPct",
    ],
    "drawdownRecovery": [
        "drawdown52wPct",
        "recoveryFrom52wLowPct",
    ],
}

FEATURE_DESCRIPTIONS = {
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
    "recoveryFrom52wLowPct": "recovery from the 52-week low",
}

DECILE_COUNT = 10
BIN_SHRINK_SAMPLES = 30.0
PRIOR_SHRINK = 0.70
PURGE_DAYS = 190
MIN_TRAIN_ROWS = 1500
MIN_VALIDATION_ROWS = 300


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def mean(values: list[float]) -> float:
    return statistics.fmean(values) if values else 0.0


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def pct_rank(sorted_values: list[float], value: float) -> float:
    if not sorted_values:
        return 50.0
    left = bisect.bisect_left(sorted_values, value)
    right = bisect.bisect_right(sorted_values, value)
    midpoint = (left + right) / 2.0
    return clamp(100.0 * midpoint / len(sorted_values), 0.0, 100.0)


def pearson(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 3 or len(xs) != len(ys):
        return 0.0
    mx = mean(xs)
    my = mean(ys)
    numerator = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if dx <= 1e-12 or dy <= 1e-12:
        return 0.0
    return numerator / (dx * dy)


def quantile_edges(values: list[float], bins: int = DECILE_COUNT) -> list[float]:
    ordered = sorted(values)
    require(len(ordered) >= bins * 5, "Too few rows to fit decile model")
    edges: list[float] = []
    for bucket in range(1, bins):
        index = min(len(ordered) - 1, max(0, math.ceil(len(ordered) * bucket / bins) - 1))
        edges.append(ordered[index])
    return edges


def feature_value(feature: str, features: dict[str, Any]) -> float | None:
    if feature == "relAccel1v3":
        one = features.get("rel1mPct")
        three = features.get("rel3mPct")
        if finite(one) and finite(three):
            return float(one) - float(three) / 3.0
        return None
    value = features.get(feature)
    return float(value) if finite(value) else None


def target_monthly(outcomes: dict[str, Any]) -> float | None:
    rel3 = outcomes.get("forwardRel3mPct")
    rel6 = outcomes.get("forwardRel6mPct")
    if not finite(rel3) or not finite(rel6):
        return None
    # Equal-weight 3M and 6M horizons after converting each to a monthly rate.
    return 0.5 * (float(rel3) / 3.0) + 0.5 * (float(rel6) / 6.0)


def load_training_rows() -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]], dict[str, Any]]:
    canonical = json.loads(CANONICAL.read_text(encoding="utf-8"))
    outcomes = json.loads(OUTCOMES.read_text(encoding="utf-8"))
    series = canonical["series"]
    outcome_series = outcomes["series"]

    require(set(series) == set(TICKERS), "Canonical ticker universe mismatch")
    require(set(outcome_series) == set(TICKERS), "Outcome ticker universe mismatch")

    rows: list[dict[str, Any]] = []
    latest_states: dict[str, list[dict[str, Any]]] = {}

    for ticker in TICKERS:
        states = series[ticker]
        require(states, f"{ticker}: empty canonical history")
        latest_states[ticker] = states

        state_by_date = {row["date"]: row["features"] for row in states}
        for label_row in outcome_series[ticker]:
            target = target_monthly(label_row["outcomes"])
            if target is None:
                continue
            features = state_by_date.get(label_row["date"])
            if features is None:
                continue

            extracted: dict[str, float] = {}
            valid = True
            for feature in FEATURE_DESCRIPTIONS:
                value = feature_value(feature, features)
                if value is None:
                    valid = False
                    break
                extracted[feature] = value
            if not valid:
                continue

            rows.append({
                "ticker": ticker,
                "date": label_row["date"],
                "dateObj": dt.date.fromisoformat(label_row["date"]),
                "features": extracted,
                "target": float(target),
            })

    rows.sort(key=lambda row: (row["date"], row["ticker"]))
    require(len(rows) >= 6000, f"Decision Engine training set unexpectedly small: {len(rows)}")

    metadata = canonical["metadata"]
    return rows, latest_states, metadata


def fit_feature_model(rows: list[dict[str, Any]], feature: str) -> dict[str, Any]:
    pairs = [
        (row["features"][feature], row["target"])
        for row in rows
        if finite(row["features"].get(feature)) and finite(row.get("target"))
    ]
    require(len(pairs) >= 500, f"{feature}: insufficient training pairs")

    values = [float(value) for value, _target in pairs]
    global_mean = mean([float(target) for _value, target in pairs])
    edges = quantile_edges(values)

    sums = [0.0] * DECILE_COUNT
    counts = [0] * DECILE_COUNT
    for value, target in pairs:
        bucket = bisect.bisect_right(edges, float(value))
        bucket = min(DECILE_COUNT - 1, bucket)
        sums[bucket] += float(target)
        counts[bucket] += 1

    means: list[float] = []
    for bucket in range(DECILE_COUNT):
        count = counts[bucket]
        smoothed = (
            sums[bucket] + BIN_SHRINK_SAMPLES * global_mean
        ) / (count + BIN_SHRINK_SAMPLES)
        means.append(smoothed)

    return {
        "feature": feature,
        "edges": edges,
        "means": means,
        "counts": counts,
        "globalMean": global_mean,
    }


def predict_feature(model: dict[str, Any], value: float) -> float:
    bucket = bisect.bisect_right(model["edges"], value)
    bucket = min(DECILE_COUNT - 1, bucket)
    return float(model["means"][bucket])


def fit_calibrator(rows: list[dict[str, Any]]) -> dict[str, Any]:
    feature_models = {
        feature: fit_feature_model(rows, feature)
        for feature in FEATURE_DESCRIPTIONS
    }

    component_prediction_distributions: dict[str, list[float]] = {}
    for component, features in COMPONENT_FEATURES.items():
        predictions: list[float] = []
        for row in rows:
            feature_predictions = [
                predict_feature(feature_models[feature], row["features"][feature])
                for feature in features
            ]
            predictions.append(mean(feature_predictions))
        component_prediction_distributions[component] = sorted(predictions)

    return {
        "featureModels": feature_models,
        "componentDistributions": component_prediction_distributions,
    }


def component_prediction(
    row_features: dict[str, float],
    calibrator: dict[str, Any],
    component: str,
) -> float:
    values = [
        predict_feature(
            calibrator["featureModels"][feature],
            row_features[feature],
        )
        for feature in COMPONENT_FEATURES[component]
    ]
    return mean(values)


def component_score(
    row_features: dict[str, float],
    calibrator: dict[str, Any],
    component: str,
) -> float:
    prediction = component_prediction(row_features, calibrator, component)
    distribution = calibrator["componentDistributions"][component]
    return pct_rank(distribution, prediction)


def quintile_spread(
    predictions: list[tuple[float, float]],
) -> float:
    if len(predictions) < 20:
        return 0.0
    ordered = sorted(predictions, key=lambda item: item[0])
    count = max(1, len(ordered) // 5)
    bottom = mean([target for _pred, target in ordered[:count]])
    top = mean([target for _pred, target in ordered[-count:]])
    return top - bottom


def walk_forward_diagnostics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    unique_dates = sorted({row["dateObj"] for row in rows})
    require(len(unique_dates) >= 300, "Not enough unique weeks for walk-forward validation")

    fractions = [0.55, 0.70, 0.85, 1.00]
    boundaries = [
        unique_dates[min(len(unique_dates) - 1, int((len(unique_dates) - 1) * fraction))]
        for fraction in fractions
    ]

    component_fold_spreads: dict[str, list[float]] = {
        component: [] for component in COMPONENT_FEATURES
    }
    component_fold_correlations: dict[str, list[float]] = {
        component: [] for component in COMPONENT_FEATURES
    }
    folds: list[dict[str, Any]] = []

    for index in range(len(boundaries) - 1):
        validation_start = boundaries[index]
        validation_end = boundaries[index + 1]
        train_end = validation_start - dt.timedelta(days=PURGE_DAYS)

        train = [row for row in rows if row["dateObj"] < train_end]
        validation = [
            row for row in rows
            if validation_start <= row["dateObj"] <= validation_end
        ]

        if len(train) < MIN_TRAIN_ROWS or len(validation) < MIN_VALIDATION_ROWS:
            continue

        calibrator = fit_calibrator(train)
        fold_components: dict[str, Any] = {}

        for component in COMPONENT_FEATURES:
            pairs: list[tuple[float, float]] = []
            for row in validation:
                prediction = component_prediction(
                    row["features"],
                    calibrator,
                    component,
                )
                pairs.append((prediction, row["target"]))

            spread = quintile_spread(pairs)
            corr = pearson(
                [prediction for prediction, _target in pairs],
                [target for _prediction, target in pairs],
            )
            component_fold_spreads[component].append(spread)
            component_fold_correlations[component].append(corr)
            fold_components[component] = {
                "topBottomMonthlyRelativeSpreadPct": round(spread, 4),
                "predictionTargetCorrelation": round(corr, 4),
            }

        folds.append({
            "trainingEnd": train_end.isoformat(),
            "validationStart": validation_start.isoformat(),
            "validationEnd": validation_end.isoformat(),
            "trainingRows": len(train),
            "validationRows": len(validation),
            "components": fold_components,
        })

    require(len(folds) >= 2, "Insufficient valid walk-forward folds")

    evidence_strength: dict[str, float] = {}
    component_summary: dict[str, Any] = {}

    for component in COMPONENT_FEATURES:
        spreads = component_fold_spreads[component]
        correlations = component_fold_correlations[component]
        positive_share = sum(1 for value in spreads if value > 0) / len(spreads)
        avg_spread = mean(spreads)
        avg_corr = mean(correlations)

        # Negative evidence does not invert the component; it simply receives
        # less evidence weight. Sign consistency matters as much as magnitude.
        evidence_strength[component] = max(0.0, avg_spread) * positive_share
        component_summary[component] = {
            "averageTopBottomMonthlyRelativeSpreadPct": round(avg_spread, 4),
            "positiveFoldShare": round(positive_share, 4),
            "averagePredictionTargetCorrelation": round(avg_corr, 4),
            "foldSpreads": [round(value, 4) for value in spreads],
        }

    strength_total = sum(evidence_strength.values())
    if strength_total <= 1e-12:
        evidence_weights = PRIOR_WEIGHTS.copy()
    else:
        evidence_weights = {
            component: evidence_strength[component] / strength_total
            for component in COMPONENT_FEATURES
        }

    final_weights = {
        component: (
            PRIOR_SHRINK * PRIOR_WEIGHTS[component]
            + (1.0 - PRIOR_SHRINK) * evidence_weights[component]
        )
        for component in COMPONENT_FEATURES
    }
    final_total = sum(final_weights.values())
    final_weights = {
        component: value / final_total
        for component, value in final_weights.items()
    }

    return {
        "folds": folds,
        "componentSummary": component_summary,
        "evidenceWeights": evidence_weights,
        "finalWeights": final_weights,
    }


def latest_feature_values(state_features: dict[str, Any]) -> dict[str, float]:
    extracted: dict[str, float] = {}
    for feature in FEATURE_DESCRIPTIONS:
        value = feature_value(feature, state_features)
        if value is None:
            raise RuntimeError(f"Latest state missing feature {feature}")
        extracted[feature] = value
    return extracted


def signal_for(score: float) -> str:
    if score >= 75:
        return "STRONG"
    if score >= 60:
        return "CONSTRUCTIVE"
    if score >= 45:
        return "WATCH"
    if score >= 30:
        return "WEAK"
    return "AVOID"


def write_typescript(
    meta: dict[str, Any],
    decision_rows: list[dict[str, Any]],
) -> None:
    header = """export type DecisionSignal = 'STRONG' | 'CONSTRUCTIVE' | 'WATCH' | 'WEAK' | 'AVOID';

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

"""
    output = header
    output += "export const decisionEngineMeta = " + json.dumps(meta, indent=2) + " as const;\n\n"
    output += "export const decisionEngineRows: DecisionEngineRow[] = " + json.dumps(decision_rows, indent=2) + ";\n"
    OUT.write_text(output, encoding="utf-8")


def main() -> None:
    rows, latest_states, canonical_meta = load_training_rows()
    diagnostics = walk_forward_diagnostics(rows)
    final_weights = diagnostics["finalWeights"]
    calibrator = fit_calibrator(rows)

    decision_rows: list[dict[str, Any]] = []
    for ticker in TICKERS:
        latest = latest_states[ticker][-1]
        features = latest_feature_values(latest["features"])
        components: dict[str, float] = {}
        component_edges: dict[str, float] = {}

        for component in COMPONENT_FEATURES:
            components[component] = component_score(
                features,
                calibrator,
                component,
            )
            component_edges[component] = component_prediction(
                features,
                calibrator,
                component,
            )

        score = sum(
            final_weights[component] * components[component]
            for component in COMPONENT_FEATURES
        )
        historical_edge = sum(
            final_weights[component] * component_edges[component]
            for component in COMPONENT_FEATURES
        )

        decision_rows.append({
            "ticker": ticker,
            "asOf": latest["date"],
            "decisionScore": round(score, 1),
            "signal": signal_for(score),
            "componentScores": {
                component: round(components[component], 1)
                for component in COMPONENT_FEATURES
            },
            "historicalEdgeMonthlyPct": round(historical_edge, 3),
        })

    decision_rows.sort(key=lambda row: (-row["decisionScore"], row["ticker"]))

    training_dates = [row["dateObj"] for row in rows]
    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    meta = {
        "schemaVersion": 1,
        "generatedAt": generated_at,
        "asOf": canonical_meta["latestCompletedSession"],
        "benchmark": "SPY",
        "trainingStart": min(training_dates).isoformat(),
        "trainingEnd": max(training_dates).isoformat(),
        "matureTrainingRows": len(rows),
        "target": "50% of 3M relative return / 3 months + 50% of 6M relative return / 6 months",
        "targetUnit": "percentage points of ETF-vs-SPY relative return per month",
        "featurePolicy": "price-derived point-in-time features only; valuation excluded",
        "weightPolicy": (
            "70% pre-registered component weights + 30% purged walk-forward "
            "evidence weights derived from top-minus-bottom quintile predictive spread"
        ),
        "priorWeights": {
            key: round(value, 6)
            for key, value in PRIOR_WEIGHTS.items()
        },
        "evidenceWeights": {
            key: round(value, 6)
            for key, value in diagnostics["evidenceWeights"].items()
        },
        "componentWeights": {
            key: round(value, 6)
            for key, value in final_weights.items()
        },
        "componentLabels": COMPONENT_LABELS,
        "componentFeatures": COMPONENT_FEATURES,
        "featureDescriptions": FEATURE_DESCRIPTIONS,
        "walkForward": {
            "purgeDays": PURGE_DAYS,
            "foldCount": len(diagnostics["folds"]),
            "componentSummary": diagnostics["componentSummary"],
        },
        "note": (
            "Decision Score is a historical technical ranking, not a return forecast. "
            "Historical edge is descriptive calibration and may not persist."
        ),
    }

    research = {
        "metadata": meta,
        "walkForwardFolds": diagnostics["folds"],
        "featureModels": calibrator["featureModels"],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    RESEARCH_OUT.parent.mkdir(parents=True, exist_ok=True)
    write_typescript(meta, decision_rows)
    RESEARCH_OUT.write_text(json.dumps(research, separators=(",", ":")) + "\n", encoding="utf-8")

    print(
        f"Decision Engine trained on {len(rows)} mature completed-week observations "
        f"from {meta['trainingStart']} through {meta['trainingEnd']}"
    )
    print("Final component weights:")
    for component in COMPONENT_FEATURES:
        summary = diagnostics["componentSummary"][component]
        print(
            f"  {component}: {final_weights[component]:.1%} "
            f"(OOS spread={summary['averageTopBottomMonthlyRelativeSpreadPct']:+.3f}pp/mo, "
            f"positive folds={summary['positiveFoldShare']:.0%})"
        )
    print("Current rankings:")
    for row in decision_rows:
        print(
            f"  {row['ticker']}: {row['decisionScore']:.1f} {row['signal']} "
            f"(hist edge {row['historicalEdgeMonthlyPct']:+.3f}pp/mo)"
        )


if __name__ == "__main__":
    main()
