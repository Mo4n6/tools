import type { SpeakableSegment } from '../../domain/segments';

type PreviewPanelProps = {
  segments: SpeakableSegment[];
  currentSegmentIndex: number;
  isContinuousMode: boolean;
};

export function PreviewPanel({ segments, currentSegmentIndex, isContinuousMode }: PreviewPanelProps): JSX.Element {
  if (isContinuousMode) {
    return (
      <div className="mt-3 max-h-[420px] space-y-3 overflow-auto pr-1" data-testid="preview-continuous-flow">
        {segments.map((segment, index) => (
          <p
            key={segment.id}
            className={`rounded-md px-1 py-0.5 text-sm ${
              currentSegmentIndex === index ? 'bg-emerald-500/10 text-emerald-100' : 'text-emerald-100'
            }`}
          >
            {segment.text}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1" data-testid="preview-segmented-cards">
      {segments.map((segment, index) => (
        <div
          key={segment.id}
          className={`rounded-md border p-2 text-sm ${
            currentSegmentIndex === index
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
    </div>
  );
}
