// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { analyzeRun } from '../analyze';
import { EngineClient, EngineTerminated, engineBaseUrl, engineUrl, probeEngine } from '../load';
import type { EngineRequest, EngineResponse } from '../engine.worker';

/**
 * A worker that answers the way the real one does, with the reply under the
 * test's control. The real worker cannot run here — it imports a 16 MB .NET
 * build from a URL — and the point of these tests is the protocol and the
 * failure handling, both of which live on this side of the boundary.
 */
class FakeWorker implements Partial<Worker> {
  static last?: FakeWorker;

  terminated = false;
  readonly sent: EngineRequest[] = [];
  /** Set to false to make `init` fail, or 'silent' to never answer a run. */
  behaviour: 'ok' | 'init-fails' | 'silent' = 'ok';

  private readonly listeners: ((event: MessageEvent<EngineResponse>) => void)[] = [];
  onmessage: ((event: MessageEvent<EngineResponse>) => void) | null = null;

  constructor() {
    FakeWorker.last = this;
  }

  addEventListener(type: string, listener: EventListener): void {
    if (type === 'message') {
      this.listeners.push(listener as unknown as (event: MessageEvent<EngineResponse>) => void);
    }
  }

  removeEventListener(_type: string, listener: EventListener): void {
    const at = this.listeners.indexOf(
      listener as unknown as (event: MessageEvent<EngineResponse>) => void,
    );
    if (at >= 0) this.listeners.splice(at, 1);
  }

  postMessage(message: EngineRequest): void {
    this.sent.push(message);

    if (message.kind === 'init') {
      this.reply(
        this.behaviour === 'init-fails'
          ? { kind: 'ready', ok: false, error: 'engine refused to start: ERR missing assembly' }
          : { kind: 'ready', ok: true },
      );
      return;
    }

    if (this.behaviour === 'silent') return;

    if (message.kind === 'run') {
      this.reply({
        kind: 'run',
        id: message.id,
        ok: true,
        result: analyzeRun(
          message.script,
          {
            result: { output: 'ran', error: '', completed: true, layers: [] },
            hostCalls: [],
            registry: [],
            dropped: [],
          },
          7,
        ),
      });
      return;
    }

    this.reply({ kind: 'read', id: message.id, ok: true, bytes: new Uint8Array([1, 2, 3]) });
  }

  terminate(): void {
    this.terminated = true;
  }

  private reply(message: EngineResponse): void {
    const event = { data: message } as MessageEvent<EngineResponse>;
    // Asynchronously, like a real worker, so a caller cannot accidentally
    // depend on the reply arriving before postMessage returns.
    queueMicrotask(() => {
      this.onmessage?.(event);
      for (const listener of [...this.listeners]) listener(event);
    });
  }
}

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('engineUrl', () => {
  it('joins a site-relative base, which new URL() cannot take as one', () => {
    expect(engineUrl('/husk-engine/', 'main.js')).toBe('/husk-engine/main.js');
    expect(engineUrl('/husk-engine', 'main.js')).toBe('/husk-engine/main.js');
  });

  it('joins an absolute base unchanged', () => {
    expect(engineUrl('https://cdn.example/e/', '_framework/x.dll')).toBe(
      'https://cdn.example/e/_framework/x.dll',
    );
  });
});

describe('engineBaseUrl', () => {
  it('is undefined by default, so Husk ships without an engine', () => {
    // The default has to be "no engine": the tree-walker is a complete answer
    // and the only one that works from a file:// copy, and an engine the UI
    // offers and cannot load is worse than no offer.
    expect(engineBaseUrl()).toBeUndefined();
  });

  it('treats a blank setting as unset rather than as an empty base', () => {
    vi.stubEnv('VITE_HUSK_ENGINE_URL', '   ');
    expect(engineBaseUrl()).toBeUndefined();

    vi.stubEnv('VITE_HUSK_ENGINE_URL', '/husk-engine/');
    expect(engineBaseUrl()).toBe('/husk-engine/');
  });

  it('resolves a relative setting against the site base', () => {
    // One value has to be right both at / in dev and at /tools/ on Pages.
    // Writing /tools/ into the deploy workflow would duplicate a path
    // vite.config.ts already derives from the repository name.
    vi.stubEnv('VITE_HUSK_ENGINE_URL', 'husk-engine/');
    vi.stubEnv('BASE_URL', '/tools/');
    expect(engineBaseUrl()).toBe('/tools/husk-engine/');

    vi.stubEnv('BASE_URL', '/');
    expect(engineBaseUrl()).toBe('/husk-engine/');
  });

  it('leaves an absolute setting alone', () => {
    vi.stubEnv('BASE_URL', '/tools/');
    for (const configured of ['/elsewhere/engine/', 'https://cdn.example/engine/']) {
      vi.stubEnv('VITE_HUSK_ENGINE_URL', configured);
      expect(engineBaseUrl()).toBe(configured);
    }
  });
});

describe('probeEngine', () => {
  it('says which setting to set when no engine is configured', async () => {
    const result = await probeEngine(undefined);

    expect(result.available).toBe(false);
    expect(result.reason).toContain('VITE_HUSK_ENGINE_URL');
  });

  it('checks the boot manifest, not the module', async () => {
    // A half-uploaded bundle serves main.js happily and then fails deep in the
    // runtime with a message about an assembly. Better to find out here.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ resources: { assembly: { 'System.Private.CoreLib.dll': 'sha256-x' } } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await probeEngine('/husk-engine/');

    expect(result.available).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain('_framework/blazor.boot.json');
  });

  it('treats a manifest with no assemblies as not deployed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    );

    const result = await probeEngine('/husk-engine/');

    expect(result.available).toBe(false);
    expect(result.reason).toContain('no assemblies');
  });

  it('reports a 404 rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const result = await probeEngine('/husk-engine/');

    expect(result.available).toBe(false);
    expect(result.reason).toContain('404');
  });

  it('reports a network failure rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await probeEngine('/husk-engine/');

    expect(result.available).toBe(false);
    expect(result.reason).toBe('offline');
  });
});

describe('EngineClient', () => {
  it('loads with the network blocked unless told otherwise', async () => {
    // The default has to be the safe one: an analyst opts in to live traffic.
    const client = new EngineClient();
    await client.load('/husk-engine/');

    expect(FakeWorker.last!.sent[0]).toMatchObject({
      kind: 'init',
      baseUrl: '/husk-engine/',
      networkMode: 'blocked',
    });
  });

  it('passes through the refusal the engine gave, not a generic one', async () => {
    // The engine's own message names the missing assembly or the failing
    // proxy, which is the difference between a fixable report and "it broke".
    class Failing extends FakeWorker {
      constructor() {
        super();
        this.behaviour = 'init-fails';
      }
    }
    vi.stubGlobal('Worker', Failing);

    await expect(new EngineClient().load('/husk-engine/')).rejects.toThrow('missing assembly');
  });

  it('runs a script and returns the whole run', async () => {
    const client = new EngineClient();
    await client.load('/husk-engine/');

    const result = await client.run('Write-Host hi');

    expect(result.output).toBe('ran');
    expect(result.backend).toBe('engine');
    expect(FakeWorker.last!.sent[1]).toMatchObject({ kind: 'run', script: 'Write-Host hi' });
  });

  it('kills the worker when a run never answers', async () => {
    // The in-engine budget is checked at sequence points, so it cannot
    // interrupt a catastrophic regex backtrack inside .NET, which never
    // reaches one. This is the limit that does not need the sample's
    // cooperation.
    vi.useFakeTimers();
    const client = new EngineClient();
    await client.load('/husk-engine/');
    FakeWorker.last!.behaviour = 'silent';

    const pending = client.run('while ($true) { }');
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(pending).rejects.toBeInstanceOf(EngineTerminated);
    expect(FakeWorker.last!.terminated).toBe(true);
  });

  it('refuses to be reused after a termination', async () => {
    // The engine's state is whatever the sample left it, and reusing it would
    // mix one sample's evidence into the next.
    const client = new EngineClient();
    await client.load('/husk-engine/');
    client.terminate();

    await expect(client.run('x')).rejects.toThrow('not loaded');
    await expect(client.load('/husk-engine/')).rejects.toThrow('create a new client');
  });

  it('rejects a run before anything is loaded', async () => {
    await expect(new EngineClient().run('x')).rejects.toThrow('not loaded');
  });

  it('reads a dropped file as bytes', async () => {
    const client = new EngineClient();
    await client.load('/husk-engine/');

    expect(await client.read('/husk-c/Users/Public/a.exe')).toEqual(new Uint8Array([1, 2, 3]));
  });
});
