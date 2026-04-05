import type { DecodedPcmAudio } from './concatAudioBlobs';
import { createMp3EncoderAdapter, type Mp3AdapterFailureReason } from './mp3EncoderAdapter';
import { encodeMp3ViaFfmpegWasm } from './encodeMp3ViaFfmpegWasm';

const MP3_MIME = 'audio/mpeg';

export const MP3_FALLBACK_WARNING = 'MP3 unavailable in this runtime; WAV provided instead.';

export type Mp3CapabilityProbe = {
  available: boolean;
  code: 'ok' | Mp3AdapterFailureReason;
  reason: string;
  technicalDetail?: string;
};

type Mp3FailureDiagnostic = {
  reason: Mp3AdapterFailureReason;
  message: string;
  technicalDetail?: string;
};

export type EncodeMp3Result = {
  blob: Blob | null;
  failureReason: Mp3AdapterFailureReason | null;
};

const mp3Adapter = createMp3EncoderAdapter();
let cachedProbe: Mp3CapabilityProbe | null = null;
let lastMp3Diagnostic: Mp3CapabilityProbe | null = null;

function toCapabilityProbe(
  result: { ok: true } | { ok: false; diagnostic: Mp3FailureDiagnostic },
): Mp3CapabilityProbe {
  if (result.ok) {
    return { available: true, code: 'ok', reason: 'MP3 encoder probe passed.' };
  }

  return {
    available: false,
    code: result.diagnostic.reason,
    reason: result.diagnostic.message,
    technicalDetail: result.diagnostic.technicalDetail,
  };
}

function toProbeFromFailure(diagnostic: Mp3FailureDiagnostic): Mp3CapabilityProbe {
  return {
    available: false,
    code: diagnostic.reason,
    reason: diagnostic.message,
    technicalDetail: diagnostic.technicalDetail,
  };
}

export function probeMp3EncodingCapability(): Mp3CapabilityProbe {
  if (cachedProbe) {
    return cachedProbe;
  }

  cachedProbe = toCapabilityProbe(mp3Adapter.init());
  return cachedProbe;
}

export function getLastMp3EncodingDiagnostic(): Mp3CapabilityProbe | null {
  return lastMp3Diagnostic;
}

export async function encodeMp3FromPcm(decodedAudio: DecodedPcmAudio): Promise<EncodeMp3Result> {
  const capability = probeMp3EncodingCapability();
  let lameFailure: Mp3FailureDiagnostic | null = null;

  if (capability.available) {
    const encoded = mp3Adapter.encodeFromPcm(decodedAudio);
    if (encoded.ok) {
      lastMp3Diagnostic = null;
      const blobChunks: BlobPart[] = encoded.chunks.map((chunk) => new Uint8Array(chunk));
      return { blob: new Blob(blobChunks, { type: MP3_MIME }), failureReason: null };
    }

    lameFailure = encoded.diagnostic;
  } else {
    lameFailure = {
      reason: capability.code === 'ok' ? 'init_failed' : capability.code,
      message: capability.reason,
      technicalDetail: capability.technicalDetail,
    };
  }

  const ffmpegResult = await encodeMp3ViaFfmpegWasm(decodedAudio);
  if (ffmpegResult.blob) {
    if (import.meta.env.DEV && lameFailure) {
      console.debug('[tts][mp3] Native MP3 encoder unavailable, ffmpeg.wasm fallback succeeded.', lameFailure);
    }
    lastMp3Diagnostic = null;
    return { blob: ffmpegResult.blob, failureReason: null };
  }

  const finalFailure = lameFailure
    ?? ffmpegResult.diagnostic
    ?? { reason: 'init_failed' as const, message: 'Both native and ffmpeg.wasm MP3 encoders were unavailable.' };

  lastMp3Diagnostic = toProbeFromFailure(finalFailure);

  if (import.meta.env.DEV) {
    console.debug('[tts][mp3] MP3 encoder failed; falling back to WAV.', {
      lameDiagnostic: lameFailure,
      ffmpegDiagnostic: ffmpegResult.diagnostic,
    });
  }

  return { blob: null, failureReason: finalFailure.reason };
}
