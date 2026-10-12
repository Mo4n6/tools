// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Its own module so the worker can use it without importing the client, which
// would pull main-thread code into the worker bundle.

/**
 * Joins the configured engine base to a path, as strings.
 *
 * Deliberately not `new URL(path, base)`: the base is usually a site-relative
 * path like '/husk-engine/', which is not a valid URL base, and inventing an
 * origin to satisfy the constructor would be a lie. `fetch` and a dynamic
 * `import` both take relative URLs, and the engine resolves its own
 * `./_framework/…` against wherever it was loaded from.
 */
export function engineUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path}`;
}
