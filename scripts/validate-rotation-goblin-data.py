#!/usr/bin/env python3
"""Fail CI if Rotation Goblin generated data is stale, malformed, or implausible."""

from __future__ import annotations

import datetime as dt
import json
import math
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TECH = ROOT / "src/features/rotation-goblin/marketData.generated.ts"
VALUATION = ROOT / "src/features/rotation-goblin/valuationData.generated.ts"
ROTATION_HISTORY = ROOT / "src/features/rotation-goblin/rotation-history.json"
VALUATION_HISTORY = ROOT / "src/features/rotation-goblin/valuation-history.json"

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
        benchmark = row.get("benchmarkMultiple")
        pb = row.get("priceToBook")
        benchmark_pb = row.get("benchmarkPriceToBook")
        score = row.get("valueScore")

        require(finite(primary) and 3 <= primary <= 150, f"{ticker}: implausible primary multiple {primary}")
        require(finite(benchmark) and 3 <= benchmark <= 100, f"{ticker}: implausible benchmark multiple {benchmark}")
        require(finite(pb) and 0.2 <= pb <= 30, f"{ticker}: implausible P/B {pb}")
        require(finite(benchmark_pb) and 0.2 <= benchmark_pb <= 30, f"{ticker}: implausible benchmark P/B {benchmark_pb}")
        require(finite(score) and 0 <= score <= 100, f"{ticker}: invalid value score {score}")

        if row.get("primaryMetric") == "Forward P/E (FY1)":
            require(primary >= 5 and benchmark >= 5, f"{ticker}: forward P/E failed lower-bound guard")

    return rows


def validate_histories(technical_rows: list[dict[str, Any]], valuation_rows: list[dict[str, Any]]) -> None:
    rotation_history = json.loads(ROTATION_HISTORY.read_text(encoding="utf-8"))
    valuation_history = json.loads(VALUATION_HISTORY.read_text(encoding="utf-8"))

    tech_by_ticker = {row["ticker"]: row for row in technical_rows}
    for ticker in EXPECTED_TECH:
        entries = rotation_history.get(ticker) or []
        require(entries, f"{ticker}: missing rotation history")
        require(entries[-1]["date"] == tech_by_ticker[ticker]["asOf"], f"{ticker}: rotation history does not match latest completed session")
        require(0 <= int(entries[-1]["value"]) <= 100, f"{ticker}: invalid rotation history score")

    for row in valuation_rows:
        ticker = row["ticker"]
        if row["status"] != "automated":
            continue
        entries = valuation_history.get(ticker) or []
        require(entries, f"{ticker}: missing valuation history")
        require(entries[-1]["date"] == row["asOf"], f"{ticker}: valuation history date mismatch")
        require(abs(float(entries[-1]["crossScore"]) - float(row["crossSectionScore"])) <= 0.11, f"{ticker}: valuation history score mismatch")
        require(abs(float(entries[-1]["primaryRelative"]) - float(row["primaryRelative"])) <= 0.001, f"{ticker}: valuation history primary ratio mismatch")
        require(abs(float(entries[-1]["pbRelative"]) - float(row["pbRelative"])) <= 0.001, f"{ticker}: valuation history P/B ratio mismatch")


def main() -> None:
    today = dt.datetime.now(dt.timezone.utc).date()
    technical_rows, benchmark = validate_technicals(today)
    valuation_rows = validate_valuations(today)
    validate_histories(technical_rows, valuation_rows)

    stale = sorted(row["ticker"] for row in valuation_rows if row["status"] == "stale")
    print(f"Data integrity OK: {len(technical_rows)} technical rows, session {benchmark['asOf']}")
    print(f"Valuation integrity OK: {len(EXPECTED_VALUED)} valued ETFs, {len(EXPECTED_NA)} deliberate N/A assets")
    if stale:
        print("WARNING: last-known-good valuation fallback active for: " + ", ".join(stale))


if __name__ == "__main__":
    main()
