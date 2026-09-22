// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// The licensing notices drifted once already: the project licence sat unmerged
// on a dead branch for two days, and THIRD-PARTY.md went on claiming that no
// third-party code was vendored after Husk had vendored some. Both were the
// kind of mistake nobody notices by reading, so they are asserted here instead.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PROJECT_LICENSE_SPDX,
  PROJECT_LICENSE_URL,
  PROJECT_REQUIRED_NOTICE,
} from '../projectLicense';

// Vitest runs from the repository root, which is where these paths are anchored.
const repoRoot = process.cwd();
const read = (relative: string): string =>
  readFileSync(join(repoRoot, relative), 'utf8');

/** Every tool the shell actually ships, by its entry point. */
const TOOL_ENTRY_POINTS = [
  'src/App.tsx',
  'src/features/binaural-beats/BinauralBeatsApp.tsx',
  'src/features/dead-letter/DeadLetterApp.tsx',
  'src/features/glass/GlassApp.tsx',
  'src/features/husk/HuskApp.tsx',
  'src/features/rotation-goblin/RotationGoblinApp.tsx',
];

/** Pages a user can open or download on their own, away from the bundle. */
const STANDALONE_PAGES = ['index.html', 'public/dead-letter.html'];

describe('project licence notices', () => {
  it('states the same Required Notice in LICENSE and in code', () => {
    // PolyForm asks for this exact line to survive redistribution, so the
    // constant the tools import has to be the line the licence actually names.
    expect(read('LICENSE')).toContain(`Required Notice: ${PROJECT_REQUIRED_NOTICE}`);
  });

  it('declares the same SPDX identifier in LICENSE and package.json', () => {
    expect(read('LICENSE')).toContain(`SPDX-License-Identifier: ${PROJECT_LICENSE_SPDX}`);
    expect(JSON.parse(read('package.json')).license).toBe(PROJECT_LICENSE_SPDX);
  });

  it.each(TOOL_ENTRY_POINTS)('carries the notice in %s', (relative) => {
    const source = read(relative);
    expect(source).toContain(`SPDX-License-Identifier: ${PROJECT_LICENSE_SPDX}`);
    expect(source).toContain(`Required Notice: ${PROJECT_REQUIRED_NOTICE}`);
  });

  it.each(STANDALONE_PAGES)('carries the notice in %s', (relative) => {
    const source = read(relative);
    expect(source).toContain(`SPDX-License-Identifier: ${PROJECT_LICENSE_SPDX}`);
    expect(source).toContain(`Required Notice: ${PROJECT_REQUIRED_NOTICE}`);
    // A downloaded page travels without LICENSE beside it, same as a chunk.
    expect(source).toContain(PROJECT_LICENSE_URL);
  });

  it('stamps the same notice onto built chunks and workers', () => {
    // Minification strips the comments the sources carry the notice in, so the
    // build re-adds it. Both banners have to say what the licence says.
    const config = read('vite.config.ts');
    expect(config).toContain(`SPDX-License-Identifier: ${PROJECT_LICENSE_SPDX}`);
    expect(config).toContain(`Required Notice: ${PROJECT_REQUIRED_NOTICE}`);
    // The Notices section wants the terms or their URL alongside the notice,
    // and a chunk redistributed alone has no LICENSE next to it to point at.
    expect(config).toContain(PROJECT_LICENSE_URL);
    // The worker pass is a separate Rollup output and was missed at first.
    expect(config).toMatch(/worker:\s*\{[\s\S]*?banner: CHUNK_BANNER/);
  });

  it('covers every shell tool, so a new tool cannot ship unnoticed', () => {
    // Guards against adding a tool to the shell and forgetting its header.
    const shell = read('src/ShellApp.tsx');
    const imported = [...shell.matchAll(/^import \w+ from '(\.[^']+)';$/gm)].map(
      ([, specifier]) => specifier,
    );
    const toolImports = imported.filter(
      (specifier) => specifier === './App' || specifier.startsWith('./features/'),
    );

    const covered = TOOL_ENTRY_POINTS.map((path) =>
      path.replace(/^src\//, './').replace(/\.tsx$/, ''),
    );

    expect([...toolImports].sort()).toEqual([...covered].sort());
  });
});

describe('third-party notices', () => {
  it('does not deny vendoring code that is in fact vendored', () => {
    const thirdParty = read('THIRD-PARTY.md');
    const manifest = JSON.parse(read('docs/licenses/husk-manifest.json'));

    // The manifest is the record of what was ported; if it lists anything,
    // THIRD-PARTY.md has to say so rather than claim the tree is clean.
    expect(manifest.artifacts.length).toBeGreaterThan(0);
    expect(thirdParty).not.toContain('No third-party code is vendored');
    expect(thirdParty).toContain('Vendored into this repository');
  });

  it('keeps the upstream copyright notice MIT requires', () => {
    // MIT lets the port carry the project licence only while this survives.
    for (const relative of [
      'src/features/husk/lexer/charTraits.ts',
      'src/features/husk/lexer/tokenKind.ts',
      'src/features/husk/attribution.ts',
      'THIRD-PARTY.md',
    ]) {
      expect(read(relative)).toContain('Microsoft Corporation');
    }
  });
});
