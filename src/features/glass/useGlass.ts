// Orchestration: decoding, tier dispatch, model lifecycle and cancellation.
//
// The two local tiers go to a worker. The neural tier stays on this thread
// because the ONNX session owns a WebGPU device, and it yields between tiles
// instead, which is enough to keep the progress line painting.

import { useCallback, useEffect, useRef, useState } from 'react';

import { decodeImage, encodePng, outputFileName } from './imageIo';
import { applyAlpha, extractAlpha, isFullyOpaque } from './imageTensor';
import { upscaleLanczos } from './lanczos';
import {
  createNeuralSession,
  upscaleNeural,
  type NeuralBackend,
  type NeuralSession,
} from './neural';
import { CANVAS_PIXEL_CEILING, outputPixels, type LocalTierId } from './pipeline';
import type { GlassRequest, GlassResponse } from './glass.worker';
import type { GlassPhase, GlassProgress, RgbaImage, TierId } from './types';
import { loadWeights, describeBytes, type WeightsSource } from './weights';

export interface LoadedImage {
  readonly image: RgbaImage;
  readonly name: string;
  readonly previewUrl: string;
  readonly byteSize: number;
}

export interface UpscaleResult {
  readonly url: string;
  readonly fileName: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly tier: TierId;
  readonly scale: number;
  readonly elapsedMs: number;
  readonly backend: NeuralBackend | null;
}

export interface GlassState {
  readonly phase: GlassPhase;
  readonly source: LoadedImage | null;
  readonly result: UpscaleResult | null;
  readonly progress: GlassProgress | null;
  readonly error: string | null;
}

const IDLE: GlassState = {
  phase: 'idle',
  source: null,
  result: null,
  progress: null,
  error: null,
};

function messageOf(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Cancelled.';
  return error instanceof Error ? error.message : String(error);
}

export interface GlassController {
  readonly state: GlassState;
  readonly load: (file: File) => Promise<void>;
  readonly runLocal: (tier: LocalTierId, scale: number) => void;
  readonly runNeural: (weights: WeightsSource) => Promise<void>;
  readonly cancel: () => void;
  readonly clear: () => void;
}

export function useGlass(): GlassController {
  const [state, setState] = useState<GlassState>(IDLE);

  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const startedAt = useRef(0);
  const pendingTier = useRef<TierId | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The worker callback needs the source it was started for. Reading it from
  // state inside a setState updater would make the updater impure, and React
  // is free to run those more than once.
  const sourceRef = useRef<LoadedImage | null>(null);
  // Held across runs so changing the scale does not re-download the weights.
  //
  // Keyed by the URL string, or by the File object itself. Two revisions of a
  // model commonly share a filename and byte count, and a fingerprint built
  // from those would silently hand back the previous file's session and
  // produce output from the wrong weights.
  const sessionRef = useRef<{ key: string | File; session: NeuralSession } | null>(null);
  // Every object URL this hook has handed out, so none outlive the tab's need.
  const urlsRef = useRef<Set<string>>(new Set());

  const trackUrl = useCallback((url: string): string => {
    urlsRef.current.add(url);
    return url;
  }, []);

  const releaseUrl = useCallback((url: string | undefined): void => {
    if (!url) return;
    URL.revokeObjectURL(url);
    urlsRef.current.delete(url);
  }, []);

  const publish = useCallback(
    async (runId: number, image: RgbaImage, name: string, tier: TierId, scale: number, elapsedMs: number, backend: NeuralBackend | null) => {
      const blob = await encodePng(image);
      // Encoding a large PNG takes long enough for the operator to have cleared
      // the tool or loaded another image. Installing the result now would
      // resurrect a cleared one, or hang this output off the wrong source.
      if (requestId.current !== runId) return;

      const url = trackUrl(URL.createObjectURL(blob));

      setState((previous) => {
        releaseUrl(previous.result?.url);
        return {
          ...previous,
          phase: 'done',
          progress: null,
          error: null,
          result: {
            url,
            fileName: outputFileName(name, scale),
            width: image.width,
            height: image.height,
            byteSize: blob.size,
            tier,
            scale,
            elapsedMs,
            backend,
          },
        };
      });
    },
    [releaseUrl, trackUrl],
  );

  /**
   * Builds the resampling worker.
   *
   * Extracted from the mount effect because cancelling a local run terminates
   * the worker outright, and the hook then needs a fresh one.
   */
  const spawnWorker = useCallback((): Worker => {
    const worker = new Worker(new URL('./glass.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (event: MessageEvent<GlassResponse>) => {
      const message = event.data;
      // A superseded run is not an error; it is simply no longer wanted.
      if (message.id !== requestId.current) return;

      if (!message.ok) {
        setState((previous) => ({ ...previous, phase: 'error', progress: null, error: message.error }));
        return;
      }

      const source = sourceRef.current;
      if (!source) return;

      const image: RgbaImage = {
        width: message.width,
        height: message.height,
        data: new Uint8ClampedArray(message.pixels),
      };

      void publish(
        message.id,
        image,
        source.name,
        pendingTier.current ?? 'lanczos',
        image.width / source.image.width,
        performance.now() - startedAt.current,
        null,
      );
    };

    worker.onerror = (event) => {
      setState((previous) => ({
        ...previous,
        phase: 'error',
        progress: null,
        error: event.message || 'The upscaling worker failed',
      }));
    };

    workerRef.current = worker;
    return worker;
  }, [publish]);

  useEffect(() => {
    spawnWorker();
    // Terminate whatever is current, which may not be the one spawned here if a
    // cancellation replaced it.
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [spawnWorker]);

  // Revoke everything on unmount; blobs of a 64-megapixel PNG are not small.
  useEffect(
    () => () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current.clear();
      void sessionRef.current?.session.release();
      sessionRef.current = null;
    },
    [],
  );

  const load = useCallback(
    async (file: File): Promise<void> => {
      requestId.current += 1;
      const runId = requestId.current;
      sourceRef.current = null;

      // Choosing a new source abandons whatever is running. Bumping the id only
      // hides the outcome: without this the neural loop still walks every
      // remaining tile, and the worker still holds a core, so the new image
      // queues behind work nobody wants any more.
      abortRef.current?.abort();
      abortRef.current = null;
      if (workerRef.current) {
        workerRef.current.terminate();
        spawnWorker();
      }

      setState((previous) => {
        releaseUrl(previous.source?.previewUrl);
        releaseUrl(previous.result?.url);
        return { ...IDLE, phase: 'decoding' };
      });

      try {
        const image = await decodeImage(file);
        // Decodes finish out of order. A slower earlier file must not displace
        // the selection the operator actually made last.
        if (requestId.current !== runId) return;

        const previewUrl = trackUrl(URL.createObjectURL(file));
        const loaded: LoadedImage = { image, name: file.name, previewUrl, byteSize: file.size };
        sourceRef.current = loaded;
        setState({ ...IDLE, source: loaded });
      } catch (error) {
        if (requestId.current !== runId) return;
        sourceRef.current = null;
        setState({ ...IDLE, phase: 'error', error: `Could not read that image: ${messageOf(error)}` });
      }
    },
    [releaseUrl, spawnWorker, trackUrl],
  );

  const guardSize = useCallback((source: LoadedImage, scale: number): string | null => {
    const pixels = outputPixels(source.image.width, source.image.height, scale);
    if (pixels > CANVAS_PIXEL_CEILING) {
      return `${scale}x would be ${pixels.toLocaleString()} pixels, past what a browser canvas will allocate. Use a smaller factor.`;
    }
    return null;
  }, []);

  const runLocal = useCallback(
    (tier: LocalTierId, scale: number): void => {
      const source = state.source;
      const worker = workerRef.current;
      if (!source || !worker) return;

      const oversize = guardSize(source, scale);
      if (oversize) {
        setState((previous) => ({ ...previous, phase: 'error', error: oversize }));
        return;
      }

      requestId.current += 1;
      pendingTier.current = tier;
      startedAt.current = performance.now();
      setState((previous) => ({
        ...previous,
        phase: 'running',
        error: null,
        progress: { note: 'resampling', fraction: null },
      }));

      // The source is copied rather than transferred: the operator will want to
      // try another tier on the same image without re-opening the file.
      const pixels = source.image.data.slice().buffer as ArrayBuffer;
      const request: GlassRequest = {
        id: requestId.current,
        tier,
        scale,
        width: source.image.width,
        height: source.image.height,
        pixels,
      };
      worker.postMessage(request, [pixels]);
    },
    [guardSize, state.source],
  );

  const runNeural = useCallback(
    async (weights: WeightsSource): Promise<void> => {
      const source = state.source;
      if (!source) return;

      requestId.current += 1;
      const runId = requestId.current;
      pendingTier.current = 'neural';
      startedAt.current = performance.now();

      const controller = new AbortController();
      abortRef.current = controller;

      const report = (note: string, fraction: number | null): void => {
        if (requestId.current !== runId) return;
        setState((previous) => ({ ...previous, phase: 'running', error: null, progress: { note, fraction } }));
      };

      report('loading weights', null);

      try {
        const key: string | File = weights.kind === 'url' ? weights.url : weights.file;
        let held = sessionRef.current;

        if (held?.key !== key) {
          await held?.session.release();
          sessionRef.current = null;

          const buffer = await loadWeights(weights, ({ received, total }) => {
            report(
              total ? `weights ${describeBytes(received)} / ${describeBytes(total)}` : `weights ${describeBytes(received)}`,
              total ? received / total : null,
            );
          });

          if (requestId.current !== runId) return;
          report('starting the model', null);
          held = { key, session: await createNeuralSession(buffer) };
          sessionRef.current = held;
        }

        if (requestId.current !== runId) return;

        const opaque = isFullyOpaque(source.image);
        const { image, scale } = await upscaleNeural(source.image, held.session, {
          signal: controller.signal,
          onProgress: (done, total) => report(`tile ${done}/${total}`, done / total),
        });

        if (requestId.current !== runId) return;

        // The model saw three channels. Transparency is carried separately so a
        // PNG with an alpha channel does not come back with a black background.
        const finished = opaque
          ? image
          : applyAlpha(image, upscaleLanczos(extractAlpha(source.image), scale));

        await publish(runId, finished, source.name, 'neural', scale, performance.now() - startedAt.current, held.session.backend);
      } catch (error) {
        if (requestId.current !== runId) return;
        setState((previous) => ({ ...previous, phase: 'error', progress: null, error: messageOf(error) }));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [publish, state.source],
  );

  const cancel = useCallback((): void => {
    requestId.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;

    // The neural tier checks the abort signal between tiles, but a worker
    // part-way through a resample has no such checkpoint: it holds a core until
    // it finishes. Terminating and respawning is what makes Cancel mean cancel.
    if (workerRef.current) {
      workerRef.current.terminate();
      spawnWorker();
    }

    setState((previous) => ({ ...previous, phase: previous.result ? 'done' : 'idle', progress: null }));
  }, [spawnWorker]);

  const clear = useCallback((): void => {
    requestId.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    sourceRef.current = null;
    setState((previous) => {
      releaseUrl(previous.source?.previewUrl);
      releaseUrl(previous.result?.url);
      return IDLE;
    });
  }, [releaseUrl]);

  return { state, load, runLocal, runNeural, cancel, clear };
}
