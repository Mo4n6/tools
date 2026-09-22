# tts-reader-mvp

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
- Glass route: `https://<host>/<base-path>#/glass` or `https://<host>/tools/glass`
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

## Glass (image upscaling)

Glass enlarges an image without sending it anywhere. It offers three methods
rather than choosing one, because they do different things and only the person
looking at the image knows which is wanted:

| Tier | Method | Best for | Download |
| --- | --- | --- | --- |
| Lanczos | Windowed-sinc resampling, in a worker | Sharp photographs that just need to be larger | None |
| Pixel | Scale2x edge extension, in a worker | Sprites, screenshots, logos, line art | None |
| Neural | A tiled ONNX super-resolution model | Soft photographs where invented detail beats none | The weights you supply |

The first two tiers need nothing but the page. Lanczos reconstructs the signal
the source pixels encode; Pixel never blends, so the output palette is exactly
the input palette.

### Neural tier weights

Glass ships no model and contacts no inference service. There are three ways to
give it one, and nothing is fetched until the operator picks:

1. **A known model** — an entry in `WEIGHTS_PRESETS`, chosen from a list.
2. **A local file** — an `.onnx` from disk.
3. **A URL** — any https address (http is allowed on localhost only).

Weights are cached in the browser after the first load. The scale factor is read
back from the model's own output shape rather than configured, so a 2x and a 4x
network both work unchanged.

A build can also pre-fill the URL field with `VITE_GLASS_WEIGHTS_URL`.

### Adding a known model

A preset pins its URL to an immutable revision and records a SHA-256 of the
exact bytes. Glass verifies that digest before the weights reach the runtime,
on the network path and on the cache path alike, and refuses anything that does
not match. The effect is that the host serving the file is infrastructure
rather than a trusted party: a swap at the origin, an interfering middlebox or
a poisoned cache entry fails the check instead of quietly executing.

Entries are produced by the helper rather than written by hand, because a wrong
digest is indistinguishable from an attack:

```
npm run glass:preset -- https://huggingface.co/<repo>/resolve/<revision>/model.onnx
```

It downloads the candidate, hashes it, loads the graph, runs a 64x64 RGB tile
through it to confirm it really is a super-resolution model, reports the factor
it inferred, and prints a record to paste into `WEIGHTS_PRESETS` in
`src/features/glass/presets.ts`. Use a revision URL, not a branch: a branch
moves, and a digest pinned to a moving target eventually fails for no reason
anyone remembers.

`WEIGHTS_PRESETS` ships empty. With no entries the UI says so and points at the
helper, rather than offering a download that may 404 or may not be the model it
claims to be.

### What the neural tier adds to the deployment

The ONNX Runtime WebAssembly binary (~21 MB, served compressed) is emitted into
`dist/assets` by the build and referenced by hash, so it deploys with the site
instead of being fetched from a CDN at runtime. `npm run check:ort-asset` fails
the build if that binary stops being emitted or stops being referenced.

Note that this is a different posture from the Kokoro TTS path, which loads its
runtime from jsDelivr at run time.

Execution uses WebGPU where the browser offers an adapter and single-threaded
WASM otherwise. Threads are not requested: they need `SharedArrayBuffer`, which
needs cross-origin isolation headers, which GitHub Pages cannot send.

Large images are tiled with overlapping context and recombined through a
raised-cosine window, so a photograph does not have to fit in GPU memory all at
once and the tile seams do not show.

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

## Additional docs

- [Tools shell routing and UI conventions](docs/tools-shell-routing-and-ui.md)
