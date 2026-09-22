/**
 * Glass — image upscaling that runs entirely in the browser tab.
 *
 * SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
 * Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
 *
 * No image ever leaves the machine: every tier resamples in this tab, and the
 * neural tier runs weights the operator supplies rather than a hosted service.
 * Those weights carry their own licence, which is not this one.
 */

import {
  PROJECT_AUTHOR,
  PROJECT_AUTHOR_URL,
  PROJECT_BYLINE,
  PROJECT_SOURCE_URL,
} from '../../licenses/projectLicense';

export const GLASS_AUTHOR = PROJECT_AUTHOR;
export const GLASS_AUTHOR_URL = PROJECT_AUTHOR_URL;
export const GLASS_SOURCE_URL = PROJECT_SOURCE_URL;
export const GLASS_COPYRIGHT = PROJECT_BYLINE;
