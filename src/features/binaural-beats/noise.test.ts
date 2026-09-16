import { describe, expect, it } from 'vitest';
import { clampToUnitRange, generateBrownNoise, generateNoise, generatePinkNoise, generateWhiteNoise } from './noise';

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const LENGTH = 48_000;

describe('noise generators', () => {
  it('produce the requested number of samples', () => {
    expect(generateWhiteNoise(10, seededRandom(1))).toHaveLength(10);
    expect(generatePinkNoise(10, seededRandom(1))).toHaveLength(10);
    expect(generateBrownNoise(10, seededRandom(1))).toHaveLength(10);
  });

  it('are deterministic for a given random source', () => {
    expect(generateNoise('pink', 256, seededRandom(7))).toEqual(generateNoise('pink', 256, seededRandom(7)));
  });

  it('stay within the unit range and are roughly zero-centered', () => {
    for (const type of ['white', 'pink', 'brown'] as const) {
      const samples = clampToUnitRange(generateNoise(type, LENGTH, seededRandom(42)));
      let sum = 0;
      let peak = 0;
      for (const sample of samples) {
        sum += sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      expect(peak).toBeLessThanOrEqual(1);
      expect(peak).toBeGreaterThan(0.05);
      expect(Math.abs(sum / LENGTH)).toBeLessThan(0.1);
    }
  });

  it('brown noise has less high-frequency energy than white noise', () => {
    const highFrequencyEnergy = (samples: Float32Array): number => {
      let energy = 0;
      for (let index = 1; index < samples.length; index += 1) {
        const delta = (samples[index] ?? 0) - (samples[index - 1] ?? 0);
        energy += delta * delta;
      }
      return energy / samples.length;
    };
    const white = highFrequencyEnergy(generateWhiteNoise(LENGTH, seededRandom(3)));
    const pink = highFrequencyEnergy(generatePinkNoise(LENGTH, seededRandom(3)));
    const brown = highFrequencyEnergy(generateBrownNoise(LENGTH, seededRandom(3)));
    expect(pink).toBeLessThan(white);
    expect(brown).toBeLessThan(pink);
  });
});
