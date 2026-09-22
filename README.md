# Mo4n6 Tools

A set of self-contained browser tools:

- [Momoro Reader](https://mo4n6.github.io/tools/#/momoro-reader) — read and listen to documents
- [Binaural Beats](https://mo4n6.github.io/tools/#/binaural-beats) — generated soundscapes for sleep, focus and calm
- [Dead Letter](https://mo4n6.github.io/tools/#/dead-letter) — offline `.eml` and `.msg` viewer and header analysis
- [Glass](https://mo4n6.github.io/tools/#/glass) — image upscaling: Lanczos, Scale2x, or your own ONNX model
- [Husk](https://mo4n6.github.io/tools/#/husk) — deobfuscate malicious PowerShell and extract IOCs
- [Rotation Goblin](https://mo4n6.github.io/tools/#/rotation-goblin) — sector rotation, RSI and relative-strength radar

Everything runs in the browser. Dead Letter also downloads as a single file you can run from your own disk with no network.

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
- Glass route: `https://<host>/<base-path>#/glass` or `https://<host>/tools/glass`
- Husk route: `https://<host>/<base-path>#/husk` or `https://<host>/tools/husk`
- Rotation Goblin route: `https://<host>/<base-path>#/rotation-goblin` or `https://<host>/tools/rotation-goblin`
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


## Licence

Licensed under [PolyForm Small Business 1.0.0](https://polyformproject.org/licenses/small-business/1.0.0) (`PolyForm-Small-Business-1.0.0`).

**Free to use** if you are an individual, or if your organisation — together with its affiliates — has fewer than 100 total employees and independent contractors and under $1,000,000 USD (2019, adjusted for inflation) in prior-year revenue.

**Above those thresholds?** A commercial licence is available. [Open a licensing issue](https://github.com/Mo4n6/tools/issues/new?template=licensing.yml) — it is a short conversation, and there is a licence waiting for you. If you would rather not discuss it in public, say so in the issue and the maintainer will follow up privately.

You are free to read, modify, and redistribute the code within those limits. The full terms are in [`LICENSE`](LICENSE).

The licence asks for its `Required Notice:` line to travel with copies. It is in every tool's source header, in both served pages, and stamped onto each built JavaScript chunk by the build, so a redistributed build carries it without anyone having to remember. `npm test` fails if a tool loses it.

Third-party code keeps its own licence and is **not** covered by the above. Two things to know: Husk's lexer tables are generated from the MIT-licensed PowerShell parser and carry Microsoft's copyright notice, and one shipped dependency is LGPL-3.0. See [`THIRD-PARTY.md`](THIRD-PARTY.md) for both, and for what the LGPL asks of anyone redistributing a build.

Model weights are separate again: Momoro Reader's speech weights are listed in [`docs/licenses/tts-manifest.json`](docs/licenses/tts-manifest.json), and Glass runs upscaling models you supply yourself, under whatever licence they came with.

Contributions are welcome under the terms in [`CONTRIBUTING.md`](CONTRIBUTING.md). Project and tool names are trademarks — see [`TRADEMARK.md`](TRADEMARK.md).

## Additional docs

- [Tools shell routing and UI conventions](docs/tools-shell-routing-and-ui.md)
