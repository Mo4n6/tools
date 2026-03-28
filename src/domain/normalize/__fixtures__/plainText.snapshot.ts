import { NormalizedDocument } from '../../segments';

export const plainTextExpected: NormalizedDocument = {
  segments: [
    {
      id: 'seg_b9d4dd52',
      kind: 'text',
      text: 'First paragraph has extra spaces. Still same paragraph line.',
      blockType: 'paragraph',
    },
    {
      id: 'seg_e08e105e',
      kind: 'text',
      text: 'Second paragraph with tabs.',
      blockType: 'paragraph',
    },
    {
      id: 'seg_f343bd5a',
      kind: 'text',
      text: 'Third paragraph.',
      blockType: 'paragraph',
    },
  ],
};
