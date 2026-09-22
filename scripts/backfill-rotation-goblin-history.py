#!/usr/bin/env python3
"""Build Rotation Goblin's historical technical research dataset.

The dataset is intentionally price-derived only. No current valuation data is
backfilled into historical observations.

Each feature row is a weekly point-in-time state built using information that
was available on or before that week's final completed trading session.
Forward returns/drawdowns are stored separately under `outcomes` and must
never be used as model inputs.

Target:
- up to 10 years of weekly observations per ETF
- extra warmup history for 200-day / 14-week indicators
- exact recalculation from adjusted daily closes
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

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/features/rotation-goblin/research/technical-history-10y.json"
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


def trim_incomplete_week(
    rows: list[tuple[dt.date, float]],
    now_utc: dt.datetime,
) -> list[tuple[dt.date, float]]:
    """Historical research rows should contain only completed market weeks.

    During Mon-Thu, or before Friday's close, remove the current ISO week.
    The live dashboard appends the current completed daily-session reading
    separately so users still see the latest state without contaminating the
    historical weekly series.
    """
    if not rows:
        return rows
    weekday = now_utc.weekday()  # Mon=0 ... Sun=6
    week_is_complete = weekday >= 5 or (weekday == 4 and now_utc.hour >= 22)
    if week_is_complete:
        return rows

    current_iso = now_utc.date().isocalendar()
    current_key = (current_iso.year, current_iso.week)
    return [
        row for row in rows
        if (row[0].isocalendar().year, row[0].isocalendar().week) != current_key
    ]


def fetch_history(
    ticker: str,
    start: dt.date,
    end: dt.date,
    now_utc: dt.datetime,
) -> tuple[list[tuple[dt.date, float]], str]:
    yahoo = remove_incomplete_session(fetch_yahoo(ticker, start, end), now_utc)
    yahoo = trim_incomplete_week(yahoo, now_utc)
    provider = "Yahoo adjusted close"

    try:
        stooq = remove_incomplete_session(fetch_stooq(ticker, start, end), now_utc)
        stooq = trim_incomplete_week(stooq, now_utc)
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
        # Yahoo is the canonical adjusted-close history. Stooq is only a
        # cross-check; record its unavailability instead of changing history
        # basis mid-series.
        provider += f" (Stooq unavailable: {type(exc).__name__})"

    return yahoo, provider


def weekly_close_indices(rows: list[tuple[dt.date, float]]) -> list[int]:
    latest_by_week: dict[tuple[int, int], int] = {}
    for index, (day, _close) in enumerate(rows):
        iso = day.isocalendar()
        latest_by_week[(iso.year, iso.week)] = index
    return sorted(latest_by_week.values())


def rsi_series(values: list[float], period: int = 14) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    if len(values) <= period:
        return result

    gains: list[float] = []
    losses: list[float] = []
    for index in range(1, period + 1):
        delta = values[index] - values[index - 1]
        gains.append(max(delta, 0.0))
        losses.append(max(-delta, 0.0))

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    def to_rsi(gain: float, loss: float) -> float:
        if loss == 0:
            return 100.0
        rs = gain / loss
        return 100.0 - (100.0 / (1.0 + rs))

    result[period] = to_rsi(avg_gain, avg_loss)
    for index in range(period + 1, len(values)):
        delta = values[index] - values[index - 1]
        gain = max(delta, 0.0)
        loss = max(-delta, 0.0)
        avg_gain = ((avg_gain * (period - 1)) + gain) / period
        avg_loss = ((avg_loss * (period - 1)) + loss) / period
        result[index] = to_rsi(avg_gain, avg_loss)

    return result


def mean(values: list[float]) -> float:
    if not values:
        raise RuntimeError("Cannot average empty sequence")
    return sum(values) / len(values)


def trailing_return(values: list[float], index: int, sessions: int) -> float | None:
    if index < sessions:
        return None
    start = values[index - sessions]
    end = values[index]
    if start <= 0:
        return None
    return ((end / start) - 1.0) * 100.0


def forward_return(values: list[float], index: int, sessions: int) -> float | None:
    end_index = index + sessions
    if end_index >= len(values):
        return None
    start = values[index]
    end = values[end_index]
    if start <= 0:
        return None
    return ((end / start) - 1.0) * 100.0


def max_path_drawdown(values: list[float], start_index: int, sessions: int) -> float | None:
    end_index = start_index + sessions
    if end_index >= len(values):
        return None
    start = values[start_index]
    future = values[start_index + 1:end_index + 1]
    if not future or start <= 0:
        return None
    return (min(future) / start - 1.0) * 100.0


def max_path_upside(values: list[float], start_index: int, sessions: int) -> float | None:
    end_index = start_index + sessions
    if end_index >= len(values):
        return None
    start = values[start_index]
    future = values[start_index + 1:end_index + 1]
    if not future or start <= 0:
        return None
    return (max(future) / start - 1.0) * 100.0


def rounded(value: float | None, digits: int = 3) -> float | None:
    return None if value is None else round(value, digits)


def signed_state(value: float, epsilon: float = 0.05) -> str:
    if value > epsilon:
        return "bullish"
    if value < -epsilon:
        return "bearish"
    return "neutral"


def days_since_positive_cross(spreads: list[float | None], index: int) -> int | None:
    if spreads[index] is None or spreads[index] < 0:
        return None
    for prior in range(index - 1, -1, -1):
        value = spreads[prior]
        if value is None:
            continue
        if value <= 0:
            return index - prior
    return None


def build_ticker_history(
    ticker: str,
    rows: list[tuple[dt.date, float]],
    spy_rows: list[tuple[dt.date, float]],
    target_start: dt.date,
) -> list[dict[str, Any]]:
    spy_map = dict(spy_rows)
    aligned = [(day, close, spy_map[day]) for day, close in rows if day in spy_map and spy_map[day] > 0]
    if len(aligned) < 260:
        raise RuntimeError(f"{ticker}: only {len(aligned)} SPY-aligned daily rows")

    dates = [day for day, _close, _spy in aligned]
    closes = [close for _day, close, _spy in aligned]
    spy_closes = [spy for _day, _close, spy in aligned]
    ratios = [close / spy for close, spy in zip(closes, spy_closes)]

    sma50: list[float | None] = [None] * len(closes)
    sma200: list[float | None] = [None] * len(closes)
    spread50_200: list[float | None] = [None] * len(closes)
    for index in range(len(closes)):
        if index >= 49:
            sma50[index] = mean(closes[index - 49:index + 1])
        if index >= 199:
            sma200[index] = mean(closes[index - 199:index + 1])
        if sma50[index] is not None and sma200[index] is not None:
            spread50_200[index] = (sma50[index] / sma200[index] - 1.0) * 100.0

    weekly_indices = weekly_close_indices([(d, c) for d, c, _s in aligned])
    weekly_closes = [closes[index] for index in weekly_indices]
    weekly_ratios = [ratios[index] for index in weekly_indices]
    weekly_rsi = rsi_series(weekly_closes)
    weekly_relative_rsi = rsi_series(weekly_ratios)

    observations: list[dict[str, Any]] = []
    for weekly_pos, daily_index in enumerate(weekly_indices):
        day = dates[daily_index]
        if day < target_start:
            continue
        if daily_index < 252 or weekly_pos < 18:
            continue

        rsi = weekly_rsi[weekly_pos]
        relative_rsi = weekly_relative_rsi[weekly_pos]
        if rsi is None or relative_rsi is None or sma200[daily_index] is None or sma50[daily_index] is None:
            continue

        high52 = max(closes[daily_index - 251:daily_index + 1])
        low52 = min(closes[daily_index - 251:daily_index + 1])
        current = closes[daily_index]

        rsi_delta4w = None
        relative_rsi_delta4w = None
        if weekly_pos >= 4 and weekly_rsi[weekly_pos - 4] is not None:
            rsi_delta4w = rsi - float(weekly_rsi[weekly_pos - 4])
        if weekly_pos >= 4 and weekly_relative_rsi[weekly_pos - 4] is not None:
            relative_rsi_delta4w = relative_rsi - float(weekly_relative_rsi[weekly_pos - 4])

        sma200_slope20 = None
        if daily_index >= 219 and sma200[daily_index - 20] is not None:
            previous = float(sma200[daily_index - 20])
            sma200_slope20 = (float(sma200[daily_index]) / previous - 1.0) * 100.0

        features = {
            "close": rounded(current, 4),
            "rsi14w": rounded(float(rsi), 2),
            "rsi14wDelta4w": rounded(rsi_delta4w, 2),
            "relativeRsi14w": rounded(float(relative_rsi), 2),
            "relativeRsi14wDelta4w": rounded(relative_rsi_delta4w, 2),
            "rel1mPct": rounded(trailing_return(ratios, daily_index, 21), 2),
            "rel3mPct": rounded(trailing_return(ratios, daily_index, 63), 2),
            "rel6mPct": rounded(trailing_return(ratios, daily_index, 126), 2),
            "rel12mPct": rounded(trailing_return(ratios, daily_index, 252), 2),
            "priceVs200dPct": rounded((current / float(sma200[daily_index]) - 1.0) * 100.0, 2),
            "sma200Slope20dPct": rounded(sma200_slope20, 3),
            "sma50Vs200Pct": rounded(float(spread50_200[daily_index]), 2),
            "goldenCross": bool(float(spread50_200[daily_index]) > 0),
            "daysSinceGoldenCross": days_since_positive_cross(spread50_200, daily_index),
            "drawdown52wPct": rounded((current / high52 - 1.0) * 100.0, 2),
            "recoveryFrom52wLowPct": rounded((current / low52 - 1.0) * 100.0, 2),
            "trend200d": signed_state(float(sma200_slope20 or 0.0)),
        }

        # Labels/outcomes are deliberately separated from features. Recent
        # observations legitimately have null outcomes until enough future
        # sessions exist.
        fwd_abs_1m = forward_return(closes, daily_index, 21)
        fwd_abs_3m = forward_return(closes, daily_index, 63)
        fwd_abs_6m = forward_return(closes, daily_index, 126)
        fwd_rel_1m = forward_return(ratios, daily_index, 21)
        fwd_rel_3m = forward_return(ratios, daily_index, 63)
        fwd_rel_6m = forward_return(ratios, daily_index, 126)

        outcomes = {
            "forwardAbs1mPct": rounded(fwd_abs_1m, 2),
            "forwardAbs3mPct": rounded(fwd_abs_3m, 2),
            "forwardAbs6mPct": rounded(fwd_abs_6m, 2),
            "forwardRel1mPct": rounded(fwd_rel_1m, 2),
            "forwardRel3mPct": rounded(fwd_rel_3m, 2),
            "forwardRel6mPct": rounded(fwd_rel_6m, 2),
            "maxDrawdown3mPct": rounded(max_path_drawdown(closes, daily_index, 63), 2),
            "maxDrawdown6mPct": rounded(max_path_drawdown(closes, daily_index, 126), 2),
            "maxUpside3mPct": rounded(max_path_upside(closes, daily_index, 63), 2),
            "maxUpside6mPct": rounded(max_path_upside(closes, daily_index, 126), 2),
        }

        observations.append({
            "date": day.isoformat(),
            "features": features,
            "outcomes": outcomes,
        })

    return observations


def validate_history_payload(payload: dict[str, Any]) -> None:
    series = payload.get("series")
    if not isinstance(series, dict):
        raise RuntimeError("Historical payload is missing series")

    for ticker in TICKERS:
        observations = series.get(ticker)
        if not isinstance(observations, list) or not observations:
            raise RuntimeError(f"{ticker}: missing historical observations")

        dates = [row["date"] for row in observations]
        if dates != sorted(dates) or len(dates) != len(set(dates)):
            raise RuntimeError(f"{ticker}: observation dates are not unique/sorted")

        for row in observations:
            features = row["features"]
            if row["date"] > payload["metadata"]["latestCompletedSession"]:
                raise RuntimeError(f"{ticker}: observation after latest completed session")
            if not (0 <= features["rsi14w"] <= 100):
                raise RuntimeError(f"{ticker} {row['date']}: invalid RSI")
            if not (0 <= features["relativeRsi14w"] <= 100):
                raise RuntimeError(f"{ticker} {row['date']}: invalid relative RSI")
            if features["drawdown52wPct"] > 0.05 or features["drawdown52wPct"] < -100:
                raise RuntimeError(f"{ticker} {row['date']}: invalid 52-week drawdown")
            if features["sma50Vs200Pct"] > 100 or features["sma50Vs200Pct"] < -100:
                raise RuntimeError(f"{ticker} {row['date']}: implausible MA spread")

        # Old-enough observations must have their 6-month labels populated.
        cutoff = dt.date.fromisoformat(payload["metadata"]["latestCompletedSession"]) - dt.timedelta(days=220)
        for row in observations:
            if dt.date.fromisoformat(row["date"]) <= cutoff:
                if row["outcomes"]["forwardRel6mPct"] is None:
                    raise RuntimeError(f"{ticker} {row['date']}: missing mature 6-month outcome")


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

    series: dict[str, list[dict[str, Any]]] = {}
    coverage: dict[str, dict[str, Any]] = {}
    spy_rows = all_rows[BENCHMARK]

    for ticker in TICKERS:
        observations = build_ticker_history(
            ticker,
            all_rows[ticker],
            spy_rows,
            target_start,
        )
        if not observations:
            raise RuntimeError(f"{ticker}: no backfilled observations")
        series[ticker] = observations
        coverage[ticker] = {
            "firstObservation": observations[0]["date"],
            "lastObservation": observations[-1]["date"],
            "observations": len(observations),
            "yearsApprox": round(
                (dt.date.fromisoformat(observations[-1]["date"]) - dt.date.fromisoformat(observations[0]["date"])).days / 365.2425,
                2,
            ),
        }
        print(
            f"{ticker}: {len(observations)} weekly observations; "
            f"{observations[0]['date']} -> {observations[-1]['date']}"
        )

    payload = {
        "metadata": {
            "schemaVersion": 1,
            "generatedAt": now_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "benchmark": BENCHMARK,
            "targetYears": TARGET_YEARS,
            "targetStart": target_start.isoformat(),
            "latestCompletedSession": latest_session.isoformat(),
            "frequency": "weekly-final-trading-session",
            "priceBasis": "Yahoo adjusted close",
            "crossCheck": "Stooq latest common close when available; 1.5% tolerance",
            "featurePolicy": "point-in-time only; no valuation inputs",
            "outcomePolicy": "forward labels are stored separately and must never be used as model inputs",
            "features": [
                "rsi14w",
                "rsi14wDelta4w",
                "relativeRsi14w",
                "relativeRsi14wDelta4w",
                "rel1mPct",
                "rel3mPct",
                "rel6mPct",
                "rel12mPct",
                "priceVs200dPct",
                "sma200Slope20dPct",
                "sma50Vs200Pct",
                "goldenCross",
                "daysSinceGoldenCross",
                "drawdown52wPct",
                "recoveryFrom52wLowPct",
                "trend200d",
            ],
            "coverage": coverage,
            "providers": providers,
        },
        "series": series,
    }

    validate_history_payload(payload)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")

    chart_series = {
        ticker: [
            {
                "date": row["date"],
                "rsi14w": row["features"]["rsi14w"],
                "relativeRsi14w": row["features"]["relativeRsi14w"],
                "priceVs200dPct": row["features"]["priceVs200dPct"],
                "sma50Vs200Pct": row["features"]["sma50Vs200Pct"],
            }
            for row in rows
        ]
        for ticker, rows in series.items()
    }
    chart_meta = {
        "generatedAt": payload["metadata"]["generatedAt"],
        "latestCompletedWeekSession": payload["metadata"]["latestCompletedSession"],
        "frequency": "weekly-completed-weeks-only",
        "benchmark": BENCHMARK,
    }
    chart_ts = """export type HistoricalChartPoint = {
  date: string;
  rsi14w: number;
  relativeRsi14w: number;
  priceVs200dPct: number;
  sma50Vs200Pct: number;
};

"""
    chart_ts += "export const chartHistoryMeta = " + json.dumps(chart_meta, indent=2) + " as const;\n\n"
    chart_ts += "export const historicalChartSeries: Record<string, HistoricalChartPoint[]> = " + json.dumps(chart_series, separators=(",", ":")) + ";\n"
    CHART_OUT.write_text(chart_ts, encoding="utf-8")

    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.1f} KiB)")
    print(f"Wrote {CHART_OUT.relative_to(ROOT)} ({CHART_OUT.stat().st_size / 1024:.1f} KiB)")


if __name__ == "__main__":
    main()
