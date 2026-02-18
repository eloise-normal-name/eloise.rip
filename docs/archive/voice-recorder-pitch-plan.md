# Plan: Pitch Signal Visualizer

> **Status:** ✅ COMPLETED (February 2026)
>
> Parent doc: [voice-recorder.md](voice-recorder.md)

## Goal

The current waveform shows raw time-domain amplitude. Add a pitch
(fundamental-frequency) trace so users can see their vocal pitch in real time
while recording.

**Result:** Successfully implemented with autocorrelation-based pitch detection and real-time blue trace overlay.

## Steps

### 1. Research pitch-detection approaches ✅

Evaluated lightweight, browser-friendly options:

| Approach | Pros | Cons |
|----------|------|------|
| **Autocorrelation** on time-domain data | No dependency; simple to implement | Needs careful tuning for accuracy |
| **YIN / pYIN** algorithm | More accurate; still pure-JS feasible | More complex; higher CPU cost |
| **FFT peak** via `AnalyserNode.getFloatFrequencyData` | Easy access to magnitudes | Gives spectral peak, not true pitch; harmonic errors |

**Decision:** Chose autocorrelation for its simplicity and zero dependencies.

### 2. Add a pitch-detection module ✅

Created `content/pages/voice-recorder/pitch-detector.js` with:

```js
function detectPitch(buffer, sampleRate) → number | null
```

- Accepts a `Float32Array` of time-domain samples and the audio sample rate.
- Returns the detected fundamental frequency in Hz, or `null` if no clear pitch
  is found (silence, noise, unvoiced sound).
- Dependency-free, inlined via `{% include %}`.
- RMS threshold of 0.01 to filter silence.

Current implementation: lightweight autocorrelation tuned for ~80–400 Hz with a
simple smoothing pass inside the visualizer.

### 3. Collect pitch samples during recording ✅

Implemented in the `AudioVisualizer` render loop:

1. Calls `AnalyserNode.getFloatTimeDomainData(buffer)` each frame.
2. Passes buffer to `detectPitch(buffer, sampleRate)`.
3. Stores pitch in rolling buffer via `pushPitchSample()` method.
4. Buffer capped at 200 samples (`pitchMaxSamples`).
5. Smoothing applied: `value = previous + (value - previous) * 0.35`.

### 4. Render the pitch trace on the canvas ✅

Implemented as second layer on canvas:

- Maps 80–400 Hz range to canvas height.
- Plots connected line in `rgba(116, 192, 252, 0.9)` (blue).
- Null values skipped (no line drawn for silence/noise).
- Renders after waveform in `render()` method.

### 5. Expose optional configuration ⏸️

Configuration hardcoded in `AudioVisualizer` constructor for v1.0:

- **Hz range:** 80–400 Hz (via `pitchMinHz`, `pitchMaxHz`)
- **Visibility:** Always shown (no toggle yet)
- **Smoothing:** 0.35 smoothing factor (via `pitchSmoothing`)

**Note:** User-facing configuration UI is planned for Sprint 1 (see [voice-recorder-roadmap.md](voice-recorder-roadmap.md)).

### 6. Test and iterate ✅

Testing completed:

- Pitch detection works accurately for voice in 80–400 Hz range.
- Performance maintains 60 fps during recording.
- Canvas video recording captures pitch trace correctly via `captureStream()`.
