export interface TTSModelArtifactUsage {
  id: string;
  packageName: string;
  modelName: string;
  versionOrHash: string;
}

export const TTS_MODEL_ARTIFACTS_IN_USE: TTSModelArtifactUsage[] = [
  {
    id: 'kokoro-js:q8',
    packageName: 'kokoro-js',
    modelName: 'q8',
    versionOrHash: 'q8',
  },
] as const;

export const DEFAULT_KOKORO_MODEL = TTS_MODEL_ARTIFACTS_IN_USE[0].modelName;
