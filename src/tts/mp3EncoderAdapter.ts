import * as lamejsImport from 'lamejs';
import type { DecodedPcmAudio } from './concatAudioBlobs';

const DEFAULT_BIT_RATE_KBPS = 128;
const FRAME_SIZE = 1152;

export type Mp3AdapterFailureReason = 'init_failed' | 'encode_failed' | 'unsupported_runtime';

export type Mp3AdapterDiagnostic = {
  reason: Mp3AdapterFailureReason;
  message: string;
  technicalDetail?: string;
};

type Mp3EncoderInstance = {
  encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array;
  flush: () => Int8Array;
};

type LameJsModule = {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => Mp3EncoderInstance;
};

export type Mp3EncoderAdapter = {
  init: () => { ok: true } | { ok: false; diagnostic: Mp3AdapterDiagnostic };
  encodeFromPcm: (decodedAudio: DecodedPcmAudio) => { ok: true; chunks: Uint8Array[] } | { ok: false; diagnostic: Mp3AdapterDiagnostic };
  diagnostics: () => Mp3AdapterDiagnostic | null;
};

function float32ToInt16(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] ?? 0));
    output[index] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return output;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function resolveLameJsModule(): LameJsModule | null {
  const candidate = (lamejsImport as { default?: unknown }).default ?? lamejsImport;
  if (typeof candidate === 'object' && candidate !== null && 'Mp3Encoder' in candidate) {
    return candidate as LameJsModule;
  }

  return null;
}

function mapInitError(error: unknown): Mp3AdapterDiagnostic {
  const message = getErrorMessage(error);
  if (message.includes('MPEGMode is not defined')) {
    return {
      reason: 'unsupported_runtime',
      message: 'The MP3 encoder module loaded, but this runtime lacks required symbols for the selected build.',
      technicalDetail: message,
    };
  }

  return {
    reason: 'init_failed',
    message: 'The MP3 encoder failed to initialize in this runtime.',
    technicalDetail: message,
  };
}

function mapEncodeError(error: unknown): Mp3AdapterDiagnostic {
  const message = getErrorMessage(error);
  return {
    reason: 'encode_failed',
    message: 'The MP3 encoder failed while processing PCM frames.',
    technicalDetail: message,
  };
}

export function createMp3EncoderAdapter(): Mp3EncoderAdapter {
  let lastDiagnostic: Mp3AdapterDiagnostic | null = null;
  let initialized = false;

  const init: Mp3EncoderAdapter['init'] = () => {
    const lamejs = resolveLameJsModule();
    if (!lamejs) {
      lastDiagnostic = {
        reason: 'init_failed',
        message: 'The MP3 encoder package is unavailable or has an unexpected export shape.',
      };
      return { ok: false, diagnostic: lastDiagnostic };
    }

    try {
      const encoder = new lamejs.Mp3Encoder(1, 24000, DEFAULT_BIT_RATE_KBPS);
      encoder.encodeBuffer(new Int16Array(FRAME_SIZE));
      encoder.flush();
      initialized = true;
      lastDiagnostic = null;
      return { ok: true };
    } catch (error) {
      initialized = false;
      lastDiagnostic = mapInitError(error);
      return { ok: false, diagnostic: lastDiagnostic };
    }
  };

  const encodeFromPcm: Mp3EncoderAdapter['encodeFromPcm'] = (decodedAudio) => {
    if (!initialized) {
      const initResult = init();
      if (!initResult.ok) {
        return initResult;
      }
    }

    const lamejs = resolveLameJsModule();
    if (!lamejs) {
      lastDiagnostic = {
        reason: 'init_failed',
        message: 'The MP3 encoder package is unavailable or has an unexpected export shape.',
      };
      return { ok: false, diagnostic: lastDiagnostic };
    }

    const channelCount = Math.min(2, Math.max(1, decodedAudio.channels.length));
    const leftChannel = float32ToInt16(decodedAudio.channels[0] ?? new Float32Array(0));
    const rightChannel = channelCount > 1
      ? float32ToInt16(decodedAudio.channels[1] ?? decodedAudio.channels[0] ?? new Float32Array(0))
      : undefined;

    try {
      const encoder = new lamejs.Mp3Encoder(channelCount, decodedAudio.sampleRate, DEFAULT_BIT_RATE_KBPS);
      const chunks: Uint8Array[] = [];

      for (let offset = 0; offset < leftChannel.length; offset += FRAME_SIZE) {
        const leftChunk = leftChannel.subarray(offset, Math.min(offset + FRAME_SIZE, leftChannel.length));
        const rightChunk = rightChannel?.subarray(offset, Math.min(offset + FRAME_SIZE, rightChannel.length));
        const encodedChunk = channelCount > 1
          ? encoder.encodeBuffer(leftChunk, rightChunk)
          : encoder.encodeBuffer(leftChunk);

        if (encodedChunk.length > 0) {
          chunks.push(Uint8Array.from(encodedChunk));
        }
      }

      const flushChunk = encoder.flush();
      if (flushChunk.length > 0) {
        chunks.push(Uint8Array.from(flushChunk));
      }

      lastDiagnostic = null;
      return { ok: true, chunks };
    } catch (error) {
      lastDiagnostic = mapEncodeError(error);
      return { ok: false, diagnostic: lastDiagnostic };
    }
  };

  return {
    init,
    encodeFromPcm,
    diagnostics: () => lastDiagnostic,
  };
}
