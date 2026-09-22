// Decoding into, and encoding out of, the RgbaImage the tiers operate on.
//
// This is the only module in Glass that touches a canvas, which keeps the
// actual upscaling testable without a browser and runnable inside a worker.
//
// Nothing here uploads anything. Decoding happens through createImageBitmap on
// a local Blob and encoding happens through the canvas, so the pixels only ever
// exist in this tab's memory.

import type { RgbaImage } from './types';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function createCanvasFor(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: AnyCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  // willReadFrequently keeps the surface on the CPU; every use here reads back
  // immediately, so a GPU-backed surface would only add a readback stall.
  const context = (canvas as HTMLCanvasElement).getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser refused a 2D canvas context');
  return context as CanvasRenderingContext2D;
}

/** Decodes any format the browser can read into raw RGBA. */
export async function decodeImage(source: Blob): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = createCanvasFor(bitmap.width, bitmap.height);
    const context = context2d(canvas);
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, data: pixels.data };
  } finally {
    bitmap.close();
  }
}

/** Encodes to PNG, which is lossless and therefore the only honest default. */
export async function encodePng(image: RgbaImage): Promise<Blob> {
  const canvas = createCanvasFor(image.width, image.height);
  const context = context2d(canvas);
  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);

  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser could not encode the result'));
    }, 'image/png');
  });
}

/** Builds the download name, preserving the stem and marking the factor. */
export function outputFileName(inputName: string, scale: number): string {
  const stem = inputName.replace(/\.[^.]+$/, '') || 'image';
  return `${stem}@${scale}x.png`;
}
