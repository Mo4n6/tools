import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { ttsManifest } from './licenses/ttsManifest';
import { ingestInput } from './features/ingest/urlAdapter';
import { PlayerControls } from './features/player/PlayerControls';
import type { NormalizedDocument } from './domain/segments';
import { usePlayerController } from './features/player/playerMachine';
import { selectTTSProvider } from './tts/providerSelector';
import { setupLocalDebugPerfTelemetry } from './tts/perfTelemetry';
import { WebSpeechProvider } from './tts/providers/webSpeechProvider';
import type { TTSProvider } from './tts/types';

const isUrlExtractorEnabled = import.meta.env.VITE_ENABLE_URL_EXTRACTOR !== 'false';
type SourceType = 'text' | 'file' | 'url';
const sourceTabs: SourceType[] = isUrlExtractorEnabled ? ['text', 'file', 'url'] : ['text', 'file'];
const TTS_PREFS_STORAGE_KEY = 'reader-tts-preferences';

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

const loadTtsPreferences = (): StoredTtsPreferences | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(TTS_PREFS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredTtsPreferences) : null;
  } catch {
    return null;
  }
};

const resolveProviderLabel = (activeProvider: TTSProvider): string => (
  activeProvider instanceof WebSpeechProvider ? 'web-speech' : 'kokoro'
);

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
  const [voice, setVoice] = useState(storedPreferences?.voice ?? 'alloy');
  const [rate, setRate] = useState(storedPreferences?.rate ?? 1);
  const [showModelLicenseInfo, setShowModelLicenseInfo] = useState(true);

  const player = usePlayerController({
    provider,
    segments: ingested.document.segments,
    synthesisOptions: { voice, rate },
  });

  useEffect(() => {
    setupLocalDebugPerfTelemetry();
  }, []);

  useEffect(() => {
    let active = true;

    const initializeProvider = async () => {
      const selectedProvider = await selectTTSProvider();
      if (active) {
        setProvider(selectedProvider.provider);
        setProviderLabel(resolveProviderLabel(selectedProvider.provider));
        setShowFallbackBanner(selectedProvider.fallbackToWebSpeech);
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
          : sourceType === 'url' && isUrlExtractorEnabled
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
        </div>
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

          {!isUrlExtractorEnabled ? (
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

          {isUrlExtractorEnabled ? (
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
              voice={voice}
              rate={rate}
              onTogglePlayPause={() => {
                if (player.state === 'playing' || player.state === 'loading') {
                  player.pause();
                  return;
                }

                if (player.state === 'paused') {
                  void player.resume();
                  return;
                }

                void player.play();
              }}
              onPrevSegment={() => {
                void player.skipPrevious();
              }}
              onNextSegment={() => {
                void player.skipNext();
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
