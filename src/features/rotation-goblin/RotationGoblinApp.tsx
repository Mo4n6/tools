// Rotation Goblin — sector rotation, RSI and relative-strength radar.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Not investment advice.

import { useEffect, useMemo, useState } from 'react';
import { dataMeta, type EtfRow, type Phase, sampleEtfs } from './sampleData';
import { PipelineStatusCard } from './PipelineStatusCard';

const phases: Phase[] = ['Capitulation','Accumulation','Rotation','Momentum','Crowded','Decay'];

const phaseMeta: Record<Phase,{ action:string; color:string; dot:string; description:string }> = {
  Capitulation:{ action:'WATCH / INVESTIGATE', color:'border-red-400/40 bg-red-500/10 text-red-200', dot:'bg-red-400', description:'Cheap and still falling. Oversold is not the same thing as a bottom.' },
  Accumulation:{ action:'RESEARCH / SCALE CAREFULLY', color:'border-amber-400/40 bg-amber-500/10 text-amber-200', dot:'bg-amber-400', description:'Selling pressure is easing while valuation remains attractive.' },
  Rotation:{ action:'PRIMARY BUY-ZONE CANDIDATE', color:'border-emerald-400/50 bg-emerald-500/10 text-emerald-100', dot:'bg-emerald-400', description:'Relative strength is improving before the valuation gap fully closes.' },
  Momentum:{ action:'HOLD / ADD SELECTIVELY', color:'border-sky-400/40 bg-sky-500/10 text-sky-200', dot:'bg-sky-400', description:'Trend is confirmed. Usually no longer the cheapest phase.' },
  Crowded:{ action:'DO NOT CHASE / CONSIDER TRIMMING', color:'border-violet-400/40 bg-violet-500/10 text-violet-200', dot:'bg-violet-400', description:'Strong narrative, rich valuation, and elevated chase risk.' },
  Decay:{ action:'REDUCE / AVOID UNTIL REPAIRED', color:'border-orange-400/40 bg-orange-500/10 text-orange-200', dot:'bg-orange-400', description:'Valuation and relative momentum are both deteriorating.' },
};

const scoreClass = (value:number|null):string => value === null ? 'text-zinc-500' : value >= 75 ? 'text-emerald-300' : value >= 50 ? 'text-amber-300' : 'text-zinc-400';

const decisionSignalClass = (signal:EtfRow['decisionSignal']):string => {
  if (signal === 'STRONG') return 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200';
  if (signal === 'CONSTRUCTIVE') return 'border-lime-400/40 bg-lime-500/10 text-lime-200';
  if (signal === 'WATCH') return 'border-amber-400/40 bg-amber-500/10 text-amber-200';
  if (signal === 'WEAK') return 'border-orange-400/40 bg-orange-500/10 text-orange-200';
  return 'border-red-400/50 bg-red-500/10 text-red-200';
};

const decisionComponentMeta = [
  ['relativeMomentum','Relative Momentum','Relative RSI, relative-RSI acceleration, 1M relative strength, and short-vs-medium acceleration.'],
  ['trendStructure','Trend Structure','Price vs 200DMA, 200DMA slope, and the 50DMA/200DMA spread.'],
  ['momentumState','Momentum State','14-week RSI and its 4-week rate of change.'],
  ['relativePerformance','Relative Performance','3M and 6M ETF/SPY relative returns.'],
  ['drawdownRecovery','Drawdown / Recovery','Distance from the 52-week high and recovery from the 52-week low.'],
] as const;

const calendarDaysSince = (dateText:string|null):number => {
  if (!dateText) return Number.POSITIVE_INFINITY;
  const then = new Date(`${dateText}T00:00:00Z`).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 86400000);
};

const businessDaysSince = (dateText:string|null):number => {
  if (!dateText) return Number.POSITIVE_INFINITY;
  const start = new Date(`${dateText}T00:00:00Z`);
  const end = new Date();
  let count = 0;
  const cursor = new Date(start);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
};

const pct = (value:number):string => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
const trend = (value:EtfRow['rsiTrend']):string => value === 'up' ? '↑' : value === 'down' ? '↓' : '→';

type HistoricalChartPoint = {
  date: string;
  rsi14w: number;
  relativeRsi14w: number;
  priceVs200dPct: number;
  sma50Vs200Pct: number;
};

const RotationChart = ({ row }:{ row:EtfRow }):JSX.Element => {
  const [rangeYears,setRangeYears] = useState<1|3|5|10>(5);
  const [historical,setHistorical] = useState<HistoricalChartPoint[]>([]);
  const [chartError,setChartError] = useState<string|null>(null);
  const [chartLoading,setChartLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setHistorical([]);
    setChartError(null);
    setChartLoading(true);
    const base = import.meta.env.BASE_URL || '/';
    const url = `${base}rotation-goblin/history/${encodeURIComponent(row.ticker)}.json`;
    fetch(url,{ signal:controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<HistoricalChartPoint[]>;
      })
      .then((points) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(points) || points.some((point) => !point || typeof point.date !== 'string' || !Number.isFinite(Date.parse(point.date)) || !Number.isFinite(point.rsi14w) || !Number.isFinite(point.relativeRsi14w))) {
          throw new Error('Invalid historical chart data');
        }
        setHistorical(points);
      })
      .catch((error:unknown) => {
        if (controller.signal.aborted) return;
        setChartError(error instanceof Error ? error.message : 'Unable to load chart history');
      })
      .finally(() => { if (!controller.signal.aborted) setChartLoading(false); });
    return () => controller.abort();
  },[row.ticker]);

  const latestDate = historical.length ? new Date(`${historical[historical.length - 1].date}T00:00:00Z`) : new Date();
  const cutoff = new Date(latestDate);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - rangeYears);
  const visible = historical.filter((point) => new Date(`${point.date}T00:00:00Z`) >= cutoff);

  const width = 700;
  const height = 250;
  const padX = 42;
  const padY = 28;
  const xFor = (index:number):number => padX + (index * (width - padX * 2)) / Math.max(1,visible.length - 1);
  const yFor = (value:number):number => height - padY - (value / 100) * (height - padY * 2);
  const rsiLine = visible.map((point,index)=>`${xFor(index)},${yFor(point.rsi14w)}`).join(' ');
  const relativeLine = visible.map((point,index)=>`${xFor(index)},${yFor(point.relativeRsi14w)}`).join(' ');
  const labelIndexes = visible.length
    ? Array.from(new Set([0,Math.floor((visible.length-1)*0.25),Math.floor((visible.length-1)*0.5),Math.floor((visible.length-1)*0.75),visible.length-1]))
    : [];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5 text-lime-200"><span className="h-0.5 w-5 bg-lime-300" />14W RSI</span>
          <span className="flex items-center gap-1.5 text-sky-200"><span className="h-0.5 w-5 bg-sky-300" />Relative RSI</span>
        </div>
        <div className="flex gap-1">
          {([1,3,5,10] as const).map((years)=><button key={years} type="button" onClick={()=>setRangeYears(years)} className={`rounded border px-2 py-1 text-[10px] font-bold ${rangeYears===years?'border-lime-400/50 bg-lime-500/10 text-lime-200':'border-emerald-500/20 text-emerald-300/45 hover:text-emerald-100'}`}>{years}Y</button>)}
        </div>
      </div>
      {chartError ? <div className="flex h-60 items-center justify-center text-sm text-red-200/80">Historical chart unavailable: {chartError}</div> : visible.length > 1 ? (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-60 w-full" role="img" aria-label={`${row.ticker} 14-week RSI and relative RSI history`}>
          {[30,50,70].map((level) => {
            const y = yFor(level);
            return <g key={level}><line x1={padX} y1={y} x2={width-padX} y2={y} stroke="rgba(52,211,153,0.14)" strokeDasharray={level===50?'4 4':undefined} /><text x="5" y={y+4} fill="#64748b" fontSize="11">{level}</text></g>;
          })}
          <polyline points={rsiLine} fill="none" stroke="#bef264" strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={relativeLine} fill="none" stroke="#7dd3fc" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round" />
          {labelIndexes.map((index) => <text key={visible[index].date} x={xFor(index)} y={height-5} textAnchor={index===0?'start':index===visible.length-1?'end':'middle'} fill="#64748b" fontSize="10">{visible[index].date.slice(0,4)}</text>)}
          <circle cx={xFor(visible.length-1)} cy={yFor(visible[visible.length-1].rsi14w)} r="3.5" fill="#bef264"><title>{`${visible[visible.length-1].date} • RSI ${visible[visible.length-1].rsi14w.toFixed(1)}`}</title></circle>
          <circle cx={xFor(visible.length-1)} cy={yFor(visible[visible.length-1].relativeRsi14w)} r="3.5" fill="#7dd3fc"><title>{`${visible[visible.length-1].date} • Relative RSI ${visible[visible.length-1].relativeRsi14w.toFixed(1)}`}</title></circle>
        </svg>
      ) : <div className="flex h-60 items-center justify-center text-sm text-amber-200/70">{chartLoading ? 'Loading historical chart…' : 'Not enough historical observations for this range.'}</div>}
      <p className="mt-1 text-[11px] text-emerald-300/40">{visible.length} observations shown • derived from the canonical technical-state history</p>
    </div>
  );
};

const RotationGoblinApp = ():JSX.Element => {
  const pipelinePassed = dataMeta.pipeline.conclusion === 'success';
  const technicalAgeBusinessDays = businessDaysSince(dataMeta.technicalSessionAsOf);
  const valuationAgeCalendarDays = calendarDaysSince(dataMeta.oldestValuationSourceAsOf);
  const technicalFresh = technicalAgeBusinessDays <= 2;
  const valuationFresh = valuationAgeCalendarDays <= 10 && dataMeta.staleValuationTickers.length === 0;
  const dataHealthy = pipelinePassed && technicalFresh && valuationFresh;
  const freshnessReason = !pipelinePassed
    ? 'The latest market-data workflow did not complete successfully.'
    : !technicalFresh
      ? `Technical snapshot is ${technicalAgeBusinessDays} business days old.`
      : !valuationFresh
        ? `Valuation source data is ${valuationAgeCalendarDays} calendar days old or using stale fallbacks.`
        : 'Latest pipeline passed and source data is within freshness limits.';
  const [phaseFilter,setPhaseFilter] = useState<'All'|Phase>('All');
  const [query,setQuery] = useState('');
  const [sortKey,setSortKey] = useState<keyof EtfRow>('decisionScore');
  const [sortDirection,setSortDirection] = useState<-1|1>(-1);
  const [selectedTicker,setSelectedTicker] = useState('XLB');

  const rows = useMemo(() => {
    const filtered = sampleEtfs.filter((row) => {
      const matchesPhase = phaseFilter === 'All' || row.phase === phaseFilter;
      const haystack = `${row.ticker} ${row.theme}`.toLowerCase();
      return matchesPhase && haystack.includes(query.trim().toLowerCase());
    });
    return [...filtered].sort((a,b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av-bv)*sortDirection;
      return String(av).localeCompare(String(bv))*sortDirection;
    });
  },[phaseFilter,query,sortKey,sortDirection]);

  const selected = sampleEtfs.find((row) => row.ticker === selectedTicker) ?? sampleEtfs[0];

  const sortBy = (key:keyof EtfRow):void => {
    if (sortKey === key) setSortDirection((value) => value === 1 ? -1 : 1);
    else { setSortKey(key); setSortDirection(-1); }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 text-zinc-100">
      <section className="overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-[#07110a] via-[#09130d] to-[#050706] p-6 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.24em] text-lime-300">SECTOR ROTATION RADAR</p>
          <h1 className="text-4xl font-black tracking-tight text-emerald-100 md:text-6xl">Rotation Goblin 👹</h1>
          <p className="mt-2 max-w-3xl text-emerald-300/75">Sniffing around the market for sectors the herd forgot about — then checking whether money has actually started rotating back in.</p>
        </div>
        <PipelineStatusCard healthy={dataHealthy} reason={freshnessReason} />
        </div>
      </section>

      {!dataHealthy ? <section className="rounded-xl border border-red-500/60 bg-red-500/10 p-4 text-sm leading-relaxed text-red-100 shadow-[0_0_24px_rgba(239,68,68,0.08)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-black tracking-wide text-red-200">{!pipelinePassed ? '🚨 DATA PIPELINE FAILED' : '🚨 STALE DATA DETECTED'}</p>
            <p className="mt-1 text-red-100/80">The dashboard is not treating this snapshot as current. It is showing the last committed data only.</p>
            <p className="mt-2 text-xs text-red-200/70">{freshnessReason}</p>
            <p className="mt-1 text-xs text-red-200/50">{dataMeta.pipeline.note}</p>
          </div>
          {!pipelinePassed && dataMeta.pipeline.runUrl ? <a href={dataMeta.pipeline.runUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-md border border-red-400/40 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-100 hover:bg-red-900/30">Open failed workflow ↗</a> : null}
        </div>
      </section> : null}

      <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-100">
        <strong>⚠ Financial caveat:</strong> This dashboard is for education, research, and entertainment only. It is not financial, investment, tax, or legal advice. Signals can be wrong, stale, or spectacularly stupid. Past performance does not predict future returns. Do your own research and consider your own risk tolerance before buying or selling anything.
      </section>

      <section className="rounded-xl border border-emerald-500/25 bg-[#07110a] p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div><p className="text-xs font-semibold tracking-[0.2em] text-lime-300">HOW TO READ THE CYCLE</p><h2 className="mt-1 text-2xl font-bold text-emerald-100">The Goblin Phase Map</h2></div>
          <p className="text-xs text-emerald-300/50">Educational interpretation — not a trade command</p>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {phases.map((phase) => <article key={phase} className={`rounded-lg border p-3 ${phaseMeta[phase].color}`}><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${phaseMeta[phase].dot}`} /><strong>{phase}</strong></div><p className="mt-2 text-[11px] font-black tracking-wide">{phaseMeta[phase].action}</p><p className="mt-2 text-xs leading-relaxed opacity-75">{phaseMeta[phase].description}</p></article>)}
        </div>
        <div className="mt-4 rounded-lg border border-lime-500/30 bg-lime-500/5 p-4 text-sm text-lime-100"><strong>Model sweet spot:</strong> the transition from <span className="text-amber-200">Accumulation</span> → <span className="text-emerald-200">Rotation</span>, where valuation is still supportive but relative momentum has begun confirming the thesis.</div>
      </section>

      <section className="rounded-xl border border-emerald-500/25 bg-[#07110a] p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div><p className="text-xs font-semibold tracking-[0.2em] text-lime-300">DECISION ENGINE</p><h2 className="mt-1 text-2xl font-bold text-emerald-100">Historically calibrated technical score</h2></div>
          <p className="text-xs text-emerald-300/45">{dataMeta.decisionEngine.matureTrainingRows.toLocaleString()} mature weekly states • {dataMeta.decisionEngine.walkForward.foldCount} purged walk-forward folds</p>
        </div>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-emerald-300/60">The 0–100 Decision Score ranks the current technical setup using only point-in-time price-derived features. Valuation stays visible as separate context and does not influence this score.</p>
        <p className="mt-3 text-xs text-emerald-300/60">Independent combined-score check: {dataMeta.decisionEngine.walkForward.combinedOutOfSample.learned.positiveFolds}/{dataMeta.decisionEngine.walkForward.foldCount} positive folds; average weekly top-minus-bottom spread {dataMeta.decisionEngine.walkForward.combinedOutOfSample.learned.averageSpreadPct.toFixed(3)} pp/month versus {dataMeta.decisionEngine.walkForward.combinedOutOfSample.prior.averageSpreadPct.toFixed(3)} for original weights. These are overlapping forward outcomes, not a trading backtest or after-cost returns.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {decisionComponentMeta.map(([key,title,body]) => <article key={key} className="rounded-lg border border-emerald-500/15 bg-black/20 p-4"><div className="flex items-center justify-between gap-2"><strong className="text-emerald-100">{title}</strong><span className="text-xs font-black text-lime-300">{(dataMeta.decisionEngine.componentWeights[key] * 100).toFixed(0)}%</span></div><p className="mt-2 text-xs leading-relaxed text-emerald-300/50">{body}</p></article>)}
        </div>
      </section>

      <section className="rounded-xl border border-emerald-500/25 bg-[#07110a] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-semibold tracking-[0.2em] text-lime-300">MARKET RADAR</p><div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold text-emerald-100">ETF Regime Table</h2><span className={`rounded border px-2 py-0.5 text-[10px] font-black tracking-wide ${dataHealthy ? 'border-emerald-400/40 text-emerald-200' : 'border-red-400/50 bg-red-500/10 text-red-200'}`}>{dataHealthy ? 'DATA OK' : (!pipelinePassed ? 'PIPELINE ERROR' : 'DATA STALE')}</span></div></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={phaseFilter} onChange={(event)=>setPhaseFilter(event.target.value as 'All'|Phase)} className="rounded-md border border-emerald-500/25 bg-[#050706] px-3 py-2 text-sm text-emerald-100"><option value="All">All phases</option>{phases.map((phase)=><option key={phase}>{phase}</option>)}</select>
            <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search ticker or theme…" className="rounded-md border border-emerald-500/25 bg-[#050706] px-3 py-2 text-sm text-emerald-100 placeholder:text-emerald-300/30" />
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-sm">
            <thead><tr className="border-b border-emerald-500/20 text-left text-xs uppercase tracking-wider text-emerald-300/55">
              {([['ticker','ETF'],['theme','Theme'],['decisionScore','Decision'],['valueScore','Value'],['rsi14w','RSI 14W'],['relativeRsi','Relative RSI'],['rel3m','3M vs SPY'],['rel6m','6M vs SPY'],['phase','Phase']] as [keyof EtfRow,string][]).map(([key,label]) => <th key={key} className="cursor-pointer px-3 py-3 hover:text-emerald-100" onClick={()=>sortBy(key)}>{label}{sortKey===key ? (sortDirection===-1?' ↓':' ↑') : ''}</th>)}
            </tr></thead>
            <tbody>{rows.map((row) => <tr key={row.ticker} onClick={()=>setSelectedTicker(row.ticker)} className={`cursor-pointer border-b border-emerald-500/10 transition hover:bg-emerald-500/5 ${selected?.ticker===row.ticker?'bg-emerald-500/5':''}`}>
              <td className="px-3 py-3 font-bold text-emerald-100">{row.ticker}</td><td className="px-3 py-3 text-emerald-300/75">{row.theme}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><span className={`font-black ${scoreClass(row.decisionScore)}`}>{row.decisionScore.toFixed(1)}</span><span className={`rounded border px-1.5 py-0.5 text-[9px] font-black ${decisionSignalClass(row.decisionSignal)}`}>{row.decisionSignal}</span></div></td><td className={`px-3 py-3 font-bold ${scoreClass(row.valueScore)}`} title={row.valuationNote}>{row.valueScore === null ? '—' : Math.round(row.valueScore)}
                {row.valueStatus === 'automated' ? <span className="ml-1 text-[9px] text-emerald-300/40">AUTO</span> : null}
                {row.valueStatus === 'stale' ? <span className="ml-1 text-[9px] font-black text-amber-300">STALE</span> : null}
                {row.valueStatus === 'error' ? <span className="ml-1 text-[9px] font-black text-red-300">ERR</span> : null}</td><td className="px-3 py-3">{Math.round(row.rsi14w)} {trend(row.rsiTrend)}</td><td className="px-3 py-3">{Math.round(row.relativeRsi)} {trend(row.relativeTrend)}</td><td className={`px-3 py-3 font-semibold ${row.rel3m>=0?'text-emerald-300':'text-red-300'}`}>{pct(row.rel3m)}</td><td className={`px-3 py-3 font-semibold ${row.rel6m>=0?'text-emerald-300':'text-red-300'}`}>{pct(row.rel6m)}</td><td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${phaseMeta[row.phase].color}`}>{row.phase}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="mt-3 space-y-1 text-xs leading-relaxed text-emerald-300/45">
          <p>Relative RSI is RSI calculated on the ETF/SPY ratio. That helps distinguish a sector that is genuinely gaining on the S&amp;P 500 from one merely floating upward with the whole market.</p>
          <p><strong className="text-emerald-200/80">Value is automated for equity/real-estate ETFs</strong> from official State Street and iShares sponsor data; SMH uses SOXX as the labeled semiconductor valuation proxy. Non-earnings assets intentionally show — instead of receiving fake equity multiples.</p>
        </div>
      </section>

      {selected ? <section className="rounded-xl border border-emerald-500/25 bg-[#07110a] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-semibold tracking-[0.2em] text-lime-300">DRILL-DOWN</p><h2 className="mt-1 text-2xl font-bold text-emerald-100">{selected.ticker} — {selected.theme}</h2></div><div className="flex flex-wrap gap-2"><span className={`self-start rounded border px-3 py-1 text-xs font-black ${decisionSignalClass(selected.decisionSignal)}`}>DECISION {selected.decisionScore.toFixed(1)} • {selected.decisionSignal}</span><span className={`self-start rounded-full border px-3 py-1 text-xs font-bold ${phaseMeta[selected.phase].color}`}>{selected.phase}</span></div></div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[['Decision',selected.decisionScore.toFixed(1)],['Price',selected.price === null ? '—' : `${selected.price.toFixed(2)}`],['Value',selected.valueScore === null ? '—' : Math.round(selected.valueScore)],['RSI 14W',Math.round(selected.rsi14w)],['Relative RSI',Math.round(selected.relativeRsi)],['1M vs SPY',pct(selected.rel1m)],['3M vs SPY',pct(selected.rel3m)],['6M vs SPY',pct(selected.rel6m)],['12M vs SPY',pct(selected.rel12m)]].map(([label,value]) => <div key={label} className="rounded-lg border border-emerald-500/15 bg-black/20 p-3"><p className="text-xs text-emerald-300/45">{label}</p><p className="mt-1 text-xl font-black text-emerald-100">{value}</p></div>)}
            </div>
            <div className="mt-3 rounded-lg border border-lime-500/25 bg-lime-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold tracking-[0.16em] text-lime-300">DECISION ENGINE BREAKDOWN</p><p className="mt-1 text-sm text-emerald-300/55">Each component is a historical percentile score; weights are recalibrated from purged walk-forward evidence.</p></div><span className={`rounded border px-2 py-1 text-xs font-black ${decisionSignalClass(selected.decisionSignal)}`}>{selected.decisionSignal}</span></div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {decisionComponentMeta.map(([key,title]) => <div key={key} className="rounded border border-emerald-500/15 bg-black/20 p-2"><p className="text-[10px] text-emerald-300/45">{title}</p><p className={`mt-1 text-lg font-black ${scoreClass(selected.decisionComponents[key])}`}>{selected.decisionComponents[key].toFixed(0)}</p><p className="text-[9px] text-lime-300/60">{(dataMeta.decisionEngine.componentWeights[key] * 100).toFixed(0)}% weight</p></div>)}
              </div>
              <p className="mt-3 text-[11px] text-emerald-300/45">In-sample calibration edge: {selected.historicalEdgeMonthlyPct >= 0 ? '+' : ''}{selected.historicalEdgeMonthlyPct.toFixed(3)} percentage points/month vs SPY. Not an independently calibrated expected return. STRONG is a score band, not a buy instruction.</p>
            </div>
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-black/20 p-4 text-sm leading-relaxed text-emerald-100"><p className="font-black text-lime-300">{phaseMeta[selected.phase].action}</p><p className="mt-2">{selected.note}</p><p className="mt-3 text-emerald-300/60"><strong className="text-emerald-200">Why:</strong> {phaseMeta[selected.phase].description}</p></div>
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-black/20 p-4 text-sm leading-relaxed text-emerald-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-black text-emerald-200">Valuation layer</p>
                <span className={`rounded border px-2 py-0.5 text-[10px] ${selected.valueStatus === 'automated' ? 'border-emerald-400/40 text-emerald-200' : selected.valueStatus === 'stale' ? 'border-amber-400/40 text-amber-200' : selected.valueStatus === 'error' ? 'border-red-400/40 text-red-200' : 'border-zinc-500/40 text-zinc-400'}`}>{selected.valueStatus.replace('_',' ').toUpperCase()}</span>
              </div>
              {selected.valueStatus === 'automated' || selected.valueStatus === 'stale' ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div><span className="text-emerald-300/45">{selected.valuationMetric}</span><div className="mt-1 font-bold">{selected.valuationMultiple?.toFixed(2)} vs SPY {selected.valuationBenchmarkMultiple?.toFixed(2)}</div></div>
                    <div><span className="text-emerald-300/45">Relative multiple</span><div className="mt-1 font-bold">{selected.valuationRelative === null ? '—' : `${(selected.valuationRelative * 100).toFixed(0)}% of SPY`}</div></div>
                    <div><span className="text-emerald-300/45">P/B</span><div className="mt-1 font-bold">{selected.priceToBook?.toFixed(2)} • {selected.pbRelative === null ? '—' : `${(selected.pbRelative * 100).toFixed(0)}% of SPY`}</div></div>
                    <div><span className="text-emerald-300/45">Tracked history</span><div className="mt-1 font-bold">{selected.trackedHistoryPercentile === null ? `${selected.valuationHistorySamples} samples` : `${selected.trackedHistoryPercentile.toFixed(0)}th pct • ${selected.valuationHistorySamples} samples`}</div></div>
                  </div>
                  <p className="mt-3 text-xs text-emerald-300/55">{selected.valuationNote}</p>
                  {selected.valuationSourceUrl ? <a href={selected.valuationSourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-lime-300 underline decoration-lime-500/40 underline-offset-2 hover:text-lime-200">Official {selected.valuationProvider} source{selected.valuationProxyTicker ? ' (' + selected.valuationProxyTicker + ' valuation proxy)' : ''} ↗</a> : null}
                </>
              ) : (
                <p className="mt-2 text-xs text-emerald-300/55">{selected.valuationNote}</p>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-emerald-500/15 bg-black/20 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-sm text-emerald-100">Technical momentum history</strong><span className="text-[11px] text-emerald-300/40">canonical 10Y technical history</span></div><p className="mt-1 text-xs text-emerald-300/45">14-week RSI and ETF/SPY Relative RSI. Chart points are derived from the canonical technical-state store; valuation and future outcomes are excluded.</p><div className="mt-3"><RotationChart row={selected} /></div></div>
        </div>
      </section> : null}

      <section className="rounded-xl border border-emerald-500/25 bg-[#07110a] p-5">
        <p className="text-xs font-semibold tracking-[0.2em] text-lime-300">DECISION ENGINE V1</p><h2 className="mt-1 text-2xl font-bold text-emerald-100">How the score is trained</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-emerald-500/15 bg-black/20 p-4"><strong className="text-emerald-100">Point-in-time inputs</strong><p className="mt-2 text-sm leading-relaxed text-emerald-300/55">Only technical features reconstructable on each historical date are used. Valuation is excluded from the trained score.</p></div>
          <div className="rounded-lg border border-emerald-500/15 bg-black/20 p-4"><strong className="text-emerald-100">Training target</strong><p className="mt-2 text-sm leading-relaxed text-emerald-300/55">Historical 3M and 6M ETF-vs-SPY forward relative returns, normalized to a monthly rate and weighted equally.</p></div>
          <div className="rounded-lg border border-emerald-500/15 bg-black/20 p-4"><strong className="text-emerald-100">Walk-forward validation</strong><p className="mt-2 text-sm leading-relaxed text-emerald-300/55">{dataMeta.decisionEngine.walkForward.foldCount} expanding validation folds with a {dataMeta.decisionEngine.walkForward.purgeDays}-day purge plus explicit outcome-maturity checks separate training from validation. Combined-score tests select weights inside each training fold.</p></div>
          <div className="rounded-lg border border-emerald-500/15 bg-black/20 p-4"><strong className="text-emerald-100">Weighting</strong><p className="mt-2 text-sm leading-relaxed text-emerald-300/55">70% historical walk-forward evidence + 30% of the original component architecture. Weak historical components lose weight instead of being forced into the score.</p></div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-emerald-300/45"><strong>Training window:</strong> {dataMeta.decisionEngine.trainingStart} → {dataMeta.decisionEngine.trainingEnd} • {dataMeta.decisionEngine.matureTrainingRows.toLocaleString()} mature observations. <strong>Data status:</strong> {dataMeta.technicals.note} {dataMeta.valuations.note}</p>
      </section>
    </div>
  );
};

export default RotationGoblinApp;
