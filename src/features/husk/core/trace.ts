// The execution trace: decoded layers and the events that produced them.
//
// This is Husk's equivalent of Didier Stevens' eval.001.log. Every time a
// script decodes something and hands it back to the interpreter, that becomes
// a layer, and the analyst reads the layers rather than the original.

import { GapLedger, type GapRecord, type Provenance } from './gaps';
import { type Taint, isTainted, markOutput } from './taint';

/** How a layer came to exist. */
export type LayerOrigin =
  /** The text the analyst pasted. */
  | { readonly via: 'input' }
  /** Decoded by a named transform, e.g. 'base64', 'gzip', 'utf16le'. */
  | { readonly via: 'decode'; readonly transform: string; readonly from: number }
  /** Handed to Invoke-Expression, & or . by the script itself. */
  | { readonly via: 'invoke'; readonly operator: string; readonly from: number };

export interface Layer {
  readonly index: number;
  readonly source: string;
  readonly origin: LayerOrigin;
  readonly taint: Taint;
}

/** Something worth showing the analyst that is not itself a new layer. */
export interface TraceEvent {
  readonly provenance: Provenance;
  /** e.g. 'network', 'process', 'filesystem', 'registry', 'assembly'. */
  readonly category: string;
  /** e.g. "Net.WebClient.DownloadString" */
  readonly signature: string;
  /** Rendered arguments. Payload-derived, so redact before sharing. */
  readonly args: readonly string[];
  readonly taint: Taint;
}

/**
 * Accumulates everything one run produced. The gap ledger lives here so that
 * recording a gap and recording what it affected stay in one place.
 */
export class Trace {
  readonly gaps = new GapLedger();

  private readonly layerList: Layer[] = [];
  private readonly eventList: TraceEvent[] = [];

  constructor(input: string) {
    this.layerList.push({
      index: 0,
      source: input,
      origin: { via: 'input' },
      taint: new Set(),
    });
  }

  get layers(): readonly Layer[] {
    return this.layerList;
  }

  get events(): readonly TraceEvent[] {
    return this.eventList;
  }

  /** The original pasted script. */
  get input(): Layer {
    return this.layerList[0];
  }

  /**
   * The deepest layer reached, which is the closest thing to a final stage.
   * Not necessarily trustworthy - check `isReliable`.
   */
  get deepest(): Layer {
    return this.layerList[this.layerList.length - 1];
  }

  addLayer(source: string, origin: LayerOrigin, taint: Taint): Layer {
    const layer: Layer = { index: this.layerList.length, source, origin, taint };
    this.layerList.push(layer);
    // A layer is analyst-visible output, so anything unreliable about it is
    // a gap the report must surface prominently.
    markOutput(this.gaps, taint);
    return layer;
  }

  addEvent(event: TraceEvent): void {
    this.eventList.push(event);
    markOutput(this.gaps, event.taint);
  }

  /** True when no layer or event depends on something Husk could not compute. */
  get isReliable(): boolean {
    return (
      this.layerList.every((l) => !isTainted(l.taint)) &&
      this.eventList.every((e) => !isTainted(e.taint))
    );
  }

  /** Events grouped by category, for the IOC panel. */
  eventsByCategory(): ReadonlyMap<string, readonly TraceEvent[]> {
    const grouped = new Map<string, TraceEvent[]>();
    for (const event of this.eventList) {
      const bucket = grouped.get(event.category);
      if (bucket) bucket.push(event);
      else grouped.set(event.category, [event]);
    }
    return grouped;
  }

  /** Everything the fidelity panel needs, in one shape. */
  summary(): TraceSummary {
    return {
      layerCount: this.layerList.length,
      eventCount: this.eventList.length,
      reliable: this.isReliable,
      gaps: this.gaps.ranked(),
      actionable: this.gaps.actionable(),
    };
  }
}

export interface TraceSummary {
  readonly layerCount: number;
  readonly eventCount: number;
  readonly reliable: boolean;
  readonly gaps: readonly GapRecord[];
  readonly actionable: readonly GapRecord[];
}
