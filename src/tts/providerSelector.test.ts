import { beforeEach, describe, expect, it, vi } from 'vitest';

const warmupMock = vi.fn();

vi.mock('./providers/kokoroProvider', () => ({
  canImportKokoroModule: vi.fn(async () => true),
  KokoroProvider: vi.fn().mockImplementation(() => ({
    warmup: warmupMock,
  })),
}));

vi.mock('./providers/webSpeechProvider', () => ({
  WebSpeechProvider: vi.fn().mockImplementation(() => ({
    providerName: 'web-speech',
  })),
}));

describe('selectTTSProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    warmupMock.mockReset();
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
    const { selectTTSProvider } = await import('./providerSelector');

    const selection = await selectTTSProvider({
      preferredDevice: 'wasm',
    });

    expect(warmupMock).toHaveBeenCalledTimes(1);
    expect(selection.fallbackToWebSpeech).toBe(false);
    expect(selection.providerType).toBe('kokoro');
    expect(selection.runtime).toBe('wasm');
  });
});
