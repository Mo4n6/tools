#!/usr/bin/env python3
"""Validate Rotation Goblin's canonical technical history architecture."""

from __future__ import annotations

import datetime as dt
import json
import math
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "src/features/rotation-goblin/technical-state-history.json"
OUTCOMES = ROOT / "src/features/rotation-goblin/research/technical-outcomes-10y.json"
CHART_DIR = ROOT / "public/rotation-goblin/history"

EXPECTED_TICKERS = {
    "XLE","XLF","XLB","XLU","XLV","XLI","XLK","SMH","IWM","IYR",
    "EFA","EEM","GLD","TLT","PDBC","KMLM","UUP",
}

REQUIRED_FEATURES = {
    "close","return3mPct","rsi14w","rsi14wDelta4w","relativeRsi14w",
    "relativeRsi14wDelta4w","rel1mPct","rel3mPct","rel6mPct","rel12mPct",
    "priceVs200dPct","sma200Slope20dPct","sma50Vs200Pct","goldenCross",
    "daysSinceGoldenCross","drawdown52wPct","recoveryFrom52wLowPct","trend200d",
}

REQUIRED_OUTCOMES = {
    "forwardAbs1mPct","forwardAbs3mPct","forwardAbs6mPct",
    "forwardRel1mPct","forwardRel3mPct","forwardRel6mPct",
    "maxDrawdown3mPct","maxDrawdown6mPct","maxUpside3mPct","maxUpside6mPct",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def finite_or_none(value: Any) -> bool:
    return value is None or (isinstance(value, (int, float)) and math.isfinite(float(value)))


def load_chart_series() -> dict[str, list[dict[str, Any]]]:
    if not CHART_DIR.exists():
        raise RuntimeError("Chart history directory is missing")
    result: dict[str, list[dict[str, Any]]] = {}
    for ticker in EXPECTED_TICKERS:
        path = CHART_DIR / f"{ticker}.json"
        if not path.exists():
            raise RuntimeError(f"{ticker}: chart history file missing")
        result[ticker] = json.loads(path.read_text(encoding="utf-8"))
    return result


def main() -> None:
    canonical = json.loads(CANONICAL.read_text(encoding="utf-8"))
    outcomes = json.loads(OUTCOMES.read_text(encoding="utf-8"))
    chart = load_chart_series()

    metadata = canonical["metadata"]
    series = canonical["series"]
    outcome_series = outcomes["series"]

    require(metadata["schemaVersion"] == 2, "Canonical schema version must be 2")
    require(metadata["benchmark"] == "SPY", "Canonical benchmark must be SPY")
    require(metadata["frequency"] == "daily-completed-market-sessions", "Canonical frequency must be daily")
    require(metadata["featurePolicy"] == "point-in-time price-derived inputs only; no valuation or future labels", "Canonical feature policy mismatch")
    require(set(series) == EXPECTED_TICKERS, "Canonical ticker universe mismatch")
    require(set(outcome_series) == EXPECTED_TICKERS, "Outcome ticker universe mismatch")
    require(set(chart) == EXPECTED_TICKERS, "Chart ticker universe mismatch")

    latest = dt.date.fromisoformat(metadata["latestCompletedSession"])
    today = dt.datetime.now(dt.timezone.utc).date()
    require(0 <= (today - latest).days <= 5, "Canonical latest completed session is stale")

    total_states = 0
    total_labels = 0

    for ticker in sorted(EXPECTED_TICKERS):
        rows = series[ticker]
        labels = outcome_series[ticker]
        require(rows, f"{ticker}: missing canonical states")
        require(labels, f"{ticker}: missing outcome labels")
        total_states += len(rows)
        total_labels += len(labels)

        dates = [row["date"] for row in rows]
        require(dates == sorted(dates), f"{ticker}: canonical rows not chronological")
        require(len(dates) == len(set(dates)), f"{ticker}: duplicate canonical dates")
        require(dates[-1] == metadata["latestCompletedSession"], f"{ticker}: latest state differs from canonical session")
        require(all("outcomes" not in row for row in rows), f"{ticker}: future outcomes leaked into canonical states")

        expected_min = 2200 if ticker != "KMLM" else 900
        require(len(rows) >= expected_min, f"{ticker}: insufficient canonical history ({len(rows)} rows)")

        coverage = metadata["coverage"][ticker]
        require(coverage["observations"] == len(rows), f"{ticker}: coverage count mismatch")
        require(coverage["firstObservation"] == rows[0]["date"], f"{ticker}: coverage first date mismatch")
        require(coverage["lastObservation"] == rows[-1]["date"], f"{ticker}: coverage last date mismatch")

        state_dates = set(dates)
        for row in rows:
            features = row["features"]
            require(set(features) == REQUIRED_FEATURES, f"{ticker} {row['date']}: canonical feature schema mismatch")
            require(0 <= features["rsi14w"] <= 100, f"{ticker} {row['date']}: invalid RSI")
            require(0 <= features["relativeRsi14w"] <= 100, f"{ticker} {row['date']}: invalid relative RSI")
            require(features["trend200d"] in {"bullish","neutral","bearish"}, f"{ticker}: invalid 200D trend state")
            require(isinstance(features["goldenCross"], bool), f"{ticker}: goldenCross must be boolean")
            require(-100 <= features["drawdown52wPct"] <= 0.05, f"{ticker}: invalid 52W drawdown")
            require(features["recoveryFrom52wLowPct"] >= -0.01, f"{ticker}: invalid recovery from 52W low")
            for key, value in features.items():
                if key in {"goldenCross","trend200d","daysSinceGoldenCross"}:
                    continue
                require(finite_or_none(value), f"{ticker} {row['date']}: non-finite feature {key}")

        label_dates = [row["date"] for row in labels]
        require(label_dates == sorted(label_dates), f"{ticker}: outcome labels not chronological")
        require(len(label_dates) == len(set(label_dates)), f"{ticker}: duplicate outcome dates")
        require(all(date in state_dates for date in label_dates), f"{ticker}: outcome date absent from canonical history")

        seen_weeks: set[tuple[int, int]] = set()
        mature_cutoff = latest - dt.timedelta(days=220)
        for row in labels:
            day = dt.date.fromisoformat(row["date"])
            iso = day.isocalendar()
            week_key = (iso.year, iso.week)
            require(week_key not in seen_weeks, f"{ticker}: multiple outcome rows in one ISO week")
            seen_weeks.add(week_key)
            values = row["outcomes"]
            require(set(values) == REQUIRED_OUTCOMES, f"{ticker} {row['date']}: outcome schema mismatch")
            for key, value in values.items():
                require(finite_or_none(value), f"{ticker} {row['date']}: non-finite outcome {key}")
            if day <= mature_cutoff:
                require(values["forwardRel6mPct"] is not None, f"{ticker} {row['date']}: mature 6M label missing")

        chart_rows = chart[ticker]
        require(chart_rows, f"{ticker}: missing chart series")
        require(chart_rows[-1]["date"] == rows[-1]["date"], f"{ticker}: chart latest point not sourced from canonical latest state")
        require(all(point["date"] in state_dates for point in chart_rows), f"{ticker}: chart contains date outside canonical history")

    print(
        f"Canonical history integrity OK: {total_states} daily point-in-time states "
        f"across {len(EXPECTED_TICKERS)} ETFs"
    )
    print(
        f"Research outcome integrity OK: {total_labels} completed-week label rows; "
        "future labels are physically separate from canonical inputs"
    )


if __name__ == "__main__":
    main()
