import { NormalizedDocument } from '../../segments';

export const articleExpected: NormalizedDocument = {
  title: 'Sample Article',
  segments: [
    {
      id: 'seg_f4bb0e1c',
      kind: 'url_article',
      text: 'Lead paragraph with extra spaces.',
      blockType: 'paragraph',
    },
    {
      id: 'seg_2c8ce5dc',
      kind: 'url_article',
      text: 'Body paragraph line one. line two continues.',
      blockType: 'paragraph',
    },
    {
      id: 'seg_74d629b7',
      kind: 'url_article',
      text: 'Closing section.',
      blockType: 'paragraph',
    },
  ],
};
