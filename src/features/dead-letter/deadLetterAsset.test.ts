import { describe, expect, it } from 'vitest';
import { DEAD_LETTER_FILE_NAME, buildDeadLetterUrl } from './deadLetterAsset';

describe('buildDeadLetterUrl', () => {
  it('resolves against a root deploy', () => {
    expect(buildDeadLetterUrl('/')).toBe(`/${DEAD_LETTER_FILE_NAME}`);
  });

  it('resolves against a subpath deploy', () => {
    expect(buildDeadLetterUrl('/tools/')).toBe(`/tools/${DEAD_LETTER_FILE_NAME}`);
  });

  it('normalizes a base path that is missing its trailing slash', () => {
    expect(buildDeadLetterUrl('/tools')).toBe(`/tools/${DEAD_LETTER_FILE_NAME}`);
  });

  it('normalizes a base path that is missing its leading slash', () => {
    expect(buildDeadLetterUrl('tools/')).toBe(`/tools/${DEAD_LETTER_FILE_NAME}`);
  });

  it('falls back to the root when the base path is empty', () => {
    expect(buildDeadLetterUrl('')).toBe(`/${DEAD_LETTER_FILE_NAME}`);
  });
});
