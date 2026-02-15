# Plan: Pitch Signal Visualizer

> Parent doc: [voice-recorder.md](voice-recorder.md)

## Goal

The current waveform shows raw time-domain amplitude. Add a pitch
(fundamental-frequency) trace so users can see their vocal pitch in real time
while recording.

## Steps

### 1. Research pitch-detection approaches

Evaluate lightweight, browser-friendly options:

| Approach | Pros | Cons |
|----------|------|------|
| **Autocorrelation** on time-domain data | No dependency; simple to implement | Needs careful tuning for accuracy |
| **YIN / pYIN** algorithm | More accurate; still pure-JS feasible | More complex; higher CPU cost |
| **FFT peak** via `AnalyserNode.getFloatFrequencyData` | Easy access to magnitudes | Gives spectral peak, not true pitch; harmonic errors |

Choose one approach and prototype it in isolation before integrating.

### 2. Add a pitch-detection module

Create `content/pages/voice-recorder/pitch-detector.js` with a function like:

```js
function detectPitch(buffer, sampleRate) → number | null
```

- Accepts a `Float32Array` of time-domain samples and the audio sample rate.
- Returns the detected fundamental frequency in Hz, or `null` if no clear pitch
  is found (silence, noise, unvoiced sound).
- Must be dependency-free so it can be `{% include %}`-inlined like the other
  scripts.

### 3. Collect pitch samples during recording

In the `AudioVisualizer` render loop (or a parallel `requestAnimationFrame`
loop):

1. Call `AnalyserNode.getFloatTimeDomainData(buffer)` to get the current audio
   frame.
2. Pass the buffer to `detectPitch(buffer, sampleRate)`.
3. Store a rolling buffer of `{ time, hz }` samples, capped at a reasonable
   window (e.g. the last 5–10 seconds of audio).

### 4. Render the pitch trace on the canvas

Draw a second layer on the canvas, on top of the existing waveform:

- Map a useful Hz range (e.g. 80–400 Hz for typical voice) to the canvas
  height.
- Plot the rolling pitch samples as a connected line or series of dots.
- Use a distinct colour so the pitch trace is visually separable from the
  waveform.
- Skip or grey out frames where no pitch was detected (silence / noise).

### 5. Expose optional configuration

Allow the user (or a future UI toggle) to adjust:

- **Hz range** (min / max) to suit different voice ranges.
- **Visibility** toggle to show or hide the pitch trace.
- **Smoothing** amount (running average over N frames) to reduce jitter.

### 6. Test and iterate

- Verify pitch-detection accuracy against a tone generator or known audio
  file.
- Profile performance: pitch detection + rendering must stay within a 60 fps
  frame budget on a mid-range phone.
- Confirm the canvas video recording still captures the pitch trace correctly
  (since the video is produced via `captureStream`).
