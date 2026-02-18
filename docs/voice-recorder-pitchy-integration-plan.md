# Pitchy Integration Plan (Self-Hosted, Optional)

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

## Open Decisions

- Confirm exact vendor path under `content/media/voice-recorder/`.
- Decide whether to keep primary Pitchy output and secondary from the existing
  detector, or fully fall back to existing detector when secondary is enabled.
