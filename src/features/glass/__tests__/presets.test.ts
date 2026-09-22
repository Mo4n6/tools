import { describe, expect, it } from 'vitest';

import { WEIGHTS_PRESETS, isUsablePreset, usablePresets, type WeightsPreset } from '../presets';
import { digestHex, verifyDigest } from '../weights';

const VALID: WeightsPreset = {
  id: 'example',
  label: 'Example',
  note: 'For tests.',
  url: 'https://example.invalid/resolve/abc1234/model.onnx',
  sha256: 'a'.repeat(64),
  bytes: 17 * 1024 * 1024,
  scale: 4,
};

describe('preset validation', () => {
  it('accepts a well-formed entry', () => {
    expect(isUsablePreset(VALID)).toBe(true);
  });

  it('rejects a digest that is not 64 hex characters', () => {
    expect(isUsablePreset({ ...VALID, sha256: 'abc123' })).toBe(false);
    expect(isUsablePreset({ ...VALID, sha256: 'A'.repeat(64) })).toBe(false);
    expect(isUsablePreset({ ...VALID, sha256: '' })).toBe(false);
  });

  it('rejects anything but https, since the digest is the only other guarantee', () => {
    expect(isUsablePreset({ ...VALID, url: 'http://example.invalid/m.onnx' })).toBe(false);
    expect(isUsablePreset({ ...VALID, url: 'not a url' })).toBe(false);
  });

  it('rejects a size or factor that cannot be true', () => {
    expect(isUsablePreset({ ...VALID, bytes: 0 })).toBe(false);
    expect(isUsablePreset({ ...VALID, bytes: 1.5 })).toBe(false);
    expect(isUsablePreset({ ...VALID, scale: 1 })).toBe(false);
  });

  it('rejects an entry with no identity', () => {
    expect(isUsablePreset({ ...VALID, id: '' })).toBe(false);
    expect(isUsablePreset({ ...VALID, label: '' })).toBe(false);
  });

  it('withholds malformed entries rather than offering them', () => {
    const list = usablePresets([VALID, { ...VALID, id: 'broken', sha256: 'nope' }]);
    expect(list.map((preset) => preset.id)).toEqual(['example']);
  });
});

describe('the presets that actually ship', () => {
  // Entries are hand-pasted from the helper script, so a typo would otherwise
  // reach the UI as a download that cannot succeed.
  it('are all well-formed', () => {
    for (const preset of WEIGHTS_PRESETS) {
      expect(isUsablePreset(preset), `${preset.id} is malformed`).toBe(true);
    }
  });

  it('have unique ids', () => {
    const ids = WEIGHTS_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('digest verification', () => {
  const abc = new TextEncoder().encode('abc').buffer as ArrayBuffer;
  const ABC_SHA = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

  it('produces the known SHA-256 of a known input', async () => {
    await expect(digestHex(abc)).resolves.toBe(ABC_SHA);
  });

  it('pads every byte to two hex characters', async () => {
    const digest = await digestHex(new Uint8Array([0]).buffer as ArrayBuffer);
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('passes bytes that match', async () => {
    await expect(verifyDigest(abc, ABC_SHA)).resolves.toBeUndefined();
  });

  it('accepts an expectation written in upper case', async () => {
    await expect(verifyDigest(abc, ABC_SHA.toUpperCase())).resolves.toBeUndefined();
  });

  it('refuses bytes that do not match, naming both digests', async () => {
    await expect(verifyDigest(abc, 'f'.repeat(64))).rejects.toThrow(/do not match the expected digest/);
    await expect(verifyDigest(abc, 'f'.repeat(64))).rejects.toThrow(/ffffffffffffffff/);
  });

  it('refuses a truncated download that would otherwise look plausible', async () => {
    const truncated = new TextEncoder().encode('ab').buffer as ArrayBuffer;
    await expect(verifyDigest(truncated, ABC_SHA)).rejects.toThrow(Error);
  });
});
