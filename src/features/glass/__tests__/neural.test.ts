import { describe, expect, it, vi } from 'vitest';

import { cropTile, upscaleNeural, type NeuralSession } from '../neural';
import { planTiles } from '../tiling';
import type { RgbaImage } from '../types';

function gradient(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      data[p] = (x * 255) / Math.max(1, width - 1);
      data[p + 1] = (y * 255) / Math.max(1, height - 1);
      data[p + 2] = 128;
      data[p + 3] = 255;
    }
  }
  return { width, height, data };
}

/** A stand-in for a working model: nearest-neighbour enlargement by `scale`. */
function doublingSession(scale: number): NeuralSession {
  return {
    backend: 'wasm',
    release: async () => undefined,
    run: async (patch) => {
      const width = patch.width * scale;
      const height = patch.height * scale;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const source = (Math.floor(y / scale) * patch.width + Math.floor(x / scale)) * 4;
          data.set(patch.data.subarray(source, source + 4), (y * width + x) * 4);
        }
      }
      return { width, height, data };
    },
  };
}

describe('cropTile', () => {
  it('lifts out exactly the padded region', () => {
    const source = gradient(8, 4);
    const [tile] = planTiles(8, 4, 4, 1);
    const patch = cropTile(source, tile!);

    expect(patch.width).toBe(tile!.padWidth);
    expect(patch.height).toBe(tile!.padHeight);
    // Top-left of the patch is the padded origin of the source.
    const at = (image: RgbaImage, x: number, y: number) =>
      [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];
    expect(at(patch, 0, 0)).toEqual(at(source, tile!.padX, tile!.padY));
  });
});

describe('upscaleNeural', () => {
  it('reads the factor back from the model rather than being told it', async () => {
    const { image, scale } = await upscaleNeural(gradient(40, 24), doublingSession(3), {
      tileSize: 16,
      overlap: 4,
    });
    expect(scale).toBe(3);
    expect(image.width).toBe(120);
    expect(image.height).toBe(72);
  });

  it('composites tiles without leaving gaps', async () => {
    const { image } = await upscaleNeural(gradient(40, 24), doublingSession(2), {
      tileSize: 16,
      overlap: 4,
    });
    // Every pixel was written by at least one tile, so none is left transparent.
    for (let i = 3; i < image.data.length; i += 4) {
      expect(image.data[i]).toBeGreaterThan(0);
    }
  });

  it('reports progress once per tile', async () => {
    const onProgress = vi.fn();
    await upscaleNeural(gradient(40, 24), doublingSession(2), {
      tileSize: 16,
      overlap: 4,
      onProgress,
    });
    const tiles = planTiles(40, 24, 16, 4).length;
    expect(onProgress).toHaveBeenCalledTimes(tiles);
    expect(onProgress).toHaveBeenLastCalledWith(tiles, tiles);
  });

  it('explains a model that will not take the tile it is given', async () => {
    // What a fixed-input-size export does: it loads, it hashes, and then it
    // refuses the only thing Glass ever asks of it. The runtime's own shape
    // error does not say that, so the message has to.
    const fixedInput: NeuralSession = {
      backend: 'wasm',
      release: async () => undefined,
      run: async () => {
        throw new Error('Got invalid dimensions for input: input for the following indices');
      },
    };

    await expect(upscaleNeural(gradient(40, 24), fixedInput, { tileSize: 16, overlap: 4 })).rejects.toThrow(
      /Glass tiles every image, so a model built for one fixed input size cannot be used/,
    );
  });

  it('rejects a model that returns the tile unchanged', async () => {
    await expect(
      upscaleNeural(gradient(8, 8), doublingSession(1), { tileSize: 8, overlap: 0 }),
    ).rejects.toThrow(/does not enlarge/);
  });

  it('honours an abort between tiles', async () => {
    const controller = new AbortController();
    const session = doublingSession(2);
    const watched: NeuralSession = {
      ...session,
      run: async (patch) => {
        controller.abort();
        return session.run(patch);
      },
    };

    await expect(
      upscaleNeural(gradient(40, 24), watched, { tileSize: 16, overlap: 4, signal: controller.signal }),
    ).rejects.toThrow(/cancelled/i);
  });
});
