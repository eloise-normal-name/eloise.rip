# Pitchy Integration Plan (Self-Hosted, Optional)

## Implementation Status

✅ Implemented on branch `pitchy-self-hosted-docs`.

### Shipped paths and versions

- Vendor directory:
  - `content/media/voice-recorder/pitchy/`
- Vendored modules:
  - `content/media/voice-recorder/pitchy/pitchy-4.1.0.esm.js`
  - `content/media/voice-recorder/pitchy/fft-4.0.4.esm.js`
- Runtime loader path:
  - `VoiceRecorderApp.pitchyModuleUrl = '/media/voice-recorder/pitchy/pitchy-4.1.0.esm.js'`

### Implemented code touchpoints

- UI toggle + persistence:
  - `content/pages/voice-recorder/voice-recorder.md`
  - `content/pages/voice-recorder/voice-recorder.css`
  - `content/pages/voice-recorder/voice-recorder.js`
- Detector wrapper and fallback wiring:
  - `content/pages/voice-recorder/pitch-detector.js`
  - `content/pages/voice-recorder/voice-recorder.js`
- Visualizer detector injection:
  - `content/pages/voice-recorder/audio-visualizer.js`

### Behavior shipped

- Default detector remains autocorrelation (no behavior change unless toggled on).
- Pitchy is lazy-loaded with dynamic `import()` only when enabled.
- If Pitchy fails to load or throws, app auto-falls back to autocorrelation and resets toggle.
- Primary pitch uses Pitchy when enabled; secondary pitch continues to come from autocorrelation when requested.

### Validation run

- `pelican content -o output -s pelicanconf.py` ✅
- `validate_output.py` ✅ (internal links/media pass; existing orphaned media warnings are unrelated)

## Scope

Add Pitchy as an optional pitch detector for the voice recorder, self-hosted
under `content/media/voice-recorder/`, while keeping the existing autocorrelation
detector as the default/fallback. No new build tools.

## Constraints

- Keep changes minimal and consistent with existing structure.
- No new build tooling unless explicitly requested.
- Static assets must live under `content/media` or `content/extra`.
- Preserve current UI/behavior unless the user opts into Pitchy.

## Plan

### 1) Vendor Pitchy for static hosting

- Copy the ESM build of `pitchy@4.x` into:
  - `content/media/voice-recorder/pitchy/` (final path to confirm).
- Include any required dependency modules (e.g., `fft.js`) in the same folder
  and adjust import paths for local resolution.
- Keep versioned filenames to make updates explicit.

### 2) Optional setting in the UI

- Add a toggle inside the existing Settings panel in:
  - `content/pages/voice-recorder/voice-recorder.md`
- Store the choice in `localStorage` so it persists across sessions.
- Default to the current detector to avoid behavior changes.

### 3) Pitchy loader + adapter

- Add a lazy dynamic `import()` in:
  - `content/pages/voice-recorder/voice-recorder.js`
- Create a wrapper that matches the current signature:
  - `detectPitch(buffer, sampleRate, detectSecondary, options)`
- Map Pitchy’s `clarity` to `primaryStrength` and apply existing thresholds.
- If Pitchy fails to load or throws, fall back to current detector.

### 4) Visualizer integration

- Route pitch detection through the wrapper based on the toggle state in:
  - `content/pages/voice-recorder/audio-visualizer.js`
- Preserve secondary pitch behavior by using the current detector when
  `detectSecondary === true` (Pitchy doesn’t provide secondary peaks).

### 5) Manual validation

- Use the built-in test signal and a quick live mic check.
- Verify toggle behavior, stability, and no regressions in pitch stats.

## Decisions (Resolved)

- Vendor path confirmed: `content/media/voice-recorder/pitchy/`.
- Hybrid strategy chosen:
  - Primary: Pitchy (when enabled and available)
  - Secondary: existing autocorrelation detector
