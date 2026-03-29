import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { ttsManifest } from './licenses/ttsManifest';
import { ingestInput } from './features/ingest/urlAdapter';
import { PlayerControls } from './features/player/PlayerControls';
import type { NormalizedDocument } from './domain/segments';
import { usePlayerController } from './features/player/playerMachine';
import { selectTTSProvider } from './tts/providerSelector';
import { setupLocalDebugPerfTelemetry } from './tts/perfTelemetry';
import type { TTSFallbackError } from './tts/errors';
import { canImportKokoroModule } from './tts/providers/kokoroProvider';
import { WebSpeechProvider } from './tts/providers/webSpeechProvider';
import type { TTSProvider, TTSVoice } from './tts/types';

const isUrlIngestEnabled = import.meta.env.VITE_ENABLE_URL_INGEST !== 'false';
const isPagesStyleBase = import.meta.env.BASE_URL !== '/';
const shouldSkipKokoroInitOnPages = import.meta.env.VITE_SKIP_KOKORO_INIT_ON_PAGES !== 'false';
type SourceType = 'text' | 'file' | 'url';
const sourceTabs: SourceType[] = isUrlIngestEnabled ? ['text', 'file', 'url'] : ['text', 'file'];
const TTS_PREFS_STORAGE_KEY = 'reader-tts-preferences';

const LEGACY_VOICE_MIGRATIONS: Record<string, string> = {
  Alloy: 'af_alloy',
  Verse: 'af_verse',
  Lumen: 'af_lumen',
  alloy: 'af_alloy',
  verse: 'af_verse',
  lumen: 'af_lumen',
};
const KOKORO_VOICE_IDS = ['af_alloy', 'af_verse', 'af_lumen'] as const;

const normalizeKokoroVoiceId = (voice: string): string => LEGACY_VOICE_MIGRATIONS[voice] ?? voice;

type StoredTtsPreferences = {
  voice: string;
  rate: number;
  provider: string;
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

const migrateStoredVoice = (voice: string): string => normalizeKokoroVoiceId(voice);

const getWebSpeechVoiceIds = (): string[] => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }

  return window.speechSynthesis.getVoices().map((voice) => voice.voiceURI);
};

const getDefaultVoiceForProvider = (provider: string, providerVoiceIds: string[]): string | null => {
  if (provider === 'kokoro') {
    return 'af_alloy';
  }

  return providerVoiceIds[0] ?? null;
};

const loadTtsPreferences = (): StoredTtsPreferences | null => {
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

    const provider = parsed.provider;
    const providerVoiceIds = provider === 'web-speech' ? getWebSpeechVoiceIds() : [...KOKORO_VOICE_IDS];
    const migratedVoice = migrateStoredVoice(parsed.voice);
    const isVoiceAvailable = providerVoiceIds.includes(migratedVoice);
    const correctedVoice = isVoiceAvailable
      ? migratedVoice
      : getDefaultVoiceForProvider(provider, providerVoiceIds) ?? migratedVoice;

    const correctedPreferences: StoredTtsPreferences = {
      voice: correctedVoice,
      rate: parsed.rate,
      provider,
    };

    if (
      correctedPreferences.voice !== parsed.voice
      || correctedPreferences.rate !== parsed.rate
      || correctedPreferences.provider !== parsed.provider
    ) {
      window.localStorage.setItem(TTS_PREFS_STORAGE_KEY, JSON.stringify(correctedPreferences));
    }

    return correctedPreferences;
  } catch {
    return null;
  }
};

const resolveProviderLabel = (activeProvider: TTSProvider): string => (
  activeProvider instanceof WebSpeechProvider ? 'web-speech' : 'kokoro'
);

type DevTtsDiagnostics = {
  kokoroPackageLoadable: boolean;
  webgpuSupported: boolean;
  deviceMemoryGb?: number;
  selectedProvider: string;
  fallbackCode?: string;
  fallbackReason?: string;
  fallbackHint?: string;
};

const KOKORO_MODULE_NOT_BUNDLED_HINT = 'Install/add kokoro-js dependency and avoid @vite-ignore for this import.';

const emitDevKokoroImportCheck = async (): Promise<boolean> => {
  const kokoroPackageLoadable = await canImportKokoroModule();
  if (!kokoroPackageLoadable) {
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

const getDeviceMemoryGb = (): number | undefined => {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
};

function App() {
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
  const [showFallbackBanner, setShowFallbackBanner] = useState(false);
  const [showInformationalFallbackBanner, setShowInformationalFallbackBanner] = useState(false);
  const [providerFallbackError, setProviderFallbackError] = useState<TTSFallbackError | null>(null);
  const [voiceFallbackWarning, setVoiceFallbackWarning] = useState<string | null>(null);
  const [isVoiceReadyForPlayback, setIsVoiceReadyForPlayback] = useState(false);
  const [voiceReadinessHelperText, setVoiceReadinessHelperText] = useState('Loading voices…');
  const [devTtsDiagnostics, setDevTtsDiagnostics] = useState<DevTtsDiagnostics | null>(null);
  const [voice, setVoice] = useState(storedPreferences?.voice ?? 'af_alloy');
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([]);
  const [rate, setRate] = useState(storedPreferences?.rate ?? 1);
  const [showModelLicenseInfo, setShowModelLicenseInfo] = useState(true);

  const playbackSegments = useMemo(
    () => ingested.document.segments.map((segment) => ({ id: segment.id, text: segment.text })),
    [ingested.document.segments],
  );

  const player = usePlayerController({
    provider,
    segments: playbackSegments,
    synthesisOptions: { voice, rate },
  });

  useEffect(() => {
    setupLocalDebugPerfTelemetry();
  }, []);

  useEffect(() => {
    let active = true;

    const initializeProvider = async () => {
      const skipKokoroInit = isPagesStyleBase && shouldSkipKokoroInitOnPages;
      const selectedProvider = await selectTTSProvider({
        skipKokoroInit,
        skipKokoroInitReason: skipKokoroInit
          ? 'GitHub Pages MVP mode: Kokoro init skipped intentionally while bundling is being finalized.'
          : undefined,
      });
      const providerName = resolveProviderLabel(selectedProvider.provider);

      if (import.meta.env.DEV) {
        const kokoroPackageLoadable = await emitDevKokoroImportCheck();

        const fallbackSummary = getFallbackReasonAndHint(selectedProvider.fallbackError);
        const diagnostics: DevTtsDiagnostics = {
          kokoroPackageLoadable,
          webgpuSupported: await checkWebGpuSupport(),
          deviceMemoryGb: getDeviceMemoryGb(),
          selectedProvider: providerName,
          fallbackCode: selectedProvider.fallbackError?.code,
          fallbackReason: fallbackSummary.reason,
          fallbackHint: fallbackSummary.hint,
        };

        console.info('[DEV][TTS_INIT_DIAGNOSTICS]', diagnostics);
        if (selectedProvider.fallbackError?.code === 'KOKORO_MODULE_RESOLUTION_FAILED') {
          console.info(
            '[DEV][TTS_INIT_ACTION] Verify kokoro-js is installed/bundled and dynamic import path works on GitHub Pages base URL.',
          );
        }

        if (active) {
          setDevTtsDiagnostics(diagnostics);
        }
      }

      if (active) {
        setProvider(selectedProvider.provider);
        setProviderLabel(providerName);
        if (providerName === 'kokoro') {
          setVoice((currentVoice) => normalizeKokoroVoiceId(currentVoice));
        }
        setShowFallbackBanner(selectedProvider.fallbackToWebSpeech && !selectedProvider.fallbackIntentional);
        setShowInformationalFallbackBanner(Boolean(selectedProvider.fallbackIntentional));
        setProviderFallbackError(selectedProvider.fallbackError ?? null);
      }
    };

    void initializeProvider();

    return () => {
      active = false;
    };
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
        const isSelectedVoiceAvailable = voices.some((providerVoice) => providerVoice.id === selectedVoice);
        if (isSelectedVoiceAvailable) {
          setVoiceReadinessHelperText(null);
          setIsVoiceReadyForPlayback(true);
          return;
        }

        const fallbackVoice = providerLabel === 'kokoro'
          ? voices.find((providerVoice) => providerVoice.id === 'af_alloy') ?? voices[0]
          : voices[0];
        setVoiceReadinessHelperText('Select a valid voice.');
        setVoice(fallbackVoice.id);
        setVoiceFallbackWarning(
          `Selected voice "${selectedVoice}" is unavailable for ${providerLabel}; switched to "${fallbackVoice.name}".`,
        );
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
  }, [provider, providerLabel, voice]);

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

  return (
    <main className="mx-auto min-h-screen max-w-7xl p-6 text-slate-100">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Reader Workbench</h1>
        <p className="mt-2 text-sm text-slate-400">
          Scaffold for source ingestion, normalization preview, and spoken playback.
        </p>
        <p className="mt-2 text-xs text-slate-300">
          Active voice provider: <span className="font-semibold">{providerLabel}</span>
        </p>
      </header>

      {showFallbackBanner ? (
        <div className="mb-4 rounded-md border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Running in fallback voice mode due to device capability.
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

      {voiceFallbackWarning ? (
        <div className="mb-4 rounded-md border border-amber-600 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          {voiceFallbackWarning}
        </div>
      ) : null}

      {!isVoiceReadyForPlayback ? (
        <div className="mb-4 rounded-md border border-sky-700 bg-sky-950/30 px-3 py-2 text-sm text-sky-100">
          Preparing voices for the active provider. Playback will be enabled once voice validation completes.
        </div>
      ) : null}

      {showInformationalFallbackBanner ? (
        <div className="mb-4 rounded-md border border-sky-700 bg-sky-950/40 px-3 py-2 text-sm text-sky-100">
          Web Speech mode is intentionally enabled for GitHub Pages MVP while Kokoro bundling is finalized.
          {providerFallbackError?.message ? (
            <p className="mt-1 text-xs text-sky-200">{providerFallbackError.message}</p>
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
            <li>selectedProvider: {devTtsDiagnostics.selectedProvider}</li>
            <li>fallbackCode: {devTtsDiagnostics.fallbackCode ?? 'none'}</li>
            <li>fallbackReason: {devTtsDiagnostics.fallbackReason ?? 'none'}</li>
            <li>fallbackHint: {devTtsDiagnostics.fallbackHint ?? 'none'}</li>
          </ul>
        </aside>
      ) : null}


      {showModelLicenseInfo ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-panel p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Model &amp; License Info</h2>
                <p className="mt-1 text-sm text-slate-300">Loaded from <code>docs/licenses/tts-manifest.json</code>.</p>
              </div>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1 text-sm text-slate-200"
                onClick={() => setShowModelLicenseInfo(false)}
              >
                Close
              </button>
            </div>
            <div className="space-y-3">
              {ttsManifest.artifacts.map((artifact) => (
                <article key={artifact.id} className="rounded-md border border-border bg-slate-900/70 p-3 text-sm">
                  <p><span className="font-semibold">Package/model:</span> {artifact.packageOrModelName}</p>
                  <p><span className="font-semibold">Version/hash:</span> {artifact.versionOrHash}</p>
                  <p><span className="font-semibold">License:</span> {artifact.license}</p>
                  <p>
                    <span className="font-semibold">Source URL:</span>{' '}
                    <a className="text-sky-300 underline" href={artifact.sourceUrl} rel="noreferrer" target="_blank">
                      {artifact.sourceUrl}
                    </a>
                  </p>
                  {artifact.attributionText ? (
                    <p><span className="font-semibold">Attribution:</span> {artifact.attributionText}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-border bg-panel p-4 shadow-lg shadow-black/20">
          <h2 className="text-lg font-semibold">Input panel</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {sourceTabs.map((type) => (
              <button
                key={type}
                type="button"
                className={`rounded-md border px-3 py-1.5 text-sm capitalize transition ${
                  sourceType === type
                    ? 'border-sky-400 bg-sky-950 text-sky-200'
                    : 'border-border text-slate-300 hover:border-slate-500'
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

          <label className="mt-4 block text-sm text-slate-300">
            Paste text
            <textarea
              className="mt-1 h-40 w-full rounded-md border border-border bg-slate-900 p-2"
              value={textInput}
              onChange={(event) => {
                setTextInput(event.target.value);
                setSourceType('text');
              }}
            />
          </label>

          <label className="mt-3 block text-sm text-slate-300">
            Upload file
            <input
              className="mt-1 block w-full rounded-md border border-border bg-slate-900 p-2"
              type="file"
              onChange={onFileChange}
            />
            {selectedFileName ? <span className="mt-1 block text-xs text-slate-400">Selected: {selectedFileName}</span> : null}
          </label>

          {isUrlIngestEnabled ? (
            <label className="mt-3 block text-sm text-slate-300">
              Source URL
              <input
                className="mt-1 w-full rounded-md border border-border bg-slate-900 p-2"
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

        <article className="rounded-xl border border-border bg-panel p-4 shadow-lg shadow-black/20">
          <h2 className="text-lg font-semibold">Preview panel</h2>
          <p className="mt-2 text-sm text-slate-400">Normalized segments: {ingested.document.segments.length}</p>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
            {ingested.document.segments.map((segment, index) => (
              <div
                key={segment.id}
                className={`rounded-md border p-2 text-sm ${
                  player.currentSegmentIndex === index
                    ? 'border-sky-500 bg-sky-950/40'
                    : 'border-border bg-slate-900/70'
                }`}
              >
                <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
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

        <article className="rounded-xl border border-border bg-panel p-4 shadow-lg shadow-black/20">
          <h2 className="text-lg font-semibold">Playback panel</h2>
          <div className="space-y-3">
            <PlayerControls
              queueStatus={player.state}
              currentSegmentIndex={player.currentSegmentIndex}
              segmentCount={ingested.document.segments.length}
              machineError={player.error}
              voice={voice}
              voices={availableVoices.map(({ id, name }) => ({ id, name }))}
              rate={rate}
              isVoiceReadyForPlayback={isVoiceReadyForPlayback}
              voiceReadinessHelperText={voiceReadinessHelperText}
              playDisabled={!isVoiceReadyForPlayback}
              onPlay={() => {
                if (!isVoiceReadyForPlayback) {
                  setVoiceFallbackWarning(
                    'Playback is temporarily disabled while voice validation is still in progress.',
                  );
                  return;
                }

                if (player.state === 'paused') {
                  void player.resume();
                  return;
                }

                void player.play();
              }}
              onPause={player.pause}
              onPrevSegment={() => {
                void player.skipPrevious();
              }}
              onNextSegment={() => {
                void player.skipNext();
              }}
              onSeekSegmentStart={() => {
                void player.seekSegment(player.currentSegmentIndex, 0);
              }}
              onVoiceChange={setVoice}
              onRateChange={setRate}
            />
            <button
              aria-label="Reset playback queue"
              className="w-full rounded-md border border-border px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              onClick={() => {
                void player.seekSegment(0, 0);
              }}
              type="button"
            >
              Reset Queue
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}

export default App;
