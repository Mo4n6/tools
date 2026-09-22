#!/usr/bin/env python3
"""Refresh Rotation Goblin valuation data from official ETF sponsor pages.

This deliberately automates valuation only where an earnings/book-value style
multiple is meaningful. Gold, Treasuries, broad commodities, managed futures,
and the U.S. dollar are marked not-applicable instead of being assigned a fake
P/E-based "value" score.

Sources:
- State Street fund pages for SPY and Select Sector SPDR ETFs
- iShares fund pages for IWM, IYR, EFA, and EEM

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


def http_get(url: str, attempts: int = 2) -> str:
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
                    "--connect-timeout",
                    "5",
                    "--max-time",
                    "12",
                    "--user-agent",
                    USER_AGENT,
                    "--header",
                    "Accept: text/html,application/xhtml+xml",
                    "--header",
                    "Accept-Language: en-US,en;q=0.9",
                    url,
                ],
                check=True,
                capture_output=True,
                timeout=15,
            )
            return completed.stdout.decode("utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(1)
    raise RuntimeError(f"Unable to fetch {url}: {last_error}")


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
    return re.sub(r"\\s+", " ", " ".join(parser.parts)).strip()


def number_after(text: str, label: str, max_chars: int = 1000) -> float | None:
    match = re.search(re.escape(label), text, flags=re.IGNORECASE)
    if not match:
        return None
    window = text[match.end():match.end() + max_chars]

    # Sponsor pages sprinkle integer footnote markers around metric labels.
    # Valuation multiples are published with decimal precision, so prefer the
    # first decimal token and only fall back to an integer if necessary.
    decimal = re.search(r"(?<![0-9])([0-9]{1,3}\\.[0-9]+)(?![0-9])", window)
    number = decimal or re.search(r"(?<![0-9])([0-9]{1,3})(?![0-9])", window)
    if not number:
        return None
    value = float(number.group(1))
    return value if math.isfinite(value) and value > 0 else None


def number_in_section(text: str, section: str, label: str, max_chars: int = 2500) -> float | None:
    section_match = re.search(re.escape(section), text, flags=re.IGNORECASE)
    if not section_match:
        return None
    section_text = text[section_match.end():section_match.end() + max_chars]
    return number_after(section_text, label, max_chars=max_chars)


def parse_ssga(raw_html: str) -> dict[str, float | None]:
    text = plain_text(raw_html)
    return {
        "pb": number_in_section(text, "Fund Characteristics", "Price/Book Ratio"),
        "forward_pe": number_in_section(text, "Fund Characteristics", "Price/Earnings Ratio FY1"),
        "pe": number_in_section(text, "Index Characteristics", "Price/Earnings"),
        "pcf": number_in_section(text, "Index Characteristics", "Price/Cash Flow"),
    }


def parse_ishares(raw_html: str) -> dict[str, float | None]:
    text = plain_text(raw_html)
    return {
        "pb": number_in_section(text, "Portfolio Characteristics", "P/B Ratio"),
        "pe": number_in_section(text, "Portfolio Characteristics", "P/E Ratio"),
        "pcf": number_in_section(text, "Portfolio Characteristics", "P/CF Ratio"),
        "forward_pe": None,
    }


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
    if entries and entries[-1].get("date") == snapshot_date:
        entries[-1] = entry
    else:
        entries.append(entry)
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


def main() -> None:
    fetched: dict[str, dict[str, float | None]] = {}
    errors: dict[str, str] = {}

    def fetch_one(item: tuple[str, dict[str, Any]]) -> tuple[str, dict[str, float | None]]:
        ticker, config = item
        raw = http_get(config["url"])
        values = parse_ssga(raw) if config["kind"] == "ssga" else parse_ishares(raw)
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

    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    history = load_history()
    rows: list[dict[str, Any]] = []

    for ticker, config in FUND_CONFIG.items():
        if ticker == "SPY":
            continue

        values = fetched.get(ticker)
        if not values:
            rows.append({
                "ticker": ticker,
                "status": "error",
                "assetClass": "equity",
                "provider": config["provider"],
                "sourceUrl": config["url"],
                "asOf": today,
                "primaryMetric": metric_label(config["primaryMetric"]),
                "primaryMultiple": None,
                "benchmarkMultiple": None,
                "primaryRelative": None,
                "priceToBook": None,
                "benchmarkPriceToBook": spy.get("pb"),
                "pbRelative": None,
                "crossSectionScore": None,
                "trackedHistoryPercentile": None,
                "historySamples": len(history.get(ticker, [])),
                "valueScore": None,
                "note": errors.get(ticker, "Valuation source unavailable."),
            })
            continue

        metric = config["primaryMetric"]
        primary = values.get(metric)
        benchmark = primary_benchmark(metric, spy)
        pb = values.get("pb")
        benchmark_pb = spy.get("pb")

        if primary is None or benchmark is None or pb is None or benchmark_pb is None:
            rows.append({
                "ticker": ticker,
                "status": "error",
                "assetClass": "equity" if ticker != "IYR" else "real_estate",
                "provider": config["provider"],
                "sourceUrl": config["url"],
                "asOf": today,
                "primaryMetric": metric_label(metric),
                "primaryMultiple": primary,
                "benchmarkMultiple": benchmark,
                "primaryRelative": None,
                "priceToBook": pb,
                "benchmarkPriceToBook": benchmark_pb,
                "pbRelative": None,
                "crossSectionScore": None,
                "trackedHistoryPercentile": None,
                "historySamples": len(history.get(ticker, [])),
                "valueScore": None,
                "note": "Sponsor page loaded, but one or more valuation fields could not be parsed.",
            })
            continue

        primary_relative = primary / benchmark
        pb_relative = pb / benchmark_pb
        cross_score = ratio_score(primary_relative) * 0.65 + ratio_score(pb_relative) * 0.35

        entries = upsert_history(
            history,
            ticker,
            today,
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
            "asOf": today,
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
                "Value score blends the ETF's primary valuation multiple and P/B versus SPY. "
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
            "Non-earnings assets are intentionally not assigned P/E-style value scores."
        ),
    }

    type_header = """export type ValuationStatus = 'automated' | 'not_applicable' | 'error';

export type GeneratedValuationRow = {
  ticker: string;
  status: ValuationStatus;
  assetClass: 'equity' | 'real_estate' | 'non_earnings';
  provider: string | null;
  sourceUrl: string | null;
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
