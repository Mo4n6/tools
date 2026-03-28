import { ChangeEvent, useMemo, useState } from 'react';
import {
  DocumentModel,
  PlaybackQueueStatus,
  SourceType,
  SpeakableSegment,
} from './types/reader';

const sourceTabs: SourceType[] = ['text', 'file', 'url'];

function parseTextToSegments(rawText: string): SpeakableSegment[] {
  let offset = 0;

  return rawText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const start = rawText.indexOf(line, offset);
      const end = start + line.length;
      offset = end;

      return {
        id: `seg-${index + 1}`,
        text: line,
        type: index === 0 ? 'heading' : 'paragraph',
        sourceOffsets: { start, end },
        metadata: {
          confidence: 1,
          tags: index === 0 ? ['title-candidate'] : ['body'],
        },
      } satisfies SpeakableSegment;
    });
}

function App() {
  const [sourceType, setSourceType] = useState<SourceType>('text');
  const [textInput, setTextInput] = useState('Paste text to normalize and preview for playback.');
  const [urlInput, setUrlInput] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [queueStatus, setQueueStatus] = useState<PlaybackQueueStatus>('idle');
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [voice, setVoice] = useState('alloy');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);

  const parsedSegments = useMemo(() => parseTextToSegments(textInput), [textInput]);

  const documentModel = useMemo<DocumentModel>(() => {
    const sourceValue = sourceType === 'text' ? textInput : sourceType === 'url' ? urlInput : selectedFileName;

    return {
      title: parsedSegments[0]?.text.slice(0, 72) || 'Untitled Source',
      source: {
        type: sourceType,
        value: sourceValue,
        name: sourceType === 'file' ? selectedFileName : undefined,
      },
      segments: parsedSegments,
      warnings: parsedSegments.length === 0
        ? [{ code: 'NO_SEGMENTS', message: 'No speakable text found.', severity: 'warning' }]
        : [],
    };
  }, [parsedSegments, selectedFileName, sourceType, textInput, urlInput]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFileName('');
      return;
    }

    setSelectedFileName(file.name);
    setTextInput(`File selected: ${file.name}\n\nDrop parser integration here.`);
    setSourceType('file');
  };

  const moveSegment = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setCurrentSegmentIndex((index) => Math.max(0, index - 1));
      return;
    }
    setCurrentSegmentIndex((index) => Math.min(parsedSegments.length - 1, index + 1));
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl p-6 text-slate-100">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Reader Workbench</h1>
        <p className="mt-2 text-sm text-slate-400">
          Scaffold for source ingestion, normalization preview, and spoken playback.
        </p>
      </header>

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
