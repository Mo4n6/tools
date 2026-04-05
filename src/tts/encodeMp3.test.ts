import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedPcmAudio } from './concatAudioBlobs';

const decodedAudio: DecodedPcmAudio = {
  channels: [new Float32Array([0, 0.25, -0.25, 0.5])],
  sampleRate: 24000,
};

describe('encodeMp3FromPcm', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns unsupported_runtime when the encoder depends on unavailable globals', async () => {
    vi.doMock('lamejs', () => ({
      default: {
        Mp3Encoder: class {
          constructor() {
            throw new Error('MPEGMode is not defined');
          }
        },
      },
    }));

    const { encodeMp3FromPcm, getLastMp3EncodingDiagnostic, probeMp3EncodingCapability } = await import('./encodeMp3');
    expect(probeMp3EncodingCapability()).toMatchObject({
      available: false,
      code: 'unsupported_runtime',
    });

    await expect(encodeMp3FromPcm(decodedAudio)).resolves.toEqual({
      blob: null,
      failureReason: 'unsupported_runtime',
    });
    expect(getLastMp3EncodingDiagnostic()).toMatchObject({
      code: 'unsupported_runtime',
      technicalDetail: 'MPEGMode is not defined',
    });
  });

  it('returns encode_failed and captures diagnostics when encodeBuffer throws', async () => {
    vi.doMock('lamejs', () => ({
      default: {
        Mp3Encoder: class {
          encodeBuffer(): Int8Array {
            throw new Error('encode failed');
          }

          flush(): Int8Array {
            return new Int8Array(0);
          }
        },
      },
    }));

    const { encodeMp3FromPcm, getLastMp3EncodingDiagnostic } = await import('./encodeMp3');
    await expect(encodeMp3FromPcm(decodedAudio)).resolves.toEqual({
      blob: null,
      failureReason: 'init_failed',
    });
    expect(getLastMp3EncodingDiagnostic()).toMatchObject({
      code: 'init_failed',
      technicalDetail: 'encode failed',
    });
  });
});
