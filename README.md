# Mo4n6 Tools

A set of self-contained browser tools: [Momoro Reader](https://mo4n6.github.io/tools/#/momoro-reader) for reading and listening to documents, [Binaural Beats](https://mo4n6.github.io/tools/#/binaural-beats) for generated soundscapes, and [Dead Letter](https://mo4n6.github.io/tools/#/dead-letter) for offline `.eml` and `.msg` analysis. Everything runs in the browser; Dead Letter also downloads as a single file you can run from your own disk with no network.

Source-available, not open source. Free for individuals and small organisations, commercially licensable above that. See [Licence](#licence).

## GitHub Pages deployment

This repository deploys to GitHub Pages on every push to `main` using `.github/workflows/deploy-pages.yml`.

Workflow runs:

- `https://github.com/<your-github-username>/tts-reader-mvp/actions/workflows/deploy-pages.yml`

### Pages URL

- `https://<your-github-username>.github.io/tts-reader-mvp/`
- Built assets should resolve from `https://<your-github-username>.github.io/tts-reader-mvp/assets/...`
- Tools shell route (hash-safe): `https://<host>/<base-path>#/momoro-reader`
- Binaural Beats route: `https://<host>/<base-path>#/binaural-beats` or `https://<host>/tools/binaural-beats`
- Dead Letter route: `https://<host>/<base-path>#/dead-letter` or `https://<host>/tools/dead-letter`
- Dead Letter standalone file (also what the tab's download button serves): `https://<host>/<base-path>dead-letter.html`
- Pretty route (with SPA 404 redirect fallback): `https://<host>/tools/momoro-reader?b64=<base64text>`

### MVP scope supported on Pages

### Base path configuration for Pages

Set `VITE_BASE_PATH` at build time to the exact deploy subpath (must include app folder):

- `VITE_BASE_PATH=/tools/momoro-reader/`
- or `VITE_BASE_PATH=/momoro-reader/`

If `VITE_BASE_PATH` is not set, production builds fall back to `GITHUB_REPOSITORY` name (for example `/tts-reader-mvp/`).


GitHub Pages is a static host, so the deployed MVP supports:

- Pasting text into the app
- Uploading supported local files
- Running local browser TTS playback

### URL ingestion support

URL ingestion requires the separate extraction backend deployment (for example, a serverless or API host) and setting:

- `VITE_ENABLE_URL_INGEST=true`
- `VITE_EXTRACT_API_BASE_URL=<your-backend-base-url>`

For Pages-only deployment, keep URL ingestion disabled (`VITE_ENABLE_URL_INGEST=false`).

### Kokoro init on Pages (MVP reliability flag)

- `VITE_SKIP_KOKORO_INIT_ON_PAGES` controls whether Pages deployments intentionally skip Kokoro initialization and use Web Speech mode.
- Default behavior is enabled (`true`) for Pages-style base paths.
- Set `VITE_SKIP_KOKORO_INIT_ON_PAGES=false` to re-enable Kokoro provider initialization attempts on Pages.

### How to verify GPU is truly enabled

Quick checklist:

- Build/run with `VITE_SKIP_KOKORO_INIT_ON_PAGES=false` so Kokoro init is not intentionally skipped by Pages config.
- Confirm the browser supports WebGPU (`navigator.gpu` exists).
- Clear any previously marked unstable profile state, then retry provider init.

## Repository settings required

In GitHub repository settings:

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

## Static single-file tools

Some tools ship as one self-contained HTML file rather than as a React view, so they can be
downloaded and run from disk with no server and no network. `public/dead-letter.html` is the
first of these: Vite copies `public/` verbatim, so the file served under the base path and the
file the download button hands over are the same bytes.

The shell tab (`src/features/dead-letter/DeadLetterApp.tsx`) embeds that file in an iframe and
links to it with a `download` attribute. The page carries its own Content-Security-Policy and
its own copy of the shell palette; it deliberately links no site stylesheet, because that would
break the `file://` copy. See [Tools shell routing and UI conventions](docs/tools-shell-routing-and-ui.md)
for the full pattern.


## Licence

Licensed under [PolyForm Small Business 1.0.0](https://polyformproject.org/licenses/small-business/1.0.0) (`PolyForm-Small-Business-1.0.0`).

**Free to use** if you are an individual, or if your organisation — together with its affiliates — has fewer than 100 total employees and independent contractors and under $1,000,000 USD (2019, adjusted for inflation) in prior-year revenue.

**Above those thresholds?** A commercial licence is available. [Open a licensing issue](https://github.com/Mo4n6/tools/issues/new?template=licensing.yml) — it is a short conversation, and there is a licence waiting for you. If you would rather not discuss it in public, say so in the issue and the maintainer will follow up privately.

You are free to read, modify, and redistribute the code within those limits. The full terms are in [`LICENSE`](LICENSE).

Bundled third-party code keeps its own licence and is **not** covered by the above. One dependency is LGPL-3.0. See [`THIRD-PARTY.md`](THIRD-PARTY.md) for what that covers and what it asks of anyone redistributing a build.

Contributions are welcome under the terms in [`CONTRIBUTING.md`](CONTRIBUTING.md). Project and tool names are trademarks — see [`TRADEMARK.md`](TRADEMARK.md).

## Additional docs

- [Tools shell routing and UI conventions](docs/tools-shell-routing-and-ui.md)
