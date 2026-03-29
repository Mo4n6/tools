# GitHub Pages MVP

## Deployment references

- Workflow: `https://github.com/<your-github-username>/kokoro-reader/actions/workflows/deploy-pages.yml`
- Site: `https://<your-github-username>.github.io/kokoro-reader/`
- Asset URL pattern to verify after deploy: `https://<your-github-username>.github.io/kokoro-reader/assets/...`

## Scope

### Supported
- Paste text input
- Upload local `.txt`, `.md`, and `.html` files
- Playback controls (play, pause, stop, seek/rate/voice controls where available)

### Not supported (Pages-only deployment)
- Arbitrary URL extraction (fetching and parsing content directly from user-provided web URLs)

## Browser capability notes

### Kokoro / WebGPU path
- Preferred path when browser and hardware expose a supported WebGPU runtime.
- Works best on up-to-date Chromium-based desktop browsers with WebGPU enabled by default.
- If WebGPU is unavailable, the app should fall back to Web Speech synthesis mode.

### Web Speech fallback path
- Used when Kokoro/WebGPU is not available.
- Depends on browser-provided speech synthesis voices; voice inventory and quality vary by OS/browser.
- Some browsers may require a user interaction before audio playback starts.

### Browser-specific expectations
- **Chrome (desktop):** Highest likelihood of Kokoro/WebGPU availability; Web Speech also available as fallback.
- **Safari:** WebGPU and speech feature availability vary by version/platform; expect Web Speech fallback in many environments.
- **Firefox:** WebGPU support may be limited depending on version/config; Web Speech fallback expected when Kokoro path is unavailable.

## Manual QA matrix

| Browser | Input: Paste text | Input: Upload `.txt` | Input: Upload `.md` | Input: Upload `.html` | TTS mode: Kokoro/WebGPU | TTS mode: Web Speech fallback |
|---|---|---|---|---|---|---|
| Chrome (desktop) | **Expected:** text accepted, editable, ready for playback | **Expected:** file loads as plain text and is playable | **Expected:** markdown source text loads and is playable | **Expected:** HTML text content is extracted/sanitized for playback | **Expected (when WebGPU available):** Kokoro initializes and playback controls function | **Expected (if forced/unavailable WebGPU):** speech synthesis starts with available system/browser voice |
| Safari | **Expected:** text accepted, editable, ready for playback | **Expected:** file loads as plain text and is playable | **Expected:** markdown source text loads and is playable | **Expected:** HTML text content is extracted/sanitized for playback | **Expected:** may be unavailable depending on Safari version/platform; app should gracefully fall back | **Expected:** fallback mode works with Safari voices; playback controls operate within platform limits |
| Firefox | **Expected:** text accepted, editable, ready for playback | **Expected:** file loads as plain text and is playable | **Expected:** markdown source text loads and is playable | **Expected:** HTML text content is extracted/sanitized for playback | **Expected:** often unavailable/experimental; app should report unsupported state and fall back | **Expected:** fallback mode works with Firefox-supported voices and standard playback controls |

## QA notes
- Verify that unsupported URL extraction is not exposed in Pages-only UX.
- Confirm clear runtime messaging when Kokoro/WebGPU cannot initialize.
- Confirm playback controls remain functional and state-consistent across both TTS modes.
