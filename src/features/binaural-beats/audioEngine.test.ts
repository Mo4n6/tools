import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BinauralEngine } from './audioEngine';
import { DEFAULT_SETTINGS } from './presets';

class FakeParam {
  value = 0;
  setValueAtTime(value: number) { this.value = value; return this; }
  linearRampToValueAtTime(value: number) { this.value = value; return this; }
  setTargetAtTime(value: number) { this.value = value; return this; }
  cancelScheduledValues() { return this; }
}

class FakeNode {
  connect() { return this; }
  disconnect() { return this; }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeOscillator extends FakeNode {
  static started = 0;
  static stopped = 0;
  type = 'sine';
  frequency = new FakeParam();
  onended: (() => void) | null = null;
  start() { FakeOscillator.started += 1; }
  stop() { FakeOscillator.stopped += 1; }
}

class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  start() {}
  stop() {}
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  private resumeResolvers: Array<() => void> = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  resume(): Promise<void> {
    return new Promise((resolve) => {
      this.resumeResolvers.push(() => {
        this.state = 'running';
        resolve();
      });
    });
  }

  releaseResume(): void {
    const resolvers = this.resumeResolvers;
    this.resumeResolvers = [];
    resolvers.forEach((resolve) => resolve());
  }

  async close(): Promise<void> { this.state = 'closed'; }
  createGain() { return new FakeGain(); }
  createOscillator() { return new FakeOscillator(); }
  createChannelMerger() { return new FakeNode(); }
  createBufferSource() { return new FakeBufferSource(); }
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, getChannelData: (index: number) => data[index]! };
  }
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('BinauralEngine', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    FakeAudioContext.instances = [];
    FakeOscillator.started = 0;
    FakeOscillator.stopped = 0;
    (globalThis as { window?: unknown }).window = { AudioContext: FakeAudioContext };
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('serializes concurrent start calls so only one audio graph is built', async () => {
    const engine = new BinauralEngine();
    const first = engine.start(DEFAULT_SETTINGS);
    const second = engine.start({ ...DEFAULT_SETTINGS, beatHz: 10 });
    expect(engine.isStarting).toBe(true);
    await flush();
    FakeAudioContext.instances[0]!.releaseResume();
    await Promise.all([first, second]);

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeOscillator.started).toBe(2);
    expect(engine.isRunning).toBe(true);
    expect(engine.isStarting).toBe(false);

    engine.stop();
    expect(FakeOscillator.stopped).toBe(2);
    expect(engine.isRunning).toBe(false);
  });

  it('does not build a graph when disposed while the context is resuming', async () => {
    const engine = new BinauralEngine();
    const pending = engine.start(DEFAULT_SETTINGS);
    await flush();
    engine.dispose();
    FakeAudioContext.instances[0]!.releaseResume();
    await pending;

    expect(FakeOscillator.started).toBe(0);
    expect(engine.isRunning).toBe(false);
  });

  it('restores the master level when a fade is cancelled', async () => {
    const engine = new BinauralEngine();
    const pending = engine.start(DEFAULT_SETTINGS);
    await flush();
    FakeAudioContext.instances[0]!.releaseResume();
    await pending;

    const masterGain = (engine as unknown as { masterGain: FakeGain }).masterGain;
    engine.fadeOut(10);
    expect(masterGain.gain.value).toBe(0);
    engine.cancelFade();
    expect(masterGain.gain.value).toBe(1);
  });
});
