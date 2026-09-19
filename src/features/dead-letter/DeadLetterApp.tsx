import { useMemo } from 'react';
import { DEAD_LETTER_FILE_NAME, buildDeadLetterUrl } from './deadLetterAsset';

const primaryActionClassName =
  'rounded-md border border-emerald-400 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100 hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';
const secondaryActionClassName =
  'rounded-md border border-emerald-500/40 bg-[#07110a] px-3 py-2 text-sm text-emerald-100 hover:border-emerald-300/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';

const DeadLetterApp = (): JSX.Element => {
  const toolUrl = useMemo(() => buildDeadLetterUrl(import.meta.env.BASE_URL), []);

  return (
    <div className="flex w-full flex-col p-2 font-mono text-emerald-100 md:p-4">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Dead Letter</h1>
          <p className="mt-2 text-sm text-emerald-300/70">
            Open .eml and .msg files without opening them: header and hop analysis, authentication
            results, defanged links, and typed attachments. Parsing happens in this tab and nothing
            leaves it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a className={primaryActionClassName} href={toolUrl} download={DEAD_LETTER_FILE_NAME}>
            Download page
          </a>
          <a className={secondaryActionClassName} href={toolUrl} target="_blank" rel="noreferrer">
            Open full screen
          </a>
        </div>
      </header>

      <p className="mb-4 rounded-md border border-emerald-500/45 bg-[#07110a] px-3 py-2 text-xs text-emerald-200/90">
        The tool below is one self-contained HTML file with no dependencies. Download it and open it
        from your own disk to run the same analysis fully offline; it makes no network requests in
        either place.
      </p>

      <iframe
        title="Dead Letter: offline .eml and .msg viewer"
        src={toolUrl}
        referrerPolicy="no-referrer"
        className="h-[calc(100vh-15rem)] min-h-[32rem] w-full rounded-xl border border-emerald-500/35 bg-[#050706] shadow-lg shadow-black/20"
      />
    </div>
  );
};

export default DeadLetterApp;
