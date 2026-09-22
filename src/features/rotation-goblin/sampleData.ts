import { benchmarkSnapshot, marketDataMeta, technicalRows } from './marketData.generated';

export type Phase = 'Capitulation' | 'Accumulation' | 'Rotation' | 'Momentum' | 'Crowded' | 'Decay';
export type Trend = 'up' | 'flat' | 'down';

export type EtfRow = {
  ticker: string;
  theme: string;
  valueScore: number;
  valueStatus: 'manual';
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
  rotationScore: number;
  contrarianScore: number;
  momentumScore: number;
  note: string;
  history: { month: string; value: number }[];
};

type AssetMeta = {
  ticker: string;
  theme: string;
  valueScore: number;
};

const assetMeta: AssetMeta[] = [
  { ticker:'XLE', theme:'Energy', valueScore:89 },
  { ticker:'XLF', theme:'Financials', valueScore:76 },
  { ticker:'XLB', theme:'Materials', valueScore:78 },
  { ticker:'XLU', theme:'Utilities', valueScore:72 },
  { ticker:'XLV', theme:'Health Care', valueScore:63 },
  { ticker:'XLI', theme:'Industrials', valueScore:31 },
  { ticker:'IWM', theme:'U.S. Small Caps', valueScore:74 },
  { ticker:'IYR', theme:'U.S. Real Estate', valueScore:82 },
  { ticker:'EFA', theme:'Developed ex-U.S.', valueScore:69 },
  { ticker:'EEM', theme:'Emerging Markets', valueScore:71 },
  { ticker:'GLD', theme:'Gold', valueScore:44 },
  { ticker:'TLT', theme:'Long Treasuries', valueScore:68 },
  { ticker:'PDBC', theme:'Broad Commodities', valueScore:58 },
  { ticker:'KMLM', theme:'Managed Futures', valueScore:50 },
  { ticker:'UUP', theme:'U.S. Dollar', valueScore:46 },
];

const clamp = (value:number):number => Math.max(0,Math.min(100,value));
const rsiSweetSpot = (rsi:number):number => clamp(100 - Math.abs(rsi - 58) * 4);
const momentumRsiScore = (rsi:number):number => clamp((rsi - 35) * 2.25);
const relativeRsiScore = (rsi:number):number => clamp((rsi - 35) * 2.5);
const relativePerformanceScore = (rel6m:number):number => clamp(50 + rel6m * 3);
const oversoldScore = (rsi:number):number => clamp((50 - rsi) * 3);
const drawdownScore = (drawdown52w:number):number => clamp(Math.abs(Math.min(0,drawdown52w)) * 4);

const phaseFor = (valueScore:number,row:(typeof technicalRows)[number]):Phase => {
  if (valueScore < 40 && row.rsi14w >= 70 && row.relativeRsi >= 65) return 'Crowded';
  if (row.rsi14w <= 35 && row.relativeRsi <= 40) return 'Capitulation';
  if (row.relativeRsi < 38 && row.rel6m < 0 && row.rsi14w < 45) return 'Decay';
  if (row.relativeRsi >= 55 && row.rel3m > 0 && row.rsi14w >= 45 && row.rsi14w < 68) return 'Rotation';
  if (row.rsi14w >= 65 && row.relativeRsi >= 60) return 'Momentum';
  if (valueScore >= 60 && row.rsiTrend !== 'down') return 'Accumulation';
  if (row.relativeRsi < 45 && row.rel6m < 0) return 'Decay';
  return row.relativeRsi >= 55 ? 'Rotation' : 'Accumulation';
};

const noteFor = (phase:Phase):string => {
  switch (phase) {
    case 'Capitulation': return 'Price is washed out, but the model wants evidence that selling pressure is actually ending before treating weakness as opportunity.';
    case 'Accumulation': return 'Valuation is supportive and momentum is repairing, but relative outperformance is not fully confirmed yet.';
    case 'Rotation': return 'Relative strength has turned constructive while valuation still offers some support — the setup this radar is designed to surface.';
    case 'Momentum': return 'Absolute and relative trends are strong. The easy re-rating may already be underway, so valuation matters more.';
    case 'Crowded': return 'Momentum is strong but the manual valuation snapshot is rich, increasing chase risk.';
    case 'Decay': return 'Relative momentum is deteriorating. Cheapness alone is not enough until trend repair appears.';
  }
};

const technicalByTicker = new Map(technicalRows.map((row) => [row.ticker,row]));

export const sampleEtfs: EtfRow[] = assetMeta.flatMap((meta) => {
  const technical = technicalByTicker.get(meta.ticker);
  if (!technical) return [];

  const rotationScore = Math.round(
    meta.valueScore * 0.30 +
    rsiSweetSpot(technical.rsi14w) * 0.15 +
    relativeRsiScore(technical.relativeRsi) * 0.30 +
    relativePerformanceScore(technical.rel6m) * 0.25
  );
  const contrarianScore = Math.round(
    meta.valueScore * 0.45 +
    oversoldScore(technical.rsi14w) * 0.30 +
    drawdownScore(technical.drawdown52w) * 0.25
  );
  const momentumScore = Math.round(
    momentumRsiScore(technical.rsi14w) * 0.35 +
    relativeRsiScore(technical.relativeRsi) * 0.40 +
    relativePerformanceScore(technical.rel6m) * 0.25
  );
  const phase = phaseFor(meta.valueScore,technical);

  return [{
    ...meta,
    valueStatus:'manual' as const,
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
    rotationScore,
    contrarianScore,
    momentumScore,
    note:noteFor(phase),
    history:technical.history,
  }];
});

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
] as const;

export const dataMeta = marketDataMeta;
