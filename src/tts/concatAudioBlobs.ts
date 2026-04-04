const FALLBACK_AUDIO_MIME = 'audio/wav';

export type DecodedPcmAudio = {
  channels: Float32Array[];
  sampleRate: number;
};

function encodeWavFromFloat32(
  channels: Float32Array[],
  sampleRate: number,
): Blob {
  const channelCount = channels.length;
  const sampleLength = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
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
  view.setUint32(24, sampleRate, true);
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

  return new Blob([buffer], { type: FALLBACK_AUDIO_MIME });
}

export async function concatAudioBlobs(blobs: Blob[]): Promise<Blob> {
  if (!blobs.length) {
    throw new Error('Cannot concatenate an empty list of audio blobs.');
  }

  if (typeof AudioContext === 'undefined') {
    return new Blob(blobs, { type: blobs[0]?.type || FALLBACK_AUDIO_MIME });
  }

  const decodedAudio = await concatAudioBlobsToPcm(blobs);
  return encodeWavFromFloat32(decodedAudio.channels, decodedAudio.sampleRate);
}

export async function concatAudioBlobsToPcm(blobs: Blob[]): Promise<DecodedPcmAudio> {
  if (!blobs.length) {
    throw new Error('Cannot concatenate an empty list of audio blobs.');
  }

  if (typeof AudioContext === 'undefined') {
    throw new Error('Audio decoding is unavailable in this runtime.');
  }

  const context = new AudioContext();
  try {
    const decodedBuffers = await Promise.all(
      blobs.map(async (blob) => context.decodeAudioData(await blob.arrayBuffer())),
    );

    const maxChannelCount = Math.max(...decodedBuffers.map((buffer) => buffer.numberOfChannels));
    const maxSampleRate = Math.max(...decodedBuffers.map((buffer) => buffer.sampleRate));
    const totalSamples = decodedBuffers.reduce((sum, buffer) => sum + Math.ceil(buffer.duration * maxSampleRate), 0);

    const mergedChannels = Array.from(
      { length: Math.max(1, maxChannelCount) },
      () => new Float32Array(totalSamples),
    );

    let writeHead = 0;
    decodedBuffers.forEach((buffer) => {
      const sourceLength = Math.ceil(buffer.duration * maxSampleRate);
      for (let channelIndex = 0; channelIndex < mergedChannels.length; channelIndex += 1) {
        const sourceChannel = channelIndex < buffer.numberOfChannels
          ? buffer.getChannelData(channelIndex)
          : buffer.getChannelData(buffer.numberOfChannels - 1);

        const targetChannel = mergedChannels[channelIndex];
        for (let sampleIndex = 0; sampleIndex < sourceLength; sampleIndex += 1) {
          const sourceSampleIndex = Math.min(
            sourceChannel.length - 1,
            Math.floor((sampleIndex / Math.max(1, sourceLength - 1)) * Math.max(0, sourceChannel.length - 1)),
          );
          targetChannel[writeHead + sampleIndex] = sourceChannel[sourceSampleIndex] ?? 0;
        }
      }
      writeHead += sourceLength;
    });

    return {
      channels: mergedChannels,
      sampleRate: maxSampleRate,
    };
  } finally {
    await context.close();
  }
}
