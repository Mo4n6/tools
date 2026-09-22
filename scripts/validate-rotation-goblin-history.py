#!/usr/bin/env python3
"""Validate Rotation Goblin's 10-year historical technical research dataset."""

from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src/features/rotation-goblin/research/technical-history-10y.json"

EXPECTED_TICKERS = {
    "XLE","XLF","XLB","XLU","XLV","XLI","XLK","SMH","IWM","IYR",
    "EFA","EEM","GLD","TLT","PDBC","KMLM","UUP",
}
REQUIRED_FEATURES = {
    "close","rsi14w","rsi14wDelta4w","relativeRsi14w","relativeRsi14wDelta4w",
    "rel1mPct","rel3mPct","rel6mPct","rel12mPct","priceVs200dPct",
    "sma200Slope20dPct","sma50Vs200Pct","goldenCross","daysSinceGoldenCross",
    "drawdown52wPct","recoveryFrom52wLowPct","trend200d",
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


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    metadata = payload["metadata"]
    series = payload["series"]

    require(metadata["benchmark"] == "SPY", "Benchmark must be SPY")
    require(metadata["targetYears"] == 10, "Backfill target must remain 10 years")
    require(metadata["featurePolicy"] == "point-in-time only; no valuation inputs", "Unexpected feature policy")
    require(set(series) == EXPECTED_TICKERS, "Historical ticker universe mismatch")

    latest = dt.date.fromisoformat(metadata["latestCompletedSession"])
    today = dt.datetime.now(dt.timezone.utc).date()
    require(0 <= (today - latest).days <= 5, "Historical dataset latest session is stale")

    coverage = metadata["coverage"]
    total = 0
    for ticker in sorted(EXPECTED_TICKERS):
        rows = series[ticker]
        require(rows, f"{ticker}: no rows")
        total += len(rows)

        dates = [row["date"] for row in rows]
        require(dates == sorted(dates), f"{ticker}: rows not chronological")
        require(len(dates) == len(set(dates)), f"{ticker}: duplicate dates")
        require(coverage[ticker]["observations"] == len(rows), f"{ticker}: coverage count mismatch")
        require(coverage[ticker]["firstObservation"] == rows[0]["date"], f"{ticker}: first coverage date mismatch")
        require(coverage[ticker]["lastObservation"] == rows[-1]["date"], f"{ticker}: last coverage date mismatch")

        # Most ETFs predate the target window. KMLM is younger and should
        # simply use all available history after enough warmup.
        if ticker != "KMLM":
            require(len(rows) >= 450, f"{ticker}: unexpectedly short 10-year backfill ({len(rows)} rows)")
        else:
            require(len(rows) >= 250, f"KMLM: unexpectedly short available-history backfill ({len(rows)} rows)")

        for row in rows:
            features = row["features"]
            outcomes = row["outcomes"]
            require(set(features) == REQUIRED_FEATURES, f"{ticker} {row['date']}: feature schema mismatch")
            require(set(outcomes) == REQUIRED_OUTCOMES, f"{ticker} {row['date']}: outcome schema mismatch")
            require(0 <= features["rsi14w"] <= 100, f"{ticker} {row['date']}: invalid RSI")
            require(0 <= features["relativeRsi14w"] <= 100, f"{ticker} {row['date']}: invalid relative RSI")
            require(features["trend200d"] in {"bullish","neutral","bearish"}, f"{ticker}: invalid trend state")
            require(isinstance(features["goldenCross"], bool), f"{ticker}: goldenCross must be boolean")

            for key, value in features.items():
                if key in {"goldenCross","trend200d","daysSinceGoldenCross"}:
                    continue
                require(finite_or_none(value), f"{ticker} {row['date']}: non-finite feature {key}")

            for key, value in outcomes.items():
                require(finite_or_none(value), f"{ticker} {row['date']}: non-finite outcome {key}")

            if features["daysSinceGoldenCross"] is not None:
                require(features["goldenCross"], f"{ticker} {row['date']}: daysSinceGoldenCross set while cross is false")
                require(features["daysSinceGoldenCross"] >= 1, f"{ticker}: invalid daysSinceGoldenCross")

        mature_cutoff = latest - dt.timedelta(days=220)
        mature = [row for row in rows if dt.date.fromisoformat(row["date"]) <= mature_cutoff]
        require(mature, f"{ticker}: no mature observations")
        for row in mature:
            require(row["outcomes"]["forwardRel6mPct"] is not None, f"{ticker} {row['date']}: missing mature 6M label")

    print(f"Historical backfill integrity OK: {total} weekly point-in-time observations across {len(EXPECTED_TICKERS)} ETFs")
    for ticker in sorted(EXPECTED_TICKERS):
        info = coverage[ticker]
        print(f"{ticker}: {info['observations']} rows, {info['firstObservation']} -> {info['lastObservation']} ({info['yearsApprox']}y)")


if __name__ == "__main__":
    main()
