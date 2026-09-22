// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { describe, expect, it } from 'vitest';

import { titleForTool } from '../ShellApp';

describe('titleForTool', () => {
  it('names the tool ahead of the site', () => {
    // The tool is the part that differs between tabs, so it goes first.
    expect(titleForTool('Husk')).toBe('Husk — Mo4n6 Tools');
  });

  it('falls back to the site name when no tool resolves', () => {
    expect(titleForTool(undefined)).toBe('Mo4n6 Tools');
  });

  it('never leaves the old MVP title in place', () => {
    // index.html shipped "TTS Reader MVP" on every tool until this existed.
    for (const label of ['Momoro Reader', 'Glass', 'Rotation Goblin', undefined]) {
      expect(titleForTool(label)).not.toMatch(/TTS Reader MVP/);
    }
  });
});
