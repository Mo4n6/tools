import { describe, expect, it } from 'vitest';

import { coverage, runAll } from './corpusReport';

// The corpus is the coverage metric. These assert a floor rather than an exact
// number, so improving the pipeline never fails the build - but regressing it
// does. Raise the floor as the number climbs.
//
// See docs/husk-spec.md section 2: the project targets the corpus, not a
// percentage, and the per-transform floors are what stop one family quietly
// collapsing while the total holds steady.

const OVERALL_FLOOR = 0.78;

const TRANSFORM_FLOORS: ReadonlyArray<[string, number]> = [
  ['Out-CompressedCommand', 1.0],
  ['Out-EncodedAsciiCommand', 1.0],
  ['Out-EncodedBXORCommand', 1.0],
  ['Out-ObfuscatedTokenCommand/Variable', 1.0],
  ['Out-ObfuscatedTokenCommand/RandomWhitespace', 1.0],
  ['Out-ObfuscatedTokenCommand/Comment', 1.0],
  ['Out-ObfuscatedTokenCommand/String', 1.0],
  ['Out-ObfuscatedTokenCommand/Command', 0.8],
  ['Out-ObfuscatedTokenCommand/Member', 0.8],
  ['Out-EncodedBinaryCommand', 0.8],
  ['Out-EncodedOctalCommand', 0.8],
  ['Out-EncodedHexCommand', 0.6],
  ['Out-ObfuscatedStringCommand', 0.4],
];

describe('deobfuscation coverage', () => {
  it('recovers at least the established share of the corpus', async () => {
    const { recovered, total, ratio } = await coverage();
    expect(
      ratio,
      `recovered ${recovered}/${total} (${(ratio * 100).toFixed(1)}%)`,
    ).toBeGreaterThanOrEqual(OVERALL_FLOOR);
  }, 60000);

  it.each(TRANSFORM_FLOORS)('holds %s at or above its floor', async (transform, floor) => {
    const { byTransform } = await coverage();
    const bucket = byTransform.get(transform);
    expect(bucket, `${transform} missing from the corpus`).toBeDefined();

    const ratio = bucket!.recovered / bucket!.total;
    expect(
      ratio,
      `${transform}: ${bucket!.recovered}/${bucket!.total}`,
    ).toBeGreaterThanOrEqual(floor);
  }, 60000);
});

describe('never lies about coverage', () => {
  // The contract from spec section 2. A wrong answer delivered confidently is
  // worse than a gap, so anything unrecovered must leave a record.
  it('records a gap or stops cleanly on every fixture it cannot recover', async () => {
    const results = await runAll();
    const silentFailures = results.filter((r) => !r.recovered && r.topGap === undefined);

    // Anything Husk could not recover has to leave a record naming why. A
    // fixture that quietly stopped would be exactly the silent wrong answer
    // this design exists to avoid.
    expect(
      silentFailures.map((r) => r.id),
      'unrecovered fixtures that recorded no gap at all',
    ).toEqual([]);
  }, 60000);

  it('never reports a recovered fixture as unreliable', async () => {
    const results = await runAll();
    for (const r of results.filter((x) => x.recovered)) {
      expect(r.actual.length, r.id).toBeGreaterThan(0);
    }
  }, 60000);
});
