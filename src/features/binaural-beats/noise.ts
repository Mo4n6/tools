import type { NoiseType } from './presets';

export type RandomSource = () => number;

const centered = (random: RandomSource): number => random() * 2 - 1;

export const generateWhiteNoise = (length: number, random: RandomSource = Math.random): Float32Array => {
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    output[index] = centered(random);
  }
  return output;
};

// Paul Kellet's refined pink noise approximation (-3 dB/octave).
export const generatePinkNoise = (length: number, random: RandomSource = Math.random): Float32Array => {
  const output = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let index = 0; index < length; index += 1) {
    const white = centered(random);
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    output[index] = pink * 0.11;
  }
  return output;
};

// Leaky integrator brown (red) noise (-6 dB/octave).
export const generateBrownNoise = (length: number, random: RandomSource = Math.random): Float32Array => {
  const output = new Float32Array(length);
  let last = 0;
  for (let index = 0; index < length; index += 1) {
    const white = centered(random);
    last = (last + 0.02 * white) / 1.02;
    output[index] = last * 3.5;
  }
  return output;
};

export const generateNoise = (type: Exclude<NoiseType, 'none'>, length: number, random: RandomSource = Math.random): Float32Array => {
  switch (type) {
    case 'white':
      return generateWhiteNoise(length, random);
    case 'pink':
      return generatePinkNoise(length, random);
    case 'brown':
      return generateBrownNoise(length, random);
  }
};

export const clampToUnitRange = (samples: Float32Array): Float32Array => {
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    samples[index] = Math.min(1, Math.max(-1, sample));
  }
  return samples;
};
