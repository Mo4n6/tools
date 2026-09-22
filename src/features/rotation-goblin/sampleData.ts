import { benchmarkSnapshot, marketDataMeta, technicalRows } from './marketData.generated';
import { valuationDataMeta, valuationRows, type ValuationStatus } from './valuationData.generated';
import { pipelineStatus } from './pipelineStatus.generated';
import { decisionEngineMeta, decisionEngineRows, type DecisionComponentScores, type DecisionSignal } from './decisionEngine.generated';

export type Phase = 'Capitulation' | 'Accumulation' | 'Rotation' | 'Momentum' | 'Crowded' | 'Decay';
export type Trend = 'up' | 'flat' | 'down';

export type EtfRow = {
  ticker: string;
  theme: string;
  valueScore: number | null;
  valueStatus: ValuationStatus;
  valuationMetric: string | null;
  valuationMultiple: number | null;
  valuationBenchmarkMultiple: number | null;
  valuationRelative: number | null;
  priceToBook: number | null;
  pbRelative: number | null;
  valuationProvider: string | null;
  valuationSourceUrl: string | null;
  valuationProxyTicker: string | null;
  valuationHistorySamples: number;
  trackedHistoryPercentile: number | null;
  valuationNote: string;
  price: number | null;
  asOf: string;
  rsi14w: number;
  rsiTrend: Trend;
  relativeRsi: number;
  relativeTrend: Trend;
  rel1m: number;
  rel3m: number;
  rel6m: number;
  rel12m: number;
  drawdown52w: number;
  above200d: boolean;
  phase: Phase;
  decisionScore: number;
  decisionSignal: DecisionSignal;
  decisionComponents: DecisionComponentScores;
  historicalEdgeMonthlyPct: number;
  note: string;
};

type AssetMeta = {
  ticker: string;
  theme: string;
};

const assetMeta: AssetMeta[] = [
  { ticker:'XLE', theme:'Energy' },
  { ticker:'XLF', theme:'Financials' },
  { ticker:'XLB', theme:'Materials' },
  { ticker:'XLU', theme:'Utilities' },
  { ticker:'XLV', theme:'Health Care' },
  { ticker:'XLI', theme:'Industrials' },
  { ticker:'XLK', theme:'Technology' },
  { ticker:'SMH', theme:'Semiconductors' },
  { ticker:'IWM', theme:'U.S. Small Caps' },
  { ticker:'IYR', theme:'U.S. Real Estate' },
  { ticker:'EFA', theme:'Developed ex-U.S.' },
  { ticker:'EEM', theme:'Emerging Markets' },
  { ticker:'GLD', theme:'Gold' },
  { ticker:'TLT', theme:'Long Treasuries' },
  { ticker:'PDBC', theme:'Broad Commodities' },
  { ticker:'KMLM', theme:'Managed Futures' },
  { ticker:'UUP', theme:'U.S. Dollar' },
];

const phaseFor = (
  valueScore:number|null,
  row:(typeof technicalRows)[number],
):Phase => {
  if (valueScore !== null && valueScore < 35 && row.rsi14w >= 70 && row.relativeRsi >= 65) return 'Crowded';
  if (row.rsi14w <= 35 && row.relativeRsi <= 40) return 'Capitulation';
  if (row.relativeRsi < 38 && row.rel6m < 0 && row.rsi14w < 45) return 'Decay';
  if (row.relativeRsi >= 55 && row.rel3m > 0 && row.rsi14w >= 45 && row.rsi14w < 68) return 'Rotation';
  if (row.rsi14w >= 65 && row.relativeRsi >= 60 && row.rel3m > 0) return 'Momentum';
  if (valueScore !== null && valueScore >= 60 && row.rsiTrend !== 'down') return 'Accumulation';
  if (row.relativeRsi < 45 && row.rel6m < 0) return 'Decay';
  return row.relativeRsi >= 55 && row.rel3m > 0 ? 'Rotation' : 'Accumulation';
};

const noteFor = (phase:Phase,valueStatus:ValuationStatus):string => {
  const valuationClause = valueStatus === 'not_applicable'
    ? ' Equity-style valuation multiples are not meaningful for this asset; the Decision Score is technical-only regardless.'
    : valueStatus === 'stale'
      ? ' Valuation context is using a recent last-known-good sponsor snapshot; the technical Decision Score is unaffected.'
      : valueStatus === 'error'
        ? ' Valuation context is temporarily unavailable; the technical Decision Score is unaffected.'
        : '';

  switch (phase) {
    case 'Capitulation': return 'Price is washed out, but the model wants evidence that selling pressure is actually ending before treating weakness as opportunity.' + valuationClause;
    case 'Accumulation': return 'Valuation and/or price action are supportive and momentum is repairing, but relative outperformance is not fully confirmed yet.' + valuationClause;
    case 'Rotation': return 'Relative strength has turned constructive before the opportunity is fully mature — the setup this radar is designed to surface.' + valuationClause;
    case 'Momentum': return 'Absolute and relative trends are strong. The easy re-rating may already be underway, so entry price matters more.' + valuationClause;
    case 'Crowded': return 'Momentum is strong but valuation is rich versus SPY, increasing chase risk.' + valuationClause;
    case 'Decay': return 'Relative momentum is deteriorating. Cheapness alone is not enough until trend repair appears.' + valuationClause;
  }
};

const technicalByTicker = new Map(technicalRows.map((row) => [row.ticker,row]));
const valuationByTicker = new Map(valuationRows.map((row) => [row.ticker,row]));
const decisionByTicker = new Map(decisionEngineRows.map((row) => [row.ticker,row]));

export const sampleEtfs: EtfRow[] = assetMeta.flatMap((meta) => {
  const technical = technicalByTicker.get(meta.ticker);
  const valuation = valuationByTicker.get(meta.ticker);
  const decision = decisionByTicker.get(meta.ticker);
  if (!technical || !valuation || !decision) return [];

  const valueScore = valuation.status === 'automated' || valuation.status === 'stale' ? valuation.valueScore : null;
  const phase = phaseFor(valueScore,technical);

  return [{
    ...meta,
    valueScore,
    valueStatus:valuation.status,
    valuationMetric:valuation.primaryMetric,
    valuationMultiple:valuation.primaryMultiple,
    valuationBenchmarkMultiple:valuation.benchmarkMultiple,
    valuationRelative:valuation.primaryRelative,
    priceToBook:valuation.priceToBook,
    pbRelative:valuation.pbRelative,
    valuationProvider:valuation.provider,
    valuationSourceUrl:valuation.sourceUrl,
    valuationProxyTicker:valuation.proxyTicker ?? null,
    valuationHistorySamples:valuation.historySamples,
    trackedHistoryPercentile:valuation.trackedHistoryPercentile,
    valuationNote:valuation.note,
    price:technical.price,
    asOf:technical.asOf,
    rsi14w:technical.rsi14w,
    rsiTrend:technical.rsiTrend,
    relativeRsi:technical.relativeRsi,
    relativeTrend:technical.relativeTrend,
    rel1m:technical.rel1m,
    rel3m:technical.rel3m,
    rel6m:technical.rel6m,
    rel12m:technical.rel12m,
    drawdown52w:technical.drawdown52w,
    above200d:technical.above200d,
    phase,
    decisionScore:decision.decisionScore,
    decisionSignal:decision.signal,
    decisionComponents:decision.componentScores,
    historicalEdgeMonthlyPct:decision.historicalEdgeMonthlyPct,
    note:noteFor(phase,valuation.status),
  }];
});

const valuationSourceDates = valuationRows
  .filter((row) => row.status === 'automated' || row.status === 'stale')
  .map((row) => row.asOf)
  .filter(Boolean)
  .sort();

const oldestValuationSourceAsOf = valuationSourceDates[0] ?? null;
const newestValuationSourceAsOf = valuationSourceDates[valuationSourceDates.length - 1] ?? null;

const technical = (ticker:string) => technicalByTicker.get(ticker);

const directional = (value:number,upLabel:string,downLabel:string):{value:string;tone:'good'|'warn'|'bad'} => {
  if (value >= 2) return { value:upLabel, tone:'good' };
  if (value <= -2) return { value:downLabel, tone:'bad' };
  return { value:'MIXED', tone:'warn' };
};

const commodity = technical('PDBC');
const dollar = technical('UUP');
const bonds = technical('TLT');
const smallCaps = technical('IWM');
const gold = technical('GLD');
const technology = technical('XLK');
const semiconductors = technical('SMH');

const spyRiskOn = benchmarkSnapshot.above200d && benchmarkSnapshot.ret3m > 0;
const spyRiskOff = !benchmarkSnapshot.above200d && benchmarkSnapshot.ret3m < 0;

export const regimeCards = [
  {
    label:'SPY trend',
    value:spyRiskOn ? 'RISK-ON' : spyRiskOff ? 'RISK-OFF' : 'MIXED',
    tone:spyRiskOn ? 'good' : spyRiskOff ? 'bad' : 'warn',
    note:`${benchmarkSnapshot.ret3m >= 0 ? '+' : ''}${benchmarkSnapshot.ret3m.toFixed(1)}% / 3M • ${benchmarkSnapshot.above200d ? 'above' : 'below'} 200D`,
  },
  {
    label:'Commodities',
    ...directional(commodity?.ret3m ?? 0,'RISING','FALLING'),
    note:`${commodity?.ret3m && commodity.ret3m > 0 ? '+' : ''}${(commodity?.ret3m ?? 0).toFixed(1)}% / 3M`,
  },
  {
    label:'USD',
    ...directional(dollar?.ret3m ?? 0,'RISING','FALLING'),
    note:`${dollar?.ret3m && dollar.ret3m > 0 ? '+' : ''}${(dollar?.ret3m ?? 0).toFixed(1)}% / 3M`,
  },
  {
    label:'Bonds',
    ...directional(bonds?.ret3m ?? 0,'STRONG','WEAK'),
    note:`${bonds?.ret3m && bonds.ret3m > 0 ? '+' : ''}${(bonds?.ret3m ?? 0).toFixed(1)}% / 3M`,
  },
  {
    label:'Small caps vs SPY',
    ...directional(smallCaps?.rel3m ?? 0,'OUTPERFORM','LAGGING'),
    note:`${smallCaps?.rel3m && smallCaps.rel3m > 0 ? '+' : ''}${(smallCaps?.rel3m ?? 0).toFixed(1)}% relative / 3M`,
  },
  {
    label:'Gold vs SPY',
    ...directional(gold?.rel3m ?? 0,'OUTPERFORM','LAGGING'),
    note:`${gold?.rel3m && gold.rel3m > 0 ? '+' : ''}${(gold?.rel3m ?? 0).toFixed(1)}% relative / 3M`,
  },
  {
    label:'Tech vs SPY',
    ...directional(technology?.rel3m ?? 0,'OUTPERFORM','LAGGING'),
    note:`${technology?.rel3m && technology.rel3m > 0 ? '+' : ''}${(technology?.rel3m ?? 0).toFixed(1)}% relative / 3M`,
  },
  {
    label:'Semis vs SPY',
    ...directional(semiconductors?.rel3m ?? 0,'OUTPERFORM','LAGGING'),
    note:`${semiconductors?.rel3m && semiconductors.rel3m > 0 ? '+' : ''}${(semiconductors?.rel3m ?? 0).toFixed(1)}% relative / 3M`,
  },
] as const;

export const dataMeta = {
  technicals: marketDataMeta,
  valuations: valuationDataMeta,
  pipeline: pipelineStatus,
  decisionEngine: decisionEngineMeta,
  technicalSessionAsOf: benchmarkSnapshot.asOf,
  oldestValuationSourceAsOf,
  newestValuationSourceAsOf,
  staleValuationTickers: valuationRows.filter((row) => row.status === 'stale').map((row) => row.ticker),
};
