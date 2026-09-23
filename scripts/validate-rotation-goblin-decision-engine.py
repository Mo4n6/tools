#!/usr/bin/env python3
"""Validate Rotation Goblin Decision Engine output."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "src/features/rotation-goblin/technical-state-history.json"
ENGINE = ROOT / "src/features/rotation-goblin/decisionEngine.generated.ts"
CALIBRATION = ROOT / "src/features/rotation-goblin/research/decision-engine-calibration.json"

EXPECTED_TICKERS = {
    "XLE","XLF","XLB","XLU","XLV","XLI","XLK","SMH","IWM","IYR",
    "EFA","EEM","GLD","TLT","PDBC","KMLM","UUP",
}
EXPECTED_COMPONENTS = {
    "relativeMomentum","trendStructure","momentumState",
    "relativePerformance","drawdownRecovery",
}
VALID_SIGNALS = {"STRONG","CONSTRUCTIVE","WATCH","WEAK","AVOID"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def extract_assignment(name: str) -> Any:
    content = ENGINE.read_text(encoding="utf-8")
    match = re.search(
        rf"export const {re.escape(name)}(?:[^=]*)=\s*(\{{.*?\}}|\[.*\])\s*(?:as const)?;",
        content,
        flags=re.DOTALL,
    )
    if not match:
        raise RuntimeError(f"Could not parse {name} from Decision Engine output")
    return json.loads(match.group(1))


def main() -> None:
    require(ENGINE.exists(), "Decision Engine generated file is missing")
    require(CALIBRATION.exists(), "Decision Engine calibration file is missing")

    canonical = json.loads(CANONICAL.read_text(encoding="utf-8"))
    metadata = extract_assignment("decisionEngineMeta")
    rows = extract_assignment("decisionEngineRows")
    calibration = json.loads(CALIBRATION.read_text(encoding="utf-8"))

    require(metadata["schemaVersion"] == 1, "Decision Engine schema version mismatch")
    require(metadata["benchmark"] == "SPY", "Decision Engine benchmark must be SPY")
    require(metadata["asOf"] == canonical["metadata"]["latestCompletedSession"], "Decision Engine date differs from canonical latest session")
    require(metadata["matureTrainingRows"] >= 6000, "Decision Engine training sample unexpectedly small")
    require("valuation excluded" in metadata["featurePolicy"].lower(), "Decision Engine must exclude valuation from historical inputs")
    require(metadata["walkForward"]["foldCount"] >= 2, "Decision Engine requires at least two walk-forward folds")

    weights = metadata["componentWeights"]
    require(set(weights) == EXPECTED_COMPONENTS, "Decision Engine component-weight schema mismatch")
    require(abs(sum(float(value) for value in weights.values()) - 1.0) <= 0.001, "Decision Engine weights must sum to 1")
    for component, value in weights.items():
        require(finite(value) and 0.02 <= float(value) <= 0.60, f"{component}: implausible final weight {value}")

    component_features = metadata["componentFeatures"]
    require(set(component_features) == EXPECTED_COMPONENTS, "Decision Engine component-feature schema mismatch")
    require(all(component_features[component] for component in EXPECTED_COMPONENTS), "Decision Engine component missing features")

    tickers = {row["ticker"] for row in rows}
    require(tickers == EXPECTED_TICKERS, f"Decision Engine ticker set mismatch: {sorted(tickers ^ EXPECTED_TICKERS)}")
    require(len(rows) == len(EXPECTED_TICKERS), "Duplicate Decision Engine ticker rows")

    canonical_series = canonical["series"]
    for row in rows:
        ticker = row["ticker"]
        require(row["asOf"] == canonical["metadata"]["latestCompletedSession"], f"{ticker}: Decision Engine date mismatch")
        require(row["asOf"] == canonical_series[ticker][-1]["date"], f"{ticker}: Decision Engine does not use latest canonical state")
        require(finite(row["decisionScore"]) and 0 <= row["decisionScore"] <= 100, f"{ticker}: invalid Decision Score")
        require(row["signal"] in VALID_SIGNALS, f"{ticker}: invalid Decision Engine signal")
        require(set(row["componentScores"]) == EXPECTED_COMPONENTS, f"{ticker}: component-score schema mismatch")
        for component, value in row["componentScores"].items():
            require(finite(value) and 0 <= value <= 100, f"{ticker}: invalid {component} component score")
        require(finite(row["historicalEdgeMonthlyPct"]), f"{ticker}: invalid historical edge")
        require("outcomes" not in row, f"{ticker}: future outcomes leaked into live Decision Engine row")

    research_meta = calibration.get("metadata", {})
    require(research_meta.get("asOf") == metadata["asOf"], "Calibration/live engine as-of mismatch")
    require(calibration.get("featureModels"), "Calibration feature models missing")
    require(calibration.get("walkForwardFolds"), "Walk-forward fold diagnostics missing")

    folds = calibration["walkForwardFolds"]
    for index, fold in enumerate(folds):
        require(fold["lastTrainingOutcome"] < fold["validationStart"], "Training outcome crosses validation boundary")
        require(fold["combined"]["weightSelectionLatestOutcome"] < fold["validationStart"], "Weight selection leaks validation outcomes")
        if index:
            require(folds[index - 1]["validationEnd"] == fold["validationStart"], "Unexpected fold boundary")
        for name in ("learned", "prior", "relative3m", "relative3mTrend"):
            require(finite(fold["combined"][name]["weeklyTopBottomMonthlyRelativeSpreadPct"]), "Invalid combined diagnostic")
    for row in rows:
        reconstructed = sum(weights[c] * row["componentScores"][c] for c in weights)
        require(abs(reconstructed - row["decisionScore"]) < 0.11, "Score differs from weighted components")

    ranking = sorted(rows, key=lambda row: (-row["decisionScore"], row["ticker"]))
    print(
        f"Decision Engine integrity OK: {metadata['matureTrainingRows']} mature weekly observations, "
        f"{metadata['walkForward']['foldCount']} purged walk-forward folds"
    )
    print("Weights: " + ", ".join(
        f"{component}={weights[component]:.1%}"
        for component in EXPECTED_COMPONENTS
    ))
    print("Top current scores: " + ", ".join(
        f"{row['ticker']} {row['decisionScore']:.1f}"
        for row in ranking[:5]
    ))


if __name__ == "__main__":
    main()
