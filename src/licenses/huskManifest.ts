import rawManifest from '../../docs/licenses/husk-manifest.json';

export interface HuskManifestEntry {
  id: string;
  packageOrModelName: string;
  versionOrHash: string;
  license: string;
  sourceUrl: string;
  attributionText?: string;
  portedFiles?: string[];
  generatedBy?: string[];
}

export interface HuskManifest {
  artifacts: HuskManifestEntry[];
}

export const huskManifest = rawManifest as HuskManifest;
