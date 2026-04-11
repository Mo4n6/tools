import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ttsManifest } from './licenses/ttsManifest';
import { ingestInput } from './features/ingest/urlAdapter';
import { PlayerControls } from './features/player/PlayerControls';
import type { NormalizedDocument, SpeakableSegment } from './domain/segments';
import { usePlayerController } from './features/player/playerMachine';
import { clearWebGpuUnstableProfileForCurrentBrowser, selectTTSProvider } from './tts/providerSelector';
import { perfTelemetry, setupLocalDebugPerfTelemetry } from './tts/perfTelemetry';
import { classifyPerfDebugEvent, type PerfDebugEntry } from './tts/perfDebugClassifier';
import type { TTSFallbackError } from './tts/errors';
import { canImportKokoroModule } from './tts/providers/kokoroProvider';
import { WebSpeechProvider } from './tts/providers/webSpeechProvider';
import type { KokoroDType, RuntimeDType, TTSProvider, TTSVoice } from './tts/types';
import { buildFullAudioExport, type ExportFormat } from './tts/buildFullAudioExport';
import { MP3_FALLBACK_WARNING, probeMp3EncodingCapability, type Mp3CapabilityProbe } from './tts/encodeMp3';
import { PreviewPanel } from './features/preview/PreviewPanel';
import {
  SYNTHESIS_MAX_SPLIT_DEPTH,
  SYNTHESIS_RETRY_BACKOFF_BASE_MS,
  SYNTHESIS_RETRY_MAX_ATTEMPTS,
  synthesizeWithValidation,
} from './tts/synthesizeWithValidation';

function normalizeFingerprintText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function hashFingerprintValue(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildDocumentFingerprint(segments: SpeakableSegment[]): string {
  const normalizedParts = segments.map((segment) => (
    `${segment.id}:${hashFingerprintValue(normalizeFingerprintText(segment.text))}`
  ));
  return `${segments.length}:${hashFingerprintValue(normalizedParts.join('|'))}`;
}

type UrlBase64Bootstrap = {
  text: string | null;
  error: string | null;
  paramKey: string | null;
};

const URL_BASE64_TEXT_PARAM_KEYS = ['text64', 'b64', 'text_base64'] as const;

function decodeBase64UrlText(encoded: string): string | null {
  if (!encoded) {
    return null;
  }

  const normalized = encoded
    .replace(/\s+/g, '+')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  try {
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function getHashQueryString(hash: string): string {
  if (!hash.startsWith('#')) {
    return '';
  }

  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) {
    return '';
  }

  return hash.slice(queryIndex);
}

function getSpaFallbackSearchParams(): URLSearchParams | null {
  if (typeof window === 'undefined' || !window.location.search.startsWith('?/')) {
    return null;
  }

  const rawValue = window.location.search.slice(2).replace(/~and~/g, '&');
  const withLeadingSlash = rawValue.startsWith('/') ? rawValue : `/${rawValue}`;

  try {
    const parsed = new URL(withLeadingSlash, window.location.origin);
    return new URLSearchParams(parsed.search);
  } catch {
    return null;
  }
}

function readUrlBase64Bootstrap(): UrlBase64Bootstrap {
  if (typeof window === 'undefined') {
    return { text: null, error: null, paramKey: null };
  }

  const paramSets = [
    new URLSearchParams(window.location.search),
    new URLSearchParams(getHashQueryString(window.location.hash)),
    getSpaFallbackSearchParams(),
  ];

  for (const params of paramSets) {
    if (!params) {
      continue;
    }
    for (const paramKey of URL_BASE64_TEXT_PARAM_KEYS) {
      const encodedValue = params.get(paramKey);
      if (typeof encodedValue !== 'string') {
        continue;
      }
      const decoded = decodeBase64UrlText(encodedValue);
      if (decoded === null) {
        return { text: null, error: `Unable to decode URL parameter "${paramKey}" as base64 text.`, paramKey };
      }
      return { text: decoded, error: null, paramKey };
    }
  }

  return { text: null, error: null, paramKey: null };
}


const isUrlIngestEnabled = import.meta.env.VITE_ENABLE_URL_INGEST !== 'false';
const isPagesStyleBase = import.meta.env.BASE_URL !== '/';
const SKIP_KOKORO_INIT_ON_PAGES_ENV_FLAG = 'VITE_SKIP_KOKORO_INIT_ON_PAGES';
const skipKokoroInitOnPagesEnvValue = import.meta.env.VITE_SKIP_KOKORO_INIT_ON_PAGES;
const shouldSkipKokoroInitOnPages = skipKokoroInitOnPagesEnvValue === 'true';
type SourceType = 'text' | 'file' | 'url';
const sourceTabs: SourceType[] = isUrlIngestEnabled ? ['text', 'file', 'url'] : ['text', 'file'];
const TTS_PREFS_STORAGE_KEY = 'reader-tts-preferences';
const TTS_DTYPE_STORAGE_KEY = 'reader-kokoro-dtype';
const VOICE_MIGRATION_DONE_STORAGE_KEY = 'reader-web-speech-voice-migration-done';
const KNOWN_PROVIDER_LABELS = ['web-speech', 'kokoro'] as const;
type KnownProviderLabel = (typeof KNOWN_PROVIDER_LABELS)[number];

const LEGACY_VOICE_MIGRATIONS: Record<string, string> = {
  Alloy: 'af_alloy',
  alloy: 'af_alloy',
};

const normalizeKokoroVoiceId = (voice: string): string => LEGACY_VOICE_MIGRATIONS[voice] ?? voice;
const WEB_SPEECH_VOICE_PATTERN = /^(?:urn:[\w-]+:|com\.[\w.-]+|Microsoft\s|Google\s|Alex$|Samantha$)/i;
const isKnownProviderLabel = (provider: string): provider is KnownProviderLabel => (
  KNOWN_PROVIDER_LABELS.includes(provider as KnownProviderLabel)
);
const isLikelyWebSpeechVoiceId = (voice: string): boolean => WEB_SPEECH_VOICE_PATTERN.test(voice);
const isKokoroActivePath = !(isPagesStyleBase && shouldSkipKokoroInitOnPages);
const getNormalizedStoredProvider = (provider: string): KnownProviderLabel => (
  isKnownProviderLabel(provider)
    ? provider
    : (isKokoroActivePath ? 'kokoro' : 'web-speech')
);
const toFileNameStem = (title: string | undefined): string => (
  (title || 'playback').replace(/\s+/g, '-').toLowerCase()
);

type StoredTtsPreferences = {
  voice: string;
  rate: number;
  provider: string;
};

type LoadedTtsPreferences = StoredTtsPreferences & {
  migratedLegacyWebSpeechVoice: boolean;
};

type DocumentSource = {
  type: SourceType;
  value: string;
  name?: string;
};

type DocumentWarning = {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
};

type IngestedState = {
  title: string;
  source: DocumentSource;
  document: NormalizedDocument;
  warnings: DocumentWarning[];
};

type FullAudioBuildState = {
  status: 'idle' | 'building' | 'ready' | 'error';
  builtSegments: number;
  totalSegments: number;
  error: string | null;
  failedSegmentId: string | null;
  failedSegmentIndex: number | null;
  audioUrl: string | null;
  fileName: string;
};
type PlaybackSource = 'stream' | 'exported';

const migrateStoredVoice = (voice: string): string => normalizeKokoroVoiceId(voice);

const getDefaultKokoroVoice = (voices: TTSVoice[]): TTSVoice | undefined => (
  voices.find((providerVoice) => providerVoice.id === 'af_alloy') ?? voices[0]
);

const getWebSpeechVoiceIds = (): string[] => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }

  return window.speechSynthesis.getVoices().map((voice) => voice.voiceURI);
};

const loadTtsPreferences = (): LoadedTtsPreferences | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(TTS_PREFS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredTtsPreferences>;
    if (typeof parsed.voice !== 'string' || typeof parsed.rate !== 'number' || typeof parsed.provider !== 'string') {
      return null;
    }

    const normalizedProvider = getNormalizedStoredProvider(parsed.provider);
    const isLegacyOrUnknownProvider = !isKnownProviderLabel(parsed.provider);
    const normalizedIncomingVoice = isLegacyOrUnknownProvider
      && normalizedProvider === 'kokoro'
      && isLikelyWebSpeechVoiceId(parsed.voice)
      ? ''
      : parsed.voice;
    const migratedVoice = migrateStoredVoice(normalizedIncomingVoice);
    const webSpeechVoiceIds = normalizedProvider === 'web-speech' ? getWebSpeechVoiceIds() : [];
    const correctedVoice = normalizedProvider === 'web-speech'
      ? (webSpeechVoiceIds.includes(migratedVoice) ? migratedVoice : webSpeechVoiceIds[0] ?? migratedVoice)
      : migratedVoice;

    const correctedPreferences: StoredTtsPreferences = {
      voice: correctedVoice,
      rate: parsed.rate,
      provider: normalizedProvider,
    };
    const migratedLegacyWebSpeechVoice = correctedVoice !== parsed.voice;

    if (
      correctedPreferences.voice !== parsed.voice
      || correctedPreferences.rate !== parsed.rate
      || correctedPreferences.provider !== parsed.provider
    ) {
      window.localStorage.setItem(TTS_PREFS_STORAGE_KEY, JSON.stringify(correctedPreferences));
    }

    return {
      ...correctedPreferences,
      migratedLegacyWebSpeechVoice,
    };
  } catch {
    return null;
  }
};

const loadVoiceMigrationDone = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(VOICE_MIGRATION_DONE_STORAGE_KEY) === 'true';
};

const persistVoiceMigrationDone = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(VOICE_MIGRATION_DONE_STORAGE_KEY, 'true');
};

type ProviderRuntimeMetadata = {
  providerType: 'kokoro' | 'web-speech';
  runtime: 'webgpu' | 'wasm' | 'system';
  dtype: RuntimeDType;
  runtimeReason?: string;
  webGpuAvoidance?: {
    reason: 'adapter_unavailable' | 'unstable_profile' | 'memory_gate';
    message: string;
    profileMarkedAt?: string;
  };
  fallbackToWebSpeech: boolean;
  fallbackError?: TTSFallbackError;
};

type TtsInitStatusLine = {
  providerSelected: string;
  runtime: ProviderRuntimeMetadata['runtime'];
  dtype: RuntimeDType;
  skipKokoroInit: boolean;
  kokoroImportable: boolean;
  fallbackCode: TTSFallbackError['code'] | 'none';
};

type DevTtsDiagnostics = {
  kokoroPackageLoadable: boolean;
  mp3Preflight: Mp3CapabilityProbe;
  webgpuSupported: boolean;
  deviceMemoryGb?: number;
  forcedDeviceOverride: 'webgpu' | 'wasm' | 'none';
  selectedProvider: string;
  selectedDtype: RuntimeDType;
  fallbackCode?: TTSFallbackError['code'];
  fallbackReason?: string;
  fallbackHint?: string;
};

const KOKORO_MODULE_NOT_BUNDLED_HINT = 'Install/add kokoro-js dependency and avoid @vite-ignore for this import.';
const KOKORO_DTYPE_OPTIONS: KokoroDType[] = ['fp32', 'fp16', 'q8', 'q4', 'q4f16'];
const AUDIO_REPLAY_EPSILON_SECONDS = 0.05;

const loadStoredKokoroDtype = (): KokoroDType | 'auto' => {
  if (typeof window === 'undefined') {
    return 'fp32';
  }

  const stored = window.localStorage.getItem(TTS_DTYPE_STORAGE_KEY);
  if (!stored || stored === 'auto') {
    return 'fp32';
  }

  return KOKORO_DTYPE_OPTIONS.includes(stored as KokoroDType) ? (stored as KokoroDType) : 'auto';
};

const emitDevKokoroImportCheck = async (): Promise<boolean> => {
  const kokoroPackageLoadable = await canImportKokoroModule();
  if (import.meta.env.DEV && !kokoroPackageLoadable) {
    console.info('[DEV][TTS_IMPORT_CHECK]', {
      code: 'KOKORO_MODULE_NOT_BUNDLED',
      hint: KOKORO_MODULE_NOT_BUNDLED_HINT,
    });
  }

  return kokoroPackageLoadable;
};

const getFallbackReasonAndHint = (error?: TTSFallbackError): { reason?: string; hint?: string } => {
  if (!error) {
    return {};
  }

  if (error.code === 'KOKORO_MODULE_RESOLUTION_FAILED') {
    return {
      reason: 'Could not resolve the kokoro-js module during provider initialization.',
      hint: 'Verify kokoro-js is installed/bundled and dynamic import path works on GitHub Pages base URL.',
    };
  }

  return {
    reason: error.message,
    hint: error.hints?.[0],
  };
};

const checkWebGpuSupport = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return false;
  }

  const gpuNavigator = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
  const adapter = await gpuNavigator.gpu?.requestAdapter();
  return Boolean(adapter);
};

const getDevDeviceOverride = (): 'webgpu' | 'wasm' | null => {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return null;
  }

  const value = new URLSearchParams(window.location.search).get('ttsDevice');
  if (value === 'webgpu' || value === 'wasm') {
    return value;
  }

  return null;
};

const getDeviceMemoryGb = (): number | undefined => {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
};

const getFallbackBucketLabel = (
  fallbackError: TTSFallbackError | null,
  fallbackIntentional: boolean
): 'Configuration' | 'Capability' | 'Intentional mode' => {
  if (fallbackIntentional) {
    return 'Intentional mode';
  }

  if (!fallbackError) {
    return 'Capability';
  }

  switch (fallbackError.code) {
    case 'KOKORO_MODULE_RESOLUTION_FAILED':
    case 'KOKORO_MODEL_ID_INVALID':
    case 'KOKORO_MODEL_FETCH_FAILED':
      return 'Configuration';
    case 'WEBGPU_UNAVAILABLE':
    case 'DEVICE_MEMORY_TOO_LOW':
      return 'Capability';
    default:
      return 'Capability';
  }
};

function App() {
  const isProduction = import.meta.env.PROD;
  const urlBase64Bootstrap = useMemo(readUrlBase64Bootstrap, []);
  const [sourceType, setSourceType] = useState<SourceType>('text');
  const [textInput, setTextInput] = useState(urlBase64Bootstrap.text ?? 'Paste text to normalize and preview for playback.');
  const [urlInput, setUrlInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [ingested, setIngested] = useState<IngestedState>({
    title: 'Untitled Source',
    source: { type: 'text', value: '' },
    document: { title: 'Untitled Source', segments: [] },
    warnings: [],
  });

  const storedPreferences = useMemo(loadTtsPreferences, []);
  const [provider, setProvider] = useState<TTSProvider>(() => new WebSpeechProvider());
  const [providerLabel, setProviderLabel] = useState('web-speech');
  const [providerRuntimeMetadata, setProviderRuntimeMetadata] = useState<ProviderRuntimeMetadata>({
    providerType: 'web-speech',
    runtime: 'system',
    dtype: 'n/a',
    runtimeReason: undefined,
    webGpuAvoidance: undefined,
    fallbackToWebSpeech: false,
  });
  const [showFallbackBanner, setShowFallbackBanner] = useState(false);
  const [showInformationalFallbackBanner, setShowInformationalFallbackBanner] = useState(false);
  const [providerFallbackError, setProviderFallbackError] = useState<TTSFallbackError | null>(null);
  const [voiceFallbackWarning, setVoiceFallbackWarning] = useState<string | null>(null);
  const [voiceMigrationInfo, setVoiceMigrationInfo] = useState<string | null>(null);
  const [isVoiceReadyForPlayback, setIsVoiceReadyForPlayback] = useState(false);
  const [voiceReadinessHelperText, setVoiceReadinessHelperText] = useState<string | null>('Loading voices…');
  const [ttsInitStatusLine, setTtsInitStatusLine] = useState<TtsInitStatusLine | null>(null);
  const [devTtsDiagnostics, setDevTtsDiagnostics] = useState<DevTtsDiagnostics | null>(null);
  const [mp3Capability, setMp3Capability] = useState<Mp3CapabilityProbe | null>(null);
  const [firstAudioTimingMs, setFirstAudioTimingMs] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(!isProduction);
  const [showUrlBase64Help, setShowUrlBase64Help] = useState(false);
  const [voice, setVoice] = useState(storedPreferences?.voice ?? '');
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([]);
  const [rate, setRate] = useState(storedPreferences?.rate ?? 1);
  const [showModelLicenseInfo, setShowModelLicenseInfo] = useState(false);
  const [selectedKokoroDtype, setSelectedKokoroDtype] = useState<KokoroDType | 'auto'>(loadStoredKokoroDtype);
  const [runtimeWarnings, setRuntimeWarnings] = useState<PerfDebugEntry[]>([]);
  const [fatalPlaybackBlockers, setFatalPlaybackBlockers] = useState<PerfDebugEntry[]>([]);
  const [hasCompletedVoiceMigration, setHasCompletedVoiceMigration] = useState(loadVoiceMigrationDone);
  const [hasPendingVoiceMigrationNormalization, setHasPendingVoiceMigrationNormalization] = useState(
    Boolean(storedPreferences?.migratedLegacyWebSpeechVoice) && !loadVoiceMigrationDone(),
  );
  const [providerInitNonce, setProviderInitNonce] = useState(0);
  const [forceWebGpuRetry, setForceWebGpuRetry] = useState(false);
  const [fullAudioBuild, setFullAudioBuild] = useState<FullAudioBuildState>({
    status: 'idle',
    builtSegments: 0,
    totalSegments: 0,
    error: null,
    failedSegmentId: null,
    failedSegmentIndex: null,
    audioUrl: null,
    fileName: 'playback.wav',
  });
  const [playbackSource, setPlaybackSource] = useState<PlaybackSource>('stream');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('wav');
  const fullAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const fullAudioSegmentCacheRef = useRef<Map<string, Blob>>(new Map());
  const [exportPreviewCurrentTime, setExportPreviewCurrentTime] = useState(0);
  const [exportPreviewDuration, setExportPreviewDuration] = useState(0);
  const [isExportPreviewPlaying, setIsExportPreviewPlaying] = useState(false);
  const hasQueuedUrlAutoPlayRef = useRef(Boolean(urlBase64Bootstrap.text));
  const hasStartedUrlAutoPlayRef = useRef(false);

  const shouldSuppressNextVoiceMigrationWarning = (
    hasPendingVoiceMigrationNormalization && !hasCompletedVoiceMigration
  );

  const filteredVoices = availableVoices;

  const playbackData = useMemo(() => {
    return {
      playbackSegments: ingested.document.segments.map((segment) => ({ id: segment.id, text: segment.text })),
      seekAnchors: ingested.document.segments.map((segment, index) => ({
        segmentId: segment.id,
        playbackSegmentIndex: index,
        playbackCharOffset: 0,
      })),
    };
  }, [ingested.document.segments]);

  const documentFingerprint = useMemo(
    () => buildDocumentFingerprint(ingested.document.segments),
    [ingested.document.segments],
  );
  const playerPersistKey = useMemo(
    () => `reader-player-cursor:${documentFingerprint}`,
    [documentFingerprint],
  );

  const player = usePlayerController({
    provider,
    segments: playbackData.playbackSegments,
    seekAnchors: playbackData.seekAnchors,
    synthesisOptions: { voice, rate },
    persistKey: playerPersistKey,
  });

  const clearFullAudioBuild = useCallback(() => {
    setFullAudioBuild((current) => {
      if (current.audioUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(current.audioUrl);
      }
      return {
        status: 'idle',
        builtSegments: 0,
        totalSegments: 0,
        error: null,
        failedSegmentId: null,
        failedSegmentIndex: null,
        audioUrl: null,
        fileName: `playback.${exportFormat}`,
      };
    });
    fullAudioSegmentCacheRef.current.clear();
    setPlaybackSource('stream');
    setExportPreviewCurrentTime(0);
    setExportPreviewDuration(0);
    setIsExportPreviewPlaying(false);
  }, [exportFormat]);

  const formatTime = useCallback((seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return '0:00';
    }
    const clampedSeconds = Math.floor(seconds);
    const mins = Math.floor(clampedSeconds / 60);
    const secs = clampedSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const syncExportPreviewStateFromAudio = useCallback((audioElement: HTMLAudioElement) => {
    const duration = Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
    const endedTime = duration > 0 ? duration : audioElement.currentTime || 0;
    setExportPreviewCurrentTime(audioElement.ended ? endedTime : (audioElement.currentTime || 0));
    setExportPreviewDuration(duration);
    setIsExportPreviewPlaying(!audioElement.paused && !audioElement.ended);
  }, []);

  const playExportedAudio = useCallback(() => {
    const audioElement = fullAudioElementRef.current;
    if (!audioElement) {
      return;
    }

    const duration = Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
    const isReplayAtEnd = audioElement.ended
      || (duration > 0 && audioElement.currentTime >= Math.max(0, duration - AUDIO_REPLAY_EPSILON_SECONDS));
    if (isReplayAtEnd) {
      audioElement.currentTime = 0;
      syncExportPreviewStateFromAudio(audioElement);
    }

    void audioElement.play().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setFullAudioBuild((current) => ({
        ...current,
        status: 'error',
        error: `Exported audio playback failed: ${message}`,
      }));
    });
  }, [syncExportPreviewStateFromAudio]);

  const buildFullAudio = useCallback(async (retryFromSegmentId?: string) => {
    if (!playbackData.playbackSegments.length) {
      setFullAudioBuild({
        status: 'error',
        builtSegments: 0,
        totalSegments: 0,
        error: 'No segments available to synthesize.',
        failedSegmentId: null,
        failedSegmentIndex: null,
        audioUrl: null,
        fileName: `playback.${exportFormat}`,
      });
      return null;
    }

    const totalSegments = playbackData.playbackSegments.length;
    const resolvedRetryIndex = retryFromSegmentId
      ? playbackData.playbackSegments.findIndex((segment) => segment.id === retryFromSegmentId)
      : -1;
    const retryStartIndex = resolvedRetryIndex >= 0 ? resolvedRetryIndex : 0;
    if (!retryFromSegmentId) {
      clearFullAudioBuild();
    } else {
      setFullAudioBuild((current) => {
        if (current.audioUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(current.audioUrl);
        }
        return {
          ...current,
          audioUrl: null,
        };
      });
      setPlaybackSource('stream');
      setExportPreviewCurrentTime(0);
      setExportPreviewDuration(0);
      setIsExportPreviewPlaying(false);
    }

    setFullAudioBuild({
      status: 'building',
      builtSegments: retryStartIndex,
      totalSegments,
      error: null,
      failedSegmentId: null,
      failedSegmentIndex: null,
      audioUrl: null,
      fileName: `${toFileNameStem(ingested.title)}.${exportFormat}`,
    });

    let builtSegmentsCount = retryStartIndex;
    try {
      const blobs: Blob[] = [];
      for (let index = 0; index < retryStartIndex; index += 1) {
        const cachedBlob = fullAudioSegmentCacheRef.current.get(playbackData.playbackSegments[index].id);
        if (!cachedBlob) {
          throw new Error(`Retry cache miss for segment ${index + 1}. Please rebuild from the start.`);
        }
        blobs.push(cachedBlob);
      }

      for (let index = 0; index < totalSegments; index += 1) {
        const segment = playbackData.playbackSegments[index];
        if (index < retryStartIndex) {
          continue;
        }

        const synthStartedAt = perfTelemetry.now();
        const result = await synthesizeWithValidation({
          provider,
          segment,
          synthesisOptions: { voice, rate },
          maxAttempts: SYNTHESIS_RETRY_MAX_ATTEMPTS,
          backoffBaseMs: SYNTHESIS_RETRY_BACKOFF_BASE_MS,
          maxSplitDepth: SYNTHESIS_MAX_SPLIT_DEPTH,
          onRetry: ({ segmentId, attempt, maxAttempts, splitDepth, reason }) => {
            perfTelemetry.sink.log({
              type: 'tts.segment_retry',
              segmentId,
              attempt,
              maxAttempts,
              splitDepth,
              reason,
            });
          },
          onRegenerated: ({ segmentId, splitDepth, chunkCount }) => {
            perfTelemetry.sink.log({
              type: 'tts.segment_regenerated',
              segmentId,
              splitDepth,
              chunkCount,
            });
          },
          onRuntimeDowngrade: ({ segmentId, reason }) => {
            perfTelemetry.sink.log({
              type: 'tts.runtime_downgrade',
              transition: 'webgpu->wasm',
              reason,
              triggerCategory: 'validation',
              segmentId,
            });
          },
        });
        if (!('blob' in result)) {
          setFullAudioBuild((current) => ({
            ...current,
            status: 'error',
            error: 'Current voice/runtime only supports live native speech playback. Try a Kokoro voice for downloadable audio.',
            failedSegmentId: segment.id,
            failedSegmentIndex: index,
          }));
          perfTelemetry.sink.log({
            type: 'tts.export_build_outcome',
            status: 'failure',
            reason: 'native-spoken-only',
            segmentId: segment.id,
          });
          return null;
        }
        blobs.push(result.blob);
        fullAudioSegmentCacheRef.current.set(segment.id, result.blob);
        perfTelemetry.sink.log({
          type: 'tts.segment_synth',
          segmentId: segment.id,
          durationMs: Math.round(perfTelemetry.now() - synthStartedAt),
        });
        setFullAudioBuild((current) => ({
          ...current,
          builtSegments: index + 1,
        }));
        builtSegmentsCount = index + 1;
      }

      if (!blobs.length) {
        setFullAudioBuild((current) => ({
          ...current,
          status: 'error',
          error: 'Synthesis returned empty audio content.',
          failedSegmentId: null,
          failedSegmentIndex: null,
        }));
        perfTelemetry.sink.log({
          type: 'tts.export_build_outcome',
          status: 'failure',
          reason: 'empty-audio',
        });
        return null;
      }

      const { blob: exportedBlob, warning: exportWarning } = await buildFullAudioExport(blobs, exportFormat);

      const audioUrl = URL.createObjectURL(exportedBlob);
      setFullAudioBuild((current) => ({
        ...current,
        status: 'ready',
        audioUrl,
        builtSegments: totalSegments,
        fileName: `${toFileNameStem(ingested.title)}.${exportedBlob.type === 'audio/mpeg' ? 'mp3' : 'wav'}`,
        error: exportWarning,
        failedSegmentId: null,
        failedSegmentIndex: null,
      }));
      perfTelemetry.sink.log({
        type: 'tts.export_build_outcome',
        status: 'success',
        reason: exportWarning ? 'success-with-warning' : 'success',
      });
      return audioUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedIndex = builtSegmentsCount < totalSegments
        ? Math.max(0, Math.min(playbackData.playbackSegments.length - 1, builtSegmentsCount))
        : null;
      const failedSegment = failedIndex == null ? null : playbackData.playbackSegments[failedIndex];
      setFullAudioBuild((current) => ({
        ...current,
        status: 'error',
        error: failedSegment
          ? `Build failed at segment ${failedIndex! + 1}/${totalSegments} (${failedSegment.id}): ${message}`
          : `Build failed during export: ${message}`,
        failedSegmentId: failedSegment?.id ?? null,
        failedSegmentIndex: failedSegment ? failedIndex : null,
      }));
      perfTelemetry.sink.log({
        type: 'tts.export_build_outcome',
        status: 'failure',
        reason: message,
        segmentId: failedSegment?.id,
      });
      return null;
    }
  }, [clearFullAudioBuild, exportFormat, ingested.title, playbackData.playbackSegments, provider, rate, voice]);

  useEffect(() => {
    setupLocalDebugPerfTelemetry();
  }, []);

  useEffect(() => {
    setMp3Capability(probeMp3EncodingCapability());
  }, []);

  useEffect(() => {
    clearFullAudioBuild();
  }, [clearFullAudioBuild, provider, playbackData.playbackSegments, rate, voice]);

  useEffect(() => {
    const audioElement = fullAudioElementRef.current;
    if (!audioElement) {
      return undefined;
    }

    const syncPreviewState = () => {
      syncExportPreviewStateFromAudio(audioElement);
    };

    syncPreviewState();
    audioElement.addEventListener('timeupdate', syncPreviewState);
    audioElement.addEventListener('loadedmetadata', syncPreviewState);
    audioElement.addEventListener('play', syncPreviewState);
    audioElement.addEventListener('pause', syncPreviewState);
    audioElement.addEventListener('ended', syncPreviewState);

    return () => {
      audioElement.removeEventListener('timeupdate', syncPreviewState);
      audioElement.removeEventListener('loadedmetadata', syncPreviewState);
      audioElement.removeEventListener('play', syncPreviewState);
      audioElement.removeEventListener('pause', syncPreviewState);
      audioElement.removeEventListener('ended', syncPreviewState);
    };
  }, [fullAudioBuild.audioUrl, syncExportPreviewStateFromAudio]);

  useEffect(() => {
    return () => {
      setFullAudioBuild((current) => {
        if (current.audioUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(current.audioUrl);
        }
        return current;
      });
    };
  }, []);

  useEffect(() => {
    const previousSink = perfTelemetry.sink;
    perfTelemetry.sink = {
      log: (event) => {
        if (event.type === 'tts.first_audio') {
          setFirstAudioTimingMs((currentTiming) => currentTiming ?? event.durationMs);
        }

        const perfDebugEntry = classifyPerfDebugEvent(event);
        if (perfDebugEntry?.category === 'runtime-warning') {
          setRuntimeWarnings((currentEntries) => [...currentEntries.slice(-19), perfDebugEntry]);
        } else if (perfDebugEntry?.category === 'fatal-playback-blocker') {
          setFatalPlaybackBlockers((currentEntries) => [...currentEntries.slice(-19), perfDebugEntry]);
        }

        previousSink.log(event);
      },
    };

    return () => {
      perfTelemetry.sink = previousSink;
    };
  }, []);

  const initializeProvider = useCallback(async (activeCheck: () => boolean) => {
    const skipKokoroInit = isPagesStyleBase && shouldSkipKokoroInitOnPages;

    const selectedProvider = await selectTTSProvider({
      preferredDevice: 'webgpu',
      allowWebGpuIfUnstable: true,
      skipWebGpuQualityCheck: true,
      kokoro: selectedKokoroDtype === 'auto' ? undefined : { dtype: selectedKokoroDtype },
      skipKokoroInit,
      skipKokoroInitReason: skipKokoroInit
        ? 'GitHub Pages MVP mode: Kokoro init skipped intentionally while bundling is being finalized.'
        : undefined,
    });
  
    const providerName = selectedProvider.providerType;
  
    // ────── REST OF YOUR ORIGINAL CODE STARTS HERE ──────
    const kokoroPackageLoadable = await emitDevKokoroImportCheck();
  
    if (activeCheck()) {
      setTtsInitStatusLine({
        providerSelected: providerName,
        runtime: selectedProvider.runtime,
        dtype: selectedProvider.dtype,
        skipKokoroInit,
        kokoroImportable: kokoroPackageLoadable,
        fallbackCode: selectedProvider.fallbackError?.code ?? 'none',
      });
    }
  
    if (activeCheck()) {
      setForceWebGpuRetry(false);
    }
  
    if (import.meta.env.DEV) {
      const fallbackSummary = getFallbackReasonAndHint(selectedProvider.fallbackError);
      const diagnostics: DevTtsDiagnostics = {
        kokoroPackageLoadable,
        mp3Preflight: probeMp3EncodingCapability(),
        webgpuSupported: await checkWebGpuSupport(),
        deviceMemoryGb: getDeviceMemoryGb(),
        forcedDeviceOverride: getDevDeviceOverride() ?? 'none',   // safe here
        selectedProvider: providerName,
        selectedDtype: selectedProvider.dtype,
        fallbackCode: selectedProvider.fallbackError?.code,
        fallbackReason: fallbackSummary.reason,
        fallbackHint: fallbackSummary.hint,
      };
      console.info('[DEV][TTS_INIT_DIAGNOSTICS]', diagnostics);
      if (activeCheck()) {
        setDevTtsDiagnostics(diagnostics);
      }
    }
  
    if (activeCheck()) {
      setProvider(selectedProvider.provider);
      setProviderLabel(providerName);
      setProviderRuntimeMetadata({
        providerType: selectedProvider.providerType,
        runtime: selectedProvider.runtime,
        dtype: selectedProvider.dtype,
        runtimeReason: selectedProvider.runtimeReason,
        webGpuAvoidance: selectedProvider.webGpuAvoidance,
        fallbackToWebSpeech: selectedProvider.fallbackToWebSpeech,
        fallbackError: selectedProvider.fallbackError,
      });
  
      if (providerName === 'kokoro') {
        setVoice((currentVoice) => normalizeKokoroVoiceId(currentVoice));
      }
  
      setShowFallbackBanner(selectedProvider.fallbackToWebSpeech && !selectedProvider.fallbackIntentional);
      setShowInformationalFallbackBanner(Boolean(selectedProvider.fallbackIntentional));
      setProviderFallbackError(selectedProvider.fallbackError ?? null);
    }
  }, [forceWebGpuRetry, selectedKokoroDtype, shouldSkipKokoroInitOnPages]);   // keep your existing deps or update if needed

  useEffect(() => {
    let active = true;

    void initializeProvider(() => active);

    return () => {
      active = false;
    };
  }, [initializeProvider, providerInitNonce]);

  const retryWebGpuForCurrentProfile = useCallback(() => {
    clearWebGpuUnstableProfileForCurrentBrowser();
    setForceWebGpuRetry(true);
    setProviderInitNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const payload: StoredTtsPreferences = {
      voice,
      rate,
      provider: providerLabel,
    };

    window.localStorage.setItem(TTS_PREFS_STORAGE_KEY, JSON.stringify(payload));
  }, [providerLabel, rate, voice]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(TTS_DTYPE_STORAGE_KEY, selectedKokoroDtype);
  }, [selectedKokoroDtype]);

  useEffect(() => {
    let active = true;

    const ensureVoiceAvailable = async () => {
      if (active) {
        setIsVoiceReadyForPlayback(false);
        setVoiceReadinessHelperText('Loading voices…');
      }

      try {
        const voices = await provider.listVoices();
        if (!active) {
          return;
        }

        setAvailableVoices(voices);

        if (voices.length === 0) {
          setVoiceFallbackWarning('No voices were returned by the active provider.');
          setVoiceReadinessHelperText('Select a valid voice.');
          return;
        }

        const selectedVoice = voice;
        const normalizedSelectedVoice = providerLabel === 'kokoro'
          ? normalizeKokoroVoiceId(selectedVoice)
          : selectedVoice;
        const fallbackVoices = voices;
        const isSelectedVoiceAvailable = fallbackVoices.some((providerVoice) => providerVoice.id === normalizedSelectedVoice);
        if (isSelectedVoiceAvailable) {
          if (normalizedSelectedVoice !== selectedVoice) {
            setVoice(normalizedSelectedVoice);
          }
          setVoiceReadinessHelperText(null);
          setVoiceFallbackWarning(null);
          setIsVoiceReadyForPlayback(true);
          return;
        }

        const fallbackVoice = providerLabel === 'kokoro'
          ? getDefaultKokoroVoice(fallbackVoices) ?? fallbackVoices[0]
          : fallbackVoices[0];
        setVoiceReadinessHelperText('Select a valid voice.');
        setVoice(fallbackVoice.id);
        if (typeof window !== 'undefined') {
          const normalizedPreferences: StoredTtsPreferences = {
            voice: fallbackVoice.id,
            provider: providerLabel,
            rate,
          };
          window.localStorage.setItem(TTS_PREFS_STORAGE_KEY, JSON.stringify(normalizedPreferences));
        }
        const suppressWarning = providerLabel === 'kokoro' && shouldSuppressNextVoiceMigrationWarning;
        if (suppressWarning) {
          setVoiceFallbackWarning(null);
          setHasPendingVoiceMigrationNormalization(false);
          if (!hasCompletedVoiceMigration) {
            setVoiceMigrationInfo('Voice preference migrated to Kokoro default.');
            persistVoiceMigrationDone();
            setHasCompletedVoiceMigration(true);
          }
        } else {
          setVoiceMigrationInfo(null);
          setVoiceFallbackWarning(
            selectedVoice
              ? `Selected voice "${selectedVoice}" is unavailable for ${providerLabel}; switched to "${fallbackVoice.name}".`
              : `No voice selected for ${providerLabel}; switched to "${fallbackVoice.name}".`,
          );
        }
      } catch {
        if (active) {
          setAvailableVoices([]);
          setVoiceFallbackWarning('Unable to validate voices for the active provider.');
          setVoiceReadinessHelperText('Select a valid voice.');
        }
      }
    };

    void ensureVoiceAvailable();

    return () => {
      active = false;
    };
  }, [
    hasCompletedVoiceMigration,
    hasPendingVoiceMigrationNormalization,
    provider,
    providerLabel,
    voice,
  ]);

  useEffect(() => {
    let active = true;

    const toIngestedState = (
      source: DocumentSource,
      normalized: NormalizedDocument,
      warnings: DocumentWarning[] = [],
    ): IngestedState => ({
      title: normalized.title || 'Untitled Source',
      source,
      document: normalized,
      warnings,
    });

    const runIngest = async () => {
      try {
        const nextModel = sourceType === 'text'
          ? toIngestedState({ type: 'text', value: textInput }, await ingestInput({ type: 'paste', payload: textInput }))
          : sourceType === 'url' && isUrlIngestEnabled
            ? toIngestedState(
              { type: 'url', value: urlInput },
              await ingestInput({ type: 'url', payload: urlInput }),
              [{ code: 'URL_INGEST_MODE', message: 'URL ingestion uses backend extraction.', severity: 'info' }],
            )
            : selectedFile
              ? toIngestedState(
                { type: 'file', value: selectedFile.name, name: selectedFile.name },
                await ingestInput({ type: 'file', payload: selectedFile }),
              )
              : toIngestedState({ type: 'file', value: '' }, await ingestInput({ type: 'paste', payload: '' }));

        if (active) {
          setIngested(nextModel);
        }
      } catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : 'Unknown ingestion error.';
          setIngested({
            title: 'Ingestion failed',
            source: sourceType === 'url'
              ? { type: 'url', value: urlInput }
              : sourceType === 'file'
                ? { type: 'file', value: selectedFile?.name ?? '', name: selectedFile?.name }
                : { type: 'text', value: textInput },
            document: { title: 'Ingestion failed', segments: [] },
            warnings: [{ code: 'INGEST_ERROR', message, severity: 'error' }],
          });
        }
      }
    };

    void runIngest();

    return () => {
      active = false;
    };
  }, [selectedFile, sourceType, textInput, urlInput]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setSelectedFileName('');
      return;
    }

    setSelectedFile(file);
    setSelectedFileName(file.name);
    setSourceType('file');
  };

  useEffect(() => {
    if (!hasQueuedUrlAutoPlayRef.current || hasStartedUrlAutoPlayRef.current) {
      return;
    }
    if (!isVoiceReadyForPlayback || player.state === 'loading' || player.state === 'playing') {
      return;
    }
    if (sourceType !== 'text' || ingested.document.segments.length === 0) {
      return;
    }

    hasStartedUrlAutoPlayRef.current = true;
    void player.seekSegment(0, 0);
  }, [ingested.document.segments.length, isVoiceReadyForPlayback, player.seekSegment, player.state, sourceType]);

  const runtimeStatus = useMemo(() => {
    if (providerRuntimeMetadata.providerType === 'web-speech') {
      return {
        label: 'Web Speech (System TTS)',
        colorClassName: 'border-amber-600/70 bg-amber-500/15 text-amber-200',
      };
    }

    if (providerRuntimeMetadata.runtime === 'webgpu') {
      return {
        label: 'Kokoro • WebGPU',
        colorClassName: 'border-emerald-600/70 bg-emerald-500/15 text-emerald-200',
      };
    }

    return {
      label: 'Kokoro • WASM',
      colorClassName: 'border-emerald-600/70 bg-emerald-500/10 text-emerald-200',
    };
  }, [providerRuntimeMetadata.providerType, providerRuntimeMetadata.runtime]);

  const runtimeSummary = useMemo(() => {
    if (providerRuntimeMetadata.providerType === 'web-speech') {
      return 'System';
    }

    return providerRuntimeMetadata.runtime === 'webgpu' ? 'GPU' : 'CPU';
  }, [providerRuntimeMetadata.providerType, providerRuntimeMetadata.runtime]);

  const shouldShowAdvancedDetails = !isProduction || showDetails;
  const isKokoroInitIntentionallySkippedForPages = isPagesStyleBase && shouldSkipKokoroInitOnPages;

  return (
    <main className="w-full p-2 font-mono text-emerald-100 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">TTS Reader MVP</h1>
        <p className="mt-2 text-sm text-emerald-300/70">
          Scaffold for source ingestion, normalization preview, and spoken playback.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-emerald-200/90">
          <span>Runtime: <span className="font-semibold">{runtimeSummary}</span></span>
          <span>Model: <span className="font-semibold">onnx-community/Kokoro-82M-ONNX</span></span>
          <span>Voice: <span className="font-semibold">{voice || 'pending'}</span></span>
          {firstAudioTimingMs !== null ? (
            <span>First audio: <span className="font-semibold">{firstAudioTimingMs}ms</span></span>
          ) : null}
        </p>
        {isProduction ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-emerald-500/40 bg-[#07110a] px-2 py-1 text-xs text-emerald-100 hover:border-emerald-300/70"
              onClick={() => setShowDetails((current) => !current)}
            >
              {showDetails ? 'Hide Details' : 'Details'}
            </button>
            <button
              type="button"
              className="rounded-md border border-emerald-500/40 bg-[#07110a] px-2 py-1 text-xs text-emerald-100 hover:border-emerald-300/70"
              onClick={() => setShowModelLicenseInfo((current) => !current)}
            >
              {showModelLicenseInfo ? 'Hide License Info' : 'Show License Info'}
            </button>
            <button
              type="button"
              className="rounded-md border border-emerald-500/40 bg-[#07110a] px-2 py-1 text-xs text-emerald-100 hover:border-emerald-300/70"
              onClick={() => setShowUrlBase64Help((current) => !current)}
            >
              {showUrlBase64Help ? 'Hide URL Input Help' : 'URL Input Help'}
            </button>
          </div>
        ) : null}
        {showUrlBase64Help ? (
          <div className="mt-2 rounded-md border border-emerald-500/45 bg-[#07110a] px-3 py-2 text-xs text-emerald-200/90">
            <p className="font-semibold text-emerald-100">Base64 URL input</p>
            <p className="mt-1">
              Pass base64-encoded text in the query string using <code>?text64=</code>, <code>?b64=</code>, or <code>?text_base64=</code>.
            </p>
            <p className="mt-1">
              Example: <code>/tools/momoro-reader?b64=&lt;base64text&gt;</code>
            </p>
            <p className="mt-1">
              When present, the app decodes the text, loads it into the paste field, and starts playback automatically using the current default voice/rate settings.
            </p>
          </div>
        ) : null}
        {urlBase64Bootstrap.paramKey ? (
          <p className="mt-2 text-xs text-emerald-300/80">
            Loaded base64 text from URL parameter <code>{urlBase64Bootstrap.paramKey}</code>.
          </p>
        ) : null}
        {urlBase64Bootstrap.error ? (
          <p className="mt-2 rounded border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-200">
            {urlBase64Bootstrap.error}
          </p>
        ) : null}
        {shouldShowAdvancedDetails ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-200/90">
          <span>
            Active voice provider: <span className="font-semibold">{providerRuntimeMetadata.providerType}</span>
          </span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${runtimeStatus.colorClassName}`}>
            Runtime: {runtimeStatus.label}
          </span>
          <span>dtype={providerRuntimeMetadata.dtype}</span>
          <span>fallbackToWebSpeech={String(providerRuntimeMetadata.fallbackToWebSpeech)}</span>
          </p>
        ) : null}
        {shouldShowAdvancedDetails ? (
          <p className="mt-2 text-xs text-emerald-300/70">
            tts init: providerSelected={ttsInitStatusLine?.providerSelected ?? 'pending'} · runtime={ttsInitStatusLine?.runtime ?? 'pending'} · dtype={ttsInitStatusLine?.dtype ?? 'pending'} · skipKokoroInit={String(ttsInitStatusLine?.skipKokoroInit ?? false)} · {SKIP_KOKORO_INIT_ON_PAGES_ENV_FLAG}={skipKokoroInitOnPagesEnvValue ?? 'undefined'} · kokoroImportable={ttsInitStatusLine ? String(ttsInitStatusLine.kokoroImportable) : 'pending'} · fallbackCode={ttsInitStatusLine?.fallbackCode ?? 'pending'} · mp3Ready={mp3Capability ? String(mp3Capability.available) : 'pending'}
          </p>
        ) : null}
      </header>

      {isKokoroInitIntentionallySkippedForPages ? (
        <div className="mb-4 rounded-md border border-emerald-500/45 bg-[#07110a] px-3 py-2 text-sm text-emerald-100">
          Kokoro init is intentionally skipped for Pages mode. {SKIP_KOKORO_INIT_ON_PAGES_ENV_FLAG}={skipKokoroInitOnPagesEnvValue ?? 'undefined'}.
          <p className="mt-1 text-xs text-emerald-300/80">
            This is an intentional configuration choice, not a GPU failure.
          </p>
        </div>
      ) : null}

      {showFallbackBanner ? (
        <div className="mb-4 rounded-md border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Running in fallback voice mode after Kokoro/WebGPU initialization failed ({getFallbackBucketLabel(providerFallbackError, false)}).
          {providerFallbackError ? (
            <>
              <p className="mt-1 text-xs text-amber-300">
                {providerFallbackError.code}: {providerFallbackError.message}
              </p>
              {providerFallbackError.code === 'KOKORO_MODULE_RESOLUTION_FAILED' ? (
                <p className="mt-1 text-xs font-semibold text-amber-100">
                  Install/ship kokoro-js correctly or use Web Speech fallback intentionally.
                </p>
              ) : null}
              {import.meta.env.DEV && providerFallbackError.hints?.length ? (
                <ul className="mt-1 list-disc pl-5 text-xs text-amber-300">
                  {providerFallbackError.hints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {providerRuntimeMetadata.providerType === 'kokoro' && providerRuntimeMetadata.runtimeReason ? (
        <div className="mb-4 rounded-md border border-emerald-500/50 bg-[#07110a] px-3 py-2 text-sm text-emerald-100">
          <p>Runtime note: {providerRuntimeMetadata.runtimeReason}</p>
          {providerRuntimeMetadata.webGpuAvoidance?.reason === 'unstable_profile' ? (
            <>
              <p className="mt-1 text-xs text-emerald-300/80">
                Profile marked unstable at:{' '}
                <span className="font-semibold">
                  {providerRuntimeMetadata.webGpuAvoidance.profileMarkedAt ?? 'unknown'}
                </span>
              </p>
              <button
                type="button"
                className="mt-2 rounded-md border border-emerald-400/70 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100 hover:border-emerald-300"
                onClick={retryWebGpuForCurrentProfile}
              >
                Clear unstable profile + retry WebGPU
              </button>
            </>
          ) : null}
          {providerRuntimeMetadata.webGpuAvoidance?.reason !== 'unstable_profile' && providerRuntimeMetadata.runtimeReason.includes('marked unstable') ? (
            <button
              type="button"
              className="mt-2 rounded-md border border-emerald-400/70 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100 hover:border-emerald-300"
              onClick={retryWebGpuForCurrentProfile}
            >
              Retry WebGPU for this browser profile
            </button>
          ) : null}
          {providerRuntimeMetadata.webGpuAvoidance?.reason ? (
            <p className="mt-1 text-xs text-emerald-300/80">
              WebGPU avoid reason code: <span className="font-semibold">{providerRuntimeMetadata.webGpuAvoidance.reason}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {voiceFallbackWarning ? (
        <div className="mb-4 rounded-md border border-amber-600 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          {voiceFallbackWarning}
        </div>
      ) : null}

      {voiceMigrationInfo ? (
        <div className="mb-4 rounded-md border border-emerald-500/45 bg-[#07110a] px-3 py-2 text-sm text-emerald-100">
          {voiceMigrationInfo}
        </div>
      ) : null}

      {!isVoiceReadyForPlayback ? (
        <div className="mb-4 rounded-md border border-emerald-500/45 bg-[#07110a] px-3 py-2 text-sm text-emerald-100">
          Preparing voices for the active provider. Playback will be enabled once voice validation completes.
        </div>
      ) : null}

      {showInformationalFallbackBanner ? (
        <div className="mb-4 rounded-md border border-emerald-500/45 bg-[#07110a] px-3 py-2 text-sm text-emerald-100">
          Web Speech mode ({getFallbackBucketLabel(providerFallbackError, true)}): intentionally enabled for GitHub Pages MVP while Kokoro bundling is finalized (not a runtime GPU failure).
          {providerFallbackError?.message ? (
            <p className="mt-1 text-xs text-emerald-300/80">{providerFallbackError.message}</p>
          ) : null}
        </div>
      ) : null}

      {import.meta.env.DEV && devTtsDiagnostics ? (
        <aside className="mb-4 rounded-md border border-cyan-700 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-100">
          <p className="font-semibold">DEV TTS init diagnostics</p>
          <ul className="mt-1 list-disc pl-5">
            <li>kokoroPackageLoadable: {String(devTtsDiagnostics.kokoroPackageLoadable)}</li>
            <li>webgpuSupported: {String(devTtsDiagnostics.webgpuSupported)}</li>
            <li>deviceMemoryGb: {devTtsDiagnostics.deviceMemoryGb ?? 'unknown'}</li>
            <li>forcedDeviceOverride: {devTtsDiagnostics.forcedDeviceOverride}</li>
            <li>selectedProvider: {devTtsDiagnostics.selectedProvider}</li>
            <li>selectedDtype: {devTtsDiagnostics.selectedDtype}</li>
            <li>fallbackCode: {devTtsDiagnostics.fallbackCode ?? 'none'}</li>
            <li>fallbackReason: {devTtsDiagnostics.fallbackReason ?? 'none'}</li>
            <li>fallbackHint: {devTtsDiagnostics.fallbackHint ?? 'none'}</li>
            <li>mp3Preflight.available: {String(devTtsDiagnostics.mp3Preflight.available)}</li>
            <li>mp3Preflight.code: {devTtsDiagnostics.mp3Preflight.code}</li>
            <li>mp3Preflight.reason: {devTtsDiagnostics.mp3Preflight.reason}</li>
            <li>mp3Preflight.detail: {devTtsDiagnostics.mp3Preflight.technicalDetail ?? 'none'}</li>
          </ul>
        </aside>
      ) : null}

      {import.meta.env.DEV ? (
        <aside className="mb-4 rounded-md border border-indigo-700 bg-indigo-950/30 px-3 py-2 text-xs text-indigo-100">
          <p className="font-semibold">Perf/debug panel</p>
          <p className="mt-1 text-indigo-200">
            Runtime warnings (WebGPU/ORT) are informational. Fatal playback blockers are shown separately.
          </p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <p className="font-medium text-indigo-100">Informational runtime warnings ({runtimeWarnings.length})</p>
              {runtimeWarnings.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {runtimeWarnings.map((entry, index) => (
                    <li key={`${entry.message}-${entry.segmentId ?? 'none'}-${index}`}>
                      {entry.message}
                      {entry.segmentId ? ` (segment: ${entry.segmentId})` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-indigo-300">None captured.</p>
              )}
            </div>
            <div>
              <p className="font-medium text-rose-200">Fatal playback blockers ({fatalPlaybackBlockers.length})</p>
              {fatalPlaybackBlockers.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-rose-100">
                  {fatalPlaybackBlockers.map((entry, index) => (
                    <li key={`${entry.message}-${entry.segmentId ?? 'none'}-${index}`}>
                      {entry.message}
                      {entry.segmentId ? ` (segment: ${entry.segmentId})` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-indigo-300">None captured.</p>
              )}
            </div>
          </div>
        </aside>
      ) : null}


      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-emerald-500/35 bg-[#07110a] p-4 shadow-lg shadow-black/20">
          <h2 className="text-lg font-semibold">Input panel</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {sourceTabs.map((type) => (
              <button
                key={type}
                type="button"
                className={`rounded-md border px-3 py-1.5 text-sm capitalize transition ${
                  sourceType === type
                    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100'
                    : 'border-emerald-500/30 text-emerald-200/80 hover:border-emerald-300/60'
                }`}
                onClick={() => setSourceType(type)}
              >
                {type}
              </button>
            ))}
          </div>

          {!isUrlIngestEnabled ? (
            <p className="mt-3 rounded border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-200">
              URL reading requires backend extractor; paste/upload still available.
            </p>
          ) : null}

          <label className="mt-4 block text-sm text-emerald-200/90">
            Paste text
            <textarea
              className="mt-1 h-40 w-full rounded-md border border-emerald-500/30 bg-[#0a160f] p-2 text-emerald-100"
              value={textInput}
              onChange={(event) => {
                setTextInput(event.target.value);
                setSourceType('text');
              }}
            />
          </label>

          <label className="mt-3 block text-sm text-emerald-200/90">
            Upload file
            <input
              className="mt-1 block w-full rounded-md border border-emerald-500/30 bg-[#0a160f] p-2 text-emerald-100"
              type="file"
              onChange={onFileChange}
            />
            {selectedFileName ? <span className="mt-1 block text-xs text-emerald-300/70">Selected: {selectedFileName}</span> : null}
          </label>

          {isUrlIngestEnabled ? (
            <label className="mt-3 block text-sm text-emerald-200/90">
              Source URL
              <input
                className="mt-1 w-full rounded-md border border-emerald-500/30 bg-[#0a160f] p-2 text-emerald-100"
                type="url"
                placeholder="https://example.com/article"
                value={urlInput}
                onChange={(event) => {
                  setUrlInput(event.target.value);
                  setSourceType('url');
                }}
              />
            </label>
          ) : null}
        </article>

        <article className="rounded-xl border border-emerald-500/35 bg-[#07110a] p-4 shadow-lg shadow-black/20">
          <h2 className="text-lg font-semibold">Preview panel</h2>
          <p className="mt-2 text-sm text-emerald-300/70">Normalized content is ready for preview.</p>
          <PreviewPanel
            segments={ingested.document.segments}
            currentSegmentIndex={player.currentSegmentIndex}
            isContinuousMode={sourceType === 'text' || ingested.document.segments.some((segment) => segment.kind === 'markdown')}
          />
          <div className="mt-2 space-y-2">
            {ingested.warnings.map((warning) => (
              <p key={warning.code} className="rounded border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-200">
                {warning.message}
              </p>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-emerald-500/35 bg-[#07110a] p-4 shadow-lg shadow-black/20">
          <h2 className="text-lg font-semibold">Playback panel</h2>
          <div className="space-y-3">
            <label className="block text-sm text-emerald-200/90">
              Kokoro dtype
              <select
                className="mt-1 w-full rounded-md border border-emerald-500/30 bg-[#0a160f] p-2 text-emerald-100"
                value={selectedKokoroDtype}
                onChange={(event) => {
                  const nextValue = event.target.value as KokoroDType | 'auto';
                  setSelectedKokoroDtype(nextValue);
                  setProviderInitNonce((current) => current + 1);
                }}
              >
                {KOKORO_DTYPE_OPTIONS.map((dtypeOption) => (
                  <option key={dtypeOption} value={dtypeOption}>{dtypeOption}</option>
                ))}
              </select>
            </label>
            <PlayerControls
              queueStatus={playbackSource === 'exported'
                ? (isExportPreviewPlaying ? 'playing' : 'idle')
                : player.state}
              currentSegmentIndex={playbackSource === 'exported' ? 0 : player.currentSegmentIndex}
              segmentCount={playbackData.playbackSegments.length}
              machineError={playbackSource === 'exported' ? null : player.error}
              machineHint={playbackSource === 'exported' ? null : player.hint}
              voice={voice}
              voices={filteredVoices}
              rate={rate}
              isVoiceReadyForPlayback={isVoiceReadyForPlayback}
              voiceReadinessHelperText={voiceReadinessHelperText}
              playDisabled={!isVoiceReadyForPlayback}
              progressLabel={playbackSource === 'exported' ? 'Export preview' : 'Progress'}
              progressTextOverride={playbackSource === 'exported'
                ? `${formatTime(exportPreviewCurrentTime)} / ${formatTime(exportPreviewDuration)}`
                : undefined}
              controlsHelperText={playbackSource === 'exported'
                ? 'Export preview mode is active. Controls now target the merged audio file.'
                : null}
              onPlay={() => {
                if (!isVoiceReadyForPlayback) {
                  setVoiceFallbackWarning(
                    'Playback is temporarily disabled while voice validation is still in progress.',
                  );
                  return;
                }
                if (playbackSource === 'exported') {
                  playExportedAudio();
                  return;
                }
                if (player.state === 'paused') {
                  void player.resume();
                  return;
                }
                if (player.state === 'error') {
                  void player.retryCurrentSegment();
                  return;
                }
                if (player.state === 'finished') {
                  void player.seekSegment(0, 0);
                  return;
                }
                if (player.state === 'playing' || player.state === 'loading') {
                  return;
                }
                void player.play();
              }}
              onPause={() => {
                if (playbackSource === 'exported') {
                  fullAudioElementRef.current?.pause();
                  return;
                }
                player.pause();
              }}
              onVoiceChange={setVoice}
              onRateChange={setRate}
              onManualRetry={() => {
                void player.retryCurrentSegment();
              }}
            />
            <div className="rounded-md border border-emerald-500/30 bg-[#0a160f] p-3 text-sm">
              <p className="font-semibold text-emerald-100">Full audio export</p>
              <p className="mt-1 text-xs text-emerald-300/80">
                Convert all normalized segments into one downloadable audio file before playback.
              </p>
              <label className="mt-2 flex items-center gap-2 text-xs text-emerald-200">
                <span className="font-medium text-emerald-100">Format</span>
                <select
                  className="rounded border border-emerald-500/40 bg-[#07110a] px-2 py-1 text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  onChange={(event) => {
                    setExportFormat(event.target.value as ExportFormat);
                  }}
                  value={exportFormat}
                >
                  <option value="wav">WAV</option>
                  <option value="mp3">MP3</option>
                </select>
              </label>
              {exportFormat === 'mp3' && mp3Capability && !mp3Capability.available ? (
                <p className="mt-1 text-xs text-amber-300/90">
                  MP3 may be unavailable in this browser/runtime and can fall back to WAV at build time.
                </p>
              ) : null}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-emerald-500/40 bg-[#07110a] px-2 py-1 text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!isVoiceReadyForPlayback || fullAudioBuild.status === 'building' || playbackData.playbackSegments.length === 0}
                  onClick={() => {
                    void buildFullAudio();
                  }}
                >
                  {fullAudioBuild.status === 'building' ? 'Building…' : 'Build Full Audio'}
                </button>
                {fullAudioBuild.audioUrl ? (
                  <>
                    <button
                      type="button"
                      className={`rounded-md border px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                        playbackSource === 'exported'
                          ? 'border-emerald-300 bg-emerald-500/20 text-emerald-100'
                          : 'border-emerald-500/40 bg-[#07110a] text-emerald-100'
                      }`}
                      onClick={() => {
                        if (playbackSource === 'exported') {
                          fullAudioElementRef.current?.pause();
                          setPlaybackSource('stream');
                          return;
                        }
                        setPlaybackSource('exported');
                      }}
                    >
                      {playbackSource === 'exported' ? 'Using export controls (switch to stream)' : 'Using stream controls (switch to export)'}
                    </button>
                    <a
                      className="rounded-md border border-emerald-500/40 bg-[#07110a] px-2 py-1 text-emerald-100 hover:border-emerald-300/70"
                      download={fullAudioBuild.fileName}
                      href={fullAudioBuild.audioUrl}
                    >
                      Download
                    </a>
                    <audio
                      ref={fullAudioElementRef}
                      className="sr-only"
                      onEnded={() => {
                        const audioElement = fullAudioElementRef.current;
                        if (!audioElement) {
                          return;
                        }
                        syncExportPreviewStateFromAudio(audioElement);
                      }}
                      preload="metadata"
                      src={fullAudioBuild.audioUrl}
                    />
                  </>
                ) : null}
              </div>
              <progress
                className="mt-2 h-2 w-full"
                max={Math.max(fullAudioBuild.totalSegments, 1)}
                value={fullAudioBuild.builtSegments}
              />
              <p className="mt-1 text-xs text-emerald-300/70">
                Build progress: {Math.round(
                  (fullAudioBuild.builtSegments / Math.max(fullAudioBuild.totalSegments || playbackData.playbackSegments.length, 1)) * 100,
                )}%
              </p>
              {fullAudioBuild.error ? (
                <div
                  className={`mt-2 rounded border p-2 text-xs ${fullAudioBuild.status === 'ready'
                    ? 'border-amber-600 bg-amber-950/40 text-amber-100'
                    : 'border-rose-700 bg-rose-950/40 text-rose-200'}`}
                >
                  <p>
                    {fullAudioBuild.status === 'ready' && fullAudioBuild.error.startsWith(MP3_FALLBACK_WARNING)
                      ? `Warning: ${fullAudioBuild.error}`
                      : fullAudioBuild.error}
                  </p>
                  {fullAudioBuild.status === 'error' && fullAudioBuild.failedSegmentId ? (
                    <button
                      type="button"
                      className="mt-2 rounded border border-rose-400/60 bg-rose-950/30 px-2 py-1 text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                      onClick={() => {
                        void buildFullAudio(fullAudioBuild.failedSegmentId ?? undefined);
                      }}
                    >
                      Retry from failed segment #{(fullAudioBuild.failedSegmentIndex ?? 0) + 1}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </article>
      </section>

      <footer className="mt-4 rounded-md border border-emerald-500/35 bg-[#07110a] p-3 text-xs text-emerald-200/85">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>Model/license attribution is available here (no blocking popup required).</p>
          <button
            type="button"
            className="rounded-md border border-emerald-500/40 bg-[#0a160f] px-2 py-1 text-xs text-emerald-100 hover:border-emerald-300/70"
            onClick={() => setShowModelLicenseInfo((current) => !current)}
          >
            {showModelLicenseInfo ? 'Hide Attribution' : 'Show Attribution'}
          </button>
        </div>
        {showModelLicenseInfo ? (
          <div className="mt-3 space-y-3">
            <p className="text-emerald-300/80">Loaded from <code>docs/licenses/tts-manifest.json</code>.</p>
            {ttsManifest.artifacts.map((artifact) => (
              <article key={artifact.id} className="rounded-md border border-emerald-500/30 bg-[#0a160f] p-3">
                <p><span className="font-semibold text-emerald-200">Package/model:</span> {artifact.packageOrModelName}</p>
                <p><span className="font-semibold text-emerald-200">Version/hash:</span> {artifact.versionOrHash}</p>
                <p><span className="font-semibold text-emerald-200">License:</span> {artifact.license}</p>
                <p>
                  <span className="font-semibold text-emerald-200">Source URL:</span>{' '}
                  <a className="text-emerald-300 underline hover:text-emerald-200" href={artifact.sourceUrl} rel="noreferrer" target="_blank">
                    {artifact.sourceUrl}
                  </a>
                </p>
                {artifact.attributionText ? (
                  <p><span className="font-semibold text-emerald-200">Attribution:</span> {artifact.attributionText}</p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </footer>
    </main>
  );
}

export default App;
