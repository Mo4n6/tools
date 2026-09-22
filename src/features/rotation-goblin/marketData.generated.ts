export type GeneratedTrend = 'up' | 'flat' | 'down';

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

export const marketDataMeta = {
  source:'seed',
  generatedAt:'2026-09-22T00:00:00Z',
  benchmark:'SPY',
  live:false,
  note:'Seed values are bundled only so the UI remains functional before the first scheduled refresh.',
} as const;

export const benchmarkSnapshot = {
  ticker:'SPY',
  price:null,
  asOf:'2026-09-22',
  ret3m:3.0,
  ret12m:12.0,
  above200d:true,
} as const;

export const technicalRows: GeneratedTechnicalRow[] = [
  {ticker:'XLE',price:null,asOf:'2026-09-22',rsi14w:47,rsiTrend:'up',relativeRsi:54,relativeTrend:'up',ret3m:5.0,rel1m:2.0,rel3m:4.0,rel6m:8.1,rel12m:3.0,drawdown52w:-12,above200d:true,history:[{month:'seed',value:78}]},
  {ticker:'XLF',price:null,asOf:'2026-09-22',rsi14w:52,rsiTrend:'up',relativeRsi:55,relativeTrend:'up',ret3m:4.0,rel1m:1.0,rel3m:2.0,rel6m:3.3,rel12m:2.0,drawdown52w:-8,above200d:true,history:[{month:'seed',value:81}]},
  {ticker:'XLB',price:null,asOf:'2026-09-22',rsi14w:57,rsiTrend:'up',relativeRsi:62,relativeTrend:'up',ret3m:7.0,rel1m:2.0,rel3m:5.0,rel6m:6.4,rel12m:5.0,drawdown52w:-7,above200d:true,history:[{month:'seed',value:88}]},
  {ticker:'XLU',price:null,asOf:'2026-09-22',rsi14w:61,rsiTrend:'up',relativeRsi:58,relativeTrend:'up',ret3m:6.0,rel1m:1.5,rel3m:3.0,rel6m:4.8,rel12m:4.0,drawdown52w:-5,above200d:true,history:[{month:'seed',value:82}]},
  {ticker:'XLV',price:null,asOf:'2026-09-22',rsi14w:39,rsiTrend:'up',relativeRsi:42,relativeTrend:'flat',ret3m:1.0,rel1m:0.5,rel3m:-1.0,rel6m:-2.1,rel12m:-4.0,drawdown52w:-15,above200d:false,history:[{month:'seed',value:66}]},
  {ticker:'XLI',price:null,asOf:'2026-09-22',rsi14w:73,rsiTrend:'flat',relativeRsi:75,relativeTrend:'up',ret3m:10.0,rel1m:3.0,rel3m:8.0,rel6m:15.2,rel12m:18.0,drawdown52w:-2,above200d:true,history:[{month:'seed',value:48}]},
  {ticker:'IWM',price:null,asOf:'2026-09-22',rsi14w:56,rsiTrend:'up',relativeRsi:64,relativeTrend:'up',ret3m:8.0,rel1m:2.0,rel3m:4.0,rel6m:7.3,rel12m:2.0,drawdown52w:-8,above200d:true,history:[{month:'seed',value:84}]},
  {ticker:'IYR',price:null,asOf:'2026-09-22',rsi14w:31,rsiTrend:'up',relativeRsi:34,relativeTrend:'flat',ret3m:-4.0,rel1m:-1.0,rel3m:-4.0,rel6m:-8.6,rel12m:-10.0,drawdown52w:-24,above200d:false,history:[{month:'seed',value:44}]},
  {ticker:'EFA',price:null,asOf:'2026-09-22',rsi14w:54,rsiTrend:'up',relativeRsi:57,relativeTrend:'up',ret3m:5.0,rel1m:1.0,rel3m:2.0,rel6m:3.9,rel12m:6.0,drawdown52w:-7,above200d:true,history:[{month:'seed',value:79}]},
  {ticker:'EEM',price:null,asOf:'2026-09-22',rsi14w:49,rsiTrend:'up',relativeRsi:51,relativeTrend:'up',ret3m:4.0,rel1m:1.0,rel3m:1.0,rel6m:1.8,rel12m:4.0,drawdown52w:-10,above200d:true,history:[{month:'seed',value:71}]},
  {ticker:'GLD',price:null,asOf:'2026-09-22',rsi14w:69,rsiTrend:'up',relativeRsi:72,relativeTrend:'up',ret3m:9.0,rel1m:2.0,rel3m:6.0,rel6m:12.4,rel12m:15.0,drawdown52w:-3,above200d:true,history:[{month:'seed',value:72}]},
  {ticker:'TLT',price:null,asOf:'2026-09-22',rsi14w:34,rsiTrend:'down',relativeRsi:29,relativeTrend:'down',ret3m:-6.0,rel1m:-2.0,rel3m:-7.0,rel6m:-10.7,rel12m:-12.0,drawdown52w:-20,above200d:false,history:[{month:'seed',value:29}]},
  {ticker:'PDBC',price:null,asOf:'2026-09-22',rsi14w:64,rsiTrend:'up',relativeRsi:67,relativeTrend:'up',ret3m:8.0,rel1m:2.0,rel3m:5.0,rel6m:9.6,rel12m:7.0,drawdown52w:-4,above200d:true,history:[{month:'seed',value:78}]},
  {ticker:'KMLM',price:null,asOf:'2026-09-22',rsi14w:59,rsiTrend:'up',relativeRsi:63,relativeTrend:'up',ret3m:6.0,rel1m:1.0,rel3m:3.0,rel6m:5.2,rel12m:4.0,drawdown52w:-6,above200d:true,history:[{month:'seed',value:70}]},
  {ticker:'UUP',price:null,asOf:'2026-09-22',rsi14w:48,rsiTrend:'flat',relativeRsi:49,relativeTrend:'flat',ret3m:0.5,rel1m:0.0,rel3m:0.2,rel6m:0.5,rel12m:1.0,drawdown52w:-4,above200d:true,history:[{month:'seed',value:55}]},
];
