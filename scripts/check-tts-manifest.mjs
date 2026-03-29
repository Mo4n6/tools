import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'docs/licenses/tts-manifest.json');
const usagePath = path.join(repoRoot, 'src/tts/modelArtifacts.ts');

const requiredManifestFields = [
  'id',
  'packageOrModelName',
  'versionOrHash',
  'license',
  'sourceUrl',
];

const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};

if (!fs.existsSync(manifestPath)) {
  fail(`Missing manifest: ${manifestPath}`);
}

if (!fs.existsSync(usagePath)) {
  fail(`Missing in-code model usage registry: ${usagePath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!manifest || !Array.isArray(manifest.artifacts)) {
  fail('Manifest must be an object with an artifacts array.');
}

for (const artifact of manifest.artifacts) {
  for (const field of requiredManifestFields) {
    if (typeof artifact[field] !== 'string' || artifact[field].trim().length === 0) {
      fail(`Manifest artifact is missing required field \"${field}\".`);
    }
  }
}

const usageSource = fs.readFileSync(usagePath, 'utf8');
const usageIds = [...usageSource.matchAll(/id:\s*'([^']+)'/g)].map((match) => match[1]);

if (usageIds.length === 0) {
  fail('No model artifacts were found in src/tts/modelArtifacts.ts.');
}

const manifestIds = new Set(manifest.artifacts.map((artifact) => artifact.id));
const missingInManifest = usageIds.filter((id) => !manifestIds.has(id));

if (missingInManifest.length > 0) {
  fail(`Model artifacts missing from manifest: ${missingInManifest.join(', ')}`);
}

console.log(`✅ tts-manifest check passed for ${usageIds.length} model artifact(s).`);
