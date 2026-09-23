// The neural tier: a convolutional super-resolution network, run locally.
//
// Everything here is lazy. ONNX Runtime is a large dependency and the weights
// are larger still, so nothing in this module is imported until the operator
// picks this tier and supplies a model. The other two tiers work with the
// runtime absent entirely.
//
// The scale factor is not configured; it is read back from the model's own
// output shape after the first tile. A 4x network and a 2x network are the
// same code path, and a model that disagrees with what the UI promised cannot
// silently produce a wrongly sized image.

import { fromNchw, toNchw } from './imageTensor';
import {
  accumulateTile,
  createCanvas,
  planTiles,
  resolveCanvas,
  type Tile,
} from './tiling';
import type { RgbaImage } from './types';

/** Tiles this size are a few hundred milliseconds on WebGPU and survive WASM. */
export const DEFAULT_TILE_SIZE = 192;
/** Context pixels per side; blended away, so cost is area, not correctness. */
export const DEFAULT_OVERLAP = 16;

export type NeuralBackend = 'webgpu' | 'wasm';

export interface NeuralSession {
  readonly run: (patch: RgbaImage) => Promise<RgbaImage>;
  readonly release: () => Promise<void>;
  readonly backend: NeuralBackend;
}

export interface NeuralOptions {
  readonly tileSize?: number;
  readonly overlap?: number;
  readonly onProgress?: (completed: number, total: number) => void;
  readonly signal?: AbortSignal;
}

export interface NeuralResult {
  readonly image: RgbaImage;
  /** Discovered from the model rather than requested. */
  readonly scale: number;
}

/** True when this browser exposes a WebGPU adapter we can actually use. */
export async function detectWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

/**
 * Creates an inference session, preferring WebGPU and falling back to WASM.
 *
 * The runtime finds its own .wasm binary: the bundle locates it relative to
 * import.meta.url, which the build rewrites to the hashed, base-path-correct
 * asset it emits. check:ort-asset guards that rewrite so an upgrade that broke
 * it would fail the build rather than 404 at the operator's first run.
 *
 * The WASM path is single-threaded on purpose. Threads need SharedArrayBuffer,
 * which needs cross-origin isolation headers, which a static host like GitHub
 * Pages cannot send. Asking for threads here would not fail loudly — it would
 * fail at a layer that reports a confusing error much later.
 */
export async function createNeuralSession(weights: ArrayBuffer): Promise<NeuralSession> {
  // The default web bundle already carries both execution providers Glass
  // asks for; the per-backend subpaths are the same size and ship no types.
  const ort = await import('onnxruntime-web');

  ort.env.wasm.numThreads = 1;

  const providers: NeuralBackend[] = (await detectWebGpu()) ? ['webgpu', 'wasm'] : ['wasm'];
  const model = new Uint8Array(weights);

  let session: Awaited<ReturnType<typeof ort.InferenceSession.create>> | null = null;
  let backend: NeuralBackend = 'wasm';
  let lastError: unknown;

  for (const provider of providers) {
    try {
      session = await ort.InferenceSession.create(model, {
        executionProviders: [provider],
        graphOptimizationLevel: 'all',
      });
      backend = provider;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!session) {
    throw new Error(
      `Could not load the model: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  const active = session;
  const inputName = active.inputNames[0];
  const outputName = active.outputNames[0];
  if (!inputName || !outputName) {
    throw new Error('Model exposes no input or output tensor');
  }

  return {
    backend,
    async run(patch: RgbaImage): Promise<RgbaImage> {
      const tensor = new ort.Tensor('float32', toNchw(patch), [1, 3, patch.height, patch.width]);
      const outputs = await active.run({ [inputName]: tensor });
      const result = outputs[outputName];
      if (!result) throw new Error(`Model produced no "${outputName}" output`);

      const dims = result.dims;
      const height = Number(dims[dims.length - 2]);
      const width = Number(dims[dims.length - 1]);
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        throw new Error(`Model output has an unusable shape [${dims.join(', ')}]`);
      }

      return fromNchw(result.data as Float32Array, width, height);
    },
    async release(): Promise<void> {
      await active.release();
    },
  };
}

function assertLive(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Upscale cancelled', 'AbortError');
}

/** Copies a tile's padded region out of the source image. */
export function cropTile(source: RgbaImage, tile: Tile): RgbaImage {
  const data = new Uint8ClampedArray(tile.padWidth * tile.padHeight * 4);

  for (let y = 0; y < tile.padHeight; y += 1) {
    const sourceStart = ((tile.padY + y) * source.width + tile.padX) * 4;
    data.set(
      source.data.subarray(sourceStart, sourceStart + tile.padWidth * 4),
      y * tile.padWidth * 4,
    );
  }

  return { width: tile.padWidth, height: tile.padHeight, data };
}

/** Runs the model over the whole image, one tile at a time. */
export async function upscaleNeural(
  source: RgbaImage,
  session: NeuralSession,
  options: NeuralOptions = {},
): Promise<NeuralResult> {
  const tileSize = options.tileSize ?? DEFAULT_TILE_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  const tiles = planTiles(source.width, source.height, tileSize, overlap);
  if (tiles.length === 0) throw new RangeError('Nothing to upscale');

  assertLive(options.signal);

  // The first tile establishes the scale, and therefore the canvas size.
  const firstTile = tiles[0] as Tile;
  // A super-resolution export is not necessarily usable here. Some are built
  // with a fixed input size, which loads and hashes perfectly well and then
  // refuses the only thing Glass ever asks of a model. The raw shape error
  // from the runtime does not say that, so it is said here.
  let firstPatch;
  try {
    firstPatch = await session.run(cropTile(source, firstTile));
  } catch (error) {
    throw new Error(
      `This model would not accept a ${firstTile.padWidth}x${firstTile.padHeight} tile. ` +
        `Glass tiles every image, so a model built for one fixed input size cannot be used. ` +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }

  const scale = firstPatch.width / firstTile.padWidth;
  // Strictly greater than one: a model that hands the tile back at its original
  // size has not upscaled anything, and passing it through would produce a
  // same-size result presented as an enlargement. Restoration models that
  // denoise without enlarging land here, and they do not belong in this tier.
  if (!Number.isFinite(scale) || scale <= 1) {
    throw new Error(
      `This model returned a ${firstPatch.width}x${firstPatch.height} tile for a ` +
        `${firstTile.padWidth}x${firstTile.padHeight} one, so it does not enlarge. ` +
        `Glass needs a super-resolution model here.`,
    );
  }

  // The model's factor is only known now, so this is the first moment the
  // output size can be checked at all.
  let canvas;
  try {
    canvas = createCanvas(Math.round(source.width * scale), Math.round(source.height * scale));
  } catch (error) {
    throw new RangeError(
      `${source.width}x${source.height} through a ${scale}x model is too large. ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
  accumulateTile(canvas, firstPatch, firstTile, scale);
  options.onProgress?.(1, tiles.length);

  for (let i = 1; i < tiles.length; i += 1) {
    assertLive(options.signal);
    const tile = tiles[i] as Tile;
    const patch = await session.run(cropTile(source, tile));
    accumulateTile(canvas, patch, tile, scale);
    options.onProgress?.(i + 1, tiles.length);
    // Hand the tab back between tiles so the progress line actually paints.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { image: resolveCanvas(canvas), scale };
}
