// Girih — a small seedable PRNG, so drills and mining are reproducible.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

export type Rng = () => number;

/** mulberry32: fast, 32-bit state, plenty for shuffling boards. */
export const createRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const randomInt = (rng: Rng, n: number): number => Math.floor(rng() * n);

export const shuffle = <T>(rng: Rng, items: T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export const pick = <T>(rng: Rng, items: T[]): T => items[randomInt(rng, items.length)];
