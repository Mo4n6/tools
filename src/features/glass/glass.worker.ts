// The CPU tiers run here so a large image cannot freeze the tab.
//
// Both are pure array arithmetic over an RgbaImage, so the worker only has to
// move buffers: the pixel data is transferred in and the result transferred
// back, never copied.

import { upscaleLocal, type LocalTierId } from './pipeline';
import type { RgbaImage } from './types';

export interface GlassRequest {
  readonly id: number;
  readonly tier: LocalTierId;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: ArrayBuffer;
}

export type GlassResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly width: number;
      readonly height: number;
      readonly pixels: ArrayBuffer;
    }
  | { readonly id: number; readonly ok: false; readonly error: string };

self.onmessage = (event: MessageEvent<GlassRequest>): void => {
  const { id, tier, scale, width, height, pixels } = event.data;

  try {
    const source: RgbaImage = { width, height, data: new Uint8ClampedArray(pixels) };
    const result = upscaleLocal(source, tier, scale);
    const buffer = result.data.buffer as ArrayBuffer;

    const response: GlassResponse = {
      id,
      ok: true,
      width: result.width,
      height: result.height,
      pixels: buffer,
    };
    (self as unknown as Worker).postMessage(response, [buffer]);
  } catch (error) {
    const response: GlassResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
