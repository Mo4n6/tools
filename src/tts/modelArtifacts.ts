export interface TTSModelArtifactUsage {
  id: string;
  packageName: string;
  modelName: string;
  dtype?: string;
  versionOrHash: string;
}

export const DEFAULT_KOKORO_MODEL = 'onnx-community/Kokoro-82M-ONNX';

export const TTS_MODEL_ARTIFACTS_IN_USE: readonly TTSModelArtifactUsage[] = [
  {
    id: 'kokoro-js:q8',
    packageName: 'kokoro-js',
    modelName: DEFAULT_KOKORO_MODEL,
    dtype: 'q8',
    versionOrHash: 'q8',
  },
] as const;
