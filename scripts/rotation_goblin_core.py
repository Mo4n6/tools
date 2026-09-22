#!/usr/bin/env python3
"""Shared point-in-time technical calculations for Rotation Goblin.

This module is the single calculation path used by both:
- the 10-year canonical history backfill
- the daily live refresh

Historical features are price-derived only. No valuation data is allowed here.
"""

from __future__ import annotations

import datetime as dt
import math
from typing import Any

FEATURE_SCHEMA_VERSION = 2


def mean(values: list[float]) -> float:
    if not values:
        raise RuntimeError("Cannot average empty sequence")
    return sum(values) / len(values)


def rsi_last(values: list[float], period: int = 14) -> float | None:
    if len(values) <= period:
        return None

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

    current = to_rsi(avg_gain, avg_loss)
    for index in range(period + 1, len(values)):
        delta = values[index] - values[index - 1]
        gain = max(delta, 0.0)
        loss = max(-delta, 0.0)
        avg_gain = ((avg_gain * (period - 1)) + gain) / period
        avg_loss = ((avg_loss * (period - 1)) + loss) / period
        current = to_rsi(avg_gain, avg_loss)

    return current


def provisional_weekly_rsi(dates: list[dt.date], values: list[float]) -> list[float | None]:
    """Calculate a point-in-time 14-week RSI for every daily session.

    For each date, all prior weeks use their final known close while the
    current week uses that day's close as the provisional weekly close.
    This matches what a user could actually know on that date.
    """
    result: list[float | None] = [None] * len(values)
    weekly_values: list[float] = []
    current_week: tuple[int, int] | None = None

    for index, (day, value) in enumerate(zip(dates, values)):
        iso = day.isocalendar()
        week_key = (iso.year, iso.week)
        if week_key != current_week:
            weekly_values.append(value)
            current_week = week_key
        else:
            weekly_values[-1] = value
        result[index] = rsi_last(weekly_values, 14)

    return result


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


def trend_from_delta(value: float | None, threshold: float = 2.0) -> str:
    if value is None:
        return "flat"
    if value >= threshold:
        return "up"
    if value <= -threshold:
        return "down"
    return "flat"


def slope_state(value: float, epsilon: float = 0.05) -> str:
    if value > epsilon:
        return "bullish"
    if value < -epsilon:
        return "bearish"
    return "neutral"


def build_daily_states(
    ticker: str,
    rows: list[tuple[dt.date, float]],
    spy_rows: list[tuple[dt.date, float]],
    target_start: dt.date,
) -> list[dict[str, Any]]:
    """Build daily point-in-time technical states aligned to SPY."""
    spy_map = dict(spy_rows)
    aligned = [(day, close, spy_map[day]) for day, close in rows if day in spy_map and spy_map[day] > 0]
    if len(aligned) < 260:
        raise RuntimeError(f"{ticker}: only {len(aligned)} SPY-aligned daily rows")

    dates = [day for day, _close, _spy in aligned]
    closes = [close for _day, close, _spy in aligned]
    spy_closes = [spy for _day, _close, spy in aligned]
    ratios = [close / spy for close, spy in zip(closes, spy_closes)]

    rsi14w = provisional_weekly_rsi(dates, closes)
    relative_rsi14w = provisional_weekly_rsi(dates, ratios)

    sma50: list[float | None] = [None] * len(closes)
    sma200: list[float | None] = [None] * len(closes)
    spread50_200: list[float | None] = [None] * len(closes)

    rolling50 = 0.0
    rolling200 = 0.0
    for index, close in enumerate(closes):
        rolling50 += close
        rolling200 += close
        if index >= 50:
            rolling50 -= closes[index - 50]
        if index >= 200:
            rolling200 -= closes[index - 200]
        if index >= 49:
            sma50[index] = rolling50 / 50.0
        if index >= 199:
            sma200[index] = rolling200 / 200.0
        if sma50[index] is not None and sma200[index] is not None:
            spread50_200[index] = (float(sma50[index]) / float(sma200[index]) - 1.0) * 100.0

    days_since_cross: list[int | None] = [None] * len(closes)
    current_cross_age: int | None = None
    for index, spread in enumerate(spread50_200):
        if spread is None or spread <= 0:
            current_cross_age = None
            days_since_cross[index] = None
            continue
        previous = spread50_200[index - 1] if index else None
        if previous is None or previous <= 0:
            current_cross_age = 1
        elif current_cross_age is None:
            current_cross_age = 1
        else:
            current_cross_age += 1
        days_since_cross[index] = current_cross_age

    states: list[dict[str, Any]] = []
    for index, day in enumerate(dates):
        if day < target_start or index < 252:
            continue

        rsi = rsi14w[index]
        relative_rsi = relative_rsi14w[index]
        if rsi is None or relative_rsi is None or sma50[index] is None or sma200[index] is None or spread50_200[index] is None:
            continue

        rsi_delta_4w = None
        relative_rsi_delta_4w = None
        if index >= 20 and rsi14w[index - 20] is not None:
            rsi_delta_4w = float(rsi) - float(rsi14w[index - 20])
        if index >= 20 and relative_rsi14w[index - 20] is not None:
            relative_rsi_delta_4w = float(relative_rsi) - float(relative_rsi14w[index - 20])

        sma200_slope20 = None
        if index >= 219 and sma200[index - 20] is not None:
            sma200_slope20 = (float(sma200[index]) / float(sma200[index - 20]) - 1.0) * 100.0

        high52 = max(closes[index - 251:index + 1])
        low52 = min(closes[index - 251:index + 1])
        current = closes[index]

        features = {
            "close": rounded(current, 4),
            "return3mPct": rounded(trailing_return(closes, index, 63), 2),
            "rsi14w": rounded(float(rsi), 2),
            "rsi14wDelta4w": rounded(rsi_delta_4w, 2),
            "relativeRsi14w": rounded(float(relative_rsi), 2),
            "relativeRsi14wDelta4w": rounded(relative_rsi_delta_4w, 2),
            "rel1mPct": rounded(trailing_return(ratios, index, 21), 2),
            "rel3mPct": rounded(trailing_return(ratios, index, 63), 2),
            "rel6mPct": rounded(trailing_return(ratios, index, 126), 2),
            "rel12mPct": rounded(trailing_return(ratios, index, 252), 2),
            "priceVs200dPct": rounded((current / float(sma200[index]) - 1.0) * 100.0, 2),
            "sma200Slope20dPct": rounded(sma200_slope20, 3),
            "sma50Vs200Pct": rounded(float(spread50_200[index]), 2),
            "goldenCross": bool(float(spread50_200[index]) > 0),
            "daysSinceGoldenCross": days_since_cross[index],
            "drawdown52wPct": rounded((current / high52 - 1.0) * 100.0, 2),
            "recoveryFrom52wLowPct": rounded((current / low52 - 1.0) * 100.0, 2),
            "trend200d": slope_state(float(sma200_slope20 or 0.0)),
        }

        states.append({"date": day.isoformat(), "features": features})

    return states


def completed_week_dates(states: list[dict[str, Any]], now_utc: dt.datetime) -> list[str]:
    """Return final state date for each completed ISO week."""
    by_week: dict[tuple[int, int], str] = {}
    current_iso = now_utc.date().isocalendar()
    current_key = (current_iso.year, current_iso.week)
    week_complete = now_utc.weekday() >= 5 or (now_utc.weekday() == 4 and now_utc.hour >= 22)

    for row in states:
        day = dt.date.fromisoformat(row["date"])
        iso = day.isocalendar()
        key = (iso.year, iso.week)
        if key == current_key and not week_complete:
            continue
        by_week[key] = row["date"]

    return [by_week[key] for key in sorted(by_week)]


def latest_state(states: list[dict[str, Any]]) -> dict[str, Any]:
    if not states:
        raise RuntimeError("No technical states available")
    return states[-1]
