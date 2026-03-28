export interface NormalizedText {
  text: string;
}

/**
 * Deterministic normalization for all ingestion paths.
 */
export function normalizeText(input: string): NormalizedText {
  const unifiedNewlines = input.replace(/\r\n?/g, '\n');
  const collapsedHorizontalWhitespace = unifiedNewlines.replace(/[\t\f\v ]+/g, ' ');
  const trimmedPerLine = collapsedHorizontalWhitespace
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
  const collapsedBlankLines = trimmedPerLine.replace(/\n{3,}/g, '\n\n').trim();

  return {
    text: collapsedBlankLines,
  };
}
