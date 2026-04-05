import type { DecodedPcmAudio } from './concatAudioBlobs';
import type { Mp3AdapterFailureReason } from './mp3EncoderAdapter';

type FfmpegModule = typeof import('@ffmpeg/ffmpeg');

type FfmpegResult = {
  blob: Blob | null;
  diagnostic: {
    reason: Mp3AdapterFailureReason;
    message: string;
    technicalDetail?: string;
  } | null;
};

const OUTPUT_FILE = 'output.mp3';
const INPUT_FILE = 'input.wav';
const MP3_MIME = 'audio/mpeg';
const DEFAULT_BIT_RATE_KBPS = 128;

let ffmpegModulePromise: Promise<FfmpegModule> | null = null;
let ffmpegLoadPromise: Promise<InstanceType<FfmpegModule['FFmpeg']>> | null = null;

function float32ToWavBytes(decodedAudio: DecodedPcmAudio): Uint8Array {
  const channels = decodedAudio.channels.length > 0 ? decodedAudio.channels : [new Float32Array(0)];
  const channelCount = channels.length;
  const sampleLength = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = decodedAudio.sampleRate * blockAlign;
  const dataSize = sampleLength * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, decodedAudio.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let sampleIndex = 0; sampleIndex < sampleLength; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = channels[channelIndex]?.[sampleIndex] ?? 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      const intSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      view.setInt16(offset, Math.round(intSample), true);
      offset += bytesPerSample;
    }
  }

  return new Uint8Array(buffer);
}

async function loadFfmpeg() {
  if (!ffmpegModulePromise) {
    ffmpegModulePromise = import('@ffmpeg/ffmpeg');
  }

  const module = await ffmpegModulePromise;
  const { FFmpeg } = module;

  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load();
      return ffmpeg;
    })();
  }

  return ffmpegLoadPromise;
}

export async function encodeMp3ViaFfmpegWasm(decodedAudio: DecodedPcmAudio): Promise<FfmpegResult> {
  try {
    const ffmpeg = await loadFfmpeg();
    const wavBytes = float32ToWavBytes(decodedAudio);

    await ffmpeg.writeFile(INPUT_FILE, wavBytes);
    await ffmpeg.exec([
      '-i',
      INPUT_FILE,
      '-codec:a',
      'libmp3lame',
      '-b:a',
      `${DEFAULT_BIT_RATE_KBPS}k`,
      OUTPUT_FILE,
    ]);

    const encoded = await ffmpeg.readFile(OUTPUT_FILE);
    await ffmpeg.deleteFile(INPUT_FILE);
    await ffmpeg.deleteFile(OUTPUT_FILE);

    if (!(encoded instanceof Uint8Array) || encoded.length === 0) {
      return {
        blob: null,
        diagnostic: {
          reason: 'encode_failed',
          message: 'ffmpeg.wasm did not produce MP3 output bytes.',
        },
      };
    }

    const normalizedEncoded = new Uint8Array(encoded.byteLength);
    normalizedEncoded.set(encoded);

    return {
      blob: new Blob([normalizedEncoded], { type: MP3_MIME }),
      diagnostic: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason: Mp3AdapterFailureReason = message.includes('load')
      || message.includes('Worker')
      || message.includes('SharedArrayBuffer')
      ? 'unsupported_runtime'
      : 'encode_failed';

    return {
      blob: null,
      diagnostic: {
        reason,
        message: 'ffmpeg.wasm MP3 encoding failed.',
        technicalDetail: message,
      },
    };
  }
}
