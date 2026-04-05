import { describe, expect, it, vi } from 'vitest';
import type { TTSProvider, TTSSegment } from './types';
import { synthesizeWithValidation } from './synthesizeWithValidation';

function createAudioResult(segment: TTSSegment, body = segment.text): { segmentId: string; blob: Blob; url: string; mode: 'audio-url' } {
  const blob = new Blob([`wav:${body}`], { type: 'audio/wav' });
  return {
    segmentId: segment.id,
    blob,
    url: URL.createObjectURL(blob),
    mode: 'audio-url',
  };
}

describe('synthesizeWithValidation', () => {
  it('preemptively splits oversized segments to avoid silently truncated synthesis', async () => {
    const calls: TTSSegment[] = [];
    const provider: TTSProvider = {
      listVoices: async () => [],
      warmup: async () => {},
      synthesize: async (segment) => {
        calls.push(segment);
        return createAudioResult(segment);
      },
    };

    const longSentenceA = 'A'.repeat(220);
    const longSentenceB = 'B'.repeat(220);
    const result = await synthesizeWithValidation({
      provider,
      segment: {
        id: 'seg-long',
        text: `${longSentenceA}. ${longSentenceB}.`,
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.id).toBe('seg-long::chunk_0');
    expect(calls[1]?.id).toBe('seg-long::chunk_1');
    expect(calls.map((call) => call.text)).toEqual([`${longSentenceA}.`, `${longSentenceB}.`]);
    expect(result.segmentId).toBe('seg-long');
    expect('blob' in result).toBe(true);
  });

  it('does not preemptively split segments that are within the safe window', async () => {
    const synthesize = vi.fn(async (segment: TTSSegment) => createAudioResult(segment));
    const provider: TTSProvider = {
      listVoices: async () => [],
      warmup: async () => {},
      synthesize,
    };

    await synthesizeWithValidation({
      provider,
      segment: {
        id: 'seg-short',
        text: 'This is short enough to synthesize directly in a single pass.',
      },
    });

    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith(
      { id: 'seg-short', text: 'This is short enough to synthesize directly in a single pass.' },
      undefined,
    );
  });
});
