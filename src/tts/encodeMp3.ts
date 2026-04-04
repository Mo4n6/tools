import type { DecodedPcmAudio } from './concatAudioBlobs';

const MP3_MIME = 'audio/mpeg';
const DEFAULT_BIT_RATE_KBPS = 128;
const FRAME_SIZE = 1152;

type LameJsModule = {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
    encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array;
    flush: () => Int8Array;
  };
};

function float32ToInt16(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] ?? 0));
    output[index] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return output;
}

const resolveLameJsModule = async (): Promise<LameJsModule | null> => {
  try {
    const module = await import('lamejs');
    const candidate = (module as { default?: unknown }).default ?? module;
    if (typeof candidate === 'object' && candidate !== null && 'Mp3Encoder' in candidate) {
      return candidate as LameJsModule;
    }
  } catch {
    return null;
  }

  return null;
};

export async function encodeMp3FromPcm(decodedAudio: DecodedPcmAudio): Promise<Blob | null> {
  const lamejs = await resolveLameJsModule();
  if (!lamejs) {
    return null;
  }

  const channelCount = Math.min(2, Math.max(1, decodedAudio.channels.length));
  const leftChannel = float32ToInt16(decodedAudio.channels[0] ?? new Float32Array(0));
  const rightChannel = channelCount > 1
    ? float32ToInt16(decodedAudio.channels[1] ?? decodedAudio.channels[0] ?? new Float32Array(0))
    : undefined;

  const encoder = new lamejs.Mp3Encoder(channelCount, decodedAudio.sampleRate, DEFAULT_BIT_RATE_KBPS);
  const chunks: Uint8Array[] = [];

  for (let offset = 0; offset < leftChannel.length; offset += FRAME_SIZE) {
    const leftChunk = leftChannel.subarray(offset, Math.min(offset + FRAME_SIZE, leftChannel.length));
    const rightChunk = rightChannel?.subarray(offset, Math.min(offset + FRAME_SIZE, rightChannel.length));
    const encodedChunk = channelCount > 1
      ? encoder.encodeBuffer(leftChunk, rightChunk)
      : encoder.encodeBuffer(leftChunk);

    if (encodedChunk.length > 0) {
      chunks.push(new Uint8Array(encodedChunk));
    }
  }

  const flushChunk = encoder.flush();
  if (flushChunk.length > 0) {
    chunks.push(new Uint8Array(flushChunk));
  }

  return new Blob(chunks, { type: MP3_MIME });
}
