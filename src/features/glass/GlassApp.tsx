// Glass — image upscaling that runs entirely in the browser tab.
// Copyright (c) 2026 Mo (@Mo4n6) - https://github.com/Mo4n6/tools
//
// The tier is the operator's choice, not the tool's. Each card states what the
// method actually does, what it costs and what it is for, because the three
// tiers are not better and worse versions of one thing: reconstructing a
// signal, preserving hard edges and inventing plausible detail are different
// jobs, and only the person looking at the image knows which one they want.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { GLASS_AUTHOR, GLASS_AUTHOR_URL, GLASS_COPYRIGHT, GLASS_SOURCE_URL } from './attribution';
import { TIERS, tierById, type LocalTierId } from './pipeline';
import type { TierId } from './types';
import { useGlass } from './useGlass';
import { configuredWeightsUrl, describeBytes, isUsableWeightsUrl } from './weights';

const panel = 'rounded-md border border-emerald-500/30 bg-[#07110a] p-3 text-sm text-emerald-100';
const primaryAction =
  'rounded-md border border-emerald-400 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100 hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40';
const secondaryAction =
  'rounded-md border border-emerald-500/40 bg-[#07110a] px-3 py-2 text-sm text-emerald-100 hover:border-emerald-300/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40';
const textField =
  'w-full rounded-md border border-emerald-500/40 bg-[#040a06] px-2 py-1.5 text-sm text-emerald-100 placeholder:text-emerald-300/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';

type WeightsMode = 'file' | 'url';

const GlassApp = (): JSX.Element => {
  const { state, load, runLocal, runNeural, cancel, clear } = useGlass();

  const [tierId, setTierId] = useState<TierId>('lanczos');
  const [scale, setScale] = useState(2);
  const [weightsMode, setWeightsMode] = useState<WeightsMode>('file');
  const [weightsUrl, setWeightsUrl] = useState(() => configuredWeightsUrl(import.meta.env) ?? '');
  const [weightsFile, setWeightsFile] = useState<File | null>(null);
  const [split, setSplit] = useState(50);

  const imageInput = useRef<HTMLInputElement | null>(null);
  const tier = tierById(tierId);

  // Keep the factor legal for the tier: switching to Pixel while 3x is selected
  // would otherwise leave a Run button that can only fail.
  useEffect(() => {
    if (tier.scales.length > 0 && !tier.scales.includes(scale)) {
      setScale(tier.scales[0] as number);
    }
  }, [scale, tier]);

  const busy = state.phase === 'running' || state.phase === 'decoding';

  const weightsReady =
    weightsMode === 'file' ? weightsFile !== null : isUsableWeightsUrl(weightsUrl.trim());

  const canRun =
    state.source !== null && !busy && (tierId !== 'neural' || weightsReady);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void load(file);
    },
    [load],
  );

  const handleRun = useCallback(() => {
    if (tierId === 'neural') {
      void runNeural(
        weightsMode === 'file' && weightsFile
          ? { kind: 'file', file: weightsFile }
          : { kind: 'url', url: weightsUrl.trim() },
      );
      return;
    }
    runLocal(tierId as LocalTierId, scale);
  }, [runLocal, runNeural, scale, tierId, weightsFile, weightsMode, weightsUrl]);

  const growth = useMemo(() => {
    const source = state.source;
    const result = state.result;
    if (!source || !result) return null;
    return `${source.image.width}x${source.image.height} → ${result.width}x${result.height}`;
  }, [state.result, state.source]);

  return (
    <div className="flex w-full flex-col p-2 font-mono text-emerald-100 md:p-4">
      <header className="mb-4">
        <h1 className="text-3xl font-bold">Glass</h1>
        <p className="mt-2 max-w-3xl text-sm text-emerald-300/70">
          Enlarge an image without sending it anywhere. Three methods are offered rather than one
          chosen for you: they do genuinely different things, and the right one depends on what the
          picture is. Everything runs in this tab, and the neural tier runs weights you supply.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="flex flex-col gap-4">
          <div className={panel}>
            <div className="text-xs uppercase tracking-wide text-emerald-300/60">Source image</div>
            <input
              ref={imageInput}
              id="glass-image"
              type="file"
              accept="image/*"
              className="mt-2 block w-full text-xs text-emerald-300/70 file:mr-3 file:rounded-md file:border file:border-emerald-500/40 file:bg-emerald-500/10 file:px-2 file:py-1 file:text-xs file:text-emerald-100"
              onChange={(event) => handleFiles(event.target.files)}
            />
            {state.source ? (
              <p className="mt-2 text-xs text-emerald-300/60">
                {state.source.name} · {state.source.image.width}x{state.source.image.height} ·{' '}
                {describeBytes(state.source.byteSize)}
              </p>
            ) : (
              <p className="mt-2 text-xs text-emerald-300/40">
                Anything the browser can decode. The file is read locally and never uploaded.
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs uppercase tracking-wide text-emerald-300/60">Method</legend>
            {TIERS.map((candidate) => {
              const selected = candidate.id === tierId;
              return (
                <label
                  key={candidate.id}
                  className={`cursor-pointer rounded-md border p-3 text-sm transition ${
                    selected
                      ? 'border-emerald-400 bg-emerald-500/10'
                      : 'border-emerald-500/25 bg-[#07110a] hover:border-emerald-400/50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="glass-tier"
                      value={candidate.id}
                      checked={selected}
                      onChange={() => setTierId(candidate.id)}
                      className="accent-emerald-400"
                    />
                    <span className="font-semibold text-emerald-200">{candidate.label}</span>
                  </span>
                  <span className="mt-1 block text-xs text-emerald-300/70">{candidate.summary}</span>
                  <span className="mt-1 block text-xs text-emerald-300/50">
                    Best for: {candidate.bestFor}
                  </span>
                  <span className="mt-1 block text-xs text-emerald-300/50">
                    Runs on: {candidate.runsOn} · Download: {candidate.download}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {tier.scales.length > 0 ? (
            <div className={panel}>
              <div className="text-xs uppercase tracking-wide text-emerald-300/60">Factor</div>
              <div className="mt-2 flex gap-2">
                {tier.scales.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => setScale(candidate)}
                    className={
                      candidate === scale
                        ? 'rounded-md border border-emerald-400 bg-emerald-500/20 px-3 py-1.5 text-sm'
                        : 'rounded-md border border-emerald-500/30 px-3 py-1.5 text-sm hover:border-emerald-400/60'
                    }
                  >
                    {candidate}x
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={panel}>
              <div className="text-xs uppercase tracking-wide text-emerald-300/60">Weights</div>
              <p className="mt-1 text-xs text-emerald-300/60">
                Glass ships no model. Point it at an ONNX super-resolution network — an ESRGAN-family
                export is the usual choice — and the factor comes from the model itself.
              </p>

              <div className="mt-3 flex gap-2 text-xs">
                {(['file', 'url'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setWeightsMode(mode)}
                    className={
                      mode === weightsMode
                        ? 'rounded-md border border-emerald-400 bg-emerald-500/20 px-2 py-1'
                        : 'rounded-md border border-emerald-500/30 px-2 py-1 hover:border-emerald-400/60'
                    }
                  >
                    {mode === 'file' ? 'Local file' : 'URL'}
                  </button>
                ))}
              </div>

              {weightsMode === 'file' ? (
                <input
                  type="file"
                  accept=".onnx,application/octet-stream"
                  className="mt-2 block w-full text-xs text-emerald-300/70 file:mr-3 file:rounded-md file:border file:border-emerald-500/40 file:bg-emerald-500/10 file:px-2 file:py-1 file:text-xs file:text-emerald-100"
                  onChange={(event) => setWeightsFile(event.target.files?.[0] ?? null)}
                />
              ) : (
                <>
                  <input
                    type="url"
                    value={weightsUrl}
                    onChange={(event) => setWeightsUrl(event.target.value)}
                    placeholder="https://…/model.onnx"
                    className={`mt-2 ${textField}`}
                  />
                  <p className="mt-1 text-xs text-emerald-300/40">
                    Fetched by your browser, cached after the first load. https only, except on
                    localhost.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" className={primaryAction} disabled={!canRun} onClick={handleRun}>
              Upscale
            </button>
            <button type="button" className={secondaryAction} disabled={!busy} onClick={cancel}>
              Cancel
            </button>
            <button
              type="button"
              className={secondaryAction}
              disabled={!state.source && !state.result}
              onClick={() => {
                clear();
                if (imageInput.current) imageInput.current.value = '';
              }}
            >
              Clear
            </button>
          </div>

          {state.progress ? (
            <div className={panel} role="status" aria-live="polite">
              <div className="flex justify-between text-xs text-emerald-300/70">
                <span>{state.progress.note}</span>
                {state.progress.fraction !== null ? (
                  <span>{Math.round(state.progress.fraction * 100)}%</span>
                ) : null}
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded bg-emerald-500/15">
                <div
                  className="h-full bg-emerald-400 transition-all"
                  style={{ width: `${Math.round((state.progress.fraction ?? 0.04) * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          {state.error ? (
            <div className="rounded-md border border-rose-500/40 bg-[#150808] p-3 text-sm text-rose-200">
              {state.error}
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          {state.result && state.source ? (
            <>
              <div className="relative select-none overflow-hidden rounded-md border border-emerald-500/30 bg-[#040a06]">
                <img
                  src={state.source.previewUrl}
                  alt="Source"
                  className="block w-full"
                  style={{ imageRendering: 'pixelated' }}
                />
                <img
                  src={state.result.url}
                  alt="Upscaled result"
                  className="absolute inset-0 block h-full w-full"
                  style={{ clipPath: `inset(0 0 0 ${split}%)` }}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 w-px bg-emerald-400"
                  style={{ left: `${split}%` }}
                />
              </div>

              <label className="flex items-center gap-3 text-xs text-emerald-300/60">
                <span className="shrink-0">Source</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  onChange={(event) => setSplit(Number(event.target.value))}
                  className="w-full accent-emerald-400"
                  aria-label="Comparison split"
                />
                <span className="shrink-0">Result</span>
              </label>

              <div className={panel}>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="text-emerald-300/50">Method</dt>
                  <dd>{tierById(state.result.tier).label}</dd>
                  <dt className="text-emerald-300/50">Size</dt>
                  <dd>{growth}</dd>
                  <dt className="text-emerald-300/50">Factor</dt>
                  <dd>{state.result.scale.toFixed(2).replace(/\.00$/, '')}x</dd>
                  <dt className="text-emerald-300/50">Elapsed</dt>
                  <dd>{(state.result.elapsedMs / 1000).toFixed(2)}s</dd>
                  <dt className="text-emerald-300/50">PNG</dt>
                  <dd>{describeBytes(state.result.byteSize)}</dd>
                  {state.result.backend ? (
                    <>
                      <dt className="text-emerald-300/50">Backend</dt>
                      <dd>{state.result.backend}</dd>
                    </>
                  ) : null}
                </dl>
                <a
                  className={`mt-3 inline-block ${primaryAction}`}
                  href={state.result.url}
                  download={state.result.fileName}
                >
                  Download {state.result.fileName}
                </a>
              </div>
            </>
          ) : state.source ? (
            <div className="overflow-hidden rounded-md border border-emerald-500/30 bg-[#040a06]">
              <img src={state.source.previewUrl} alt="Source" className="block w-full" />
            </div>
          ) : (
            <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-emerald-500/25 p-6 text-center text-sm text-emerald-300/40">
              Choose an image to begin.
            </div>
          )}
        </section>
      </div>

      <footer className="mt-6 border-t border-emerald-500/20 pt-3 text-xs text-emerald-300/40">
        {GLASS_COPYRIGHT} ·{' '}
        <a className="underline hover:text-emerald-300/70" href={GLASS_AUTHOR_URL}>
          @{GLASS_AUTHOR}
        </a>{' '}
        ·{' '}
        <a className="underline hover:text-emerald-300/70" href={GLASS_SOURCE_URL}>
          source
        </a>
      </footer>
    </div>
  );
};

export default GlassApp;
