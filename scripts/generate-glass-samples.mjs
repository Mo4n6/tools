// Generates the sample images Glass offers on its own page.
//
// They are drawn here rather than downloaded, so the repository carries no
// third-party image and no licence question, and so each one can be built to
// exercise the tier it sits next to. The three tiers disagree most visibly on
// different material, and a sample that does not provoke that disagreement
// teaches the operator nothing:
//
//   sprite  hard edges and a tiny palette   — Pixel keeps them, Lanczos blurs them
//   chart   fine detail and clean gradients — Lanczos resolves it, Pixel cannot
//   soft    genuinely missing detail        — only the neural tier invents any
//
// Regenerate with `npm run glass:samples`. Output is deterministic, so a run
// with no source change produces no diff.

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT_DIR = path.join(process.cwd(), 'public', 'glass-samples');

// --- a minimal PNG encoder -------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}

function encodePng(width, height, rgba) {
  // One filter byte per scanline; filter 0 (None) keeps the encoder trivial and
  // costs nothing at these sizes.
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- a tiny drawing surface ------------------------------------------------

function surface(width, height, background = [10, 16, 12, 255]) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(background, i * 4);
  return {
    width,
    height,
    data,
    set(x, y, [r, g, b, a = 255]) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const p = (y * width + x) * 4;
      // Source-over, so antialiased coverage composites rather than replaces.
      const alpha = a / 255;
      data[p] = data[p] * (1 - alpha) + r * alpha;
      data[p + 1] = data[p + 1] * (1 - alpha) + g * alpha;
      data[p + 2] = data[p + 2] * (1 - alpha) + b * alpha;
      data[p + 3] = Math.max(data[p + 3], a);
    },
  };
}

/** Three-pass box blur: cheap, and separable enough at these sizes. */
function blur(source, radius, passes = 3) {
  const { width, height } = source;
  let data = Buffer.from(source.data);

  for (let pass = 0; pass < passes; pass += 1) {
    for (const horizontal of [true, false]) {
      const next = Buffer.alloc(data.length);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          let n = 0;
          for (let k = -radius; k <= radius; k += 1) {
            const sx = horizontal ? Math.min(width - 1, Math.max(0, x + k)) : x;
            const sy = horizontal ? y : Math.min(height - 1, Math.max(0, y + k));
            const p = (sy * width + sx) * 4;
            r += data[p];
            g += data[p + 1];
            b += data[p + 2];
            a += data[p + 3];
            n += 1;
          }
          const q = (y * width + x) * 4;
          next[q] = r / n;
          next[q + 1] = g / n;
          next[q + 2] = b / n;
          next[q + 3] = a / n;
        }
      }
      data = next;
    }
  }

  return { width, height, data };
}

// --- the samples -----------------------------------------------------------

/** @typedef {[number, number, number, number]} Rgba */

/** @type {Rgba} */ const EMERALD = [74, 222, 128, 255];
/** @type {Rgba} */ const AMBER = [251, 191, 36, 255];
/** @type {Rgba} */ const ROSE = [244, 63, 94, 255];
/** @type {Rgba} */ const PALE = [209, 250, 229, 255];

/**
 * Hard edges, four colours, staircase diagonals.
 *
 * Scale2x extends the diagonals and copies everything else; Lanczos rounds the
 * corners and introduces hundreds of intermediate colours. The difference is
 * obvious at a glance, which is the point of shipping it.
 */
function sprite() {
  const size = 32;
  const s = surface(size, size);
  const put = (x, y, c) => s.set(x, y, c);

  for (let i = 0; i < size; i += 1) {
    put(i, i, EMERALD);
    put(i, size - 1 - i, AMBER);
  }
  for (let x = 5; x < 27; x += 1) {
    put(x, 5, ROSE);
    put(x, 26, ROSE);
  }
  for (let y = 5; y < 27; y += 1) {
    put(5, y, ROSE);
    put(26, y, ROSE);
  }
  for (let x = 12; x < 20; x += 1) {
    for (let y = 12; y < 20; y += 1) put(x, y, EMERALD);
  }
  // A stepped corner motif, which is where edge-directed scaling shows itself.
  for (let i = 0; i < 6; i += 1) {
    for (let j = 0; j <= i; j += 1) put(8 + j, 8 + i, PALE);
  }
  return s;
}

/**
 * A spoke target plus a gradient ramp: the classic way to see a resampler's
 * quality, and its ringing.
 */
function chart() {
  const size = 160;
  const s = surface(size, size, [8, 14, 10, 255]);
  const cx = size / 2;
  const cy = size / 2 - 12;
  const spokes = 24;

  // Supersampled so the source itself is clean; any softness after upscaling
  // then belongs to the resampler rather than to the sample.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < 3; sy += 1) {
        for (let sx = 0; sx < 3; sx += 1) {
          const px = x + (sx + 0.5) / 3 - 0.5;
          const py = y + (sy + 0.5) / 3 - 0.5;
          const dx = px - cx;
          const dy = py - cy;
          const radius = Math.hypot(dx, dy);
          if (radius > 60 || radius < 6) continue;
          const angle = Math.atan2(dy, dx);
          if (Math.cos(angle * spokes) > 0) hits += 1;
        }
      }
      if (hits > 0) s.set(x, y, [PALE[0], PALE[1], PALE[2], Math.round((hits / 9) * 255)]);
    }
  }

  for (let x = 0; x < size; x += 1) {
    const t = x / (size - 1);
    for (let y = size - 22; y < size - 6; y += 1) {
      s.set(x, y, [
        Math.round(20 + t * 231),
        Math.round(222 - t * 31),
        Math.round(128 - t * 34),
        255,
      ]);
    }
  }
  return s;
}

/**
 * Detail that is genuinely absent rather than merely small.
 *
 * Lanczos can only enlarge this blur; a generative model is the one thing that
 * can put an edge back, which is exactly the trade the neural tier offers.
 */
function soft() {
  const size = 96;
  const s = surface(size, size, [12, 20, 16, 255]);

  for (let i = 0; i < 5; i += 1) {
    const cx = 18 + i * 15;
    const cy = 30 + Math.sin(i * 1.3) * 16;
    const colour = [EMERALD, AMBER, ROSE, PALE, EMERALD][i];
    for (let y = -11; y <= 11; y += 1) {
      for (let x = -11; x <= 11; x += 1) {
        if (Math.hypot(x, y) <= 10) s.set(Math.round(cx + x), Math.round(cy + y), colour);
      }
    }
  }
  for (let x = 10; x < 86; x += 1) {
    for (let y = 64; y < 72; y += 1) {
      if (Math.floor(x / 6) % 2 === 0) s.set(x, y, PALE);
    }
  }

  return blur(s, 2, 3);
}

const SAMPLES = [
  { name: 'sprite.png', image: sprite() },
  { name: 'chart.png', image: chart() },
  { name: 'soft.png', image: soft() },
];

await mkdir(OUT_DIR, { recursive: true });
for (const { name, image } of SAMPLES) {
  const png = encodePng(image.width, image.height, image.data);
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(path.join(OUT_DIR, name));
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(png);
  });
  console.log(`glass-samples: ${name} ${image.width}x${image.height}, ${png.length} bytes`);
}
