# Tools Shell: Routing, Sidebar, and UI Conventions

This guide documents how to add and ship tools inside the `tools` shell without breaking deep links, routes, or static assets.

## 1) Subpath deploys (`tools` repo)

This app is intended to run under a subpath (for example `/tools/momoro-reader/` on GitHub Pages) and not only at `/`.

### How base path is resolved

`vite.config.ts` computes `base` like this in production:

1. `VITE_BASE_PATH` if set (recommended for explicit deploys)
2. otherwise `GITHUB_REPOSITORY` repo name
3. otherwise `/`

It also normalizes the path to always include leading/trailing `/`.

### Practical deploy rules

- Prefer setting `VITE_BASE_PATH` explicitly in CI/CD.
  - Example: `VITE_BASE_PATH=/tools/momoro-reader/`
- Keep all runtime assets and chunk URLs relative to `import.meta.env.BASE_URL` by relying on Vite-managed imports.
- After deployment, validate assets with:
  - `npm run check:deployed-assets -- https://<host>/<base-path>/`

## 2) Adding new tools to the sidebar

The sidebar is defined by `toolDefinitions` in `src/ShellApp.tsx`. Each entry controls:

- `path`: canonical route for the tool
- `label`: sidebar label
- `description`: supporting text
- `render`: tool root component
- `available`: whether to show a "Soon" badge

### Steps to add a tool

1. Create (or import) the tool root component.
2. Add a new object to `toolDefinitions`.
3. Use a stable path under `/tools/<tool-slug>`.
4. Set `available: false` if this is a placeholder state.

Example:

```tsx
{
  path: '/tools/my-new-tool',
  label: 'My New Tool',
  description: 'One-line description.',
  render: () => <MyNewToolApp />,
  available: true,
}
```

### Navigation behavior to preserve

- Sidebar links use `window.history.pushState` and dispatch `popstate`.
- `/` is normalized to the default tool path.
- Unknown paths currently fall back to the first configured tool.

If you change route matching, keep these invariants so existing deep links do not silently break.

## 2b) Static single-file tools

A tool that must also run from the user's own disk (no server, no network) ships as one
self-contained HTML file in `public/` instead of as a React view. `public/dead-letter.html` is
the reference implementation.

### How it is wired

1. Put the single file in `public/<slug>.html`. Vite copies `public/` verbatim, so it deploys
   to `<base>/<slug>.html` untouched.
2. Add a small wrapper component that resolves the file against `import.meta.env.BASE_URL`,
   embeds it in an `<iframe>`, and links to the same URL with a `download` attribute. See
   `src/features/dead-letter/deadLetterAsset.ts` for the URL helper and its tests.
3. Register the wrapper in `toolDefinitions` like any other tool.

### Rules for the static file

- Resolve the URL through `import.meta.env.BASE_URL`; a hard-coded `/tools/...` breaks any
  deploy at a different base path.
- Do not link the site stylesheet or any external font, script, or analytics into the file. The
  file carries its own copy of the shell palette so the downloaded copy looks identical, and a
  site-origin `<link>` would both need a CSP change and break under `file://`.
- Prefix every selector (`dl-` for Dead Letter) so the file's styles cannot collide with the
  shell's, and keep its `<meta http-equiv="Content-Security-Policy">` intact.
- Do not put a `sandbox` attribute on the wrapper `<iframe>`. These files are first-party and
  handle their own sandboxing internally; an outer sandbox blocks their `blob:` subframes,
  file pickers, and downloads.
- When the shell palette changes, update the static file's palette by hand. Nothing links the
  two automatically, by design.

## 3) Per-tool base routes

Each tool should have a unique, non-overlapping base route:

- ✅ `/tools/momoro-reader`
- ✅ `/tools/dead-letter`
- ✅ `/tools/highlights`
- ✅ `/tools/library`
- ❌ `/tools/momoro-reader/v2` (if this is intended as a separate top-level tool, give it its own slug)

### Route conventions

- Use kebab-case slugs.
- Never reuse or repurpose an existing slug for a different tool.
- Treat published slugs as API surface: once shipped, keep compatibility or add redirect handling before changing.
- Keep a single canonical path per tool in `toolDefinitions`.

## 4) Shared UI conventions

All tools should feel native to the shell layout.

### Layout

- Keep shell structure unchanged:
  - left sidebar (`aside`)
  - right content area (`main`)
- Tool content should render inside the existing `main` container and respect current padding/spacing.

### Visual language

- Use existing Tailwind utility style choices already present in shell and tool pages:
  - slate neutrals for default surfaces
  - blue accent for active/primary states
  - subtle borders and rounded corners
- Keep heading hierarchy consistent with existing tool views.

### States and messaging

- Use concise empty/loading/error states.
- If a tool is unavailable, prefer a stable placeholder with `available: false` rather than removing the route.
- Preserve accessibility attributes already in use (for example `aria-label="Tool Navigation"`, `aria-current="page"`).

## Release checklist (routes/assets safety)

Use this checklist before merging a new tool:

### Route safety

- [ ] New tool added to `toolDefinitions` with unique `/tools/<slug>` path.
- [ ] Existing tool paths are unchanged, or redirects/compat plan documented.
- [ ] Loading `/` still redirects/replaces to default tool route.
- [ ] Browser back/forward works between tools via `popstate`.
- [ ] Direct navigation to each tool path renders expected content.

### Asset safety

- [ ] Static single-file tools resolve through `import.meta.env.BASE_URL`, and the deployed
      `<base>/<slug>.html` returns the file itself rather than the SPA fallback.
- [ ] Build with production base path (`VITE_BASE_PATH`) expected for target deploy.
- [ ] Deployed asset URLs resolve under the intended subpath.
- [ ] `npm run check:deployed-assets -- https://<host>/<base-path>/` passes.
- [ ] Dynamic chunks (including Kokoro-related chunks when applicable) load without 404s.

### Regression and quality

- [ ] `npm run build` passes locally/CI.
- [ ] `npm run test` passes.
- [ ] Existing tool routes still render and interact correctly.
- [ ] Placeholder (`available: false`) tools still show a stable “Soon” state.
- [ ] Any user-facing route/path changes are noted in release notes.

### Recommended CI gates for new-tool releases

- `npm run build`
- `npm run test`
- `npm run check:browser-imports`
- `npm run check:kokoro-chunk`
- `npm run check:tts-manifest`
- `npm run check:deployed-assets -- <deployed-url>`
