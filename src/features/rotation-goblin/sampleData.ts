export type Phase = 'Capitulation' | 'Accumulation' | 'Rotation' | 'Momentum' | 'Crowded' | 'Decay';

export type EtfRow = {
  ticker: string;
  theme: string;
  valueScore: number;
  rsi14w: number;
  rsiTrend: 'up' | 'flat' | 'down';
  relativeRsi: number;
  relativeTrend: 'up' | 'flat' | 'down';
  rel6m: number;
  phase: Phase;
  rotationScore: number;
  contrarianScore: number;
  momentumScore: number;
  note: string;
  history: { month: string; value: number }[];
};

export const regimeCards = [
  { label: 'SPY trend', value: 'RISK-ON', tone: 'good', note: 'Broad market firm' },
  { label: 'Commodities', value: 'RISING', tone: 'good', note: 'Physical assets improving' },
  { label: 'USD', value: 'MIXED', tone: 'warn', note: 'No clean breakout' },
  { label: 'Bonds', value: 'WEAK', tone: 'bad', note: 'Duration under pressure' },
  { label: 'Inflation', value: 'STICKY', tone: 'warn', note: 'Disinflation uneven' },
  { label: 'Reorder pressure', value: 'HIGH', tone: 'good', note: 'Fragmentation / bottlenecks' },
] as const;

export const sampleEtfs: EtfRow[] = [
  { ticker:'XLE', theme:'Energy', valueScore:89, rsi14w:47, rsiTrend:'up', relativeRsi:54, relativeTrend:'up', rel6m:8.1, phase:'Accumulation', rotationScore:78, contrarianScore:91, momentumScore:55, note:'Deep value with improving momentum, but the model still wants stronger relative confirmation.', history:[['Jan',42],['Feb',45],['Mar',49],['Apr',55],['May',62],['Jun',68],['Jul',72],['Aug',75],['Sep',78]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'XLB', theme:'Materials', valueScore:78, rsi14w:57, rsiTrend:'up', relativeRsi:62, relativeTrend:'up', rel6m:6.4, phase:'Rotation', rotationScore:88, contrarianScore:74, momentumScore:71, note:'Cheap enough to matter while ETF/SPY momentum has already turned constructive.', history:[['Jan',39],['Feb',43],['Mar',48],['Apr',56],['May',65],['Jun',73],['Jul',80],['Aug',85],['Sep',88]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'XLF', theme:'Financials', valueScore:76, rsi14w:52, rsiTrend:'up', relativeRsi:55, relativeTrend:'up', rel6m:3.3, phase:'Rotation', rotationScore:81, contrarianScore:70, momentumScore:64, note:'Valuation remains supportive and relative momentum has crossed into a constructive zone.', history:[['Jan',52],['Feb',54],['Mar',57],['Apr',61],['May',66],['Jun',71],['Jul',76],['Aug',79],['Sep',81]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'XLU', theme:'Utilities', valueScore:72, rsi14w:61, rsiTrend:'up', relativeRsi:58, relativeTrend:'up', rel6m:4.8, phase:'Rotation', rotationScore:82, contrarianScore:61, momentumScore:69, note:'Defensive valuation plus improving relative strength puts utilities into the active rotation bucket.', history:[['Jan',48],['Feb',51],['Mar',55],['Apr',60],['May',67],['Jun',72],['Jul',77],['Aug',79],['Sep',82]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'XLV', theme:'Health Care', valueScore:63, rsi14w:39, rsiTrend:'up', relativeRsi:42, relativeTrend:'flat', rel6m:-2.1, phase:'Accumulation', rotationScore:66, contrarianScore:77, momentumScore:38, note:'Still lagging SPY, but absolute momentum is repairing from a weak base.', history:[['Jan',51],['Feb',48],['Mar',46],['Apr',49],['May',53],['Jun',57],['Jul',60],['Aug',63],['Sep',66]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'XLI', theme:'Industrials', valueScore:31, rsi14w:73, rsiTrend:'flat', relativeRsi:75, relativeTrend:'up', rel6m:15.2, phase:'Crowded', rotationScore:48, contrarianScore:18, momentumScore:90, note:'Strong trend, but valuation is rich and relative momentum is already extended.', history:[['Jan',75],['Feb',72],['Mar',67],['Apr',63],['May',60],['Jun',56],['Jul',52],['Aug',49],['Sep',48]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'IWM', theme:'U.S. Small Caps', valueScore:74, rsi14w:56, rsiTrend:'up', relativeRsi:64, relativeTrend:'up', rel6m:7.3, phase:'Rotation', rotationScore:84, contrarianScore:68, momentumScore:72, note:'Domestic risk appetite and relative momentum are improving while valuation remains supportive.', history:[['Jan',43],['Feb',46],['Mar',50],['Apr',58],['May',65],['Jun',71],['Jul',77],['Aug',82],['Sep',84]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'IYR', theme:'U.S. Real Estate', valueScore:82, rsi14w:31, rsiTrend:'up', relativeRsi:34, relativeTrend:'flat', rel6m:-8.6, phase:'Capitulation', rotationScore:44, contrarianScore:89, momentumScore:22, note:'Very cheap and washed out, but relative strength has not yet confirmed a durable turn.', history:[['Jan',57],['Feb',52],['Mar',48],['Apr',43],['May',39],['Jun',37],['Jul',39],['Aug',41],['Sep',44]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'EFA', theme:'Developed ex-U.S.', valueScore:69, rsi14w:54, rsiTrend:'up', relativeRsi:57, relativeTrend:'up', rel6m:3.9, phase:'Rotation', rotationScore:79, contrarianScore:62, momentumScore:67, note:'International developed markets are beginning to outperform enough to register as rotation.', history:[['Jan',50],['Feb',53],['Mar',56],['Apr',61],['May',66],['Jun',70],['Jul',73],['Aug',76],['Sep',79]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'EEM', theme:'Emerging Markets', valueScore:71, rsi14w:49, rsiTrend:'up', relativeRsi:51, relativeTrend:'up', rel6m:1.8, phase:'Accumulation', rotationScore:71, contrarianScore:73, momentumScore:54, note:'Valuation is supportive and relative strength is improving, but the breakout is not decisive yet.', history:[['Jan',47],['Feb',49],['Mar',51],['Apr',55],['May',59],['Jun',63],['Jul',66],['Aug',69],['Sep',71]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'GLD', theme:'Gold', valueScore:44, rsi14w:69, rsiTrend:'up', relativeRsi:72, relativeTrend:'up', rel6m:12.4, phase:'Momentum', rotationScore:72, contrarianScore:31, momentumScore:91, note:'Strong absolute and relative trend; no longer a bargain, but the trend remains intact.', history:[['Jan',51],['Feb',55],['Mar',60],['Apr',64],['May',67],['Jun',70],['Jul',73],['Aug',74],['Sep',72]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'TLT', theme:'Long Treasuries', valueScore:68, rsi14w:34, rsiTrend:'down', relativeRsi:29, relativeTrend:'down', rel6m:-10.7, phase:'Decay', rotationScore:29, contrarianScore:62, momentumScore:15, note:'Cheapness is not enough: relative momentum continues to deteriorate.', history:[['Jan',53],['Feb',49],['Mar',46],['Apr',42],['May',38],['Jun',35],['Jul',33],['Aug',31],['Sep',29]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'PDBC', theme:'Broad Commodities', valueScore:58, rsi14w:64, rsiTrend:'up', relativeRsi:67, relativeTrend:'up', rel6m:9.6, phase:'Momentum', rotationScore:78, contrarianScore:44, momentumScore:86, note:'Commodities are displaying confirmed relative strength, though valuation is less direct than for equity sectors.', history:[['Jan',46],['Feb',50],['Mar',56],['Apr',62],['May',68],['Jun',72],['Jul',76],['Aug',79],['Sep',78]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'KMLM', theme:'Managed Futures', valueScore:50, rsi14w:59, rsiTrend:'up', relativeRsi:63, relativeTrend:'up', rel6m:5.2, phase:'Momentum', rotationScore:70, contrarianScore:40, momentumScore:80, note:'Trend-following exposure is working and remains useful as a regime diversifier rather than a valuation trade.', history:[['Jan',48],['Feb',52],['Mar',57],['Apr',61],['May',66],['Jun',69],['Jul',72],['Aug',71],['Sep',70]].map(([month,value])=>({month:String(month),value:Number(value)})) },
  { ticker:'UUP', theme:'U.S. Dollar', valueScore:46, rsi14w:48, rsiTrend:'flat', relativeRsi:49, relativeTrend:'flat', rel6m:0.5, phase:'Accumulation', rotationScore:55, contrarianScore:50, momentumScore:48, note:'The dollar is not sending a clean directional signal, so the model keeps it neutral.', history:[['Jan',52],['Feb',51],['Mar',50],['Apr',52],['May',53],['Jun',54],['Jul',55],['Aug',55],['Sep',55]].map(([month,value])=>({month:String(month),value:Number(value)})) },
];
