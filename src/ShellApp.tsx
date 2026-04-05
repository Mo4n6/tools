import { useEffect, useMemo, useState } from 'react';
import MomoroReaderApp from './App';

type ToolDefinition = {
  path: string;
  label: string;
  description: string;
  render: () => JSX.Element;
  available: boolean;
};

const ComingSoonTool = ({ name }: { name: string }): JSX.Element => (
  <div className="mx-auto max-w-2xl rounded-lg border border-emerald-500/50 bg-[#07110a] p-6 shadow-[0_0_20px_rgba(16,185,129,0.18)]">
    <h2 className="text-xl font-semibold text-emerald-200">{name}</h2>
    <p className="mt-2 text-emerald-300/80">
      This tool is a placeholder for a future feature. Routing is already wired so this can be replaced with a
      dedicated implementation without changing the shell layout.
    </p>
  </div>
);

const toolDefinitions: ToolDefinition[] = [
  {
    path: '/tools/momoro-reader',
    label: 'Momoro Reader',
    description: 'Read and listen to documents.',
    render: () => <MomoroReaderApp />,
    available: true,
  },
  {
    path: '/tools/highlights',
    label: 'Highlights',
    description: 'Collect and review key excerpts.',
    render: () => <ComingSoonTool name="Highlights" />,
    available: false,
  },
  {
    path: '/tools/library',
    label: 'Library',
    description: 'Store and organize imported content.',
    render: () => <ComingSoonTool name="Library" />,
    available: false,
  },
];

const defaultToolPath = toolDefinitions[0]?.path ?? '/';

const getNormalizedPath = (path: string): string => {
  if (path === '/') {
    return defaultToolPath;
  }

  return path;
};

const navigateTo = (path: string): void => {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const ShellApp = (): JSX.Element => {
  const [currentPath, setCurrentPath] = useState<string>(() => getNormalizedPath(window.location.pathname));

  useEffect(() => {
    if (window.location.pathname === '/') {
      window.history.replaceState({}, '', defaultToolPath);
    }

    const handlePopState = (): void => {
      setCurrentPath(getNormalizedPath(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const activeTool = useMemo(
    () => toolDefinitions.find((tool) => tool.path === currentPath) ?? toolDefinitions[0],
    [currentPath],
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#050706] font-mono text-emerald-100 md:flex-row">
      <aside className="w-full border-b border-emerald-500/30 bg-[#07110a] p-4 shadow-[inset_0_-1px_0_rgba(16,185,129,0.25)] md:w-72 md:shrink-0 md:border-b-0 md:border-r md:shadow-[inset_-1px_0_0_rgba(16,185,129,0.25)]">
        <h1 className="text-lg font-semibold text-emerald-200">Tools</h1>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 md:block md:space-y-2 md:overflow-visible md:pb-0" aria-label="Tool Navigation">
          {toolDefinitions.map((tool) => {
            const isActive = tool.path === activeTool.path;
            return (
              <a
                key={tool.path}
                href={tool.path}
                onClick={(event) => {
                  event.preventDefault();
                  navigateTo(tool.path);
                }}
                className={`block min-w-[12rem] rounded-md border px-3 py-2 transition md:min-w-0 ${
                  isActive
                    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100 shadow-[0_0_0_1px_rgba(52,211,153,0.45),0_0_12px_rgba(16,185,129,0.25)]'
                    : 'border-emerald-500/25 bg-[#0a160f] text-emerald-300/90 hover:border-emerald-400/50 hover:bg-emerald-500/10'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{tool.label}</span>
                  {!tool.available ? (
                    <span className="rounded border border-emerald-500/30 bg-[#07110a] px-2 py-0.5 text-xs text-emerald-300/70">Soon</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-emerald-300/70">{tool.description}</p>
              </a>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto bg-[#050706] p-6">{activeTool.render()}</main>
    </div>
  );
};

export default ShellApp;
