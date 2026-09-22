#!/usr/bin/env python3
"""Refresh Rotation Goblin technical market data.

No API key is required. The script tries Stooq first and Yahoo's chart endpoint
as a fallback. It calculates technical indicators locally and writes a typed
TypeScript data module consumed by the static Vite app.

Rotation-score history consumes the latest generated valuation score where
that concept applies. Non-earnings assets use a technical-only score instead
of being assigned a fake equity valuation.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
import math
import re
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/features/rotation-goblin/marketData.generated.ts"
HISTORY = ROOT / "src/features/rotation-goblin/rotation-history.json"
VALUATION_OUT = ROOT / "src/features/rotation-goblin/valuationData.generated.ts"

TICKERS = [
    "SPY", "XLE", "XLF", "XLB", "XLU", "XLV", "XLI", "XLK", "SMH", "IWM",
    "IYR", "EFA", "EEM", "GLD", "TLT", "PDBC", "KMLM", "UUP",
]

USER_AGENT = "RotationGoblin/1.0 (+https://github.com/Mo4n6/tools)"
LOOKBACK_DAYS = 1200


def http_get(url: str, attempts: int = 3) -> bytes:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as response:
                return response.read()
        except Exception as exc:  # noqa: BLE001 - preserve provider error
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Unable to fetch {url}: {last_error}")


def fetch_stooq(ticker: str, start: dt.date, end: dt.date) -> list[tuple[dt.date, float]]:
    symbol = f"{ticker.lower()}.us"
    url = (
        "https://stooq.com/q/d/l/?"
        + urllib.parse.urlencode({
            "s": symbol,
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


def fetch_history(ticker: str, start: dt.date, end: dt.date) -> tuple[list[tuple[dt.date, float]], str]:
    errors: list[str] = []
    for provider, fn in (("Stooq", fetch_stooq), ("Yahoo fallback", fetch_yahoo)):
        try:
            return fn(ticker, start, end), provider
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{provider}: {exc}")
    raise RuntimeError(f"All providers failed for {ticker}: {' | '.join(errors)}")


def remove_incomplete_session(
    rows: list[tuple[dt.date, float]],
    now_utc: dt.datetime,
) -> list[tuple[dt.date, float]]:
    """Do not treat an intraday daily bar as a completed market session.

    Scheduled refreshes run after the U.S. close. PR/push validation can run
    during market hours, so before 22:00 UTC we deliberately use the prior
    completed session if the provider already exposes today's partial bar.
    """
    if not rows:
        return rows
    today = now_utc.date()
    if rows[-1][0] == today and now_utc.hour < 22:
        return rows[:-1]
    return rows


def weekly_close(rows: list[tuple[dt.date, float]]) -> list[tuple[dt.date, float]]:
    weeks: dict[tuple[int, int], tuple[dt.date, float]] = {}
    for day, close in rows:
        iso = day.isocalendar()
        weeks[(iso.year, iso.week)] = (day, close)
    return sorted(weeks.values())


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


def latest_rsi_and_trend(values: list[float]) -> tuple[float, str]:
    series = rsi_series(values)
    valid = [value for value in series if value is not None]
    if not valid:
        raise RuntimeError("Not enough values for RSI")
    current = float(valid[-1])
    prior = float(valid[-5]) if len(valid) >= 5 else float(valid[0])
    delta = current - prior
    trend = "up" if delta >= 2 else "down" if delta <= -2 else "flat"
    return round(current, 1), trend


def return_pct(values: list[float], sessions: int) -> float:
    if len(values) <= sessions:
        return 0.0
    start = values[-sessions - 1]
    end = values[-1]
    return ((end / start) - 1.0) * 100.0


def relative_return(etf_rows: list[tuple[dt.date, float]], spy_rows: list[tuple[dt.date, float]], sessions: int) -> float:
    spy = dict(spy_rows)
    ratios = [close / spy[day] for day, close in etf_rows if day in spy and spy[day] > 0]
    return return_pct(ratios, sessions)


def clamp(value: float) -> float:
    return max(0.0, min(100.0, value))


def load_value_scores() -> dict[str, float]:
    if not VALUATION_OUT.exists():
        return {}
    content = VALUATION_OUT.read_text(encoding="utf-8")
    match = re.search(
        r"export const valuationRows: GeneratedValuationRow\[\] = (\[.*\]);",
        content,
        flags=re.DOTALL,
    )
    if not match:
        return {}
    try:
        rows = json.loads(match.group(1))
    except json.JSONDecodeError:
        return {}
    scores: dict[str, float] = {}
    for row in rows:
        ticker = row.get("ticker")
        score = row.get("valueScore")
        if isinstance(ticker, str) and isinstance(score, (int, float)):
            scores[ticker] = float(score)
    return scores


def rotation_score(value_score: float | None, rsi: float, relative_rsi: float, rel6m: float) -> int:
    rsi_sweet_spot = clamp(100.0 - abs(rsi - 58.0) * 4.0)
    relative_rsi_score = clamp((relative_rsi - 35.0) * 2.5)
    relative_performance_score = clamp(50.0 + rel6m * 3.0)

    if value_score is None:
        score = (
            rsi_sweet_spot * 0.20
            + relative_rsi_score * 0.45
            + relative_performance_score * 0.35
        )
    else:
        score = (
            value_score * 0.30
            + rsi_sweet_spot * 0.15
            + relative_rsi_score * 0.30
            + relative_performance_score * 0.25
        )
    return round(score)


def history_points(history: dict[str, list[dict[str, object]]], ticker: str) -> list[dict[str, object]]:
    items = history.get(ticker, [])
    return [{"month": str(item["date"])[5:], "value": int(item["value"])} for item in items[-90:]]


def main() -> None:
    now_utc = dt.datetime.now(dt.timezone.utc)
    today = now_utc.date()
    start = today - dt.timedelta(days=LOOKBACK_DAYS)

    all_rows: dict[str, list[tuple[dt.date, float]]] = {}
    providers: dict[str, str] = {}
    for ticker in TICKERS:
        rows, provider = fetch_history(ticker, start, today)
        rows = remove_incomplete_session(rows, now_utc)
        if len(rows) < 260:
            raise RuntimeError(f"{ticker}: fewer than 260 completed daily sessions after filtering")
        all_rows[ticker] = rows
        providers[ticker] = provider
        print(f"{ticker}: {len(rows)} completed rows via {provider}; latest={rows[-1][0]}")

    spy_daily = all_rows["SPY"]
    spy_weekly = weekly_close(spy_daily)
    spy_weekly_map = dict(spy_weekly)

    if HISTORY.exists():
        try:
            history: dict[str, list[dict[str, object]]] = json.loads(HISTORY.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            history = {}
    else:
        history = {}

    technical_rows: list[dict[str, object]] = []
    value_scores = load_value_scores()

    for ticker in TICKERS:
        if ticker == "SPY":
            continue

        daily = all_rows[ticker]
        weekly = weekly_close(daily)
        weekly_values = [close for _, close in weekly]
        rsi14w, rsi_trend = latest_rsi_and_trend(weekly_values)

        common_weekly = [(day, close / spy_weekly_map[day]) for day, close in weekly if day in spy_weekly_map]
        relative_values = [value for _, value in common_weekly]
        relative_rsi, relative_trend = latest_rsi_and_trend(relative_values)

        closes = [close for _, close in daily]
        current = closes[-1]
        high52 = max(closes[-252:]) if len(closes) >= 252 else max(closes)
        drawdown52w = ((current / high52) - 1.0) * 100.0
        sma200 = sum(closes[-200:]) / min(200, len(closes))
        as_of = daily[-1][0].isoformat()

        rel1m = relative_return(daily, spy_daily, 21)
        rel3m = relative_return(daily, spy_daily, 63)
        rel6m = relative_return(daily, spy_daily, 126)
        rel12m = relative_return(daily, spy_daily, 252)
        ret3m = return_pct(closes, 63)

        score = rotation_score(value_scores.get(ticker), rsi14w, relative_rsi, rel6m)
        entries = history.setdefault(ticker, [])
        if entries and entries[-1].get("date") == as_of:
            entries[-1] = {"date": as_of, "value": score}
        else:
            entries.append({"date": as_of, "value": score})
        history[ticker] = entries[-90:]

        technical_rows.append({
            "ticker": ticker,
            "price": round(current, 4),
            "asOf": as_of,
            "rsi14w": rsi14w,
            "rsiTrend": rsi_trend,
            "relativeRsi": relative_rsi,
            "relativeTrend": relative_trend,
            "ret3m": round(ret3m, 2),
            "rel1m": round(rel1m, 2),
            "rel3m": round(rel3m, 2),
            "rel6m": round(rel6m, 2),
            "rel12m": round(rel12m, 2),
            "drawdown52w": round(drawdown52w, 2),
            "above200d": current >= sma200,
            "history": history_points(history, ticker),
        })

    spy_closes = [close for _, close in spy_daily]
    spy_current = spy_closes[-1]
    spy_sma200 = sum(spy_closes[-200:]) / min(200, len(spy_closes))
    benchmark = {
        "ticker": "SPY",
        "price": round(spy_current, 4),
        "asOf": spy_daily[-1][0].isoformat(),
        "ret3m": round(return_pct(spy_closes, 63), 2),
        "ret12m": round(return_pct(spy_closes, 252), 2),
        "above200d": spy_current >= spy_sma200,
    }

    used_providers = sorted(set(providers.values()))
    provider_label = " + ".join(used_providers)
    generated_at = now_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z")

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
  history: { month: string; value: number }[];
};

"""

    meta = {
        "source": provider_label,
        "generatedAt": generated_at,
        "benchmark": "SPY",
        "live": True,
        "note": "Technicals are automated. Rotation history uses automated sponsor valuation where applicable and technical-only scoring for non-earnings assets.",
    }

    output = type_header
    output += "export const marketDataMeta = " + json.dumps(meta, indent=2) + " as const;\n\n"
    output += "export const benchmarkSnapshot = " + json.dumps(benchmark, indent=2) + " as const;\n\n"
    output += "export const technicalRows: GeneratedTechnicalRow[] = " + json.dumps(technical_rows, indent=2) + ";\n"

    OUT.write_text(output, encoding="utf-8")
    HISTORY.write_text(json.dumps(history, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}")
    print(f"Wrote {HISTORY.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
