import { useMemo, useState } from 'react';
import { dataMeta, type EtfRow, type Phase, regimeCards, sampleEtfs } from './sampleData';

const phases: Phase[] = ['Capitulation','Accumulation','Rotation','Momentum','Crowded','Decay'];

const phaseMeta: Record<Phase,{ action:string; color:string; dot:string; description:string }> = {
  Capitulation:{ action:'WATCH / INVESTIGATE', color:'border-red-400/40 bg-red-500/10 text-red-200', dot:'bg-red-400', description:'Cheap and still falling. Oversold is not the same thing as a bottom.' },
  Accumulation:{ action:'RESEARCH / SCALE CAREFULLY', color:'border-amber-400/40 bg-amber-500/10 text-amber-200', dot:'bg-amber-400', description:'Selling pressure is easing while valuation remains attractive.' },
  Rotation:{ action:'PRIMARY BUY-ZONE CANDIDATE', color:'border-emerald-400/50 bg-emerald-500/10 text-emerald-100', dot:'bg-emerald-400', description:'Relative strength is improving before the valuation gap fully closes.' },
  Momentum:{ action:'HOLD / ADD SELECTIVELY', color:'border-sky-400/40 bg-sky-500/10 text-sky-200', dot:'bg-sky-400', description:'Trend is confirmed. Usually no longer the cheapest phase.' },
  Crowded:{ action:'DO NOT CHASE / CONSIDER TRIMMING', color:'border-violet-400/40 bg-violet-500/10 text-violet-200', dot:'bg-violet-400', description:'Strong narrative, rich valuation, and elevated chase risk.' },
  Decay:{ action:'REDUCE / AVOID UNTIL REPAIRED', color:'border-orange-400/40 bg-orange-500/10 text-orange-200', dot:'bg-orange-400', description:'Valuation and relative momentum are both deteriorating.' },
};

const toneClass = {
  good:'text-emerald-300',
  warn:'text-amber-300',
  bad:'text-red-300',
} as const;

const scoreClass = (value:number|null):string => value === null ? 'text-zinc-500' : value >= 75 ? 'text-emerald-300' : value >= 50 ? 'text-amber-300' : 'text-zinc-400';
const pct = (value:number):string => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
const trend = (value:EtfRow['rsiTrend']):string => value === 'up' ? '↑' : value === 'down' ? '↓' : '→';

const RotationChart = ({ row }:{ row:EtfRow }):JSX.Element => {
  const width = 620;
  const height = 230;
  const pad = 30;
  const points = row.history.map((point,index) => ({
    x: pad + (index * (width - pad * 2)) / Math.max(1,row.history.length - 1),
    y: height - pad - (point.value / 100) * (height - pad * 2),
    ...point,
  }));
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full" role="img" aria-label={`${row.ticker} rotation score history`}>
      {[25,50,75].map((level) => {
        const y = height - pad - (level / 100) * (height - pad * 2);
        return <g key={level}><line x1={pad} y1={y} x2={width-pad} y2={y} stroke="rgba(52,211,153,0.14)" /><text x="3" y={y+4} fill="#64748b" fontSize="11">{level}</text></g>;
      })}
      <polyline points={polyline} fill="none" stroke="#86efac" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p,index) => <g key={p.month}><circle cx={p.x} cy={p.y} r="3" fill="#d9f99d" />{(index % 2 === 0 || index === points.length - 1) ? <text x={p.x} y={height-6} textAnchor="middle" fill="#64748b" fontSize="10">{p.month}</text> : null}</g>)}
    </svg>
  );
};

const RotationGoblinApp = ():JSX.Element => {
  const [phaseFilter,setPhaseFilter] = useState<'All'|Phase>('All');
  const [query,setQuery] = useState('');
  const [sortKey,setSortKey] = useState<keyof EtfRow>('rotationScore');
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
        <p className="text-xs font-semibold tracking-[0.24em] text-lime-300">SECTOR ROTATION RADAR</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-emerald-100 md:text-6xl">Rotation Goblin 👹</h1>
            <p className="mt-2 max-w-3xl text-emerald-300/75">Sniffing around the market for sectors the herd forgot about — then checking whether money has actually started rotating back in.</p>
          </div>
          <div className="flex flex-col items-start gap-1 rounded-md border border-emerald-500/20 bg-black/20 px-3 py-2 text-xs text-emerald-300/60">
            <span className={dataMeta.technicals.live ? 'text-emerald-300' : 'text-amber-300'}>{dataMeta.technicals.live ? 'LIVE TECHNICALS' : 'SEED TECHNICALS'} • {dataMeta.technicals.source}</span>
            <span className="text-emerald-300">AUTO VALUATION • {dataMeta.valuations.providers.join(' + ')}</span>
            <span>Updated {new Date(dataMeta.technicals.generatedAt).toLocaleString()}</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-100">
        <strong>⚠ Financial caveat:</strong> This dashboard is for education, research, and entertainment only. It is not financial, investment, tax, or legal advice. Signals can be wrong, stale, or spectacularly stupid. Past performance does not predict future returns. Do your own research and consider your own risk tolerance before buying or selling anything.
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {regimeCards.map((card) => <article key={card.label} className="rounded-lg border border-emerald-500/20 bg-[#07110a] p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400/60">{card.label}</p><p className={`mt-1 text-xl font-black ${toneClass[card.tone]}`}>{card.value}</p><p className="mt-1 text-xs text-emerald-300/50">{card.note}</p></article>)}
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

      <section className="grid gap-3 lg:grid-cols-3">
        {[['Rotation Score','Is money starting to care?','Cheap/fair valuation + improving relative RSI + ETF/SPY outperformance.'],['Contrarian Score','Is this thing hated enough?','Cheap valuation + oversold conditions + evidence that selling pressure is stabilizing.'],['Momentum Score','Is the trend actually alive?','Sustained absolute and relative strength. Useful confirmation, but high momentum can also mean less margin of safety.']].map(([title,q,body]) => <article key={title} className="rounded-xl border border-emerald-500/20 bg-[#07110a] p-4"><p className="text-xs font-semibold tracking-[0.16em] text-lime-300">{title}</p><h3 className="mt-2 font-bold text-emerald-100">{q}</h3><p className="mt-2 text-sm leading-relaxed text-emerald-300/60">{body}</p></article>)}
      </section>

      <section className="rounded-xl border border-emerald-500/25 bg-[#07110a] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-semibold tracking-[0.2em] text-lime-300">MARKET RADAR</p><h2 className="mt-1 text-2xl font-bold text-emerald-100">ETF Regime Table</h2></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={phaseFilter} onChange={(event)=>setPhaseFilter(event.target.value as 'All'|Phase)} className="rounded-md border border-emerald-500/25 bg-[#050706] px-3 py-2 text-sm text-emerald-100"><option value="All">All phases</option>{phases.map((phase)=><option key={phase}>{phase}</option>)}</select>
            <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search ticker or theme…" className="rounded-md border border-emerald-500/25 bg-[#050706] px-3 py-2 text-sm text-emerald-100 placeholder:text-emerald-300/30" />
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-sm">
            <thead><tr className="border-b border-emerald-500/20 text-left text-xs uppercase tracking-wider text-emerald-300/55">
              {([['ticker','ETF'],['theme','Theme'],['valueScore','Value'],['rsi14w','RSI 14W'],['relativeRsi','Relative RSI'],['rel6m','6M vs SPY'],['phase','Phase'],['rotationScore','Rotation'],['contrarianScore','Contrarian'],['momentumScore','Momentum']] as [keyof EtfRow,string][]).map(([key,label]) => <th key={key} className="cursor-pointer px-3 py-3 hover:text-emerald-100" onClick={()=>sortBy(key)}>{label}{sortKey===key ? (sortDirection===-1?' ↓':' ↑') : ''}</th>)}
            </tr></thead>
            <tbody>{rows.map((row) => <tr key={row.ticker} onClick={()=>setSelectedTicker(row.ticker)} className={`cursor-pointer border-b border-emerald-500/10 transition hover:bg-emerald-500/5 ${selected?.ticker===row.ticker?'bg-emerald-500/5':''}`}>
              <td className="px-3 py-3 font-bold text-emerald-100">{row.ticker}</td><td className="px-3 py-3 text-emerald-300/75">{row.theme}</td><td className={`px-3 py-3 font-bold ${scoreClass(row.valueScore)}`} title={row.valuationNote}>{row.valueScore === null ? '—' : Math.round(row.valueScore)}{row.valueStatus === 'automated' ? <span className="ml-1 text-[9px] text-emerald-300/40">AUTO</span> : null}</td><td className="px-3 py-3">{Math.round(row.rsi14w)} {trend(row.rsiTrend)}</td><td className="px-3 py-3">{Math.round(row.relativeRsi)} {trend(row.relativeTrend)}</td><td className={`px-3 py-3 font-semibold ${row.rel6m>=0?'text-emerald-300':'text-red-300'}`}>{pct(row.rel6m)}</td><td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${phaseMeta[row.phase].color}`}>{row.phase}</span></td><td className={`px-3 py-3 font-bold ${scoreClass(row.rotationScore)}`}>{row.rotationScore}</td><td className={`px-3 py-3 font-bold ${scoreClass(row.contrarianScore)}`}>{row.contrarianScore}</td><td className={`px-3 py-3 font-bold ${scoreClass(row.momentumScore)}`}>{row.momentumScore}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="mt-3 space-y-1 text-xs leading-relaxed text-emerald-300/45">
          <p>Relative RSI is RSI calculated on the ETF/SPY ratio. That helps distinguish a sector that is genuinely gaining on the S&amp;P 500 from one merely floating upward with the whole market.</p>
          <p><strong className="text-emerald-200/80">Value is automated for equity/real-estate ETFs</strong> from official State Street, iShares, and VanEck sponsor data. Non-earnings assets intentionally show — instead of receiving fake equity multiples.</p>
        </div>
      </section>

      {selected ? <section className="rounded-xl border border-emerald-500/25 bg-[#07110a] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-semibold tracking-[0.2em] text-lime-300">DRILL-DOWN</p><h2 className="mt-1 text-2xl font-bold text-emerald-100">{selected.ticker} — {selected.theme}</h2></div><span className={`self-start rounded-full border px-3 py-1 text-xs font-bold ${phaseMeta[selected.phase].color}`}>{selected.phase}</span></div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[['Price',selected.price === null ? '—' : `${selected.price.toFixed(2)}`],['Value',selected.valueScore === null ? '—' : Math.round(selected.valueScore)],['RSI 14W',Math.round(selected.rsi14w)],['Relative RSI',Math.round(selected.relativeRsi)],['1M vs SPY',pct(selected.rel1m)],['3M vs SPY',pct(selected.rel3m)],['6M vs SPY',pct(selected.rel6m)],['12M vs SPY',pct(selected.rel12m)],['Rotation',selected.rotationScore]].map(([label,value]) => <div key={label} className="rounded-lg border border-emerald-500/15 bg-black/20 p-3"><p className="text-xs text-emerald-300/45">{label}</p><p className="mt-1 text-xl font-black text-emerald-100">{value}</p></div>)}
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
          <div className="rounded-lg border border-emerald-500/15 bg-black/20 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-sm text-emerald-100">Rotation score history</strong><span className="text-[11px] text-emerald-300/40">{dataMeta.technicals.live ? 'persisted by daily workflow' : 'starts after first live refresh'}</span></div><RotationChart row={selected} /></div>
        </div>
      </section> : null}

      <section className="rounded-xl border border-emerald-500/25 bg-[#07110a] p-5">
        <p className="text-xs font-semibold tracking-[0.2em] text-lime-300">MVP METHODOLOGY</p><h2 className="mt-1 text-2xl font-bold text-emerald-100">What V1 actually scores</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['Value','Automated sponsor-page valuation for equity/real-estate ETFs: primary multiple + P/B versus SPY, then blended with tracked-history percentile once enough samples accumulate.'],['Momentum','14-week RSI, 3/6/12-month performance, and trend persistence.'],['Relative Strength','ETF/SPY ratio plus RSI calculated on that ratio.'],['Phase','Rules designed to surface the shift from hated → stabilizing → being repriced.']].map(([title,body]) => <div key={title} className="rounded-lg border border-emerald-500/15 bg-black/20 p-4"><strong className="text-emerald-100">{title}</strong><p className="mt-2 text-sm leading-relaxed text-emerald-300/55">{body}</p></div>)}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-emerald-300/45"><strong>Data status:</strong> {dataMeta.technicals.note} {dataMeta.valuations.note} The scheduled workflow runs after U.S. market hours on weekdays and preserves both technical and valuation history.</p>
      </section>
    </div>
  );
};

export default RotationGoblinApp;
