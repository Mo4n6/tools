import { JSDOM } from 'jsdom';
import React, { useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerController, type UsePlayerControllerResult } from './playerMachine';
import type { TTSProvider } from '../../tts/types';

const segments = [
  { id: 'seg-1', text: 'First segment text' },
  { id: 'seg-2', text: 'Second segment text' },
];

class MockAudio {
  static instances: MockAudio[] = [];

  src: string;
  preload = 'none';
  currentTime = 0;
  duration = 5;
  onended: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  pause = vi.fn();
  load = vi.fn();
  play = vi.fn(async () => undefined);

  constructor(src: string) {
    this.src = src;
    MockAudio.instances.push(this);
  }
}

function HookHarness({
  provider,
  customSegments = segments,
  synthesisOptions,
  persistKey = 'player-machine-test',
  onController,
}: {
  provider: TTSProvider;
  customSegments?: { id: string; text: string }[];
  synthesisOptions?: { voice?: string; rate?: number };
  persistKey?: string;
  onController: (controller: UsePlayerControllerResult) => void;
}): React.JSX.Element {
  const controller = usePlayerController({
    provider,
    segments: customSegments,
    synthesisOptions,
    persistKey,
    prefetchCount: 0,
  });

  useEffect(() => {
    onController(controller);
  }, [controller, onController]);

  return <div data-state={controller.state} />;
}

describe('usePlayerController transitions', () => {
  let jsdom: JSDOM;
  let originalAudio: typeof globalThis.Audio | undefined;
  let originalURL: typeof globalThis.URL;
  let originalAudioContext: typeof AudioContext | undefined;
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeAll(() => {
    jsdom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test' });
    Object.assign(globalThis, {
      window: jsdom.window,
      document: jsdom.window.document,
      localStorage: jsdom.window.localStorage,
      DOMParser: jsdom.window.DOMParser,
      navigator: jsdom.window.navigator,
    });
    originalAudio = globalThis.Audio;
    originalURL = globalThis.URL;
    originalAudioContext = (globalThis as typeof globalThis & { AudioContext?: typeof AudioContext }).AudioContext;
    globalThis.Audio = MockAudio as unknown as typeof Audio;
  });

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root?.unmount();
    root = null;
    container.remove();
    Object.assign(globalThis, { URL: originalURL, AudioContext: originalAudioContext });
  });

  afterAll(() => {
    if (originalAudio) {
      globalThis.Audio = originalAudio;
    }
    jsdom.window.close();
  });

  it('transitions through play, pause, skip, and error states', async () => {
    const provider: TTSProvider = {
      listVoices: vi.fn(async () => []),
      warmup: vi.fn(async () => undefined),
      synthesize: vi.fn(async ({ id }) => {
        if (id === 'seg-2') {
          throw new Error('boom synthesis');
        }
        return {
          segmentId: id,
          blob: new Blob(['ok'], { type: 'audio/mpeg' }),
          url: `blob:${id}`,
        };
      }),
    };

    let controller: UsePlayerControllerResult | null = null;
    const getController = (): UsePlayerControllerResult => {
      if (!controller) {
        throw new Error('Controller was not initialized');
      }
      return controller;
    };
    await act(async () => {
      root?.render(<HookHarness provider={provider} onController={(value) => { controller = value; }} />);
    });

    expect(getController().state).toBe('idle');

    await act(async () => {
      await getController().play();
    });
    expect(getController().state).toBe('playing');
    expect(getController().currentSegmentIndex).toBe(0);

    act(() => {
      getController().pause();
    });
    expect(getController().state).toBe('paused');

    await act(async () => {
      await getController().skipNext();
    });

    expect(getController().state).toBe('error');
    expect(getController().error).toContain('boom synthesis');
    expect(getController().currentSegmentIndex).toBe(1);
  });

  it('clears synthesized queue when synthesis options change', async () => {
    const originalURL = globalThis.URL;
    const revokeObjectURL = vi.fn();
    Object.assign(globalThis, {
      URL: {
        revokeObjectURL,
      },
    });

    const provider: TTSProvider = {
      listVoices: vi.fn(async () => []),
      warmup: vi.fn(async () => undefined),
      synthesize: vi.fn(async ({ id }) => ({
        segmentId: id,
        blob: new Blob(['ok'], { type: 'audio/mpeg' }),
        url: `blob:${id}`,
      })),
    };

    let controller: UsePlayerControllerResult | null = null;
    const getController = (): UsePlayerControllerResult => {
      if (!controller) {
        throw new Error('Controller was not initialized');
      }
      return controller;
    };

    await act(async () => {
      root?.render(
        <HookHarness
          provider={provider}
          synthesisOptions={{ voice: 'voice-a', rate: 1 }}
          onController={(value) => { controller = value; }}
        />,
      );
    });

    await act(async () => {
      await getController().play();
    });

    expect(getController().queue[0]?.synthesisStatus).toBe('ready');
    expect(getController().queue[0]?.audioUrl).toBe('blob:seg-1');

    await act(async () => {
      root?.render(
        <HookHarness
          provider={provider}
          synthesisOptions={{ voice: 'voice-b', rate: 1 }}
          onController={(value) => { controller = value; }}
        />,
      );
    });

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:seg-1');
    expect(getController().state).toBe('idle');
    expect(getController().queue[0]?.synthesisStatus).toBe('idle');
    expect(getController().queue[0]?.audioUrl).toBeNull();
    Object.assign(globalThis, { URL: originalURL });
  });

  it('clears synthesized queue when provider runtime signature changes', async () => {
    const originalURL = globalThis.URL;
    const revokeObjectURL = vi.fn();
    Object.assign(globalThis, {
      URL: {
        revokeObjectURL,
      },
    });

    const provider = {
      runtimeDevice: 'webgpu' as 'webgpu' | 'wasm',
      dtype: 'q8',
      getRuntimeDevice() {
        return this.runtimeDevice;
      },
      listVoices: vi.fn(async () => []),
      warmup: vi.fn(async () => undefined),
      synthesize: vi.fn(async ({ id }: { id: string }) => ({
        segmentId: id,
        blob: new Blob(['ok'], { type: 'audio/mpeg' }),
        url: `blob:${id}`,
      })),
    } as TTSProvider & { runtimeDevice: 'webgpu' | 'wasm'; dtype: string; getRuntimeDevice: () => string };

    let controller: UsePlayerControllerResult | null = null;
    const getController = (): UsePlayerControllerResult => {
      if (!controller) {
        throw new Error('Controller was not initialized');
      }
      return controller;
    };

    await act(async () => {
      root?.render(
        <HookHarness
          provider={provider}
          synthesisOptions={{ voice: 'voice-a', rate: 1 }}
          onController={(value) => { controller = value; }}
        />,
      );
    });

    await act(async () => {
      await getController().play();
    });
    expect(getController().queue[0]?.audioUrl).toBe('blob:seg-1');

    await act(async () => {
      provider.runtimeDevice = 'wasm';
      root?.render(
        <HookHarness
          provider={provider}
          synthesisOptions={{ voice: 'voice-a', rate: 1 }}
          onController={(value) => { controller = value; }}
        />,
      );
    });

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:seg-1');
    expect(getController().queue[0]?.synthesisStatus).toBe('idle');
    expect(getController().queue[0]?.audioUrl).toBeNull();
    Object.assign(globalThis, { URL: originalURL });
  });

  it('switches documents after pausing at segment N and starts the new document at the beginning', async () => {
    const docA = [
      { id: 'shared-1', text: 'Shared opening segment' },
      { id: 'doc-a-2', text: 'Document A second segment' },
    ];
    const docB = [
      { id: 'shared-1', text: 'Shared opening segment' },
      { id: 'doc-b-2', text: 'Document B second segment' },
    ];
    const provider: TTSProvider = {
      listVoices: vi.fn(async () => []),
      warmup: vi.fn(async () => undefined),
      synthesize: vi.fn(async ({ id }) => ({
        segmentId: id,
        blob: new Blob(['ok'], { type: 'audio/mpeg' }),
        url: `blob:${id}`,
      })),
    };

    let controller: UsePlayerControllerResult | null = null;
    const getController = (): UsePlayerControllerResult => {
      if (!controller) {
        throw new Error('Controller was not initialized');
      }
      return controller;
    };

    await act(async () => {
      root?.render(
        <HookHarness
          provider={provider}
          customSegments={docA}
          persistKey="player-machine-doc-a"
          onController={(value) => { controller = value; }}
        />,
      );
    });

    await act(async () => {
      await getController().play();
      await getController().skipNext();
    });
    act(() => {
      getController().pause();
    });
    expect(getController().currentSegmentIndex).toBe(1);

    await act(async () => {
      root?.render(
        <HookHarness
          provider={provider}
          customSegments={docB}
          persistKey="player-machine-doc-b"
          onController={(value) => { controller = value; }}
        />,
      );
    });

    expect(getController().state).toBe('idle');
    expect(getController().currentSegmentIndex).toBe(0);
    expect(getController().charOffset).toBe(0);
    expect(getController().queue[0]?.synthesisStatus).toBe('idle');
    expect(getController().queue[0]?.audioUrl).toBeNull();
  });

  it('preserves resume only within the same document fingerprint key', async () => {
    const provider: TTSProvider = {
      listVoices: vi.fn(async () => []),
      warmup: vi.fn(async () => undefined),
      synthesize: vi.fn(async ({ id }) => ({
        segmentId: id,
        blob: new Blob(['ok'], { type: 'audio/mpeg' }),
        url: `blob:${id}`,
      })),
    };

    let controller: UsePlayerControllerResult | null = null;
    const getController = (): UsePlayerControllerResult => {
      if (!controller) {
        throw new Error('Controller was not initialized');
      }
      return controller;
    };

    await act(async () => {
      root?.render(
        <HookHarness
          provider={provider}
          persistKey="player-machine-fingerprint-a"
          onController={(value) => { controller = value; }}
        />,
      );
    });

    await act(async () => {
      await getController().play();
      await getController().seekSegment(1, 3);
    });
    act(() => {
      getController().pause();
    });
    expect(getController().currentSegmentIndex).toBe(1);
    expect(getController().charOffset).toBe(3);

    await act(async () => {
      root?.render(
        <HookHarness
          provider={provider}
          persistKey="player-machine-fingerprint-b"
          onController={(value) => { controller = value; }}
        />,
      );
    });

    expect(getController().currentSegmentIndex).toBe(0);
    expect(getController().charOffset).toBe(0);

    await act(async () => {
      root?.render(
        <HookHarness
          provider={provider}
          persistKey="player-machine-fingerprint-a"
          onController={(value) => { controller = value; }}
        />,
      );
    });

    expect(getController().currentSegmentIndex).toBe(1);
    expect(getController().charOffset).toBe(3);
  });

  it('runs decode probe before ready and retries once with wasm when webgpu probe fails', async () => {
    const originalAudioContext = (globalThis as typeof globalThis & { AudioContext?: typeof AudioContext }).AudioContext;
    const decodeAudioDataMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('bad webgpu decode'))
      .mockResolvedValueOnce({ duration: 1 });
    const closeMock = vi.fn(async () => undefined);
    class MockAudioContext {
      decodeAudioData = decodeAudioDataMock;
      close = closeMock;
    }
    Object.assign(globalThis, {
      AudioContext: MockAudioContext as unknown as typeof AudioContext,
    });

    const synthesize = vi.fn(async ({ id }: { id: string }) => ({
      segmentId: id,
      blob: new Blob(['bad-audio'], { type: 'audio/wav' }),
      url: `blob:webgpu:${id}`,
    }));
    const synthesizeWithRuntime = vi.fn(async ({ id }: { id: string }) => ({
      segmentId: id,
      blob: new Blob(['good-audio'], { type: 'audio/wav' }),
      url: `blob:wasm:${id}`,
    }));
    const provider = {
      getRuntimeDevice: () => 'webgpu',
      listVoices: vi.fn(async () => []),
      warmup: vi.fn(async () => undefined),
      synthesize,
      synthesizeWithRuntime,
    } as TTSProvider & {
      getRuntimeDevice: () => 'webgpu';
      synthesizeWithRuntime: (segment: { id: string; text: string }, options: { voice?: string; rate?: number } | undefined, runtime: 'wasm' | 'webgpu') => Promise<{
        segmentId: string;
        blob: Blob;
        url: string;
      }>;
    };

    let controller: UsePlayerControllerResult | null = null;
    const getController = (): UsePlayerControllerResult => {
      if (!controller) {
        throw new Error('Controller was not initialized');
      }
      return controller;
    };

    await act(async () => {
      root?.render(<HookHarness provider={provider} onController={(value) => { controller = value; }} />);
    });

    await act(async () => {
      await getController().play();
    });

    expect(synthesizeWithRuntime).toHaveBeenCalledWith(
      { id: 'seg-1', text: 'First segment text' },
      undefined,
      'wasm'
    );
    expect(getController().queue[0]?.synthesisStatus).toBe('ready');
    expect(getController().queue[0]?.audioUrl).toBe('blob:wasm:seg-1');

    Object.assign(globalThis, { AudioContext: originalAudioContext });
  });

  it('retries synthesis with subchunks when initial segment synthesis fails', async () => {
    const originalURL = globalThis.URL;
    const createObjectURL = vi.fn(() => 'blob:stitched-seg-1');
    const revokeObjectURL = vi.fn();
    Object.assign(globalThis, {
      URL: {
        createObjectURL,
        revokeObjectURL,
      },
    });

    const fallbackSegments = [
      { id: 'seg-1', text: 'First sentence. Second sentence.' },
      { id: 'seg-2', text: 'Second segment text' },
    ];

    const synthesize = vi.fn(async ({ id, text }: { id: string; text: string }) => {
      if (id === 'seg-1') {
        throw new Error('initial synthesis failed');
      }
      return {
        segmentId: id,
        blob: new Blob([text], { type: 'audio/mpeg' }),
        url: `blob:${id}`,
      };
    });

    const provider: TTSProvider = {
      listVoices: vi.fn(async () => []),
      warmup: vi.fn(async () => undefined),
      synthesize,
    };

    let controller: UsePlayerControllerResult | null = null;
    const getController = (): UsePlayerControllerResult => {
      if (!controller) {
        throw new Error('Controller was not initialized');
      }
      return controller;
    };

    await act(async () => {
      root?.render(<HookHarness provider={provider} customSegments={fallbackSegments} onController={(value) => { controller = value; }} />);
    });

    await act(async () => {
      await getController().play();
    });

    expect(synthesize).toHaveBeenCalledWith({ id: 'seg-1', text: 'First sentence. Second sentence.' }, undefined);
    expect(synthesize).toHaveBeenCalledWith({ id: 'seg-1::chunk_0', text: 'First sentence.' }, undefined);
    expect(synthesize).toHaveBeenCalledWith({ id: 'seg-1::chunk_1', text: 'Second sentence.' }, undefined);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(getController().queue[0]?.synthesisStatus).toBe('ready');
    expect(getController().queue[0]?.audioUrl).toBe('blob:stitched-seg-1');
    expect(getController().state).toBe('playing');

    Object.assign(globalThis, { URL: originalURL });
  });

  it('hard-fails when initial synthesis fails and fallback splitting is not possible', async () => {
    const provider: TTSProvider = {
      listVoices: vi.fn(async () => []),
      warmup: vi.fn(async () => undefined),
      synthesize: vi.fn(async ({ id }) => {
        throw new Error(`fatal failure: ${id}`);
      }),
    };

    const unsplittableSegments = [{ id: 'seg-1', text: 'tiny' }];

    let controller: UsePlayerControllerResult | null = null;
    const getController = (): UsePlayerControllerResult => {
      if (!controller) {
        throw new Error('Controller was not initialized');
      }
      return controller;
    };

    await act(async () => {
      root?.render(<HookHarness provider={provider} customSegments={unsplittableSegments} onController={(value) => { controller = value; }} />);
    });

    await act(async () => {
      await getController().play();
    });

    expect(getController().state).toBe('error');
    expect(getController().queue[0]?.synthesisStatus).toBe('error');
    expect(getController().error).toContain('fatal failure: seg-1');
  });
});
