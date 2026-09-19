/**
 * Dead Letter ships as a single static file in `public/`, not as a React view.
 *
 * Vite copies `public/` verbatim into the build, so the file that the iframe loads and the
 * file the download button hands over are the same bytes, and that copy keeps working from
 * `file://` with no network. Keep the file name in step with `public/dead-letter.html`.
 */
export const DEAD_LETTER_FILE_NAME = 'dead-letter.html';

/**
 * Resolves the deployed location of the static page against the app base path, so the tool
 * keeps working under a subpath deploy such as `/tools/`.
 */
export const buildDeadLetterUrl = (basePath: string): string => {
  const trimmed = basePath.trim();
  const withLeadingSlash = !trimmed || trimmed === '/' ? '/' : trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const normalizedBase = withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
  return `${normalizedBase}${DEAD_LETTER_FILE_NAME}`;
};
