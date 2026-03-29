# kokoro-reader

## GitHub Pages deployment

This repository deploys to GitHub Pages on every push to `main` using `.github/workflows/deploy-pages.yml`.

Workflow runs:

- `https://github.com/<your-github-username>/kokoro-reader/actions/workflows/deploy-pages.yml`

### Pages URL

- `https://<your-github-username>.github.io/kokoro-reader/`
- Built assets should resolve from `https://<your-github-username>.github.io/kokoro-reader/assets/...`

### MVP scope supported on Pages

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

## Repository settings required

In GitHub repository settings:

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
