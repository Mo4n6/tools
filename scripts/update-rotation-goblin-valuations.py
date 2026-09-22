#!/usr/bin/env python3
"""Refresh Rotation Goblin valuation data from official ETF sponsor pages.

This deliberately automates valuation only where an earnings/book-value style
multiple is meaningful. Gold, Treasuries, broad commodities, managed futures,
and the U.S. dollar are marked not-applicable instead of being assigned a fake
P/E-based "value" score.

Sources:
- State Street fund pages for SPY and Select Sector SPDR ETFs
- iShares fund pages for IWM, IYR, EFA, and EEM
- iShares SOXX sponsor page as a clearly labeled semiconductor valuation proxy for SMH

The script stores a daily valuation snapshot so the dashboard can build its own
tracked-history percentile over time. Until enough observations accumulate,
the score is based only on each ETF's current multiple relative to SPY.
"""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import html
import json
import math
import re
import subprocess
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/features/rotation-goblin/valuationData.generated.ts"
HISTORY = ROOT / "src/features/rotation-goblin/valuation-history.json"

USER_AGENT = "RotationGoblin/1.0 (+https://github.com/Mo4n6/tools)"
MIN_HISTORY_SAMPLES = 20
MAX_HISTORY_SAMPLES = 1500
MAX_STALE_DAYS = 10
MAX_SOURCE_AGE_DAYS = 10

SSGA_BASE = "https://www.ssga.com/us/en/intermediary/etfs/"
ISHARES_BASE = "https://www.ishares.com/us/products/"

FUND_CONFIG: dict[str, dict[str, Any]] = {
    "SPY": {
        "provider": "State Street",
        "url": SSGA_BASE + "state-street-spdr-sp-500-etf-trust-spy",
        "kind": "ssga",
        "primaryMetric": "benchmark",
    },
    "XLE": {
        "provider": "State Street",
        "url": SSGA_BASE + "state-street-energy-select-sector-spdr-etf-xle",
        "kind": "ssga",
        "primaryMetric": "forward_pe",
    },
    "XLF": {
        "provider": "State Street",
        "url": SSGA_BASE + "state-street-financial-select-sector-spdr-etf-xlf",
        "kind": "ssga",
        "primaryMetric": "forward_pe",
    },
    "XLB": {
        "provider": "State Street",
        "url": SSGA_BASE + "state-street-materials-select-sector-spdr-etf-xlb",
        "kind": "ssga",
        "primaryMetric": "forward_pe",
    },
    "XLU": {
        "provider": "State Street",
        "url": SSGA_BASE + "state-street-utilities-select-sector-spdr-etf-xlu",
        "kind": "ssga",
        "primaryMetric": "forward_pe",
    },
    "XLV": {
        "provider": "State Street",
        "url": SSGA_BASE + "state-street-health-care-select-sector-spdr-etf-xlv",
        "kind": "ssga",
        "primaryMetric": "forward_pe",
    },
    "XLI": {
        "provider": "State Street",
        "url": SSGA_BASE + "state-street-industrial-select-sector-spdr-etf-xli",
        "kind": "ssga",
        "primaryMetric": "forward_pe",
    },
    "XLK": {
        "provider": "State Street",
        "url": SSGA_BASE + "state-street-technology-select-sector-spdr-etf-xlk",
        "kind": "ssga",
        "primaryMetric": "forward_pe",
    },
    "SMH": {
        "provider": "iShares",
        "url": ISHARES_BASE + "239705/ishares-semiconductor-etf",
        "kind": "ishares",
        "primaryMetric": "pe",
        "proxyTicker": "SOXX",
    },
    "IWM": {
        "provider": "iShares",
        "url": ISHARES_BASE + "239710/ishares-russell-2000-etf",
        "kind": "ishares",
        "primaryMetric": "pe",
    },
    "IYR": {
        "provider": "iShares",
        "url": ISHARES_BASE + "239520/ishares-us-real-estate-etf",
        "kind": "ishares",
        "primaryMetric": "pcf",
    },
    "EFA": {
        "provider": "iShares",
        "url": ISHARES_BASE + "239623/ishares-msci-eafe-etf",
        "kind": "ishares",
        "primaryMetric": "pe",
    },
    "EEM": {
        "provider": "iShares",
        "url": ISHARES_BASE + "239637/ishares-msci-emerging-markets-etf",
        "kind": "ishares",
        "primaryMetric": "pe",
    },
}

NOT_APPLICABLE = {
    "GLD": "Gold does not have an earnings multiple comparable with SPY.",
    "TLT": "Long-duration Treasuries are better valued with yield/term-premium measures than P/E.",
    "PDBC": "Broad commodities do not have an earnings multiple comparable with SPY.",
    "KMLM": "Managed futures do not have an earnings multiple comparable with SPY.",
    "UUP": "A currency index does not have an earnings multiple comparable with SPY.",
}


def http_get_bytes(url: str, attempts: int = 2) -> bytes:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            completed = subprocess.run(
                [
                    "curl",
                    "--fail",
                    "--silent",
                    "--show-error",
                    "--location",
                    "--max-redirs",
                    "10",
                    "--connect-timeout",
                    "5",
                    "--max-time",
                    "20",
                    "--user-agent",
                    USER_AGENT,
                    "--header",
                    "Accept: */*",
                    "--header",
                    "Accept-Language: en-US,en;q=0.9",
                    url,
                ],
                check=True,
                capture_output=True,
                timeout=25,
            )
            if not completed.stdout:
                raise RuntimeError("empty response")
            return completed.stdout
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(1)
    raise RuntimeError(f"Unable to fetch {url}: {last_error}")


def http_get(url: str, attempts: int = 2) -> str:
    return http_get_bytes(url, attempts=attempts).decode("utf-8", errors="replace")


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style", "svg"}:
            self.skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "svg"} and self.skip_depth > 0:
            self.skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.skip_depth == 0:
            stripped = data.strip()
            if stripped:
                self.parts.append(stripped)


def plain_text(raw_html: str) -> str:
    parser = TextExtractor()
    parser.feed(raw_html)
    parser.close()
    return re.sub(r"\s+", " ", " ".join(parser.parts)).strip()


MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def parse_sponsor_date(text: str) -> str | None:
    match = re.search(
        r"as of\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    month = MONTHS.get(match.group(1).lower())
    if month is None:
        return None
    try:
        return dt.date(int(match.group(3)), month, int(match.group(2))).isoformat()
    except ValueError:
        return None


def sponsor_date_after(text: str, label: str, max_chars: int = 1800) -> str | None:
    match = re.search(re.escape(label), text, flags=re.IGNORECASE)
    if not match:
        return None
    window = text[match.start():match.end() + max_chars]
    return parse_sponsor_date(window)


def decimal_after(text: str, label: str, max_chars: int = 1200) -> float | None:
    """Return the first decimal-formatted value after a metric label.

    Sponsor pages repeat labels and explanatory text. Requiring a decimal token
    deliberately rejects footnote digits such as the "1" in "FY1" instead of
    guessing. If a sponsor changes its markup/format, the parser fails closed.
    """
    match = re.search(re.escape(label), text, flags=re.IGNORECASE)
    if not match:
        return None
    window = text[match.end():match.end() + max_chars]
    decimal = re.search(r"(?<![0-9])([0-9]{1,4}\.[0-9]+)(?![0-9])", window)
    if not decimal:
        return None
    value = float(decimal.group(1))
    return value if math.isfinite(value) and value > 0 else None


def decimal_in_section(text: str, section: str, label: str, max_chars: int = 3000) -> float | None:
    section_match = re.search(re.escape(section), text, flags=re.IGNORECASE)
    if not section_match:
        return None
    section_text = text[section_match.end():section_match.end() + max_chars]
    return decimal_after(section_text, label, max_chars=max_chars)


def parse_ssga(raw_html: str) -> dict[str, Any]:
    text = plain_text(raw_html)
    return {
        "pb": decimal_in_section(text, "Fund Characteristics", "Price/Book Ratio"),
        "forward_pe": decimal_in_section(text, "Fund Characteristics", "Price/Earnings Ratio FY1"),
        "pe": decimal_in_section(text, "Index Characteristics", "Price/Earnings"),
        "pcf": decimal_in_section(text, "Index Characteristics", "Price/Cash Flow"),
        "source_as_of": sponsor_date_after(text, "Fund Characteristics"),
    }


def parse_ishares(raw_html: str) -> dict[str, Any]:
    text = plain_text(raw_html)
    dates = [
        sponsor_date_after(text, "P/B Ratio"),
        sponsor_date_after(text, "P/E Ratio"),
        sponsor_date_after(text, "P/CF Ratio"),
    ]
    valid_dates = sorted(date for date in dates if date)
    return {
        "pb": decimal_in_section(text, "Portfolio Characteristics", "P/B Ratio"),
        "pe": decimal_in_section(text, "Portfolio Characteristics", "P/E Ratio"),
        "pcf": decimal_in_section(text, "Portfolio Characteristics", "P/CF Ratio"),
        "forward_pe": None,
        "source_as_of": valid_dates[0] if valid_dates else None,
    }


METRIC_RANGES: dict[str, tuple[float, float]] = {
    "pb": (0.2, 30.0),
    "forward_pe": (5.0, 100.0),
    "pe": (5.0, 150.0),
    "pcf": (3.0, 100.0),
}


def validate_parsed_metrics(ticker: str, values: dict[str, float | None], required: list[str]) -> None:
    for metric in required:
        value = values.get(metric)
        if value is None:
            raise RuntimeError(f"{ticker}: missing required valuation metric {metric}")
        low, high = METRIC_RANGES[metric]
        if not (low <= value <= high):
            raise RuntimeError(
                f"{ticker}: implausible {metric}={value}; expected {low} <= value <= {high}"
            )


def clamp(value: float) -> float:
    return max(0.0, min(100.0, value))


def ratio_score(ratio: float) -> float:
    # 0.5x SPY multiple => 100; 1.0x => 50; 1.5x+ => 0.
    return clamp(100.0 - (ratio - 0.5) * 100.0)


def percentile_rank(values: list[float], current: float) -> float | None:
    if len(values) < MIN_HISTORY_SAMPLES:
        return None
    less_or_equal = sum(1 for value in values if value <= current)
    return round((less_or_equal / len(values)) * 100.0, 1)


def load_history() -> dict[str, list[dict[str, Any]]]:
    if not HISTORY.exists():
        return {}
    try:
        data = json.loads(HISTORY.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def upsert_history(
    history: dict[str, list[dict[str, Any]]],
    ticker: str,
    snapshot_date: str,
    cross_score: float,
    primary_relative: float,
    pb_relative: float,
) -> list[dict[str, Any]]:
    entries = history.setdefault(ticker, [])
    entry = {
        "date": snapshot_date,
        "crossScore": round(cross_score, 2),
        "primaryRelative": round(primary_relative, 4),
        "pbRelative": round(pb_relative, 4),
    }
    # Sponsor dates can lag the scrape date. Rebuild chronologically and
    # discard any later entry created by the old scrape-date semantics.
    entries = [
        existing for existing in entries
        if str(existing.get("date", "")) < snapshot_date
    ]
    entries.append(entry)
    entries.sort(key=lambda existing: str(existing.get("date", "")))
    history[ticker] = entries[-MAX_HISTORY_SAMPLES:]
    return history[ticker]


def primary_benchmark(metric: str, spy: dict[str, float | None]) -> float | None:
    if metric == "forward_pe":
        return spy.get("forward_pe")
    if metric == "pe":
        return spy.get("pe")
    if metric == "pcf":
        return spy.get("pcf")
    return None


def metric_label(metric: str) -> str:
    return {
        "forward_pe": "Forward P/E (FY1)",
        "pe": "P/E",
        "pcf": "P/CF",
    }.get(metric, metric)


def load_previous_rows() -> dict[str, dict[str, Any]]:
    if not OUT.exists():
        return {}
    content = OUT.read_text(encoding="utf-8")
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
    return {
        str(row["ticker"]): row
        for row in rows
        if isinstance(row, dict) and isinstance(row.get("ticker"), str)
    }


def previous_row_is_usable(row: dict[str, Any], today: dt.date) -> bool:
    if row.get("status") not in {"automated", "stale"}:
        return False
    try:
        as_of = dt.date.fromisoformat(str(row["asOf"]))
        age = (today - as_of).days
        primary = float(row["primaryMultiple"])
        pb = float(row["priceToBook"])
        value_score = float(row["valueScore"])
    except (KeyError, TypeError, ValueError):
        return False
    if age < 0 or age > MAX_STALE_DAYS:
        return False
    if not (3.0 <= primary <= 150.0 and 0.2 <= pb <= 30.0 and 0.0 <= value_score <= 100.0):
        return False
    return True


def stale_or_error_row(
    ticker: str,
    config: dict[str, Any],
    previous_rows: dict[str, dict[str, Any]],
    today: dt.date,
    benchmark_pb: float | None,
    error: str,
) -> dict[str, Any]:
    previous = previous_rows.get(ticker)
    if previous and previous_row_is_usable(previous, today):
        stale = dict(previous)
        stale["status"] = "stale"
        stale["note"] = (
            f"Using last known good valuation from {previous['asOf']} because the current "
            f"sponsor refresh failed: {error}"
        )
        return stale

    return {
        "ticker": ticker,
        "status": "error",
        "assetClass": "equity" if ticker != "IYR" else "real_estate",
        "provider": config["provider"],
        "sourceUrl": config["url"],
        "proxyTicker": config.get("proxyTicker"),
        "asOf": today.isoformat(),
        "primaryMetric": metric_label(config["primaryMetric"]),
        "primaryMultiple": None,
        "benchmarkMultiple": None,
        "primaryRelative": None,
        "priceToBook": None,
        "benchmarkPriceToBook": benchmark_pb,
        "pbRelative": None,
        "crossSectionScore": None,
        "trackedHistoryPercentile": None,
        "historySamples": 0,
        "valueScore": None,
        "note": error,
    }


def main() -> None:
    fetched: dict[str, dict[str, float | None]] = {}
    errors: dict[str, str] = {}

    def fetch_one(item: tuple[str, dict[str, Any]]) -> tuple[str, dict[str, Any]]:
        ticker, config = item
        kind = config["kind"]

        raw = http_get(config["url"])
        if kind == "ssga":
            values = parse_ssga(raw)
        elif kind == "ishares":
            values = parse_ishares(raw)
        else:
            raise RuntimeError(f"Unsupported valuation source kind: {kind}")

        required = ["pb", config["primaryMetric"]]
        if ticker == "SPY":
            required = ["pb", "forward_pe", "pe", "pcf"]
        validate_parsed_metrics(ticker, values, required)
        source_as_of = values.get("source_as_of")
        if not isinstance(source_as_of, str):
            raise RuntimeError(f"{ticker}: could not determine sponsor source date")
        source_date = dt.date.fromisoformat(source_as_of)
        age = (dt.datetime.now(dt.timezone.utc).date() - source_date).days
        if age < 0 or age > MAX_SOURCE_AGE_DAYS:
            raise RuntimeError(
                f"{ticker}: sponsor valuation source date {source_as_of} is stale/invalid (age={age} days)"
            )
        return ticker, values

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        future_to_item = {
            pool.submit(fetch_one, item): item
            for item in FUND_CONFIG.items()
        }
        for future in concurrent.futures.as_completed(future_to_item):
            ticker, _config = future_to_item[future]
            try:
                resolved_ticker, values = future.result()
                fetched[resolved_ticker] = values
                print(f"{resolved_ticker}: {values}")
            except Exception as exc:  # noqa: BLE001
                errors[ticker] = str(exc)
                print(f"{ticker}: ERROR {exc}")

    if "SPY" not in fetched:
        raise RuntimeError(f"SPY valuation benchmark could not be fetched: {errors.get('SPY', 'unknown error')}")

    spy = fetched["SPY"]
    if not spy.get("pb") or not spy.get("forward_pe") or not spy.get("pe") or not spy.get("pcf"):
        raise RuntimeError(f"SPY benchmark parsing incomplete: {spy}")

    today_date = dt.datetime.now(dt.timezone.utc).date()
    today = today_date.isoformat()
    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    history = load_history()
    previous_rows = load_previous_rows()
    rows: list[dict[str, Any]] = []

    for ticker, config in FUND_CONFIG.items():
        if ticker == "SPY":
            continue

        values = fetched.get(ticker)
        if not values:
            rows.append(
                stale_or_error_row(
                    ticker,
                    config,
                    previous_rows,
                    today_date,
                    spy.get("pb"),
                    errors.get(ticker, "Valuation source unavailable."),
                )
            )
            continue

        metric = config["primaryMetric"]
        primary = values.get(metric)
        benchmark = primary_benchmark(metric, spy)
        pb = values.get("pb")
        benchmark_pb = spy.get("pb")

        if primary is None or benchmark is None or pb is None or benchmark_pb is None:
            rows.append(
                stale_or_error_row(
                    ticker,
                    config,
                    previous_rows,
                    today_date,
                    benchmark_pb,
                    "Sponsor page loaded, but one or more valuation fields could not be parsed.",
                )
            )
            continue

        primary_relative = primary / benchmark
        pb_relative = pb / benchmark_pb
        cross_score = ratio_score(primary_relative) * 0.65 + ratio_score(pb_relative) * 0.35
        source_as_of = str(values["source_as_of"])

        entries = upsert_history(
            history,
            ticker,
            source_as_of,
            cross_score,
            primary_relative,
            pb_relative,
        )
        tracked_percentile = percentile_rank(
            [float(entry["crossScore"]) for entry in entries if "crossScore" in entry],
            cross_score,
        )
        value_score = (
            cross_score
            if tracked_percentile is None
            else cross_score * 0.60 + tracked_percentile * 0.40
        )

        rows.append({
            "ticker": ticker,
            "status": "automated",
            "assetClass": "equity" if ticker != "IYR" else "real_estate",
            "provider": config["provider"],
            "sourceUrl": config["url"],
            "proxyTicker": config.get("proxyTicker"),
            "asOf": source_as_of,
            "primaryMetric": metric_label(metric),
            "primaryMultiple": round(primary, 2),
            "benchmarkMultiple": round(benchmark, 2),
            "primaryRelative": round(primary_relative, 4),
            "priceToBook": round(pb, 2),
            "benchmarkPriceToBook": round(benchmark_pb, 2),
            "pbRelative": round(pb_relative, 4),
            "crossSectionScore": round(cross_score, 1),
            "trackedHistoryPercentile": tracked_percentile,
            "historySamples": len(entries),
            "valueScore": round(value_score, 1),
            "note": (
                (
                    f"Valuation proxy: {config['proxyTicker']} is used for the semiconductor complex because "
                    "the SMH sponsor endpoint blocks automated CI access. "
                    if config.get("proxyTicker") else ""
                )
                + f"Sponsor fundamentals are as of {source_as_of}. "
                + "Value score blends the ETF's primary valuation multiple and P/B versus SPY. "
                + (
                    f"Tracked-history percentile is active with {len(entries)} samples."
                    if tracked_percentile is not None
                    else f"Tracked-history percentile activates after {MIN_HISTORY_SAMPLES} samples; currently {len(entries)}."
                )
            ),
        })

    for ticker, reason in NOT_APPLICABLE.items():
        rows.append({
            "ticker": ticker,
            "status": "not_applicable",
            "assetClass": "non_earnings",
            "provider": None,
            "sourceUrl": None,
            "proxyTicker": None,
            "asOf": today,
            "primaryMetric": None,
            "primaryMultiple": None,
            "benchmarkMultiple": None,
            "primaryRelative": None,
            "priceToBook": None,
            "benchmarkPriceToBook": None,
            "pbRelative": None,
            "crossSectionScore": None,
            "trackedHistoryPercentile": None,
            "historySamples": 0,
            "valueScore": None,
            "note": reason,
        })

    rows.sort(key=lambda row: row["ticker"])
    HISTORY.write_text(json.dumps(history, indent=2) + "\n", encoding="utf-8")

    meta = {
        "generatedAt": generated_at,
        "benchmark": "SPY",
        "minimumHistorySamples": MIN_HISTORY_SAMPLES,
        "automatedTickers": sorted(ticker for ticker in FUND_CONFIG if ticker != "SPY"),
        "notApplicableTickers": sorted(NOT_APPLICABLE),
        "providers": ["State Street", "iShares"],
        "note": (
            "Equity/real-estate valuation is automated from official sponsor pages. "
            "SMH uses SOXX as a clearly labeled semiconductor-sector valuation proxy. "
            "Non-earnings assets are intentionally not assigned P/E-style value scores."
        ),
    }

    type_header = """export type ValuationStatus = 'automated' | 'stale' | 'not_applicable' | 'error';

export type GeneratedValuationRow = {
  ticker: string;
  status: ValuationStatus;
  assetClass: 'equity' | 'real_estate' | 'non_earnings';
  provider: string | null;
  sourceUrl: string | null;
  proxyTicker?: string | null;
  asOf: string;
  primaryMetric: string | null;
  primaryMultiple: number | null;
  benchmarkMultiple: number | null;
  primaryRelative: number | null;
  priceToBook: number | null;
  benchmarkPriceToBook: number | null;
  pbRelative: number | null;
  crossSectionScore: number | null;
  trackedHistoryPercentile: number | null;
  historySamples: number;
  valueScore: number | null;
  note: string;
};

"""

    output = type_header
    output += "export const valuationDataMeta = " + json.dumps(meta, indent=2) + " as const;\n\n"
    output += "export const valuationRows: GeneratedValuationRow[] = " + json.dumps(rows, indent=2) + ";\n"
    OUT.write_text(output, encoding="utf-8")

    print(f"Wrote {OUT.relative_to(ROOT)}")
    print(f"Wrote {HISTORY.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
