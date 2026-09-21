// Regenerates every file Husk ports from the PowerShell source.
//
// Usage:
//   npm run port:powershell -- <path-to-PowerShell-checkout>
//
// See src/features/husk/README.md for what is ported and why.

import { spawnSync } from 'node:child_process';

const checkout = process.argv[2];
if (!checkout) {
  console.error('usage: npm run port:powershell -- <path-to-PowerShell-checkout>');
  process.exit(1);
}

const generators = ['scripts/port-char-traits.mjs', 'scripts/port-tokens.mjs'];

for (const generator of generators) {
  const result = spawnSync(process.execPath, [generator, checkout], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\n${generator} failed; generated files left untouched.`);
    process.exit(result.status ?? 1);
  }
}
