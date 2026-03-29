import { JSDOM } from 'jsdom';
import React, { useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
  onController,
}: {
  provider: TTSProvider;
  onController: (controller: UsePlayerControllerResult) => void;
}): React.JSX.Element {
  const controller = usePlayerController({
    provider,
    segments,
    persistKey: 'player-machine-test',
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
  let container: HTMLDivElement;
  let root: Root;

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
    globalThis.Audio = MockAudio as unknown as typeof Audio;
  });

  afterAll(() => {
    if (originalAudio) {
      globalThis.Audio = originalAudio;
    }
    root.unmount();
    jsdom.window.close();
  });

  it('transitions through play, pause, skip, and error states', async () => {
    const provider: TTSProvider = {
      id: 'mock-provider',
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
      stop: vi.fn(),
      unload: vi.fn(),
      supportsVoice: vi.fn(() => true),
    };

    let controller: UsePlayerControllerResult | null = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<HookHarness provider={provider} onController={(value) => { controller = value; }} />);
    });

    expect(controller?.state).toBe('idle');

    await act(async () => {
      await controller?.play();
    });
    expect(controller?.state).toBe('playing');
    expect(controller?.currentSegmentIndex).toBe(0);

    act(() => {
      controller?.pause();
    });
    expect(controller?.state).toBe('paused');

    await act(async () => {
      await controller?.skipNext();
    });

    expect(controller?.state).toBe('error');
    expect(controller?.error).toContain('boom synthesis');
    expect(controller?.currentSegmentIndex).toBe(1);
  });
});
