import { concatAudioBlobs, concatAudioBlobsToPcm } from './concatAudioBlobs';
import { encodeMp3FromPcm, getLastMp3EncodingDiagnostic, MP3_FALLBACK_WARNING } from './encodeMp3';

export type ExportFormat = 'wav' | 'mp3';

export async function buildFullAudioExport(blobs: Blob[], exportFormat: ExportFormat): Promise<{ blob: Blob; warning: string | null }> {
  const wavBlob = await concatAudioBlobs(blobs);
  if (exportFormat !== 'mp3') {
    return { blob: wavBlob, warning: null };
  }

  const decodedPcm = await concatAudioBlobsToPcm(blobs);
  const mp3Result = await encodeMp3FromPcm(decodedPcm);
  if (!mp3Result.blob) {
    const mp3Diagnostic = getLastMp3EncodingDiagnostic();
    const warning = mp3Diagnostic
      ? `${MP3_FALLBACK_WARNING} (${mp3Diagnostic.code}: ${mp3Diagnostic.technicalDetail ?? mp3Diagnostic.reason})`
      : `${MP3_FALLBACK_WARNING} (${mp3Result.failureReason ?? 'init_failed'})`;
    return { blob: wavBlob, warning };
  }

  return { blob: mp3Result.blob, warning: null };
}
