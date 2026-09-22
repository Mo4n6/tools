#!/usr/bin/env python3
"""Refresh Rotation Goblin live technical data and canonical history.

The 10-year canonical technical-state history is the source of truth. This
workflow recalculates recent point-in-time states from price history, upserts
those states into the canonical store, and derives the live TypeScript data
and compact chart series from the same calculations.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
import math
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from rotation_goblin_core import (
    FEATURE_SCHEMA_VERSION,
    build_daily_states,
    completed_week_dates,
    trend_from_delta,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/features/rotation-goblin/marketData.generated.ts"
CANONICAL = ROOT / "src/features/rotation-goblin/technical-state-history.json"
CHART_OUT = ROOT / "src/features/rotation-goblin/chartHistory.generated.ts"

TICKERS = [
    "SPY", "XLE", "XLF", "XLB", "XLU", "XLV", "XLI", "XLK", "SMH", "IWM",
    "IYR", "EFA", "EEM", "GLD", "TLT", "PDBC", "KMLM", "UUP",
]
ETF_TICKERS = [ticker for ticker in TICKERS if ticker != "SPY"]

USER_AGENT = "RotationGoblin/1.0 (+https://github.com/Mo4n6/tools)"
LOOKBACK_DAYS = 1200
RECENT_RECALC_DAYS = 140
CANONICAL_YEARS = 10
ALLOW_PARTIAL = os.environ.get("RG_ALLOW_PARTIAL_CANONICAL") == "1"


def http_get(url: str, attempts: int = 3) -> bytes:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as response:
                return response.read()
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Unable to fetch {url}: {last_error}")


def fetch_yahoo(ticker: str, start: dt.date, end: dt.date) -> list[tuple[dt.date, float]]:
    period1 = int(dt.datetime.combine(start, dt.time.min, tzinfo=dt.timezone.utc).timestamp())
    period2 = int(dt.datetime.combine(end + dt.timedelta(days=1), dt.time.min, tzinfo=dt.timezone.utc).timestamp())
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}?"
        + urllib.parse.urlencode({
            "period1": period1,
            "period2": period2,
            "interval": "1d",
            "events": "history",
            "includeAdjustedClose": "true",
        })
    )
    payload = json.loads(http_get(url).decode("utf-8"))
    result = payload["chart"]["result"][0]
    timestamps = result.get("timestamp") or []
    indicators = result.get("indicators") or {}
    adjclose_groups = indicators.get("adjclose") or []
    quote_groups = indicators.get("quote") or []
    closes = (
        (adjclose_groups[0].get("adjclose") if adjclose_groups else None)
        or (quote_groups[0].get("close") if quote_groups else None)
        or []
    )

    rows: list[tuple[dt.date, float]] = []
    for stamp, close in zip(timestamps, closes):
        if close is None:
            continue
        value = float(close)
        if not math.isfinite(value) or value <= 0:
            continue
        day = dt.datetime.fromtimestamp(int(stamp), tz=dt.timezone.utc).date()
        rows.append((day, value))

    if len(rows) < 260:
        raise RuntimeError(f"Yahoo returned only {len(rows)} rows for {ticker}")
    return sorted(rows)


def fetch_stooq(ticker: str, start: dt.date, end: dt.date) -> list[tuple[dt.date, float]]:
    url = (
        "https://stooq.com/q/d/l/?"
        + urllib.parse.urlencode({
            "s": f"{ticker.lower()}.us",
            "d1": start.strftime("%Y%m%d"),
            "d2": end.strftime("%Y%m%d"),
            "i": "d",
        })
    )
    raw = http_get(url).decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    rows: list[tuple[dt.date, float]] = []
    for row in reader:
        try:
            day = dt.date.fromisoformat(row["Date"])
            close = float(row["Close"])
        except (KeyError, TypeError, ValueError):
            continue
        if math.isfinite(close) and close > 0:
            rows.append((day, close))

    if len(rows) < 260:
        raise RuntimeError(f"Stooq returned only {len(rows)} rows for {ticker}")
    return sorted(rows)


def remove_incomplete_session(
    rows: list[tuple[dt.date, float]],
    now_utc: dt.datetime,
) -> list[tuple[dt.date, float]]:
    if rows and rows[-1][0] == now_utc.date() and now_utc.hour < 22:
        return rows[:-1]
    return rows


def fetch_history(
    ticker: str,
    start: dt.date,
    end: dt.date,
    now_utc: dt.datetime,
) -> tuple[list[tuple[dt.date, float]], str]:
    yahoo_rows: list[tuple[dt.date, float]] | None = None
    stooq_rows: list[tuple[dt.date, float]] | None = None
    errors: list[str] = []

    try:
        yahoo_rows = remove_incomplete_session(fetch_yahoo(ticker, start, end), now_utc)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Yahoo: {exc}")

    try:
        stooq_rows = remove_incomplete_session(fetch_stooq(ticker, start, end), now_utc)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Stooq: {exc}")

    if yahoo_rows is not None:
        provider = "Yahoo primary"
        if stooq_rows is not None:
            yahoo_map = dict(yahoo_rows)
            stooq_map = dict(stooq_rows)
            common_dates = sorted(set(yahoo_map) & set(stooq_map))
            if common_dates:
                day = common_dates[-1]
                y = yahoo_map[day]
                s = stooq_map[day]
                difference = abs(y - s) / max(abs(y), 1e-9)
                if difference > 0.015:
                    raise RuntimeError(
                        f"{ticker}: Yahoo/Stooq latest-close cross-check failed on {day}: "
                        f"Yahoo={y:.4f}, Stooq={s:.4f}, diff={difference:.2%}"
                    )
                provider = "Yahoo primary + Stooq cross-check"
        return yahoo_rows, provider

    if stooq_rows is not None:
        return stooq_rows, "Stooq fallback"

    raise RuntimeError(f"All providers failed for {ticker}: {' | '.join(errors)}")


def load_canonical() -> dict[str, Any]:
    if not CANONICAL.exists():
        if ALLOW_PARTIAL:
            return {
                "metadata": {
                    "schemaVersion": FEATURE_SCHEMA_VERSION,
                    "benchmark": "SPY",
                    "targetYears": CANONICAL_YEARS,
                    "frequency": "daily-completed-market-sessions",
                    "featurePolicy": "point-in-time price-derived inputs only; no valuation or future labels",
                    "coverage": {},
                    "providers": {},
                },
                "series": {ticker: [] for ticker in ETF_TICKERS},
            }
        raise RuntimeError(
            "Canonical technical history is missing. Run the historical backfill before the live refresh."
        )

    payload = json.loads(CANONICAL.read_text(encoding="utf-8"))
    if payload.get("metadata", {}).get("schemaVersion") != FEATURE_SCHEMA_VERSION:
        raise RuntimeError("Canonical technical history schema version mismatch")
    return payload


def merge_recent_states(
    existing: list[dict[str, Any]],
    recent: list[dict[str, Any]],
    cutoff: dt.date,
) -> list[dict[str, Any]]:
    merged = {
        row["date"]: row
        for row in existing
        if dt.date.fromisoformat(row["date"]) >= cutoff
    }
    for row in recent:
        merged[row["date"]] = row
    return [merged[key] for key in sorted(merged)]


def chart_series_from_canonical(
    canonical_series: dict[str, list[dict[str, Any]]],
    now_utc: dt.datetime,
) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for ticker, states in canonical_series.items():
        completed_dates = set(completed_week_dates(states, now_utc))
        selected = [row for row in states if row["date"] in completed_dates]
        if states and (not selected or selected[-1]["date"] != states[-1]["date"]):
            selected.append(states[-1])
        result[ticker] = [
            {
                "date": row["date"],
                "rsi14w": row["features"]["rsi14w"],
                "relativeRsi14w": row["features"]["relativeRsi14w"],
                "priceVs200dPct": row["features"]["priceVs200dPct"],
                "sma50Vs200Pct": row["features"]["sma50Vs200Pct"],
            }
            for row in selected
        ]
    return result


def write_chart_module(
    series: dict[str, list[dict[str, Any]]],
    generated_at: str,
    latest_session: str,
) -> None:
    header = """export type HistoricalChartPoint = {
  date: string;
  rsi14w: number;
  relativeRsi14w: number;
  priceVs200dPct: number;
  sma50Vs200Pct: number;
};

"""
    meta = {
        "generatedAt": generated_at,
        "latestCanonicalSession": latest_session,
        "frequency": "completed-weeks-plus-latest-daily-session",
        "benchmark": "SPY",
    }
    output = header
    output += "export const chartHistoryMeta = " + json.dumps(meta, indent=2) + " as const;\n\n"
    output += "export const historicalChartSeries: Record<string, HistoricalChartPoint[]> = " + json.dumps(series, separators=(",", ":")) + ";\n"
    CHART_OUT.write_text(output, encoding="utf-8")


def pct_return(values: list[float], sessions: int) -> float:
    if len(values) <= sessions:
        raise RuntimeError("Not enough benchmark history")
    return ((values[-1] / values[-sessions - 1]) - 1.0) * 100.0


def main() -> None:
    now_utc = dt.datetime.now(dt.timezone.utc)
    today = now_utc.date()
    fetch_start = today - dt.timedelta(days=LOOKBACK_DAYS)
    recent_start = today - dt.timedelta(days=RECENT_RECALC_DAYS)
    canonical_cutoff = today - dt.timedelta(days=round(CANONICAL_YEARS * 365.2425))

    all_rows: dict[str, list[tuple[dt.date, float]]] = {}
    providers: dict[str, str] = {}
    for ticker in TICKERS:
        rows, provider = fetch_history(ticker, fetch_start, today, now_utc)
        if len(rows) < 260:
            raise RuntimeError(f"{ticker}: insufficient completed daily sessions")
        all_rows[ticker] = rows
        providers[ticker] = provider
        print(f"{ticker}: {len(rows)} completed rows via {provider}; latest={rows[-1][0]}")

    latest_sessions = {rows[-1][0] for rows in all_rows.values()}
    if len(latest_sessions) != 1:
        raise RuntimeError(f"Ticker session mismatch: {sorted(str(x) for x in latest_sessions)}")
    latest_session = next(iter(latest_sessions))
    generated_at = now_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z")

    canonical = load_canonical()
    series = canonical.setdefault("series", {})
    spy_daily = all_rows["SPY"]
    technical_rows: list[dict[str, Any]] = []

    for ticker in ETF_TICKERS:
        recent_states = build_daily_states(
            ticker,
            all_rows[ticker],
            spy_daily,
            recent_start,
        )
        if not recent_states:
            raise RuntimeError(f"{ticker}: no recent point-in-time states")

        existing = series.get(ticker, [])
        merged = merge_recent_states(existing, recent_states, canonical_cutoff)
        series[ticker] = merged
        latest = merged[-1]
        features = latest["features"]

        technical_rows.append({
            "ticker": ticker,
            "price": features["close"],
            "asOf": latest["date"],
            "rsi14w": features["rsi14w"],
            "rsiTrend": trend_from_delta(features["rsi14wDelta4w"]),
            "relativeRsi": features["relativeRsi14w"],
            "relativeTrend": trend_from_delta(features["relativeRsi14wDelta4w"]),
            "ret3m": features["return3mPct"],
            "rel1m": features["rel1mPct"],
            "rel3m": features["rel3mPct"],
            "rel6m": features["rel6mPct"],
            "rel12m": features["rel12mPct"],
            "drawdown52w": features["drawdown52wPct"],
            "above200d": features["priceVs200dPct"] >= 0,
        })

    coverage: dict[str, dict[str, Any]] = {}
    for ticker in ETF_TICKERS:
        rows = series.get(ticker, [])
        if not rows:
            raise RuntimeError(f"{ticker}: canonical series is empty after merge")
        coverage[ticker] = {
            "firstObservation": rows[0]["date"],
            "lastObservation": rows[-1]["date"],
            "observations": len(rows),
            "yearsApprox": round(
                (dt.date.fromisoformat(rows[-1]["date"]) - dt.date.fromisoformat(rows[0]["date"])).days / 365.2425,
                2,
            ),
        }

    canonical["metadata"] = {
        "schemaVersion": FEATURE_SCHEMA_VERSION,
        "generatedAt": generated_at,
        "benchmark": "SPY",
        "targetYears": CANONICAL_YEARS,
        "targetStart": canonical_cutoff.isoformat(),
        "latestCompletedSession": latest_session.isoformat(),
        "frequency": "daily-completed-market-sessions",
        "priceBasis": "Yahoo adjusted close",
        "crossCheck": "Stooq latest common close when available; 1.5% tolerance",
        "featurePolicy": "point-in-time price-derived inputs only; no valuation or future labels",
        "coverage": coverage,
        "providers": providers,
    }
    CANONICAL.write_text(json.dumps(canonical, separators=(",", ":")) + "\n", encoding="utf-8")

    spy_closes = [close for _day, close in spy_daily]
    spy_current = spy_closes[-1]
    spy_sma200 = sum(spy_closes[-200:]) / 200.0
    benchmark = {
        "ticker": "SPY",
        "price": round(spy_current, 4),
        "asOf": latest_session.isoformat(),
        "ret3m": round(pct_return(spy_closes, 63), 2),
        "ret12m": round(pct_return(spy_closes, 252), 2),
        "above200d": spy_current >= spy_sma200,
    }

    provider_label = " + ".join(sorted(set(providers.values())))
    type_header = """export type GeneratedTrend = 'up' | 'flat' | 'down';

export type GeneratedTechnicalRow = {
  ticker: string;
  price: number | null;
  asOf: string;
  rsi14w: number;
  rsiTrend: GeneratedTrend;
  relativeRsi: number;
  relativeTrend: GeneratedTrend;
  ret3m: number;
  rel1m: number;
  rel3m: number;
  rel6m: number;
  rel12m: number;
  drawdown52w: number;
  above200d: boolean;
};

"""
    meta = {
        "source": provider_label,
        "generatedAt": generated_at,
        "benchmark": "SPY",
        "live": True,
        "canonicalHistory": "technical-state-history.json",
        "note": "Live technicals and chart history are derived from the same canonical point-in-time technical-state store.",
    }

    output = type_header
    output += "export const marketDataMeta = " + json.dumps(meta, indent=2) + " as const;\n\n"
    output += "export const benchmarkSnapshot = " + json.dumps(benchmark, indent=2) + " as const;\n\n"
    output += "export const technicalRows: GeneratedTechnicalRow[] = " + json.dumps(technical_rows, indent=2) + ";\n"
    OUT.write_text(output, encoding="utf-8")

    chart_series = chart_series_from_canonical(series, now_utc)
    write_chart_module(chart_series, generated_at, latest_session.isoformat())

    print(f"Wrote {CANONICAL.relative_to(ROOT)}")
    print(f"Wrote {OUT.relative_to(ROOT)}")
    print(f"Wrote {CHART_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
