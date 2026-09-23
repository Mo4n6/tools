# Mo4n6 Tools

Six browser tools that do their work in the tab you have open, rather than on
someone else's machine. Deployed at **<https://mo4n6.github.io/tools/>**.

| Tool | What it does | Leaves the machine? |
| --- | --- | --- |
| [Momoro Reader](https://mo4n6.github.io/tools/#/momoro-reader) | Read and listen to documents | Downloads voice weights on first use |
| [Binaural Beats](https://mo4n6.github.io/tools/#/binaural-beats) | Generated tones for sleep, focus and calm | No |
| [Dead Letter](https://mo4n6.github.io/tools/#/dead-letter) | Offline `.eml` / `.msg` viewer and header analysis | No |
| [Glass](https://mo4n6.github.io/tools/#/glass) | Image upscaling: Lanczos, Scale2x, or your own ONNX model | Only to fetch weights you choose |
| [Husk](https://mo4n6.github.io/tools/#/husk) | Deobfuscate malicious PowerShell and extract IOCs | No |
| [Rotation Goblin](https://mo4n6.github.io/tools/#/rotation-goblin) | Sector rotation, RSI and relative-strength radar | No — data ships with the build |

Two of these handle hostile input — Dead Letter takes phishing mail, Husk takes
live malware — which is why "runs locally" is a design constraint here and not a
marketing line. Neither uploads a sample anywhere.

The "leaves the machine" column is meant literally. Where a tool does reach the
network, it is named below under that tool.

Source-available, not open source. Free for individuals and small organisations,
commercially licensable above that. See [Licence](#licence).

## Running it

```
npm install
npm run dev          # http://localhost:5173
```

Everything else you are likely to need:

```
npm test             # vitest
npm run typecheck    # both tsconfig projects
npm run ci:prebuild  # typecheck + merge-leftover guard
npm run build        # production build into dist/
npm run preview      # serve dist/ as it will be served
```

Node 24 is what CI uses.

### Repository layout

```
src/
  ShellApp.tsx          the tool switcher, routing and tab title
  App.tsx               Momoro Reader
  features/<tool>/      one directory per tool
  tts/                  speech providers shared by Momoro Reader
  licenses/             project licence constants and third-party manifests
public/                 files copied verbatim into the build
scripts/                generators, guards and maintenance helpers
docs/                   design records and conventions
```

### Adding a tool

Add an entry to `toolDefinitions` in `src/ShellApp.tsx`; routing, the sidebar and
the tab title follow from it. Give the tool's entry point the licence header the
others carry — `npm test` fails if a registered tool is missing one. The
conventions are written up in
[Tools shell routing and UI conventions](docs/tools-shell-routing-and-ui.md).

## Deployment

Pushing to `main` deploys to GitHub Pages via
[`deploy-pages.yml`](.github/workflows/deploy-pages.yml). The repository must
have **Settings → Pages → Source** set to **GitHub Actions**.

Routes work two ways, because Pages is a static host:

- Hash route: `https://mo4n6.github.io/tools/#/husk`
- Pretty route, via the SPA 404 fallback: `https://mo4n6.github.io/tools/husk`
- Dead Letter's standalone file: `https://mo4n6.github.io/tools/dead-letter.html`

The hash route is the one to link to. The pretty route depends on the 404
fallback in `public/404.html`, and it happens to collide neatly with the base
path here only because the repository is itself named `tools`.

### Base path

`VITE_BASE_PATH` sets the deploy subpath at build time, including a trailing
slash. Unset, a production build falls back to the repository name from
`GITHUB_REPOSITORY` — which is what the live deploy relies on, giving `/tools/`.

### Build-time flags

| Variable | Unset behaviour | Effect |
| --- | --- | --- |
| `VITE_BASE_PATH` | repository name | Deploy subpath |
| `VITE_ENABLE_URL_INGEST` | **on** | Momoro Reader URL ingestion; needs a backend |
| `VITE_EXTRACT_API_BASE_URL` | `/api/extract` | That backend's base URL |
| `VITE_SKIP_KOKORO_INIT_ON_PAGES` | **does not skip** | Skip Kokoro init and use Web Speech |
| `VITE_GLASS_WEIGHTS_URL` | — | Pre-fills the Glass weights field |

Both flags are worth reading twice, because neither defaults the way the name
suggests:

- URL ingestion is enabled unless the value is exactly `false`
  (`VITE_ENABLE_URL_INGEST !== 'false'`). So a plain `npm run dev` shows the URL
  tab, and submitting there posts to `/api/extract`, which is nothing unless you
  are running a backend. Set it to `false` if you want the tab gone.
- Kokoro init is skipped only when the value is exactly `true` **and** the base
  path is not `/` (`isPagesStyleBase && shouldSkipKokoroInitOnPages`). Unset, it
  initialises normally.

The Pages build sets `VITE_ENABLE_URL_INGEST=false` and
`VITE_SKIP_KOKORO_INIT_ON_PAGES=false`, so the live site has the URL tab hidden
and Kokoro enabled.

## Notes on individual tools

### Momoro Reader

Two speech paths. The browser's built-in Web Speech voices need no download. The
Kokoro path fetches `onnx-community/Kokoro-82M-ONNX` from Hugging Face on first
use and runs it locally after that, on WebGPU where the browser offers an adapter
and on WASM otherwise.

URL ingestion is the one feature in this repository that needs a server:
extracting an article from a URL requires a backend. Note that it is **on** in a
default build — see the flags above — so the URL tab appears in `npm run dev` and
posts to `/api/extract` whether or not anything is listening there. The Pages
build turns it off explicitly.

### Glass

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

#### Neural tier weights

Glass ships no model and contacts no inference service. There are three ways to
give it one, and nothing is fetched until the operator picks:

1. **A known model** — an entry in `WEIGHTS_PRESETS`, chosen from a list.
2. **A local file** — an `.onnx` from disk.
3. **A URL** — any https address (http is allowed on localhost only).

Weights are cached in the browser after the first load. The scale factor is read
back from the model's own output shape rather than configured, so a 2x and a 4x
network both work unchanged.

#### Adding a known model

A preset pins its URL to an immutable revision and records a SHA-256 of the exact
bytes. Glass verifies that digest before the weights reach the runtime, on the
network path and on the cache path alike, and refuses anything that does not
match. The effect is that the host serving the file is infrastructure rather than
a trusted party: a swap at the origin, an interfering middlebox or a poisoned
cache entry fails the check instead of quietly executing.

Entries are produced by the helper rather than written by hand, because a wrong
digest is indistinguishable from an attack:

```
npm run glass:preset -- <url> [expected-sha256] [<url> [expected-sha256] ...]
```

It downloads each candidate, hashes it, loads the graph, runs a 64x64 RGB tile
through it to confirm it really is a super-resolution model that can be tiled,
reports the factor it inferred, and prints records to paste into
`WEIGHTS_PRESETS` in `src/features/glass/presets.ts`.

A bare 64-character hex argument is read as the expected digest of the URL before
it. It is checked rather than trusted: if a digest transcribed from a model card
disagrees with the bytes, the script prints both and emits no record for that
model. Shipping a mismatched digest fails in the browser as though the download
had been tampered with, which is an alarming way to find a typo.

A model with a fixed input size is the other thing the probe catches. It loads
and hashes perfectly well, and then cannot be tiled, which is the one thing Glass
needs from it.

Use a revision URL, not a branch: a branch moves, and a digest pinned to a moving
target eventually fails for no reason anyone remembers.

`WEIGHTS_PRESETS` ships with three Real-ESRGAN entries. Their digests were
supplied rather than computed when they were first added, and have since been
confirmed against copies downloaded from those exact URLs; the recorded sizes
were measured at the same time.

What remains unconfirmed is behaviour: none has been run through Glass, so each
`scale` is what the export is named for rather than what was observed. That
costs nothing in correctness, because the real factor is read back from the
model's output shape at run time — a wrong label changes what the dropdown says,
not what the tier produces.

With no entries at all the UI says so and points at the helper, rather than
offering a download that may 404 or may not be the model it claims to be.

#### Sample images

`npm run glass:samples` draws the three images offered on the page into
`public/glass-samples/`. They are generated rather than sourced, so the
repository carries no third-party image and no licence question, and each one is
built to make a different tier obviously correct:

| Sample | What it is | Where it goes |
| --- | --- | --- |
| `sprite.png` | 32x32, four colours, hard edges | Pixel keeps them; Lanczos rounds them off |
| `chart.png` | A spoke target and a gradient ramp | Lanczos resolves it; Pixel cannot |
| `soft.png` | Blurred past recovery | Only the neural tier can invent detail |

Output is deterministic, so regenerating without changing the script produces no
diff.

#### Print size

A model enlarges by the factor it was trained for, and that factor has nothing
to do with the size anyone needs to print. Turning on **Print size** separates
the two: the tier decides how much detail exists, and this decides how far it is
spread.

Give it a size in inches and a density, or pick one of the DTF presets, and the
result is rendered at exactly those pixels. `Fit whole` keeps the entire design
and pads the rest with transparency, which is what transfer film wants — it
carries ink only where there is ink, so the margin costs nothing. `Fill sheet`
covers the target instead and crops whatever falls outside.

Fitting happens after upscaling rather than instead of it. That ordering is the
point: reducing a large result is discarding surplus detail, where enlarging a
small one is stretching a shortage of it.

Before anything runs, the panel reports the density the chosen size would
actually get — the number that decides whether a print holds up, and the one
usually not shown. A result can be enormous in pixels and still be thin spread
over 22 inches.

The download is named for the size, so a folder of transfers reads
`logo@11x14in.png` rather than four files all called `4x`.

Print targets are held to the same memory ceiling as the upscaler, because
inches and density multiply quickly: 22x36 inches at 600 DPI is 285 megapixels.

#### What the neural tier adds to the deployment

The ONNX Runtime WebAssembly binary (~21 MB, served compressed) is emitted into
`dist/assets` by the build and referenced by hash, so it deploys with the site
instead of being fetched from a CDN at runtime. `npm run check:ort-asset` fails
the build if that binary stops being emitted or stops being referenced.

Execution uses WebGPU where the browser offers an adapter and single-threaded
WASM otherwise. Threads are not requested: they need `SharedArrayBuffer`, which
needs cross-origin isolation headers, which GitHub Pages cannot send.

Large images are tiled with overlapping context and recombined through a
raised-cosine window, so a photograph does not have to fit in GPU memory all at
once and the tile seams do not show.

### Husk

Husk emulates obfuscated PowerShell rather than running it: the computational
half is evaluated for real, and anything that would touch the host is a logging
stub. Each `Invoke-Expression` it unwraps becomes a layer, and IOCs are collected
across every layer rather than only the last.

It reports what it could not deobfuscate instead of quietly returning a clean
verdict. The design record, including where the ceiling is and why, is in
[`docs/husk-spec.md`](docs/husk-spec.md).

Never commit malware samples to this repository. Local corpora live outside the
tree; the `husk:*` scripts expect them there.

### Dead Letter

Dead Letter ships as one self-contained HTML file rather than as a React view, so
it can be downloaded and run from disk with no server and no network. Vite copies
`public/` verbatim, so the file served under the base path and the file the
download button hands over are the same bytes.

The shell tab (`src/features/dead-letter/DeadLetterApp.tsx`) embeds that file in
an iframe and links to it with a `download` attribute. The page carries its own
Content-Security-Policy and its own copy of the shell palette; it deliberately
links no site stylesheet, because that would break the `file://` copy.

### Rotation Goblin

Market data is generated ahead of time and committed, so the tool itself makes no
requests. `update-rotation-goblin.yml` refreshes it on a weekday schedule and
validates it before committing; the same workflow runs on pull requests that touch
the tool, without the commit step.

## Licence

Licensed under [PolyForm Small Business 1.0.0](https://polyformproject.org/licenses/small-business/1.0.0) (`PolyForm-Small-Business-1.0.0`).

**Free to use** if you are an individual, or if your organisation — together with its affiliates — has fewer than 100 total employees and independent contractors and under $1,000,000 USD (2019, adjusted for inflation) in prior-year revenue.

**Above those thresholds?** A commercial licence is available. [Open a licensing issue](https://github.com/Mo4n6/tools/issues/new?template=licensing.yml) — it is a short conversation, and there is a licence waiting for you. If you would rather not discuss it in public, say so in the issue and the maintainer will follow up privately.

You are free to read, modify, and redistribute the code within those limits. The full terms are in [`LICENSE`](LICENSE).

The licence asks for its `Required Notice:` line to travel with copies. It is in every tool's source header, in both served pages, and stamped onto each built JavaScript chunk by the build, so a redistributed build carries it without anyone having to remember. `npm test` fails if a tool loses it.

Third-party code keeps its own licence and is **not** covered by the above. Two things to know: Husk's lexer tables are generated from the MIT-licensed PowerShell parser and carry Microsoft's copyright notice, and one shipped dependency is LGPL-3.0. See [`THIRD-PARTY.md`](THIRD-PARTY.md) for both, and for what the LGPL asks of anyone redistributing a build. Regenerate the dependency tally with `npm run licenses`.

Model weights are separate again: Momoro Reader's speech weights are listed in [`docs/licenses/tts-manifest.json`](docs/licenses/tts-manifest.json), and Glass runs upscaling models you supply yourself, under whatever licence they came with.

Contributions are welcome under the terms in [`CONTRIBUTING.md`](CONTRIBUTING.md). Project and tool names are trademarks — see [`TRADEMARK.md`](TRADEMARK.md).

GitHub's sidebar shows this repository's licence as "Other", because PolyForm is not in the list GitHub can auto-detect. The machine-readable identifier is the `license` field in `package.json`.

## Additional docs

- [Tools shell routing and UI conventions](docs/tools-shell-routing-and-ui.md)
- [Husk design record](docs/husk-spec.md)
- [Performance budgets](docs/perf-budgets.md)
