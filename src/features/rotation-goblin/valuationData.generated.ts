export type ValuationStatus = 'automated' | 'not_applicable' | 'error';

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

export const valuationDataMeta = {
  "generatedAt": "2026-09-22T00:00:00Z",
  "benchmark": "SPY",
  "minimumHistorySamples": 20,
  "automatedTickers": ["EEM","EFA","IWM","IYR","XLB","XLE","XLF","XLI","XLU","XLV"],
  "notApplicableTickers": ["GLD","KMLM","PDBC","TLT","UUP"],
  "providers": ["State Street","iShares"],
  "note": "Seeded from official sponsor valuation fields; the scheduled workflow refreshes these values automatically."
} as const;

export const valuationRows: GeneratedValuationRow[] = [
  {"ticker":"EEM","status":"automated","assetClass":"equity","provider":"iShares","sourceUrl":"https://www.ishares.com/us/products/239637/ishares-msci-emerging-markets-etf","asOf":"2026-09-22","primaryMetric":"P/E","primaryMultiple":19.37,"benchmarkMultiple":24.83,"primaryRelative":0.7801,"priceToBook":2.69,"benchmarkPriceToBook":5.21,"pbRelative":0.5163,"crossSectionScore":81.2,"trackedHistoryPercentile":null,"historySamples":1,"valueScore":81.2,"note":"Tracked-history percentile activates after 20 samples; currently 1."},
  {"ticker":"EFA","status":"automated","assetClass":"equity","provider":"iShares","sourceUrl":"https://www.ishares.com/us/products/239623/ishares-msci-eafe-etf","asOf":"2026-09-22","primaryMetric":"P/E","primaryMultiple":19.16,"benchmarkMultiple":24.83,"primaryRelative":0.7716,"priceToBook":2.37,"benchmarkPriceToBook":5.21,"pbRelative":0.4549,"crossSectionScore":82.3,"trackedHistoryPercentile":null,"historySamples":1,"valueScore":82.3,"note":"Tracked-history percentile activates after 20 samples; currently 1."},
  {"ticker":"IWM","status":"automated","assetClass":"equity","provider":"iShares","sourceUrl":"https://www.ishares.com/us/products/239710/ishares-russell-2000-etf","asOf":"2026-09-22","primaryMetric":"P/E","primaryMultiple":18.31,"benchmarkMultiple":24.83,"primaryRelative":0.7374,"priceToBook":2.11,"benchmarkPriceToBook":5.21,"pbRelative":0.4050,"crossSectionScore":84.6,"trackedHistoryPercentile":null,"historySamples":1,"valueScore":84.6,"note":"Tracked-history percentile activates after 20 samples; currently 1."},
  {"ticker":"IYR","status":"automated","assetClass":"real_estate","provider":"iShares","sourceUrl":"https://www.ishares.com/us/products/239520/ishares-us-real-estate-etf","asOf":"2026-09-22","primaryMetric":"P/CF","primaryMultiple":17.10,"benchmarkMultiple":18.10,"primaryRelative":0.9448,"priceToBook":2.49,"benchmarkPriceToBook":5.21,"pbRelative":0.4779,"crossSectionScore":71.1,"trackedHistoryPercentile":null,"historySamples":1,"valueScore":71.1,"note":"Tracked-history percentile activates after 20 samples; currently 1."},
  {"ticker":"XLB","status":"automated","assetClass":"equity","provider":"State Street","sourceUrl":"https://www.ssga.com/us/en/intermediary/etfs/state-street-materials-select-sector-spdr-etf-xlb","asOf":"2026-09-22","primaryMetric":"Forward P/E (FY1)","primaryMultiple":17.34,"benchmarkMultiple":21.08,"primaryRelative":0.8226,"priceToBook":2.84,"benchmarkPriceToBook":5.21,"pbRelative":0.5451,"crossSectionScore":77.5,"trackedHistoryPercentile":null,"historySamples":1,"valueScore":77.5,"note":"Tracked-history percentile activates after 20 samples; currently 1."},
  {"ticker":"XLE","status":"automated","assetClass":"equity","provider":"State Street","sourceUrl":"https://www.ssga.com/us/en/intermediary/etfs/state-street-energy-select-sector-spdr-etf-xle","asOf":"2026-09-22","primaryMetric":"Forward P/E (FY1)","primaryMultiple":12.74,"benchmarkMultiple":21.08,"primaryRelative":0.6044,"priceToBook":2.63,"benchmarkPriceToBook":5.21,"pbRelative":0.5048,"crossSectionScore":93.0,"trackedHistoryPercentile":null,"historySamples":1,"valueScore":93.0,"note":"Tracked-history percentile activates after 20 samples; currently 1."},
  {"ticker":"XLF","status":"automated","assetClass":"equity","provider":"State Street","sourceUrl":"https://www.ssga.com/us/en/intermediary/etfs/state-street-financial-select-sector-spdr-etf-xlf","asOf":"2026-09-22","primaryMetric":"Forward P/E (FY1)","primaryMultiple":15.91,"benchmarkMultiple":21.08,"primaryRelative":0.7547,"priceToBook":2.41,"benchmarkPriceToBook":5.21,"pbRelative":0.4626,"crossSectionScore":83.4,"trackedHistoryPercentile":null,"historySamples":1,"valueScore":83.4,"note":"Tracked-history percentile activates after 20 samples; currently 1."},
  {"ticker":"XLI","status":"automated","assetClass":"equity","provider":"State Street","sourceUrl":"https://www.ssga.com/us/en/intermediary/etfs/state-street-industrial-select-sector-spdr-etf-xli","asOf":"2026-09-22","primaryMetric":"Forward P/E (FY1)","primaryMultiple":24.59,"benchmarkMultiple":21.08,"primaryRelative":1.1665,"priceToBook":6.63,"benchmarkPriceToBook":5.21,"pbRelative":1.2726,"crossSectionScore":29.6,"trackedHistoryPercentile":null,"historySamples":1,"valueScore":29.6,"note":"Tracked-history percentile activates after 20 samples; currently 1."},
  {"ticker":"XLU","status":"automated","assetClass":"equity","provider":"State Street","sourceUrl":"https://www.ssga.com/us/en/intermediary/etfs/state-street-utilities-select-sector-spdr-etf-xlu","asOf":"2026-09-22","primaryMetric":"Forward P/E (FY1)","primaryMultiple":17.81,"benchmarkMultiple":21.08,"primaryRelative":0.8449,"priceToBook":2.17,"benchmarkPriceToBook":5.21,"pbRelative":0.4165,"crossSectionScore":77.6,"trackedHistoryPercentile":null,"historySamples":1,"valueScore":77.6,"note":"Tracked-history percentile activates after 20 samples; currently 1."},
  {"ticker":"XLV","status":"automated","assetClass":"equity","provider":"State Street","sourceUrl":"https://www.ssga.com/us/en/intermediary/etfs/state-street-health-care-select-sector-spdr-etf-xlv","asOf":"2026-09-22","primaryMetric":"Forward P/E (FY1)","primaryMultiple":19.82,"benchmarkMultiple":21.08,"primaryRelative":0.9402,"priceToBook":4.66,"benchmarkPriceToBook":5.21,"pbRelative":0.8944,"crossSectionScore":57.6,"trackedHistoryPercentile":null,"historySamples":1,"valueScore":57.6,"note":"Tracked-history percentile activates after 20 samples; currently 1."},
  {"ticker":"GLD","status":"not_applicable","assetClass":"non_earnings","provider":null,"sourceUrl":null,"asOf":"2026-09-22","primaryMetric":null,"primaryMultiple":null,"benchmarkMultiple":null,"primaryRelative":null,"priceToBook":null,"benchmarkPriceToBook":null,"pbRelative":null,"crossSectionScore":null,"trackedHistoryPercentile":null,"historySamples":0,"valueScore":null,"note":"Gold does not have an earnings multiple comparable with SPY."},
  {"ticker":"TLT","status":"not_applicable","assetClass":"non_earnings","provider":null,"sourceUrl":null,"asOf":"2026-09-22","primaryMetric":null,"primaryMultiple":null,"benchmarkMultiple":null,"primaryRelative":null,"priceToBook":null,"benchmarkPriceToBook":null,"pbRelative":null,"crossSectionScore":null,"trackedHistoryPercentile":null,"historySamples":0,"valueScore":null,"note":"Long-duration Treasuries are better valued with yield/term-premium measures than P/E."},
  {"ticker":"PDBC","status":"not_applicable","assetClass":"non_earnings","provider":null,"sourceUrl":null,"asOf":"2026-09-22","primaryMetric":null,"primaryMultiple":null,"benchmarkMultiple":null,"primaryRelative":null,"priceToBook":null,"benchmarkPriceToBook":null,"pbRelative":null,"crossSectionScore":null,"trackedHistoryPercentile":null,"historySamples":0,"valueScore":null,"note":"Broad commodities do not have an earnings multiple comparable with SPY."},
  {"ticker":"KMLM","status":"not_applicable","assetClass":"non_earnings","provider":null,"sourceUrl":null,"asOf":"2026-09-22","primaryMetric":null,"primaryMultiple":null,"benchmarkMultiple":null,"primaryRelative":null,"priceToBook":null,"benchmarkPriceToBook":null,"pbRelative":null,"crossSectionScore":null,"trackedHistoryPercentile":null,"historySamples":0,"valueScore":null,"note":"Managed futures do not have an earnings multiple comparable with SPY."},
  {"ticker":"UUP","status":"not_applicable","assetClass":"non_earnings","provider":null,"sourceUrl":null,"asOf":"2026-09-22","primaryMetric":null,"primaryMultiple":null,"benchmarkMultiple":null,"primaryRelative":null,"priceToBook":null,"benchmarkPriceToBook":null,"pbRelative":null,"crossSectionScore":null,"trackedHistoryPercentile":null,"historySamples":0,"valueScore":null,"note":"A currency index does not have an earnings multiple comparable with SPY."}
];
