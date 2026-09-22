// Where the neural tier's weights come from.
//
// Deliberately nowhere, by default. Glass ships no model and contacts no
// service: the operator points it at an .onnx file, either one on disk or one
// at a URL they chose, and that decision is visible in the UI rather than
// buried in a build constant. A tool that silently fetched a few dozen
// megabytes from a third party the first time you opened it would be making a
// supply-chain decision on the operator's behalf.
//
// Once fetched, weights are kept in the Cache API so the download happens once
// per browser rather than once per visit.

const CACHE_NAME = 'glass-weights-v1';

export type WeightsSource =
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'file'; readonly file: File };

export interface DownloadProgress {
  readonly received: number;
  /** Total bytes, or null when the server sends no length. */
  readonly total: number | null;
}

/** Human-readable byte count for a progress line. */
export function describeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Accepts only schemes a browser can fetch without surprises.
 *
 * Plain http is allowed on loopback so a locally served model works, and
 * refused elsewhere: weights fetched over a cleartext connection are weights an
 * intermediary can replace, and this file becomes executable tensor code.
 */
export function isUsableWeightsUrl(candidate: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }

  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol !== 'http:') return false;
  return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
}

/** Build-time default, if the deployment chose to bake one in. */
export function configuredWeightsUrl(
  env: Readonly<Record<string, string | boolean | undefined>>,
): string | null {
  const configured = env.VITE_GLASS_WEIGHTS_URL;
  if (typeof configured !== 'string') return null;
  const trimmed = configured.trim();
  if (!trimmed || !isUsableWeightsUrl(trimmed)) return null;
  return trimmed;
}

/** Drains a response body, reporting bytes as they arrive. */
export async function readWithProgress(
  stream: ReadableStream<Uint8Array>,
  total: number | null,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.({ received, total });
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

async function openCache(): Promise<Cache | null> {
  // Absent in workers without the Cache API, and in some privacy modes. A
  // missing cache costs a re-download, not correctness.
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/** Loads weights, preferring the cache and falling back to the network. */
export async function loadWeights(
  source: WeightsSource,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<ArrayBuffer> {
  if (source.kind === 'file') {
    return source.file.arrayBuffer();
  }

  if (!isUsableWeightsUrl(source.url)) {
    throw new Error('Weights URL must be https, or http on localhost');
  }

  const cache = await openCache();
  const cached = await cache?.match(source.url).catch(() => undefined);
  if (cached) {
    const buffer = await cached.arrayBuffer();
    onProgress?.({ received: buffer.byteLength, total: buffer.byteLength });
    return buffer;
  }

  const response = await fetch(source.url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`Weights request failed: ${response.status} ${response.statusText}`);
  }

  const lengthHeader = response.headers.get('content-length');
  const total = lengthHeader ? Number.parseInt(lengthHeader, 10) : null;

  const buffer = response.body
    ? await readWithProgress(response.body, Number.isFinite(total) ? total : null, onProgress)
    : await response.arrayBuffer();

  // Best effort: a quota refusal must not lose the download we already have.
  await cache?.put(source.url, new Response(buffer.slice(0))).catch(() => undefined);

  return buffer;
}

/** Forgets every cached model, for an operator who wants the bytes gone. */
export async function clearWeightsCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    // Nothing useful to do; the cache is a convenience.
  }
}
