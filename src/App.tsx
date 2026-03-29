import { ChangeEvent, useEffect, useState } from 'react';
import { ttsManifest } from './licenses/ttsManifest';
import { ingestInput } from './features/ingest/urlAdapter';
import { PlayerControls } from './features/player/PlayerControls';
import { DocumentModel, PlaybackQueueStatus, SourceType } from './types/reader';

const sourceTabs: SourceType[] = ['text', 'file', 'url'];

function App() {
  const [sourceType, setSourceType] = useState<SourceType>('text');
  const [textInput, setTextInput] = useState('Paste text to normalize and preview for playback.');
  const [urlInput, setUrlInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [documentModel, setDocumentModel] = useState<DocumentModel>({
    title: 'Untitled Source',
    source: { type: 'text', value: '' },
    segments: [],
    warnings: [],
  });

  const [queueStatus, setQueueStatus] = useState<PlaybackQueueStatus>('idle');
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [voice, setVoice] = useState('alloy');
  const [rate, setRate] = useState(1);
  const [showModelLicenseInfo, setShowModelLicenseInfo] = useState(true);

  useEffect(() => {
    let active = true;

    const toDocumentModel = (
      source: DocumentModel['source'],
      normalized: Awaited<ReturnType<typeof ingestInput>>,
      warnings: DocumentModel['warnings'] = [],
    ): DocumentModel => ({
      title: normalized.title || 'Untitled Source',
      source,
      segments: normalized.segments.map((segment) => ({
        id: segment.id,
        text: segment.text,
        type: segment.blockType === 'heading'
          ? 'heading'
          : segment.blockType === 'paragraph'
            ? 'paragraph'
            : segment.blockType === 'list_item'
              ? 'list-item'
              : 'other',
        sourceOffsets: segment.sourceOffset ?? { start: 0, end: segment.text.length },
      })),
      warnings,
    });

    const runIngest = async () => {
      try {
        const nextModel = sourceType === 'text'
          ? toDocumentModel({ type: 'text', value: textInput }, await ingestInput({ type: 'paste', payload: textInput }))
          : sourceType === 'url'
            ? toDocumentModel(
              { type: 'url', value: urlInput },
              await ingestInput({ type: 'url', payload: urlInput }),
              [{ code: 'URL_INGEST_MODE', message: 'URL ingestion uses backend extraction.', severity: 'info' }],
            )
            : selectedFile
              ? toDocumentModel(
                { type: 'file', value: selectedFile.name, name: selectedFile.name },
                await ingestInput({ type: 'file', payload: selectedFile }),
              )
              : toDocumentModel({ type: 'file', value: '' }, await ingestInput({ type: 'paste', payload: '' }));

        if (active) {
          setDocumentModel(nextModel);
          setCurrentSegmentIndex((index) => Math.min(index, Math.max(nextModel.segments.length - 1, 0)));
        }
      } catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : 'Unknown ingestion error.';
          setDocumentModel({
            title: 'Ingestion failed',
            source: sourceType === 'url'
              ? { type: 'url', value: urlInput }
              : sourceType === 'file'
                ? { type: 'file', value: selectedFile?.name ?? '', name: selectedFile?.name }
                : { type: 'text', value: textInput },
            segments: [],
            warnings: [{ code: 'INGEST_ERROR', message, severity: 'error' }],
          });
          setCurrentSegmentIndex(0);
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

  const moveSegment = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setCurrentSegmentIndex((index) => Math.max(0, index - 1));
      return;
    }
    setCurrentSegmentIndex((index) => Math.min(documentModel.segments.length - 1, index + 1));
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl p-6 text-slate-100">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Reader Workbench</h1>
        <p className="mt-2 text-sm text-slate-400">
          Scaffold for source ingestion, normalization preview, and spoken playback.
        </p>
      </header>


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
        </article>

        <article className="rounded-xl border border-border bg-panel p-4 shadow-lg shadow-black/20">
          <h2 className="text-lg font-semibold">Preview panel</h2>
          <p className="mt-2 text-sm text-slate-400">Normalized segments: {documentModel.segments.length}</p>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
            {documentModel.segments.map((segment, index) => (
              <div
                key={segment.id}
                className={`rounded-md border p-2 text-sm ${
                  currentSegmentIndex === index
                    ? 'border-sky-500 bg-sky-950/40'
                    : 'border-border bg-slate-900/70'
                }`}
              >
                <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                  <span>{segment.type}</span>
                  <span>
                    {segment.sourceOffsets.start}-{segment.sourceOffsets.end}
                  </span>
                </div>
                <p>{segment.text}</p>
              </div>
            ))}
            {documentModel.warnings.map((warning) => (
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
              queueStatus={queueStatus}
              currentSegmentIndex={currentSegmentIndex}
              segmentCount={documentModel.segments.length}
              voice={voice}
              rate={rate}
              onTogglePlayPause={() => setQueueStatus((status) => (status === 'playing' ? 'paused' : 'playing'))}
              onPrevSegment={() => moveSegment('prev')}
              onNextSegment={() => moveSegment('next')}
              onVoiceChange={setVoice}
              onRateChange={setRate}
            />
            <button
              aria-label="Reset playback queue"
              className="w-full rounded-md border border-border px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              onClick={() => {
                setQueueStatus('ready');
                setCurrentSegmentIndex(0);
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
