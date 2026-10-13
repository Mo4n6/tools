// Shared by the two sample harnesses: the tree-walker's (run-local-corpus.mjs)
// and the engine's (engine/corpus.mjs). It lives here because the first copy of
// it was BOM-only, and the scratch harness that copied it quietly read a UTF-16
// sample as mojibake while the hardened one next to it did not.
//
// SPDX-License-Identifier: MIT

/**
 * Droppers are not all UTF-8. Reading a UTF-16 file as UTF-8 yields a string
 * with a NUL between every character, which tokenises to nothing: the sample
 * then scores as "found nothing" for a reason that has no bearing on Husk.
 * The browser never sees this - Husk takes pasted text, which the clipboard
 * has already decoded - so the sniffing belongs here, not in the product.
 */
export function decodeSource(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = buffer.subarray(2, 2 + (((buffer.length - 2) >> 1) << 1));
    return Buffer.from(body).swap16().toString('utf16le');
  }
  // No BOM, but every other byte NUL is UTF-16 all the same; some droppers
  // are written by a tool that omits the mark.
  const probe = buffer.subarray(0, 64);
  if (probe.length >= 4) {
    let evenNul = 0;
    let oddNul = 0;
    for (let i = 0; i < probe.length; i += 1) {
      if (probe[i] !== 0) continue;
      if (i % 2 === 0) evenNul += 1;
      else oddNul += 1;
    }
    const half = Math.floor(probe.length / 2);
    if (oddNul > half * 0.8 && evenNul === 0) return buffer.toString('utf16le');
    if (evenNul > half * 0.8 && oddNul === 0) {
      const body = buffer.subarray(0, (buffer.length >> 1) << 1);
      return Buffer.from(body).swap16().toString('utf16le');
    }
  }
  // A UTF-8 BOM decodes to U+FEFF, which the tokeniser tolerates, but strip
  // it so layer-0 text matches the file.
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
