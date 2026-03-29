import { ChangeEvent, useEffect, useState } from 'react';
import { ttsManifest } from './licenses/ttsManifest';
import { ingestFile, ingestText, ingestUrl } from './lib/ingest/ingest';
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
  const [pitch, setPitch] = useState(1);
  const [showModelLicenseInfo, setShowModelLicenseInfo] = useState(true);

  useEffect(() => {
    let active = true;

    const runIngest = async () => {
      const nextModel = sourceType === 'text'
        ? await ingestText(textInput)
        : sourceType === 'url'
          ? await ingestUrl(urlInput)
          : selectedFile
            ? await ingestFile(selectedFile)
            : await ingestText('');

      if (active) {
        setDocumentModel(nextModel);
        setCurrentSegmentIndex((index) => Math.min(index, Math.max(nextModel.segments.length - 1, 0)));
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
          <div className="mt-3 space-y-3">
            <label className="block text-sm text-slate-300">
              Voice picker
              <select
                className="mt-1 w-full rounded-md border border-border bg-slate-900 p-2"
                value={voice}
                onChange={(event) => setVoice(event.target.value)}
              >
                <option value="alloy">Alloy</option>
                <option value="verse">Verse</option>
                <option value="lumen">Lumen</option>
              </select>
            </label>

            <label className="block text-sm text-slate-300">
              Rate: {rate.toFixed(1)}x
              <input
                className="mt-1 w-full"
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={rate}
                onChange={(event) => setRate(Number(event.target.value))}
              />
            </label>

            <label className="block text-sm text-slate-300">
              Pitch: {pitch.toFixed(1)}
              <input
                className="mt-1 w-full"
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={pitch}
                onChange={(event) => setPitch(Number(event.target.value))}
              />
            </label>

            <div className="rounded-md border border-border bg-slate-900 p-3 text-sm">
              <p>Status: <span className="font-semibold capitalize">{queueStatus}</span></p>
              <p>Current segment index: {currentSegmentIndex}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button className="rounded-md border border-border px-2 py-1" onClick={() => moveSegment('prev')} type="button">
                ◀ Prev
              </button>
              <button
                className="rounded-md border border-sky-500 bg-sky-900/60 px-2 py-1"
                onClick={() => setQueueStatus((status) => (status === 'playing' ? 'paused' : 'playing'))}
                type="button"
              >
                {queueStatus === 'playing' ? 'Pause' : 'Play'}
              </button>
              <button className="rounded-md border border-border px-2 py-1" onClick={() => moveSegment('next')} type="button">
                Next ▶
              </button>
            </div>
            <button
              className="w-full rounded-md border border-border px-2 py-1"
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
