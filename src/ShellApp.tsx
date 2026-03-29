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
  <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="text-xl font-semibold text-slate-900">{name}</h2>
    <p className="mt-2 text-slate-600">
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
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="w-72 border-r border-slate-200 bg-white p-4">
        <h1 className="text-lg font-semibold">Tools</h1>
        <nav className="mt-4 space-y-2" aria-label="Tool Navigation">
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
                className={`block rounded-md border px-3 py-2 transition ${
                  isActive
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{tool.label}</span>
                  {!tool.available ? (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Soon</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">{tool.description}</p>
              </a>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-6">{activeTool.render()}</main>
    </div>
  );
};

export default ShellApp;
