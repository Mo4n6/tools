import { describe, expect, it } from 'vitest';

import { CLEAN, taintFrom } from '../taint';
import { Trace } from '../trace';

describe('layers', () => {
  it('starts with the pasted input as layer 0', () => {
    const trace = new Trace('whoami');
    expect(trace.layers).toHaveLength(1);
    expect(trace.input.source).toBe('whoami');
    expect(trace.input.origin).toEqual({ via: 'input' });
  });

  it('records each decode as a new layer with its provenance', () => {
    const trace = new Trace('encoded');
    trace.addLayer('decoded', { via: 'decode', transform: 'base64', from: 0 }, CLEAN);

    expect(trace.layers).toHaveLength(2);
    expect(trace.deepest.source).toBe('decoded');
    expect(trace.deepest.origin).toEqual({ via: 'decode', transform: 'base64', from: 0 });
  });

  // This is the Didier Stevens eval log: each IEX hands back a new layer.
  it('records an invoke as a layer', () => {
    const trace = new Trace('IEX $x');
    trace.addLayer('stage2', { via: 'invoke', operator: 'IEX', from: 0 }, CLEAN);
    expect(trace.deepest.origin).toEqual({ via: 'invoke', operator: 'IEX', from: 0 });
  });
});

describe('reliability', () => {
  it('is reliable when nothing is tainted', () => {
    const trace = new Trace('whoami');
    trace.addLayer('decoded', { via: 'decode', transform: 'base64', from: 0 }, CLEAN);
    expect(trace.isReliable).toBe(true);
  });

  it('is unreliable once a tainted layer is added', () => {
    const trace = new Trace('x');
    const id = trace.gaps.report({
      kind: 'GAP',
      signature: '[X]::Y()',
      argTypes: [],
      provenance: { layer: 0 },
    });
    trace.addLayer('maybe wrong', { via: 'decode', transform: 'aes', from: 0 }, taintFrom(id));

    expect(trace.isReliable).toBe(false);
  });

  it('marks a gap as output-reaching when it lands in a layer', () => {
    const trace = new Trace('x');
    const id = trace.gaps.report({
      kind: 'GAP',
      signature: '[X]::Y()',
      argTypes: [],
      provenance: { layer: 0 },
    });
    trace.addLayer('out', { via: 'decode', transform: 'aes', from: 0 }, taintFrom(id));

    expect(trace.gaps.get(id)?.reachedOutput).toBe(true);
  });

  it('marks a gap as output-reaching when it lands in an event', () => {
    const trace = new Trace('x');
    const id = trace.gaps.report({
      kind: 'GAP',
      signature: '[X]::Y()',
      argTypes: [],
      provenance: { layer: 0 },
    });
    trace.addEvent({
      provenance: { layer: 0 },
      category: 'network',
      signature: 'Net.WebClient.DownloadString',
      args: ['http://example.invalid/a'],
      taint: taintFrom(id),
    });

    expect(trace.gaps.get(id)?.reachedOutput).toBe(true);
    expect(trace.isReliable).toBe(false);
  });
});

describe('events', () => {
  it('groups by category for the IOC panel', () => {
    const trace = new Trace('x');
    const event = (category: string, signature: string) => ({
      provenance: { layer: 0 },
      category,
      signature,
      args: [],
      taint: CLEAN,
    });

    trace.addEvent(event('network', 'DownloadString'));
    trace.addEvent(event('network', 'Invoke-WebRequest'));
    trace.addEvent(event('process', 'Start-Process'));

    const grouped = trace.eventsByCategory();
    expect(grouped.get('network')).toHaveLength(2);
    expect(grouped.get('process')).toHaveLength(1);
  });
});

describe('summary', () => {
  it('reports counts, reliability and the ranked queue', () => {
    const trace = new Trace('x');
    trace.addLayer('l1', { via: 'decode', transform: 'base64', from: 0 }, CLEAN);
    trace.gaps.report({
      kind: 'GAP',
      signature: '[X]::Y()',
      argTypes: [],
      provenance: { layer: 1 },
    });
    trace.gaps.report({
      kind: 'HARD_BLOCK',
      signature: 'dead C2',
      argTypes: [],
      provenance: { layer: 1 },
    });

    const summary = trace.summary();
    expect(summary.layerCount).toBe(2);
    expect(summary.reliable).toBe(true);
    expect(summary.gaps).toHaveLength(2);
    expect(summary.actionable).toHaveLength(1);
  });
});
