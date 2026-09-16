import { clampToUnitRange, generateNoise } from './noise';
import type { BinauralSettings, NoiseType } from './presets';

const NOISE_BUFFER_SECONDS = 4;
const RAMP_SECONDS = 0.05;
const START_FADE_SECONDS = 1.5;
const STOP_FADE_SECONDS = 0.6;

type AudioContextConstructor = new () => AudioContext;

const resolveAudioContextConstructor = (): AudioContextConstructor | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const globalWindow = window as Window & {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return globalWindow.AudioContext ?? globalWindow.webkitAudioContext ?? null;
};

export const isWebAudioSupported = (): boolean => resolveAudioContextConstructor() !== null;

type NoiseChain = {
  type: Exclude<NoiseType, 'none'>;
  source: AudioBufferSourceNode;
  gain: GainNode;
};

export class BinauralEngine {
  private context: AudioContext | null = null;

  private leftOscillator: OscillatorNode | null = null;

  private rightOscillator: OscillatorNode | null = null;

  private toneGain: GainNode | null = null;

  private masterGain: GainNode | null = null;

  private noiseChain: NoiseChain | null = null;

  private noiseBuffers = new Map<Exclude<NoiseType, 'none'>, AudioBuffer>();

  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  async start(settings: BinauralSettings): Promise<void> {
    if (this.running) {
      this.update(settings);
      return;
    }

    const AudioContextCtor = resolveAudioContextConstructor();
    if (!AudioContextCtor) {
      throw new Error('Web Audio is not supported in this browser.');
    }

    const context = this.context ?? new AudioContextCtor();
    this.context = context;
    if (context.state === 'suspended') {
      await context.resume();
    }

    const now = context.currentTime;

    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(1, now + START_FADE_SECONDS);
    masterGain.connect(context.destination);

    const toneGain = context.createGain();
    toneGain.gain.setValueAtTime(settings.toneVolume, now);
    toneGain.connect(masterGain);

    const merger = context.createChannelMerger(2);
    merger.connect(toneGain);

    const leftOscillator = context.createOscillator();
    leftOscillator.type = 'sine';
    leftOscillator.frequency.setValueAtTime(settings.carrierHz, now);
    leftOscillator.connect(merger, 0, 0);

    const rightOscillator = context.createOscillator();
    rightOscillator.type = 'sine';
    rightOscillator.frequency.setValueAtTime(settings.carrierHz + settings.beatHz, now);
    rightOscillator.connect(merger, 0, 1);

    leftOscillator.start(now);
    rightOscillator.start(now);

    this.masterGain = masterGain;
    this.toneGain = toneGain;
    this.leftOscillator = leftOscillator;
    this.rightOscillator = rightOscillator;
    this.running = true;

    this.syncNoise(settings);
  }

  update(settings: BinauralSettings): void {
    const context = this.context;
    if (!this.running || !context) {
      return;
    }
    const now = context.currentTime;
    this.leftOscillator?.frequency.setTargetAtTime(settings.carrierHz, now, RAMP_SECONDS);
    this.rightOscillator?.frequency.setTargetAtTime(settings.carrierHz + settings.beatHz, now, RAMP_SECONDS);
    this.toneGain?.gain.setTargetAtTime(settings.toneVolume, now, RAMP_SECONDS);
    this.syncNoise(settings);
  }

  fadeOut(seconds: number): void {
    const context = this.context;
    const masterGain = this.masterGain;
    if (!this.running || !context || !masterGain) {
      return;
    }
    const now = context.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0, now + Math.max(0.1, seconds));
  }

  stop(): void {
    const context = this.context;
    if (!this.running || !context) {
      return;
    }
    const now = context.currentTime;
    const stopAt = now + STOP_FADE_SECONDS;

    const masterGain = this.masterGain;
    if (masterGain) {
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(0, stopAt);
    }

    const leftOscillator = this.leftOscillator;
    const rightOscillator = this.rightOscillator;
    const noiseChain = this.noiseChain;
    leftOscillator?.stop(stopAt);
    rightOscillator?.stop(stopAt);
    noiseChain?.source.stop(stopAt);

    const disconnectAll = (): void => {
      leftOscillator?.disconnect();
      rightOscillator?.disconnect();
      noiseChain?.source.disconnect();
      noiseChain?.gain.disconnect();
      masterGain?.disconnect();
    };
    if (leftOscillator) {
      leftOscillator.onended = disconnectAll;
    } else {
      disconnectAll();
    }

    this.leftOscillator = null;
    this.rightOscillator = null;
    this.toneGain = null;
    this.masterGain = null;
    this.noiseChain = null;
    this.running = false;
  }

  dispose(): void {
    this.stop();
    const context = this.context;
    this.context = null;
    this.noiseBuffers.clear();
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
    }
  }

  private syncNoise(settings: BinauralSettings): void {
    const context = this.context;
    const masterGain = this.masterGain;
    if (!context || !masterGain) {
      return;
    }
    const now = context.currentTime;

    if (settings.noiseType === 'none') {
      this.teardownNoise();
      return;
    }

    if (this.noiseChain && this.noiseChain.type === settings.noiseType) {
      this.noiseChain.gain.gain.setTargetAtTime(settings.noiseVolume, now, RAMP_SECONDS);
      return;
    }

    this.teardownNoise();

    const buffer = this.getNoiseBuffer(context, settings.noiseType);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = context.createGain();
    gain.gain.setValueAtTime(settings.noiseVolume, now);

    source.connect(gain);
    gain.connect(masterGain);
    source.start(now);

    this.noiseChain = { type: settings.noiseType, source, gain };
  }

  private teardownNoise(): void {
    const noiseChain = this.noiseChain;
    if (!noiseChain) {
      return;
    }
    const context = this.context;
    const now = context?.currentTime ?? 0;
    noiseChain.gain.gain.setTargetAtTime(0, now, RAMP_SECONDS);
    noiseChain.source.stop(now + STOP_FADE_SECONDS);
    noiseChain.source.onended = () => {
      noiseChain.source.disconnect();
      noiseChain.gain.disconnect();
    };
    this.noiseChain = null;
  }

  private getNoiseBuffer(context: AudioContext, type: Exclude<NoiseType, 'none'>): AudioBuffer {
    const cached = this.noiseBuffers.get(type);
    if (cached) {
      return cached;
    }
    const length = Math.floor(context.sampleRate * NOISE_BUFFER_SECONDS);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const channelData = buffer.getChannelData(channel);
      channelData.set(clampToUnitRange(generateNoise(type, length)));
    }
    this.noiseBuffers.set(type, buffer);
    return buffer;
  }
}
