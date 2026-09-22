#!/usr/bin/env python3
"""Fail CI if Rotation Goblin live data or canonical history is inconsistent."""

from __future__ import annotations

import datetime as dt
import json
import math
import os
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TECH = ROOT / "src/features/rotation-goblin/marketData.generated.ts"
VALUATION = ROOT / "src/features/rotation-goblin/valuationData.generated.ts"
CANONICAL = ROOT / "src/features/rotation-goblin/technical-state-history.json"
CHART_DIR = ROOT / "public/rotation-goblin/history"
VALUATION_HISTORY = ROOT / "src/features/rotation-goblin/valuation-history.json"

ALLOW_PARTIAL = os.environ.get("RG_ALLOW_PARTIAL_CANONICAL") == "1"

EXPECTED_TECH = {
    "XLE","XLF","XLB","XLU","XLV","XLI","XLK","SMH","IWM","IYR",
    "EFA","EEM","GLD","TLT","PDBC","KMLM","UUP",
}
EXPECTED_VALUED = {"XLE","XLF","XLB","XLU","XLV","XLI","XLK","SMH","IWM","IYR","EFA","EEM"}
EXPECTED_NA = {"GLD","TLT","PDBC","KMLM","UUP"}

MAX_TECH_AGE_DAYS = 5
MAX_STALE_VALUATION_DAYS = 10
MAX_AUTOMATED_VALUATION_SOURCE_AGE_DAYS = 10


def extract_json_assignment(path: Path, name: str) -> Any:
    content = path.read_text(encoding="utf-8")
    match = re.search(
        rf"export const {re.escape(name)}(?:[^=]*)=\s*(\{{.*?\}}|\[.*\])\s*(?:as const)?;",
        content,
        flags=re.DOTALL,
    )
    if not match:
        raise RuntimeError(f"Could not parse {name} from {path}")
    return json.loads(match.group(1))


def finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def date_age(date_text: str, today: dt.date) -> int:
    return (today - dt.date.fromisoformat(date_text)).days


def nearly_equal(left: Any, right: Any, tolerance: float = 0.011) -> bool:
    return finite(left) and finite(right) and abs(float(left) - float(right)) <= tolerance


def validate_technicals(today: dt.date) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows = extract_json_assignment(TECH, "technicalRows")
    benchmark = extract_json_assignment(TECH, "benchmarkSnapshot")
    tickers = {row["ticker"] for row in rows}

    require(tickers == EXPECTED_TECH, f"Technical ticker set mismatch: {sorted(tickers ^ EXPECTED_TECH)}")
    require(len(rows) == len(EXPECTED_TECH), "Duplicate technical ticker rows detected")
    require(finite(benchmark.get("price")) and benchmark["price"] > 0, "SPY benchmark price invalid")
    require(date_age(benchmark["asOf"], today) in range(0, MAX_TECH_AGE_DAYS + 1), "SPY technical data is stale")

    for row in rows:
        ticker = row["ticker"]
        require(row["asOf"] == benchmark["asOf"], f"{ticker}: technical session date differs from SPY")
        require(finite(row.get("price")) and row["price"] > 0, f"{ticker}: invalid price")
        require(finite(row.get("rsi14w")) and 0 <= row["rsi14w"] <= 100, f"{ticker}: invalid RSI")
        require(finite(row.get("relativeRsi")) and 0 <= row["relativeRsi"] <= 100, f"{ticker}: invalid relative RSI")
        require(row.get("rsiTrend") in {"up","flat","down"}, f"{ticker}: invalid RSI trend")
        require(row.get("relativeTrend") in {"up","flat","down"}, f"{ticker}: invalid relative trend")
        require(finite(row.get("drawdown52w")) and -100 <= row["drawdown52w"] <= 0.05, f"{ticker}: invalid 52-week drawdown")
        for field in ("ret3m","rel1m","rel3m","rel6m","rel12m"):
            require(finite(row.get(field)) and -100 <= row[field] <= 300, f"{ticker}: implausible {field}={row.get(field)}")

    return rows, benchmark


def validate_canonical(technical_rows: list[dict[str, Any]], benchmark: dict[str, Any]) -> None:
    require(CANONICAL.exists(), "Canonical technical-state history is missing")
    payload = json.loads(CANONICAL.read_text(encoding="utf-8"))
    metadata = payload.get("metadata", {})
    series = payload.get("series", {})

    require(metadata.get("schemaVersion") == 2, "Canonical schema version mismatch")
    require(metadata.get("benchmark") == "SPY", "Canonical benchmark mismatch")
    require(metadata.get("frequency") == "daily-completed-market-sessions", "Canonical frequency mismatch")
    require(metadata.get("latestCompletedSession") == benchmark["asOf"], "Canonical latest session differs from live benchmark")
    require(set(series) == EXPECTED_TECH, "Canonical ticker universe mismatch")

    by_ticker = {row["ticker"]: row for row in technical_rows}
    for ticker in sorted(EXPECTED_TECH):
        states = series[ticker]
        require(states, f"{ticker}: canonical history empty")
        latest = states[-1]
        features = latest["features"]
        live = by_ticker[ticker]

        require(latest["date"] == live["asOf"], f"{ticker}: canonical latest date differs from live data")
        require("outcomes" not in latest, f"{ticker}: future outcomes leaked into canonical technical state")
        require(nearly_equal(features["close"], live["price"], 0.011), f"{ticker}: canonical/live price mismatch")
        require(nearly_equal(features["rsi14w"], live["rsi14w"], 0.011), f"{ticker}: canonical/live RSI mismatch")
        require(nearly_equal(features["relativeRsi14w"], live["relativeRsi"], 0.011), f"{ticker}: canonical/live relative RSI mismatch")
        require(nearly_equal(features["return3mPct"], live["ret3m"], 0.011), f"{ticker}: canonical/live 3M return mismatch")
        require(nearly_equal(features["rel1mPct"], live["rel1m"], 0.011), f"{ticker}: canonical/live 1M relative return mismatch")
        require(nearly_equal(features["rel3mPct"], live["rel3m"], 0.011), f"{ticker}: canonical/live 3M relative return mismatch")
        require(nearly_equal(features["rel6mPct"], live["rel6m"], 0.011), f"{ticker}: canonical/live 6M relative return mismatch")
        require(nearly_equal(features["rel12mPct"], live["rel12m"], 0.011), f"{ticker}: canonical/live 12M relative return mismatch")
        require(nearly_equal(features["drawdown52wPct"], live["drawdown52w"], 0.011), f"{ticker}: canonical/live drawdown mismatch")
        require((features["priceVs200dPct"] >= 0) == live["above200d"], f"{ticker}: canonical/live 200D regime mismatch")

        dates = [row["date"] for row in states]
        require(dates == sorted(dates), f"{ticker}: canonical dates are not chronological")
        require(len(dates) == len(set(dates)), f"{ticker}: duplicate canonical dates")

        if not ALLOW_PARTIAL:
            expected_min = 2200 if ticker != "KMLM" else 900
            require(len(states) >= expected_min, f"{ticker}: canonical history is not fully seeded ({len(states)} rows)")

    require(CHART_DIR.exists(), "Chart history directory is missing")
    for ticker in EXPECTED_TECH:
        path = CHART_DIR / f"{ticker}.json"
        require(path.exists(), f"{ticker}: chart history file missing")
        points = json.loads(path.read_text(encoding="utf-8"))
        require(points, f"{ticker}: chart history empty")
        require(points[-1]["date"] == benchmark["asOf"], f"{ticker}: chart does not include canonical latest session")
        require(nearly_equal(points[-1]["rsi14w"], by_ticker[ticker]["rsi14w"], 0.011), f"{ticker}: chart/live RSI mismatch")
        require(nearly_equal(points[-1]["relativeRsi14w"], by_ticker[ticker]["relativeRsi"], 0.011), f"{ticker}: chart/live relative RSI mismatch")


def validate_valuations(today: dt.date) -> list[dict[str, Any]]:
    rows = extract_json_assignment(VALUATION, "valuationRows")
    tickers = {row["ticker"] for row in rows}
    require(tickers == EXPECTED_VALUED | EXPECTED_NA, f"Valuation ticker set mismatch: {sorted(tickers ^ (EXPECTED_VALUED | EXPECTED_NA))}")
    require(len(rows) == len(EXPECTED_VALUED | EXPECTED_NA), "Duplicate valuation ticker rows detected")

    for row in rows:
        ticker = row["ticker"]
        status = row.get("status")

        if ticker in EXPECTED_NA:
            require(status == "not_applicable", f"{ticker}: should be valuation not_applicable, got {status}")
            require(row.get("valueScore") is None, f"{ticker}: non-earnings asset should not have valueScore")
            continue

        require(status in {"automated","stale"}, f"{ticker}: valuation unavailable ({status}): {row.get('note')}")
        age = date_age(row["asOf"], today)
        require(age >= 0, f"{ticker}: valuation date is in the future")
        max_age = MAX_AUTOMATED_VALUATION_SOURCE_AGE_DAYS if status == "automated" else MAX_STALE_VALUATION_DAYS
        require(age <= max_age, f"{ticker}: valuation source snapshot too stale ({age} days)")

        primary = row.get("primaryMultiple")
        benchmark_multiple = row.get("benchmarkMultiple")
        pb = row.get("priceToBook")
        benchmark_pb = row.get("benchmarkPriceToBook")
        score = row.get("valueScore")

        require(finite(primary) and 3 <= primary <= 150, f"{ticker}: implausible primary multiple {primary}")
        require(finite(benchmark_multiple) and 3 <= benchmark_multiple <= 100, f"{ticker}: implausible benchmark multiple {benchmark_multiple}")
        require(finite(pb) and 0.2 <= pb <= 30, f"{ticker}: implausible P/B {pb}")
        require(finite(benchmark_pb) and 0.2 <= benchmark_pb <= 30, f"{ticker}: implausible benchmark P/B {benchmark_pb}")
        require(finite(score) and 0 <= score <= 100, f"{ticker}: invalid value score {score}")

    return rows


def validate_valuation_history(valuation_rows: list[dict[str, Any]]) -> None:
    history = json.loads(VALUATION_HISTORY.read_text(encoding="utf-8"))
    for row in valuation_rows:
        if row["status"] != "automated":
            continue
        entries = history.get(row["ticker"]) or []
        require(entries, f"{row['ticker']}: missing valuation history")
        require(entries[-1]["date"] == row["asOf"], f"{row['ticker']}: valuation history date mismatch")
        require(abs(float(entries[-1]["crossScore"]) - float(row["crossSectionScore"])) <= 0.11, f"{row['ticker']}: valuation history score mismatch")


def main() -> None:
    today = dt.datetime.now(dt.timezone.utc).date()
    technical_rows, benchmark = validate_technicals(today)
    validate_canonical(technical_rows, benchmark)
    valuation_rows = validate_valuations(today)
    validate_valuation_history(valuation_rows)

    stale = sorted(row["ticker"] for row in valuation_rows if row["status"] == "stale")
    canonical_mode = "partial CI seed" if ALLOW_PARTIAL else "full 10-year canonical history"
    print(f"Data integrity OK: {len(technical_rows)} technical rows, session {benchmark['asOf']}")
    print(f"Canonical integrity OK: live data and chart derive from {canonical_mode}")
    print(f"Valuation integrity OK: {len(EXPECTED_VALUED)} valued ETFs, {len(EXPECTED_NA)} deliberate N/A assets")
    if stale:
        print("WARNING: last-known-good valuation fallback active for: " + ", ".join(stale))


if __name__ == "__main__":
    main()
