import type { DecodedPcmAudio } from './concatAudioBlobs';
import { createMp3EncoderAdapter, type Mp3AdapterFailureReason } from './mp3EncoderAdapter';

const MP3_MIME = 'audio/mpeg';

export const MP3_FALLBACK_WARNING = 'MP3 unavailable in this runtime; WAV provided instead.';

export type Mp3CapabilityProbe = {
  available: boolean;
  code: 'ok' | Mp3AdapterFailureReason;
  reason: string;
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
  result: { ok: true } | { ok: false; diagnostic: { reason: Mp3AdapterFailureReason; message: string; technicalDetail?: string } },
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
  if (!capability.available) {
    lastMp3Diagnostic = capability;
    return { blob: null, failureReason: capability.code };
  }

  const encoded = mp3Adapter.encodeFromPcm(decodedAudio);
  if (!encoded.ok) {
    lastMp3Diagnostic = {
      available: false,
      code: encoded.diagnostic.reason,
      reason: encoded.diagnostic.message,
      technicalDetail: encoded.diagnostic.technicalDetail,
    };

    if (import.meta.env.DEV) {
      console.debug('[tts][mp3] MP3 encoder failed; falling back to WAV.', lastMp3Diagnostic);
    }

    return { blob: null, failureReason: encoded.diagnostic.reason };
  }

  lastMp3Diagnostic = null;
  return { blob: new Blob(encoded.chunks, { type: MP3_MIME }), failureReason: null };
}
