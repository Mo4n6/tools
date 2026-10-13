// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Binary a sample carries rather than fetches.
//
// A downloader's payload arrives over the wire, and the stage panel is how an
// analyst supplies it. A *dropper* carries the payload inline, usually as a
// PowerShell byte-array literal feeding VirtualAlloc, and there is nothing to
// download and nothing written to disk - so neither the indicator list nor the
// dropped-file panel had anything to offer. The bytes were sitting in plain
// sight and Husk gave the analyst no way to get them out.

import type { Trace } from '../core/trace';

export interface EmbeddedPayload {
  /**
   * The bytes themselves, ready to save. Explicitly backed by an ArrayBuffer
   * rather than ArrayBufferLike, because a Blob will not take a view that
   * might be over a SharedArrayBuffer.
   */
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** Which layer carried it, so a decoded stage is distinguishable from the input. */
  readonly layer: number;
  /** Byte offset of the literal within that layer. */
  readonly offset: number;
  /** What the first bytes say it is, when they say anything. */
  readonly magic?: string;
}

/**
 * Shorter than this and it is a constant, not a payload. 32 bytes is already
 * too short to be shellcode; the point of the floor is to keep `@(1,2,3)` and
 * an RGB triple out of the list.
 */
const MIN_BYTES = 32;

/** A cap, because the literal is sample-controlled and this allocates. */
const MAX_BYTES = 8 * 1024 * 1024;

/** Runs of `0xNN` separated by commas and whitespace, as PowerShell writes them. */
const HEX_ARRAY = /0x[0-9a-fA-F]{1,2}(?:\s*,\s*0x[0-9a-fA-F]{1,2}){31,}/g;

/** Enough of a signature to be worth saying; deliberately not a full typer. */
function magicOf(bytes: Uint8Array): string | undefined {
  const starts = (...sig: number[]): boolean => sig.every((b, i) => bytes[i] === b);
  if (starts(0x4d, 0x5a)) return 'PE (MZ) — a Windows executable or DLL';
  if (starts(0x7f, 0x45, 0x4c, 0x46)) return 'ELF';
  if (starts(0x1f, 0x8b)) return 'gzip';
  if (starts(0x50, 0x4b, 0x03, 0x04)) return 'zip';
  if (starts(0x42, 0x4d)) return 'bitmap';
  // x86 shellcode has no header; these are the usual first instructions.
  if (bytes[0] === 0xfc || bytes[0] === 0xeb || bytes[0] === 0xe8 || bytes[0] === 0xbf) {
    return 'no file header — consistent with raw shellcode';
  }
  return undefined;
}

/**
 * Every byte-array literal big enough to be a payload, across all layers.
 *
 * Deliberately not deduplicated by content: the same blob appearing in two
 * layers is worth seeing twice, because it says the decoder round-tripped it.
 */
export function extractPayloads(trace: Trace): readonly EmbeddedPayload[] {
  const found: EmbeddedPayload[] = [];

  for (const layer of trace.layers) {
    for (const match of layer.source.matchAll(HEX_ARRAY)) {
      const parts = match[0].split(',');
      if (parts.length < MIN_BYTES || parts.length > MAX_BYTES) continue;

      const bytes = new Uint8Array(new ArrayBuffer(parts.length));
      for (let i = 0; i < parts.length; i += 1) {
        bytes[i] = Number.parseInt(parts[i].trim().slice(2), 16) & 0xff;
      }

      found.push({
        bytes,
        layer: layer.index,
        offset: match.index ?? 0,
        ...(magicOf(bytes) === undefined ? {} : { magic: magicOf(bytes) }),
      });
    }
  }

  return found;
}
