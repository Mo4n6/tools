import rawManifest from '../../docs/licenses/tts-manifest.json';

export interface TTSManifestEntry {
  id: string;
  packageOrModelName: string;
  versionOrHash: string;
  license: string;
  sourceUrl: string;
  attributionText?: string;
}

export interface TTSManifest {
  artifacts: TTSManifestEntry[];
}

export const ttsManifest = rawManifest as TTSManifest;
