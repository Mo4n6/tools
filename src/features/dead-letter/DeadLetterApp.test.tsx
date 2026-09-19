import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DeadLetterApp from './DeadLetterApp';
import { DEAD_LETTER_FILE_NAME, buildDeadLetterUrl } from './deadLetterAsset';

describe('DeadLetterApp', () => {
  const markup = renderToStaticMarkup(<DeadLetterApp />);
  const expectedUrl = buildDeadLetterUrl(import.meta.env.BASE_URL);

  it('embeds the static page from the deployed base path', () => {
    expect(markup).toContain(`<iframe title="Dead Letter: offline .eml and .msg viewer" src="${expectedUrl}"`);
  });

  it('offers the same file as a download so it can be run locally', () => {
    expect(markup).toContain(`href="${expectedUrl}" download="${DEAD_LETTER_FILE_NAME}"`);
    expect(markup).toContain('Download page');
  });
});
