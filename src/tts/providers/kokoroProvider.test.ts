import { beforeEach, describe, expect, it, vi } from 'vitest';
import { perfTelemetry } from '../perfTelemetry';

const fromPretrainedMock = vi.fn();

vi.mock('kokoro-js', () => ({
  KokoroTTS: {
    from_pretrained: fromPretrainedMock,
  },
}));

const buildWavBytes = (payloadSize = 80): Uint8Array => {
  const bytes = new Uint8Array(payloadSize);
  bytes[0] = 0x52;
  bytes[1] = 0x49;
  bytes[2] = 0x46;
  bytes[3] = 0x46;
  bytes[8] = 0x57;
  bytes[9] = 0x41;
  bytes[10] = 0x56;
  bytes[11] = 0x45;
  return bytes;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => (
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
);

describe('KokoroProvider runtime downgrade', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('retries with wasm when webgpu output fails validation', async () => {
    const logSpy = vi.spyOn(perfTelemetry.sink, 'log');
    fromPretrainedMock.mockImplementation(async (_modelId: string, options: { device?: string }) => {
      if (options.device === 'webgpu') {
        return {
          device: 'webgpu',
          voices: { af_heart: { name: 'Heart' } },
          generate: vi.fn(async () => new Blob([], { type: 'audio/wav' })),
        };
      }

      return {
        device: 'wasm',
        voices: { af_heart: { name: 'Heart' } },
        generate: vi.fn(async () => buildWavBytes()),
      };
    });

    const { KokoroProvider } = await import('./kokoroProvider');
    const provider = new KokoroProvider({ device: 'webgpu' });
    await provider.warmup();

    const result = await provider.synthesize({ id: 'seg-1', text: 'hello' });
    expect('url' in result && result.url.length > 0).toBe(true);
    expect(provider.getRuntimeDevice()).toBe('wasm');
    expect(fromPretrainedMock).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tts.runtime_downgrade',
      transition: 'webgpu->wasm',
      segmentId: 'seg-1',
      reason: 'empty_audio',
    }));
  });

  it('normalizes missing blob type to audio/wav when bytes are playable', async () => {
    fromPretrainedMock.mockResolvedValue({
      device: 'wasm',
      voices: { af_heart: { name: 'Heart' } },
      generate: vi.fn(async () => new Blob([toArrayBuffer(buildWavBytes())], { type: '' })),
    });

    const { KokoroProvider } = await import('./kokoroProvider');
    const provider = new KokoroProvider({ device: 'wasm' });
    const result = await provider.synthesize({ id: 'seg-2', text: 'hello' });
    expect('blob' in result && result.blob.type).toBe('audio/wav');
  });

  it('throws typed tts.synth_failure for unsupported blob mime types', async () => {
    fromPretrainedMock.mockResolvedValue({
      device: 'wasm',
      voices: { af_heart: { name: 'Heart' } },
      generate: vi.fn(async () => new Blob([toArrayBuffer(buildWavBytes())], { type: 'text/plain' })),
    });

    const { KokoroProvider } = await import('./kokoroProvider');
    const provider = new KokoroProvider({ device: 'wasm' });
    await expect(provider.synthesize({ id: 'seg-3', text: 'hello' }))
      .rejects
      .toMatchObject({ code: 'tts.synth_failure', message: expect.stringContaining('unsupported_mime_type') });
  });
});
