import { beforeEach, describe, expect, it, vi } from 'vitest';

const warmupMock = vi.fn();
const getRuntimeDeviceMock = vi.fn();
const synthesizeMock = vi.fn();
const synthesizeWithRuntimeMock = vi.fn();

vi.mock('./providers/kokoroProvider', () => ({
  canImportKokoroModule: vi.fn(async () => true),
  KokoroProvider: vi.fn().mockImplementation(function MockKokoroProvider() {
    return {
    warmup: warmupMock,
    getRuntimeDevice: getRuntimeDeviceMock,
    synthesize: synthesizeMock,
    synthesizeWithRuntime: synthesizeWithRuntimeMock,
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
    synthesizeWithRuntimeMock.mockReset();
    getRuntimeDeviceMock.mockReturnValue('wasm');
    synthesizeMock.mockResolvedValue({
      segmentId: 'seg-id',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
      url: 'blob:test',
    });
    synthesizeWithRuntimeMock.mockResolvedValue({
      segmentId: 'seg-id',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
      url: 'blob:test-runtime',
    });
    (globalThis as { navigator?: Navigator }).navigator = {} as Navigator;
    window.localStorage.clear();
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

    expect(KokoroProvider).toHaveBeenCalledWith(expect.objectContaining({ dtype: 'q8', device: 'webgpu' }));
    expect(selection.fallbackToWebSpeech).toBe(false);
    expect(selection.providerType).toBe('kokoro');
    expect(selection.runtime).toBe('wasm');
    expect(selection.dtype).toBe('q8');

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
    synthesizeWithRuntimeMock.mockResolvedValue({
      segmentId: 'kokoro-quality-check',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
      url: 'blob:quality-check',
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { selectTTSProvider } = await import('./providerSelector');

    const selection = await selectTTSProvider({
      preferredDevice: 'webgpu',
    });

    expect(synthesizeWithRuntimeMock).toHaveBeenCalledWith({
      id: 'kokoro-quality-check',
      text: 'This is a Kokoro test in English.',
    }, {}, 'webgpu');
    expect(warnSpy).toHaveBeenCalledWith('WebGPU output quality check failed; switched to WASM.');
    expect(revokeSpy).toHaveBeenCalledWith('blob:quality-check');
    expect(selection.runtime).toBe('wasm');

    warnSpy.mockRestore();
    URL.revokeObjectURL = originalRevoke;
    (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu = originalGpu;
  });

  it('marks WebGPU unstable and defaults to wasm when WebGPU quality check fails but wasm succeeds', async () => {
    const originalGpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu = {
      requestAdapter: vi.fn(async () => ({})),
    };
    warmupMock.mockResolvedValue(undefined);
    getRuntimeDeviceMock.mockReturnValue('webgpu');
    synthesizeWithRuntimeMock
      .mockRejectedValueOnce(new Error('webgpu decode failed'))
      .mockResolvedValueOnce({
        segmentId: 'kokoro-quality-check',
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
        url: 'blob:quality-check-wasm',
      });

    const { selectTTSProvider } = await import('./providerSelector');
    await selectTTSProvider();

    synthesizeWithRuntimeMock.mockReset();
    getRuntimeDeviceMock.mockReturnValue('wasm');

    const followUpSelection = await selectTTSProvider();
    expect(followUpSelection.runtime).toBe('wasm');

    (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu = originalGpu;
  });

  it('reports unstable_profile reason when current browser profile is marked unstable', async () => {
    const unstableKey = 'reader-tts-webgpu-unstable-profiles-v1';
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'vitest-agent',
    });
    (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu = {
      requestAdapter: vi.fn(async () => ({})),
    };
    window.localStorage.setItem(unstableKey, JSON.stringify({
      'vitest-agent::unknown-gpu': {
        markedAt: '2026-03-01T00:00:00.000Z',
        reason: 'webgpu decode failed',
      },
    }));
    warmupMock.mockResolvedValue(undefined);
    getRuntimeDeviceMock.mockReturnValue('wasm');

    const { selectTTSProvider } = await import('./providerSelector');
    const selection = await selectTTSProvider();

    expect(selection.webGpuAvoidance).toEqual({
      reason: 'unstable_profile',
      message: 'WebGPU was previously marked unstable in this browser profile, so Kokoro was started in CPU mode.',
      profileMarkedAt: '2026-03-01T00:00:00.000Z',
    });
    expect(selection.runtimeReason).toContain('previously marked unstable');
  });
});
