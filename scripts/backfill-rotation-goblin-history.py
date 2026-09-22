#!/usr/bin/env python3
"""Build Rotation Goblin's canonical 10-year technical history.

Architecture:
- canonical technical-state history: daily point-in-time features only
- research outcomes: completed-week forward labels only
- compact chart history: derived browser view of canonical history

Valuation is intentionally excluded from all historical technical features.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from rotation_goblin_core import (
    FEATURE_SCHEMA_VERSION,
    build_daily_states,
    completed_week_dates,
    forward_return,
    max_path_drawdown,
    max_path_upside,
    rounded,
)

ROOT = Path(__file__).resolve().parents[1]
CANONICAL_OUT = ROOT / "src/features/rotation-goblin/technical-state-history.json"
OUTCOMES_OUT = ROOT / "src/features/rotation-goblin/research/technical-outcomes-10y.json"
CHART_OUT = ROOT / "src/features/rotation-goblin/chartHistory.generated.ts"

TICKERS = [
    "XLE", "XLF", "XLB", "XLU", "XLV", "XLI", "XLK", "SMH", "IWM",
    "IYR", "EFA", "EEM", "GLD", "TLT", "PDBC", "KMLM", "UUP",
]
BENCHMARK = "SPY"
ALL_TICKERS = [BENCHMARK, *TICKERS]

USER_AGENT = "RotationGoblin/1.0 (+https://github.com/Mo4n6/tools)"
TARGET_YEARS = 10
WARMUP_DAYS = 500
MIN_DAILY_ROWS = 260
LATEST_CROSSCHECK_TOLERANCE = 0.015


def http_get(url: str, attempts: int = 3) -> bytes:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=35) as response:
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

    rows = sorted(set(rows))
    if len(rows) < MIN_DAILY_ROWS:
        raise RuntimeError(f"Yahoo returned only {len(rows)} rows for {ticker}")
    return rows


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
    yahoo = remove_incomplete_session(fetch_yahoo(ticker, start, end), now_utc)
    provider = "Yahoo adjusted close"

    try:
        stooq = remove_incomplete_session(fetch_stooq(ticker, start, end), now_utc)
        yahoo_map = dict(yahoo)
        stooq_map = dict(stooq)
        common = sorted(set(yahoo_map) & set(stooq_map))
        if common:
            day = common[-1]
            y = yahoo_map[day]
            s = stooq_map[day]
            difference = abs(y - s) / max(abs(y), 1e-9)
            if difference > LATEST_CROSSCHECK_TOLERANCE:
                raise RuntimeError(
                    f"{ticker}: Yahoo/Stooq latest common close differs by {difference:.2%} "
                    f"on {day}: Yahoo={y:.4f}, Stooq={s:.4f}"
                )
            provider += " + Stooq latest-close cross-check"
    except Exception as exc:  # noqa: BLE001
        provider += f" (Stooq unavailable: {type(exc).__name__})"

    return yahoo, provider


def aligned_arrays(
    rows: list[tuple[dt.date, float]],
    spy_rows: list[tuple[dt.date, float]],
) -> tuple[list[dt.date], list[float], list[float]]:
    spy_map = dict(spy_rows)
    aligned = [(day, close, spy_map[day]) for day, close in rows if day in spy_map and spy_map[day] > 0]
    return (
        [day for day, _close, _spy in aligned],
        [close for _day, close, _spy in aligned],
        [close / spy for _day, close, spy in aligned],
    )


def build_weekly_outcomes(
    ticker: str,
    states: list[dict[str, Any]],
    rows: list[tuple[dt.date, float]],
    spy_rows: list[tuple[dt.date, float]],
    now_utc: dt.datetime,
) -> list[dict[str, Any]]:
    dates, closes, ratios = aligned_arrays(rows, spy_rows)
    index_by_date = {day.isoformat(): index for index, day in enumerate(dates)}
    completed_dates = completed_week_dates(states, now_utc)

    outcomes: list[dict[str, Any]] = []
    for date_text in completed_dates:
        index = index_by_date.get(date_text)
        if index is None:
            continue
        outcomes.append({
            "date": date_text,
            "outcomes": {
                "forwardAbs1mPct": rounded(forward_return(closes, index, 21), 2),
                "forwardAbs3mPct": rounded(forward_return(closes, index, 63), 2),
                "forwardAbs6mPct": rounded(forward_return(closes, index, 126), 2),
                "forwardRel1mPct": rounded(forward_return(ratios, index, 21), 2),
                "forwardRel3mPct": rounded(forward_return(ratios, index, 63), 2),
                "forwardRel6mPct": rounded(forward_return(ratios, index, 126), 2),
                "maxDrawdown3mPct": rounded(max_path_drawdown(closes, index, 63), 2),
                "maxDrawdown6mPct": rounded(max_path_drawdown(closes, index, 126), 2),
                "maxUpside3mPct": rounded(max_path_upside(closes, index, 63), 2),
                "maxUpside6mPct": rounded(max_path_upside(closes, index, 126), 2),
            },
        })

    if not outcomes:
        raise RuntimeError(f"{ticker}: no completed-week outcomes")
    return outcomes


def chart_series_from_canonical(
    canonical_series: dict[str, list[dict[str, Any]]],
    now_utc: dt.datetime,
) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}

    for ticker, states in canonical_series.items():
        completed_dates = set(completed_week_dates(states, now_utc))
        selected = [
            row for row in states
            if row["date"] in completed_dates
        ]

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
    chart_ts = """export type HistoricalChartPoint = {
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
        "benchmark": BENCHMARK,
    }
    chart_ts += "export const chartHistoryMeta = " + json.dumps(meta, indent=2) + " as const;\n\n"
    chart_ts += "export const historicalChartSeries: Record<string, HistoricalChartPoint[]> = " + json.dumps(series, separators=(",", ":")) + ";\n"
    CHART_OUT.write_text(chart_ts, encoding="utf-8")


def main() -> None:
    now_utc = dt.datetime.now(dt.timezone.utc)
    today = now_utc.date()
    target_start = today - dt.timedelta(days=round(TARGET_YEARS * 365.2425))
    fetch_start = target_start - dt.timedelta(days=WARMUP_DAYS)

    all_rows: dict[str, list[tuple[dt.date, float]]] = {}
    providers: dict[str, str] = {}
    for ticker in ALL_TICKERS:
        rows, provider = fetch_history(ticker, fetch_start, today, now_utc)
        all_rows[ticker] = rows
        providers[ticker] = provider
        print(f"{ticker}: {len(rows)} daily rows; {rows[0][0]} -> {rows[-1][0]} via {provider}")

    latest_sessions = {rows[-1][0] for rows in all_rows.values()}
    if len(latest_sessions) != 1:
        raise RuntimeError(f"Ticker session mismatch: {sorted(str(x) for x in latest_sessions)}")
    latest_session = next(iter(latest_sessions))
    generated_at = now_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z")

    canonical_series: dict[str, list[dict[str, Any]]] = {}
    coverage: dict[str, dict[str, Any]] = {}
    outcomes_series: dict[str, list[dict[str, Any]]] = {}
    spy_rows = all_rows[BENCHMARK]

    for ticker in TICKERS:
        states = build_daily_states(ticker, all_rows[ticker], spy_rows, target_start)
        if not states:
            raise RuntimeError(f"{ticker}: no canonical states")
        canonical_series[ticker] = states
        coverage[ticker] = {
            "firstObservation": states[0]["date"],
            "lastObservation": states[-1]["date"],
            "observations": len(states),
            "yearsApprox": round(
                (dt.date.fromisoformat(states[-1]["date"]) - dt.date.fromisoformat(states[0]["date"])).days / 365.2425,
                2,
            ),
        }
        outcomes_series[ticker] = build_weekly_outcomes(
            ticker,
            states,
            all_rows[ticker],
            spy_rows,
            now_utc,
        )
        print(
            f"{ticker}: {len(states)} daily canonical states; "
            f"{len(outcomes_series[ticker])} completed-week outcome labels"
        )

    canonical = {
        "metadata": {
            "schemaVersion": FEATURE_SCHEMA_VERSION,
            "generatedAt": generated_at,
            "benchmark": BENCHMARK,
            "targetYears": TARGET_YEARS,
            "targetStart": target_start.isoformat(),
            "latestCompletedSession": latest_session.isoformat(),
            "frequency": "daily-completed-market-sessions",
            "priceBasis": "Yahoo adjusted close",
            "crossCheck": "Stooq latest common close when available; 1.5% tolerance",
            "featurePolicy": "point-in-time price-derived inputs only; no valuation or future labels",
            "coverage": coverage,
            "providers": providers,
        },
        "series": canonical_series,
    }

    outcomes = {
        "metadata": {
            "schemaVersion": 1,
            "generatedAt": generated_at,
            "benchmark": BENCHMARK,
            "frequency": "completed-week-samples",
            "sourceCanonicalSchemaVersion": FEATURE_SCHEMA_VERSION,
            "labelPolicy": "future outcomes only; never valid as Decision Engine inputs",
        },
        "series": outcomes_series,
    }

    CANONICAL_OUT.parent.mkdir(parents=True, exist_ok=True)
    OUTCOMES_OUT.parent.mkdir(parents=True, exist_ok=True)
    CANONICAL_OUT.write_text(json.dumps(canonical, separators=(",", ":")) + "\n", encoding="utf-8")
    OUTCOMES_OUT.write_text(json.dumps(outcomes, separators=(",", ":")) + "\n", encoding="utf-8")

    chart_series = chart_series_from_canonical(canonical_series, now_utc)
    write_chart_module(chart_series, generated_at, latest_session.isoformat())

    print(f"Wrote {CANONICAL_OUT.relative_to(ROOT)} ({CANONICAL_OUT.stat().st_size / 1024 / 1024:.1f} MiB)")
    print(f"Wrote {OUTCOMES_OUT.relative_to(ROOT)} ({OUTCOMES_OUT.stat().st_size / 1024 / 1024:.1f} MiB)")
    print(f"Wrote {CHART_OUT.relative_to(ROOT)} ({CHART_OUT.stat().st_size / 1024:.1f} KiB)")


if __name__ == "__main__":
    main()
