import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const trackedFilesRaw = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
const trackedFiles = trackedFilesRaw
  .split('\n')
  .map((value) => value.trim())
  .filter(Boolean)
  .filter((file) => !file.endsWith('.png') && !file.endsWith('.jpg') && !file.endsWith('.jpeg') && !file.endsWith('.gif'));

const conflictMarkerPattern = /^(<{7}|={7}|>{7})(?:\s|$)/m;
const featureBranchPattern = /(?:\borigin\/)?\bfeature\/[A-Za-z0-9._/-]+|refs\/heads\/feature\/[A-Za-z0-9._/-]+/;

const violations = [];

for (const file of trackedFiles) {
  const content = readFileSync(file, 'utf8');

  if (conflictMarkerPattern.test(content)) {
    violations.push(`${file}: merge conflict marker detected`);
  }

  const branchMatch = content.match(featureBranchPattern);
  if (branchMatch) {
    violations.push(`${file}: orphaned feature-branch reference detected (${branchMatch[0]})`);
  }
}

if (violations.length > 0) {
  console.error('Found stale merge leftovers:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('No merge leftovers found.');
