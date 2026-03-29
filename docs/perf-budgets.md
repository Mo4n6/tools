# TTS Performance Budgets (MVP)

These budgets define the minimum acceptable playback experience for the Reader Workbench MVP and map directly to runtime telemetry emitted by the app.

## Telemetry tracked

- **Time-to-first-audio** (`tts.first_audio`): elapsed time from a user play request until first audio starts.
- **Per-segment synth latency** (`tts.segment_synth`): synthesis duration for each segment.
- **Queue underruns** (`tts.queue_underrun`): emitted when playback advances and the next segment audio is not yet ready.
- **Model load time** (`tts.model_load`): Kokoro engine/module load and initialization duration.
- **Peak memory estimate** (`tts.model_load.peakMemoryMb`, where available): best-effort estimate from browser `performance.memory`.
- **Degraded-mode transitions** (`tts.degraded_mode`): fallback transitions from Kokoro to Web Speech and reason.

## MVP budgets

- **Time-to-first-audio (desktop baseline):** `< 2.5s` at p95.
- **Per-segment synthesis latency:** `< 700ms` median, `< 1.5s` at p95 for short/medium segments.
- **Queue underrun rate:** `< 1%` of playback transitions.
- **Kokoro model load time:** `< 4.0s` p95 on desktop baseline.
- **Peak memory estimate:** `< 1.2GB` during Kokoro warmup/synthesis on desktop baseline.

## Notes

- “Desktop baseline” means a modern laptop/desktop browser with at least 4GB reported device memory.
- `performance.memory` is browser-dependent; when unavailable, memory budget checks are treated as informational-only.
- Degraded-mode transitions are expected on constrained devices or when Kokoro warmup fails; track transition rate to identify regressions.
