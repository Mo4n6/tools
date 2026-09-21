import { describe, expect, it } from 'vitest';

import { lexableCases } from '../../corpus';
import { compareCase, coverage, failureGroups } from './oracleReport';

// Differential testing against the real PowerShell tokenizer. This is what
// establishes the lexer's correctness - not our reading of the grammar.
//
// See docs/husk-spec.md section 6.

describe('agreement with the real PowerShell tokenizer', () => {
  it('matches every lexable oracle case', () => {
    const { matched, total } = coverage();

    if (matched !== total) {
      const detail = failureGroups()
        .slice(0, 10)
        .map((g) => `  ${g.count}x  ${g.signature}\n    ${g.sample.id}\n${g.sample.context}`)
        .join('\n\n');
      throw new Error(
        `tokenizer agrees on ${matched}/${total} cases; regressions:\n\n${detail}`,
      );
    }

    expect(matched).toBe(total);
  });

  it('runs against a corpus large enough to be meaningful', () => {
    expect(lexableCases().length).toBeGreaterThan(200);
  });
});

describe('per-case agreement', () => {
  // Named cases, so a regression points at the construct rather than a count.
  const named = [
    'edge/expandable-string-subexpr',
    'edge/nested-subexpression',
    'edge/here-string-literal',
    'edge/here-string-expandable',
    'edge/backtick-escapes',
    'edge/backtick-in-command',
    'edge/splatting',
    'edge/unicode-dash-parameter',
    'edge/smart-quote-string',
    'edge/array-index-chain',
    'edge/type-literal-generic',
    'edge/format-operator',
    'edge/argument-mode-dash',
    'edge/expression-mode-dash',
    'edge/number-suffixes',
    'edge/ternary',
    'edge/null-coalesce',
    'edge/comment-then-code',
    'edge/block-comment',
    'edge/label-and-break',
    'edge/variable-braced',
    'edge/scope-qualified-variable',
    'edge/stream-redirect',
    'edge/dot-source',
    'edge/amp-invoke',
  ];

  const byId = new Map(lexableCases().map((c) => [c.id, c]));

  it.each(named)('%s', (id) => {
    const oracleCase = byId.get(id);
    expect(oracleCase, `${id} missing from the oracle`).toBeDefined();

    const result = compareCase(oracleCase!);
    expect(result.matched, `diverged at token ${result.divergedAt}\n${result.context ?? ''}`).toBe(
      true,
    );
  });
});
