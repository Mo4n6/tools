/**
 * The project's own licence, in one place.
 *
 * SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
 * Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
 *
 * PolyForm Small Business 1.0.0 requires that the "Required Notice" line be
 * reproduced in copies that are passed on. That makes its exact wording part
 * of the licence rather than decoration, so it is defined once here and every
 * tool refers to it instead of retyping it. A tool's own byline is a separate
 * thing: a human-facing credit, free to read however it likes.
 *
 * Third-party code that ships alongside this keeps its own licence and is not
 * covered by the above. See THIRD-PARTY.md.
 */

export const PROJECT_LICENSE_SPDX = 'PolyForm-Small-Business-1.0.0' as const;

export const PROJECT_LICENSE_URL =
  'https://polyformproject.org/licenses/small-business/1.0.0' as const;

/** Reproduce verbatim. The licence asks for this line specifically. */
export const PROJECT_REQUIRED_NOTICE =
  'Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)' as const;

export const PROJECT_SOURCE_URL = 'https://github.com/Mo4n6/tools' as const;

export const PROJECT_AUTHOR = 'Mo4n6' as const;

export const PROJECT_AUTHOR_URL = 'https://x.com/Mo4n6' as const;

/** Where to ask when an organisation is over the licence's size thresholds. */
export const PROJECT_COMMERCIAL_LICENSE_URL =
  'https://github.com/Mo4n6/tools/issues/new?template=licensing.yml' as const;

/**
 * The byline a tool shows in its own interface. Distinct from the Required
 * Notice above, which is what the licence obliges a redistributor to keep.
 */
export const PROJECT_BYLINE = 'Copyright (c) 2026 Mo (@Mo4n6)' as const;
