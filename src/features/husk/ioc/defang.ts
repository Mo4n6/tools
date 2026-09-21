// Defanging, so indicators can be pasted into a ticket or a chat without
// becoming a live link. This is what analysts expect to be able to copy.

/** hxxp://evil[.]test/a -> from http://evil.test/a */
export function defang(value: string): string {
  return value
    .replace(/^http:/i, 'hxxp:')
    .replace(/^https:/i, 'hxxps:')
    .replace(/^ftp:/i, 'fxp:')
    .replace(/\./g, '[.]')
    .replace(/@/g, '[@]');
}

/** The inverse, for matching a defanged indicator back to its source. */
export function refang(value: string): string {
  return value
    .replace(/^hxxp:/i, 'http:')
    .replace(/^hxxps:/i, 'https:')
    .replace(/^fxp:/i, 'ftp:')
    .replace(/\[\.\]/g, '.')
    .replace(/\[@\]/g, '@');
}
