import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ttsManifest } from './licenses/ttsManifest';
import { ingestInput } from './features/ingest/urlAdapter';
import { PlayerControls } from './features/player/PlayerControls';
import type { NormalizedDocument, PlaybackMode, SpeakableSegment } from './domain/segments';
import { usePlayerController } from './features/player/playerMachine';
import { clearWebGpuUnstableProfileForCurrentBrowser, selectTTSProvider } from './tts/providerSelector';
import { perfTelemetry, setupLocalDebugPerfTelemetry } from './tts/perfTelemetry';
import { classifyPerfDebugEvent, type PerfDebugEntry } from './tts/perfDebugClassifier';
import type { TTSFallbackError } from './tts/errors';
import { canImportKokoroModule } from './tts/providers/kokoroProvider';
import { WebSpeechProvider } from './tts/providers/webSpeechProvider';
import type { KokoroDType, RuntimeDType, TTSProvider, TTSVoice } from './tts/types';
import { chunkSegmentsByPolicy, defaultChunkingPolicy } from './domain/chunking/policy';
import { concatAudioBlobs } from './tts/concatAudioBlobs';

type PlaybackAnchor = {
  segmentId: string;
  playbackSegmentIndex: number;
  playbackCharOffset: number;
};

function shouldDefaultContinuousMode(segments: SpeakableSegment[]): boolean {
  if (!segments.length) {
    return false;
  }

  return segments.every((segment) => segment.kind === 'text' || segment.kind === 'markdown');
}

function buildContinuousPlayback(segments: SpeakableSegment[]): {
  playbackSegments: Array<{ id: string; text: string }>;
  seekAnchors: PlaybackAnchor[];
} {
  const chunkedSegments = chunkSegmentsByPolicy(segments, defaultChunkingPolicy);
  const playbackSegments = chunkedSegments.map(({ id, text }) => ({ id, text }));

  const seekAnchors: PlaybackAnchor[] = [];

  chunkedSegments.forEach((chunk, playbackSegmentIndex) => {
    let runningOffset = 0;

    chunk.pieces.forEach((piece) => {
      seekAnchors.push({
        segmentId: piece.segmentId,
        playbackSegmentIndex,
        playbackCharOffset: runningOffset,
      });
      runningOffset += piece.text.length + defaultChunkingPolicy.prosodySpacing.length;
    });
  });

  return { playbackSegments, seekAnchors };
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
  audioUrl: string | null;
  fileName: string;
};
type PlaybackSource = 'stream' | 'exported';

const migrateStoredVoice = (voice: string): string => normalizeKokoroVoiceId(voice);

const getDefaultKokoroVoice = (voices: TTSVoice[]): TTSVoice | undefined => (
  voices.find((providerVoice) => providerVoice.id === 'af_alloy') ?? voices[0]
);

const normalizeLanguageTag = (language?: string): string => (
  (language ?? '').trim().toLowerCase()
);

const getLanguageRoot = (language?: string): string => {
  const normalized = normalizeLanguageTag(language);
  return normalized.split(/[-_]/)[0] ?? '';
};

const isVoiceLanguageMatch = (voiceLanguage: string | undefined, targetLanguage: string): boolean => {
  const normalizedTarget = normalizeLanguageTag(targetLanguage);
  if (!normalizedTarget) {
    return false;
  }

  const normalizedVoiceLanguage = normalizeLanguageTag(voiceLanguage);
  if (!normalizedVoiceLanguage) {
    return false;
  }

  return (
    normalizedVoiceLanguage === normalizedTarget
    || getLanguageRoot(normalizedVoiceLanguage) === getLanguageRoot(normalizedTarget)
  );
};

const getEnglishVoices = (voices: TTSVoice[]): TTSVoice[] => voices.filter((providerVoice) => (
  isVoiceLanguageMatch(providerVoice.language, 'en')
));

const getPreferredVoicesForLanguage = (voices: TTSVoice[], language: string): TTSVoice[] => {
  const languageMatches = voices.filter((providerVoice) => isVoiceLanguageMatch(providerVoice.language, language));
  if (languageMatches.length > 0) {
    return languageMatches;
  }

  const englishVoices = getEnglishVoices(voices);
  if (englishVoices.length > 0) {
    return englishVoices;
  }

  return voices;
};

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

const loadStoredKokoroDtype = (): KokoroDType | 'auto' => {
  if (typeof window === 'undefined') {
    return 'auto';
  }

  const stored = window.localStorage.getItem(TTS_DTYPE_STORAGE_KEY);
  if (!stored || stored === 'auto') {
    return 'auto';
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
  const [sourceType, setSourceType] = useState<SourceType>('text');
  const [textInput, setTextInput] = useState('Paste text to normalize and preview for playback.');
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
  const [firstAudioTimingMs, setFirstAudioTimingMs] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(!isProduction);
  const [voice, setVoice] = useState(storedPreferences?.voice ?? '');
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([]);
  const [selectedVoiceLanguage, setSelectedVoiceLanguage] = useState('auto');
  const [rate, setRate] = useState(storedPreferences?.rate ?? 1);
  const [playbackModeOverride, setPlaybackModeOverride] = useState<PlaybackMode | null>(null);
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
    audioUrl: null,
    fileName: 'playback.wav',
  });
  const [playbackSource, setPlaybackSource] = useState<PlaybackSource>('stream');
  const fullAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const [exportPreviewCurrentTime, setExportPreviewCurrentTime] = useState(0);
  const [exportPreviewDuration, setExportPreviewDuration] = useState(0);
  const [isExportPreviewPlaying, setIsExportPreviewPlaying] = useState(false);

  const shouldSuppressNextVoiceMigrationWarning = (
    hasPendingVoiceMigrationNormalization && !hasCompletedVoiceMigration
  );

  const defaultPlaybackMode = useMemo<PlaybackMode>(() => (
    shouldDefaultContinuousMode(ingested.document.segments) ? 'continuous' : 'segmented'
  ), [ingested.document.segments]);
  const playbackMode = playbackModeOverride ?? defaultPlaybackMode;

  const languageOptions = useMemo<Array<{ value: string; label: string }>>(() => {
    const distinctLanguages = Array.from(
      new Set(
        availableVoices
          .map((providerVoice) => normalizeLanguageTag(providerVoice.language))
          .filter((language) => language.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return [
      { value: 'auto', label: 'Auto' },
      ...distinctLanguages.map((language) => ({ value: language, label: language })),
    ];
  }, [availableVoices]);

  const effectiveVoiceLanguage = useMemo(() => {
    if (selectedVoiceLanguage !== 'auto') {
      return selectedVoiceLanguage;
    }

    const selectedVoice = availableVoices.find((providerVoice) => providerVoice.id === voice);
    const selectedVoiceLanguageTag = normalizeLanguageTag(selectedVoice?.language);
    if (selectedVoiceLanguageTag) {
      return selectedVoiceLanguageTag;
    }

    const defaultLanguage = normalizeLanguageTag(availableVoices[0]?.language);
    return defaultLanguage || 'en';
  }, [availableVoices, selectedVoiceLanguage, voice]);

  const filteredVoices = useMemo(() => (
    getPreferredVoicesForLanguage(availableVoices, effectiveVoiceLanguage)
  ), [availableVoices, effectiveVoiceLanguage]);

  const playbackData = useMemo(() => {
    if (playbackMode === 'continuous') {
      return buildContinuousPlayback(ingested.document.segments);
    }

    return {
      playbackSegments: ingested.document.segments.map((segment) => ({ id: segment.id, text: segment.text })),
      seekAnchors: ingested.document.segments.map((segment, index) => ({
        segmentId: segment.id,
        playbackSegmentIndex: index,
        playbackCharOffset: 0,
      })),
    };
  }, [ingested.document.segments, playbackMode]);

  const player = usePlayerController({
    provider,
    segments: playbackData.playbackSegments,
    seekAnchors: playbackData.seekAnchors,
    synthesisOptions: { voice, rate },
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
        audioUrl: null,
        fileName: 'playback.wav',
      };
    });
    setPlaybackSource('stream');
    setExportPreviewCurrentTime(0);
    setExportPreviewDuration(0);
    setIsExportPreviewPlaying(false);
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return '0:00';
    }
    const clampedSeconds = Math.floor(seconds);
    const mins = Math.floor(clampedSeconds / 60);
    const secs = clampedSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const seekExportPreviewBy = useCallback((deltaSeconds: number) => {
    const audioElement = fullAudioElementRef.current;
    if (!audioElement) {
      return;
    }

    const targetTime = Math.min(
      Number.isFinite(audioElement.duration) ? audioElement.duration : Number.POSITIVE_INFINITY,
      Math.max(0, audioElement.currentTime + deltaSeconds),
    );
    audioElement.currentTime = targetTime;
  }, []);

  const buildFullAudio = useCallback(async () => {
    if (!playbackData.playbackSegments.length) {
      setFullAudioBuild({
        status: 'error',
        builtSegments: 0,
        totalSegments: 0,
        error: 'No segments available to synthesize.',
        audioUrl: null,
        fileName: 'playback.wav',
      });
      return null;
    }

    clearFullAudioBuild();
    const totalSegments = playbackData.playbackSegments.length;
    setFullAudioBuild({
      status: 'building',
      builtSegments: 0,
      totalSegments,
      error: null,
      audioUrl: null,
      fileName: `${(ingested.title || 'playback').replace(/\s+/g, '-').toLowerCase()}.wav`,
    });

    const blobs: Blob[] = [];
    for (let index = 0; index < totalSegments; index += 1) {
      const segment = playbackData.playbackSegments[index];
      const result = await provider.synthesize(segment, { voice, rate });
      if (!('blob' in result)) {
        setFullAudioBuild((current) => ({
          ...current,
          status: 'error',
          error: 'Current voice/runtime only supports live native speech playback. Try a Kokoro voice for downloadable audio.',
        }));
        return null;
      }
      blobs.push(result.blob);
      setFullAudioBuild((current) => ({
        ...current,
        builtSegments: index + 1,
      }));
    }

    if (!blobs.length) {
      setFullAudioBuild((current) => ({
        ...current,
        status: 'error',
        error: 'Synthesis returned empty audio content.',
      }));
      return null;
    }

    const joinedBlob = await concatAudioBlobs(blobs);
    const audioUrl = URL.createObjectURL(joinedBlob);
    setFullAudioBuild((current) => ({
      ...current,
      status: 'ready',
      audioUrl,
      builtSegments: totalSegments,
    }));
    return audioUrl;
  }, [clearFullAudioBuild, ingested.title, playbackData.playbackSegments, provider, rate, voice]);

  useEffect(() => {
    setupLocalDebugPerfTelemetry();
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
      setExportPreviewCurrentTime(audioElement.currentTime || 0);
      setExportPreviewDuration(Number.isFinite(audioElement.duration) ? audioElement.duration : 0);
      setIsExportPreviewPlaying(!audioElement.paused);
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
  }, [fullAudioBuild.audioUrl]);

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
  
    // ────── FULL GREMLIN OVERRIDE SYSTEM v2 ──────
    const urlParams = typeof window !== 'undefined' 
      ? new URLSearchParams(window.location.search) 
      : new URLSearchParams();
  
    const forcedFromUrl = urlParams.get('ttsDevice') || urlParams.get('device');
    const forceWebGpu = urlParams.get('forceWebGpu') === 'true' || forcedFromUrl === 'webgpu';
    const forceWasm   = urlParams.get('forceWasm') === 'true'   || forcedFromUrl === 'wasm';
  
    // This is the line that was causing the "Cannot find name 'forcedDeviceOverride'" error
    const preferredDevice: 'webgpu' | 'wasm' | undefined =
      forceWebGpu ? 'webgpu' :
      forceWasm   ? 'wasm' :
      getDevDeviceOverride() ?? undefined;
  
    const skipAllQualityChecks = forceWebGpu || 
      urlParams.get('skipQuality') === 'true' || 
      urlParams.get('skipWebGpuQualityCheck') === 'true';
  
    const allowUnstable = forceWebGpu || 
      urlParams.get('allowUnstable') === 'true';
  
    console.log('🚀 GREMLIN TTS INIT OVERRIDE:', { 
      preferredDevice, 
      skipAllQualityChecks, 
      allowUnstable,
      rawUrlParams: Object.fromEntries(urlParams.entries())
    });
  
    const selectedProvider = await selectTTSProvider({
      preferredDevice,                    // now correctly typed
      allowWebGpuIfUnstable: allowUnstable,
      skipWebGpuQualityCheck: skipAllQualityChecks,
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
  
    if (forceWebGpu && activeCheck()) {
      setForceWebGpuRetry(false);
    }
  
    if (import.meta.env.DEV) {
      const fallbackSummary = getFallbackReasonAndHint(selectedProvider.fallbackError);
      const diagnostics: DevTtsDiagnostics = {
        kokoroPackageLoadable,
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
        const preferredVoicesForEffectiveLanguage = getPreferredVoicesForLanguage(voices, effectiveVoiceLanguage);
        const fallbackVoices = preferredVoicesForEffectiveLanguage.length > 0
          ? preferredVoicesForEffectiveLanguage
          : voices;
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
    effectiveVoiceLanguage,
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
          </div>
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
            tts init: providerSelected={ttsInitStatusLine?.providerSelected ?? 'pending'} · runtime={ttsInitStatusLine?.runtime ?? 'pending'} · dtype={ttsInitStatusLine?.dtype ?? 'pending'} · skipKokoroInit={String(ttsInitStatusLine?.skipKokoroInit ?? false)} · {SKIP_KOKORO_INIT_ON_PAGES_ENV_FLAG}={skipKokoroInitOnPagesEnvValue ?? 'undefined'} · kokoroImportable={ttsInitStatusLine ? String(ttsInitStatusLine.kokoroImportable) : 'pending'} · fallbackCode={ttsInitStatusLine?.fallbackCode ?? 'pending'}
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
          <p className="mt-2 text-sm text-emerald-300/70">Normalized segments: {ingested.document.segments.length}</p>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
            {ingested.document.segments.map((segment, index) => (
              <div
                key={segment.id}
                className={`rounded-md border p-2 text-sm ${
                  player.currentSegmentIndex === index
                    ? 'border-emerald-400/80 bg-emerald-500/10'
                    : 'border-emerald-500/30 bg-[#0a160f]'
                }`}
              >
                <div className="mb-1 flex items-center justify-between text-xs text-emerald-300/70">
                  <span>{segment.blockType}</span>
                  <span>
                    {segment.sourceOffset?.start ?? 0}-{segment.sourceOffset?.end ?? segment.text.length}
                  </span>
                </div>
                <p>{segment.text}</p>
              </div>
            ))}
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
                <option value="auto">Auto (default)</option>
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
              segmentCount={playbackSource === 'exported' ? 1 : ingested.document.segments.length}
              playbackMode={playbackMode}
              machineError={playbackSource === 'exported' ? null : player.error}
              machineHint={playbackSource === 'exported' ? null : player.hint}
              voice={voice}
              voices={filteredVoices}
              selectedLanguage={selectedVoiceLanguage}
              languageOptions={languageOptions}
              rate={rate}
              isVoiceReadyForPlayback={isVoiceReadyForPlayback}
              voiceReadinessHelperText={voiceReadinessHelperText}
              playDisabled={!isVoiceReadyForPlayback}
              progressLabel={playbackSource === 'exported' ? 'Export preview' : 'Segment progress'}
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
                  const audioElement = fullAudioElementRef.current;
                  if (!audioElement) {
                    return;
                  }
                  void audioElement.play().catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    setFullAudioBuild((current) => ({
                      ...current,
                      status: 'error',
                      error: `Exported audio playback failed: ${message}`,
                    }));
                  });
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
              onPrevSegment={() => {
                if (playbackSource === 'exported') {
                  seekExportPreviewBy(-10);
                  return;
                }
                void player.skipPrevious();
              }}
              onNextSegment={() => {
                if (playbackSource === 'exported') {
                  seekExportPreviewBy(10);
                  return;
                }
                void player.skipNext();
              }}
              onSeekSegmentStart={() => {
                if (playbackSource === 'exported') {
                  if (fullAudioElementRef.current) {
                    fullAudioElementRef.current.currentTime = 0;
                  }
                  return;
                }
                void player.seekSegment(player.currentSegmentIndex, 0);
              }}
              onVoiceChange={setVoice}
              onLanguageChange={setSelectedVoiceLanguage}
              onRateChange={setRate}
              onPlaybackModeChange={setPlaybackModeOverride}
              onManualRetry={() => {
                void player.retryCurrentSegment();
              }}
            />
            <button
              aria-label="Reset playback queue"
              className="w-full rounded-md border border-emerald-500/40 bg-[#07110a] px-2 py-1 text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              onClick={() => {
                if (playbackSource === 'exported' && fullAudioElementRef.current) {
                  fullAudioElementRef.current.currentTime = 0;
                  fullAudioElementRef.current.pause();
                  return;
                }
                void player.seekSegment(0, 0);
              }}
              type="button"
            >
              Reset Queue
            </button>
            <div className="rounded-md border border-emerald-500/30 bg-[#0a160f] p-3 text-sm">
              <p className="font-semibold text-emerald-100">Full audio export</p>
              <p className="mt-1 text-xs text-emerald-300/80">
                Convert all normalized segments into one downloadable audio file before playback.
              </p>
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
                        setPlaybackSource('exported');
                      }}
                    >
                      Use export preview controls
                    </button>
                    <button
                      type="button"
                      className={`rounded-md border px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                        playbackSource === 'stream'
                          ? 'border-emerald-300 bg-emerald-500/20 text-emerald-100'
                          : 'border-emerald-500/40 bg-[#07110a] text-emerald-100'
                      }`}
                      onClick={() => {
                        fullAudioElementRef.current?.pause();
                        setPlaybackSource('stream');
                      }}
                    >
                      Use stream controls
                    </button>
                    <a
                      className="rounded-md border border-emerald-500/40 bg-[#07110a] px-2 py-1 text-emerald-100 hover:border-emerald-300/70"
                      download={fullAudioBuild.fileName}
                      href={fullAudioBuild.audioUrl}
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      className="rounded-md border border-emerald-500/40 bg-[#07110a] px-2 py-1 text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                      onClick={() => {
                        const audioElement = fullAudioElementRef.current;
                        if (!audioElement) {
                          return;
                        }
                        setPlaybackSource('exported');
                        void audioElement.play().catch((error) => {
                          const message = error instanceof Error ? error.message : String(error);
                          setFullAudioBuild((current) => ({
                            ...current,
                            status: 'error',
                            error: `Exported audio playback failed: ${message}`,
                          }));
                        });
                      }}
                    >
                      Play exported audio
                    </button>
                    <audio
                      ref={fullAudioElementRef}
                      className="sr-only"
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
                {fullAudioBuild.builtSegments} / {fullAudioBuild.totalSegments || playbackData.playbackSegments.length} segments
              </p>
              {fullAudioBuild.error ? (
                <p className="mt-2 rounded border border-rose-700 bg-rose-950/40 p-2 text-xs text-rose-200">{fullAudioBuild.error}</p>
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
