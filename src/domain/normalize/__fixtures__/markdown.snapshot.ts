import { NormalizedDocument } from '../../segments';

export const markdownExpected: NormalizedDocument = {
  segments: [
    {
      id: 'seg_ef5f654c',
      kind: 'markdown',
      text: 'Main Title',
      blockType: 'heading',
      sourceOffset: { start: 0, end: 16 },
      meta: { depth: 1 },
    },
    {
      id: 'seg_16cae2df',
      kind: 'markdown',
      text: 'Intro paragraph with extra spaces.',
      blockType: 'paragraph',
      sourceOffset: { start: 18, end: 56 },
    },
    {
      id: 'seg_42c3865c',
      kind: 'markdown',
      text: 'First item',
      blockType: 'list_item',
      sourceOffset: { start: 58, end: 72 },
    },
    {
      id: 'seg_ca7b7963',
      kind: 'markdown',
      text: 'Second item',
      blockType: 'list_item',
      sourceOffset: { start: 73, end: 86 },
    },
    {
      id: 'seg_9e8ed03e',
      kind: 'markdown',
      text: 'Quoted thought',
      blockType: 'blockquote',
      sourceOffset: { start: 88, end: 107 },
    },
    {
      id: 'seg_7530ee5f',
      kind: 'markdown',
      text: 'const a = 1;',
      blockType: 'code',
      sourceOffset: { start: 109, end: 133 },
      meta: { language: 'ts' },
    },
  ],
};
