import { describe, expect, it, vi } from 'vitest';

import { configuredWeightsUrl, describeBytes, isUsableWeightsUrl, readWithProgress } from '../weights';

describe('describeBytes', () => {
  it('scales through the units', () => {
    expect(describeBytes(512)).toBe('512 B');
    expect(describeBytes(2048)).toBe('2.0 KB');
    expect(describeBytes(17 * 1024 * 1024)).toBe('17 MB');
    expect(describeBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
  });

  it('refuses to render nonsense as a size', () => {
    expect(describeBytes(Number.NaN)).toBe('—');
    expect(describeBytes(-1)).toBe('—');
  });
});

describe('isUsableWeightsUrl', () => {
  it('accepts https anywhere', () => {
    expect(isUsableWeightsUrl('https://example.invalid/model.onnx')).toBe(true);
  });

  it('accepts cleartext only on loopback', () => {
    expect(isUsableWeightsUrl('http://localhost:8080/model.onnx')).toBe(true);
    expect(isUsableWeightsUrl('http://127.0.0.1/model.onnx')).toBe(true);
    expect(isUsableWeightsUrl('http://example.invalid/model.onnx')).toBe(false);
  });

  it('rejects other schemes and malformed input', () => {
    expect(isUsableWeightsUrl('file:///etc/passwd')).toBe(false);
    expect(isUsableWeightsUrl('javascript:alert(1)')).toBe(false);
    expect(isUsableWeightsUrl('data:application/octet-stream,AA')).toBe(false);
    expect(isUsableWeightsUrl('not a url')).toBe(false);
    expect(isUsableWeightsUrl('')).toBe(false);
  });
});

describe('configuredWeightsUrl', () => {
  it('returns a usable configured URL', () => {
    expect(configuredWeightsUrl({ VITE_GLASS_WEIGHTS_URL: ' https://example.invalid/m.onnx ' })).toBe(
      'https://example.invalid/m.onnx',
    );
  });

  it('ignores absent, blank and unusable values', () => {
    expect(configuredWeightsUrl({})).toBeNull();
    expect(configuredWeightsUrl({ VITE_GLASS_WEIGHTS_URL: '   ' })).toBeNull();
    expect(configuredWeightsUrl({ VITE_GLASS_WEIGHTS_URL: 'ftp://example.invalid/m.onnx' })).toBeNull();
    expect(configuredWeightsUrl({ VITE_GLASS_WEIGHTS_URL: true })).toBeNull();
  });
});

describe('readWithProgress', () => {
  function streamOf(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
  }

  it('concatenates chunks in order', async () => {
    const buffer = await readWithProgress(
      streamOf([Uint8Array.from([1, 2]), Uint8Array.from([3]), Uint8Array.from([4, 5])]),
      5,
    );
    expect([...new Uint8Array(buffer)]).toEqual([1, 2, 3, 4, 5]);
  });

  it('reports cumulative bytes against the declared total', async () => {
    const onProgress = vi.fn();
    await readWithProgress(streamOf([Uint8Array.from([1, 2]), Uint8Array.from([3])]), 3, onProgress);
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([
      { received: 2, total: 3 },
      { received: 3, total: 3 },
    ]);
  });

  it('copes with a server that sends no length', async () => {
    const onProgress = vi.fn();
    await readWithProgress(streamOf([Uint8Array.from([7])]), null, onProgress);
    expect(onProgress).toHaveBeenCalledWith({ received: 1, total: null });
  });
});
