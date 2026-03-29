# codextest

## GitHub Pages deployment

This repository deploys to GitHub Pages on every push to `main` using `.github/workflows/deploy-pages.yml`.

### Pages URL

- `https://<your-github-username>.github.io/codextest/`

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

## Repository settings required

In GitHub repository settings:

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
