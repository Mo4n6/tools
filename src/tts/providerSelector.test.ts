import { beforeEach, describe, expect, it, vi } from 'vitest';

const warmupMock = vi.fn();
const getRuntimeDeviceMock = vi.fn();
const synthesizeMock = vi.fn();

vi.mock('./providers/kokoroProvider', () => ({
  canImportKokoroModule: vi.fn(async () => true),
  KokoroProvider: vi.fn().mockImplementation(function MockKokoroProvider() {
    return {
    warmup: warmupMock,
    getRuntimeDevice: getRuntimeDeviceMock,
    synthesize: synthesizeMock,
    };
  }),
}));

vi.mock('./providers/webSpeechProvider', () => ({
  WebSpeechProvider: vi.fn().mockImplementation(function MockWebSpeechProvider() {
    return {
      providerName: 'web-speech',
    };
  }),
}));

describe('selectTTSProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    warmupMock.mockReset();
    getRuntimeDeviceMock.mockReset();
    synthesizeMock.mockReset();
    getRuntimeDeviceMock.mockReturnValue('wasm');
    synthesizeMock.mockResolvedValue({
      segmentId: 'seg-id',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
      url: 'blob:test',
    });
    (globalThis as { navigator?: Navigator }).navigator = {} as Navigator;
  });

  it('falls back intentionally when Kokoro init is skipped', async () => {
    const { selectTTSProvider } = await import('./providerSelector');

    const selection = await selectTTSProvider({
      skipKokoroInit: true,
      skipKokoroInitReason: 'manual skip for test',
    });

    expect(selection.fallbackToWebSpeech).toBe(true);
    expect(selection.providerType).toBe('web-speech');
    expect(selection.runtime).toBe('system');
    expect(selection.fallbackIntentional).toBe(true);
    expect(selection.fallbackReason).toContain('manual skip for test');
  });

  it('initializes Kokoro provider when warmup succeeds', async () => {
    warmupMock.mockResolvedValue(undefined);
    getRuntimeDeviceMock.mockReturnValue('wasm');
    const { selectTTSProvider } = await import('./providerSelector');

    const selection = await selectTTSProvider({
      preferredDevice: 'wasm',
    });

    expect(warmupMock).toHaveBeenCalledTimes(1);
    expect(selection.fallbackToWebSpeech).toBe(false);
    expect(selection.providerType).toBe('kokoro');
    expect(selection.runtime).toBe('wasm');
    expect(selection.dtype).toBe('q8');
  });

  it('uses runtime device reported by Kokoro after warmup downgrade', async () => {
    const originalGpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu = {
      requestAdapter: vi.fn(async () => ({})),
    };
    warmupMock.mockResolvedValue(undefined);
    getRuntimeDeviceMock.mockReturnValue('wasm');
    const { selectTTSProvider } = await import('./providerSelector');
    const { KokoroProvider } = await import('./providers/kokoroProvider');

    const selection = await selectTTSProvider({
      preferredDevice: 'webgpu',
    });

    expect(KokoroProvider).toHaveBeenCalledWith(expect.objectContaining({ dtype: 'fp16', device: 'webgpu' }));
    expect(selection.fallbackToWebSpeech).toBe(false);
    expect(selection.providerType).toBe('kokoro');
    expect(selection.runtime).toBe('wasm');
    expect(selection.dtype).toBe('fp16');

    (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu = originalGpu;
  });

  it('runs a WebGPU quality check after warmup and warns when runtime downgrades to wasm', async () => {
    const originalGpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    const originalRevoke = URL.revokeObjectURL;
    const revokeSpy = vi.fn();
    URL.revokeObjectURL = revokeSpy;
    (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu = {
      requestAdapter: vi.fn(async () => ({})),
    };
    warmupMock.mockResolvedValue(undefined);
    getRuntimeDeviceMock
      .mockReturnValueOnce('webgpu')
      .mockReturnValueOnce('wasm')
      .mockReturnValueOnce('wasm');
    synthesizeMock.mockResolvedValue({
      segmentId: 'kokoro-quality-check',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
      url: 'blob:quality-check',
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { selectTTSProvider } = await import('./providerSelector');

    const selection = await selectTTSProvider({
      preferredDevice: 'webgpu',
    });

    expect(synthesizeMock).toHaveBeenCalledWith({
      id: 'kokoro-quality-check',
      text: 'This is a Kokoro test in English.',
    });
    expect(warnSpy).toHaveBeenCalledWith('WebGPU output quality check failed; switched to WASM.');
    expect(revokeSpy).toHaveBeenCalledWith('blob:quality-check');
    expect(selection.runtime).toBe('wasm');

    warnSpy.mockRestore();
    URL.revokeObjectURL = originalRevoke;
    (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu = originalGpu;
  });
});
