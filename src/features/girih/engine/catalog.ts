// Girih — the curriculum: every technique, in teaching order.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// The order here is load-bearing. It is the order techniques are taught in,
// and it is also the definition of "simplest": a drill for a technique is a
// position where nothing earlier in this list makes progress. The miner and
// the drill checker both read it from here.

import { aic, xyChain } from './techniques/chains.ts';
import { alsXz } from './techniques/als.ts';
import {
  claiming,
  fullHouse,
  hiddenPair,
  hiddenQuad,
  hiddenSingle,
  hiddenTriple,
  nakedPair,
  nakedQuad,
  nakedSingle,
  nakedTriple,
  pointing,
} from './techniques/basic.ts';
import { finnedSwordfish, finnedXWing, jellyfish, swordfish, xWing } from './techniques/fish.ts';
import { emptyRectangle, simpleColoring, skyscraper, twoStringKite, xChain } from './techniques/singleDigit.ts';
import { bugPlusOne, urType1, urType2, urType4 } from './techniques/uniqueness.ts';
import { wWing, xyWing, xyzWing } from './techniques/wings.ts';
import type { Detector, TechniqueId } from './types.ts';

export type Technique = {
  id: TechniqueId;
  name: string;
  tier: number;
  detect: Detector;
  /** The move is a placement rather than eliminations. */
  places: boolean;
  /** Practice asks the player to mark the pattern's cells before acting on it. */
  patternStep: boolean;
};

export type Tier = { id: number; name: string; blurb: string };

export const TIERS: Tier[] = [
  { id: 1, name: 'Singles', blurb: 'Where a digit has only one place to go.' },
  { id: 2, name: 'Intersections', blurb: 'A box and a line that overlap constrain each other.' },
  { id: 3, name: 'Pairs & Triples', blurb: 'Digits locked into a group of cells.' },
  { id: 4, name: 'Fish & Wings', blurb: 'Patterns that span several units at once.' },
  { id: 5, name: 'Strong Links', blurb: 'Single-digit patterns built from forced pairs.' },
  { id: 6, name: 'Big & Finned Fish', blurb: 'Quads, Jellyfish, and fish with a fin.' },
  { id: 7, name: 'Uniqueness', blurb: 'Using the fact that a puzzle has one solution.' },
  { id: 8, name: 'Chains', blurb: 'Long proofs: if this is false, that is true.' },
];

const t = (id: TechniqueId, name: string, tier: number, detect: Detector, places: boolean, patternStep: boolean): Technique => ({
  id,
  name,
  tier,
  detect,
  places,
  patternStep,
});

export const TECHNIQUES: Technique[] = [
  t('full-house', 'Full House', 1, fullHouse, true, false),
  t('hidden-single', 'Hidden Single', 1, hiddenSingle, true, false),
  t('naked-single', 'Naked Single', 1, nakedSingle, true, false),
  t('pointing', 'Pointing', 2, pointing, false, true),
  t('claiming', 'Claiming', 2, claiming, false, true),
  t('naked-pair', 'Naked Pair', 3, nakedPair, false, true),
  t('hidden-pair', 'Hidden Pair', 3, hiddenPair, false, true),
  t('naked-triple', 'Naked Triple', 3, nakedTriple, false, true),
  t('hidden-triple', 'Hidden Triple', 3, hiddenTriple, false, true),
  t('x-wing', 'X-Wing', 4, xWing, false, true),
  t('xy-wing', 'XY-Wing', 4, xyWing, false, true),
  t('swordfish', 'Swordfish', 4, swordfish, false, true),
  t('xyz-wing', 'XYZ-Wing', 4, xyzWing, false, true),
  t('skyscraper', 'Skyscraper', 5, skyscraper, false, true),
  t('two-string-kite', '2-String Kite', 5, twoStringKite, false, true),
  t('empty-rectangle', 'Empty Rectangle', 5, emptyRectangle, false, false),
  t('w-wing', 'W-Wing', 5, wWing, false, true),
  t('simple-coloring', 'Simple Coloring', 5, simpleColoring, false, false),
  t('naked-quad', 'Naked Quad', 6, nakedQuad, false, true),
  t('hidden-quad', 'Hidden Quad', 6, hiddenQuad, false, true),
  t('jellyfish', 'Jellyfish', 6, jellyfish, false, true),
  t('finned-x-wing', 'Finned X-Wing', 6, finnedXWing, false, true),
  t('finned-swordfish', 'Finned Swordfish', 6, finnedSwordfish, false, true),
  t('ur-type-1', 'Unique Rectangle 1', 7, urType1, false, true),
  t('ur-type-2', 'Unique Rectangle 2', 7, urType2, false, true),
  t('ur-type-4', 'Unique Rectangle 4', 7, urType4, false, true),
  t('bug-plus-one', 'BUG+1', 7, bugPlusOne, true, false),
  t('x-chain', 'X-Chain', 8, xChain, false, false),
  t('xy-chain', 'XY-Chain', 8, xyChain, false, false),
  t('aic', 'Alternating Inference Chain', 8, aic, false, false),
  t('als-xz', 'ALS-XZ', 8, alsXz, false, false),
];

export const TECHNIQUE_INDEX = new Map<TechniqueId, number>(TECHNIQUES.map((tech, i) => [tech.id, i]));

export const techniqueById = (id: TechniqueId): Technique => {
  const index = TECHNIQUE_INDEX.get(id);
  if (index === undefined) {
    throw new Error(`unknown technique ${id}`);
  }
  return TECHNIQUES[index];
};

export const techniquesInTier = (tier: number): Technique[] => TECHNIQUES.filter((tech) => tech.tier === tier);
