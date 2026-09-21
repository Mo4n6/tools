// Primitive decoders. All native - no third-party dependency enters the
// runtime. See docs/husk-spec.md section 8.

/** Base64 to bytes, tolerating the whitespace obfuscators insert. */
export function base64ToBytes(text: string): Uint8Array {
  const cleaned = text.replace(/\s+/g, '');
  try {
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return new Uint8Array();
  }
}

/**
 * UTF-16LE, which is what -EncodedCommand carries. Decoding it as UTF-8
 * yields text interleaved with NULs, which looks plausible and is wrong.
 */
export function decodeUtf16le(bytes: Uint8Array): string {
  return new TextDecoder('utf-16le').decode(bytes);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

/** Gzip or raw deflate, via the platform's own DecompressionStream. */
export async function decompress(
  bytes: Uint8Array,
  format: 'gzip' | 'deflate-raw' | 'deflate',
): Promise<Uint8Array | undefined> {
  if (typeof DecompressionStream === 'undefined') return undefined;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(
      new DecompressionStream(format as CompressionFormat),
    );
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return undefined;
  }
}

/**
 * Try every compression format. .NET's DeflateStream writes raw deflate, which
 * the web platform calls 'deflate-raw' - 'deflate' expects a zlib header and
 * silently fails on .NET output.
 */
export async function decompressAny(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  for (const format of ['deflate-raw', 'gzip', 'deflate'] as const) {
    const result = await decompress(bytes, format);
    if (result && result.length > 0) return result;
  }
  return undefined;
}

/** Heuristic: does this look like recovered script text rather than binary? */
export function looksLikeText(text: string): boolean {
  if (text.length === 0) return false;
  let printable = 0;
  const sample = text.slice(0, 2048);
  for (const c of sample) {
    const code = c.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code < 127)) printable += 1;
  }
  return printable / [...sample].length > 0.85;
}
