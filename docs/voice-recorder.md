# Voice Recorder

## Overview

A client-side voice recorder that captures microphone audio, draws a live
waveform on a canvas, records the canvas and audio as a video, and lets the user
play back or save the result. Everything runs in the browser — no server upload
is involved.

## File Map

| File | Role |
|------|------|
| `content/pages/voice-recorder/voice-recorder.md` | Jinja page template — includes the CSS and JS below via `{% include %}`. |
| `content/pages/voice-recorder/voice-recorder.css` | Styles, inlined into the page. |
| `content/pages/voice-recorder/audio-visualizer.js` | `AudioVisualizer` class — canvas rendering for the live waveform. Inlined before `voice-recorder.js`. |
| `content/pages/voice-recorder/pitch-detector.js` | Dependency-free `detectPitch(buffer, sampleRate)` helper used by the visualizer. |
| `content/pages/voice-recorder/voice-recorder.js` | `VoiceRecorderApp` class — recording, playback, save/share, and UI state. Inlined after the visualizer. |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  voice-recorder.md (Jinja page)                      │
│                                                      │
│  ┌────────────────────────────────────────────────┐   │
│  │  <canvas>  ←── AudioVisualizer.render()        │   │
│  │            ←── playback draws video frames     │   │
│  └────────────────────────────────────────────────┘   │
│                                                      │
│  Buttons: Record · Play · Save Video · Save Audio    │
│                                                      │
│  ┌────────────────────────────────────────────────┐   │
│  │  <details>  Status / debug log                 │   │
│  └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### Data flow during recording

```
Microphone
  → getUserMedia stream
      ├─→ AudioContext / AnalyserNode → AudioVisualizer (waveform)
      ├─→ MediaRecorder (audio/mp4)   → audioChunks → audioBlob
      └─→ canvas.captureStream + audio track
            → MediaRecorder (video)   → videoChunks → videoBlob
```

### Data flow during playback

```
videoBlob → <video> (hidden) → drawImage onto <canvas> each frame
```

## AudioVisualizer Class

`AudioVisualizer` owns the `<canvas>` and is responsible for all drawing.

| Member | Description |
|--------|-------------|
| `constructor(canvas, analyserNode)` | Stores references, sets colors, calls `setAnalyser`. |
| `setAnalyser(node)` | Attach or detach an `AnalyserNode`. Allocates the `Float32Array` data buffer when a node is provided. |
| `paintFrame()` | Fills the background and draws the border. Called by both `render` and `clear`. |
| `render()` | Calls `paintFrame`, reads `getFloatTimeDomainData`, detects pitch(es), and renders the pitch trace(s). |
| `clear()` | Redraws the empty background frame and clears pitch history. |
| `pushPitchSample(pitchData)` | Adds pitch data to history buffers. Accepts a number (primary only) or object with `primary` and `secondary` fields. |
| `renderPitchTrace()` | Draws primary pitch (blue) and optionally secondary pitch (orange) traces on the canvas. |

Colors and border width are instance properties set in the constructor.

### Pitch Visualization

- **Primary pitch**: Blue trace (`rgba(116, 192, 252, 0.9)`)
- **Secondary pitch**: Orange trace (`rgba(255, 180, 100, 0.7)`)
- Both traces use exponential smoothing (35%) to reduce jitter
- Secondary pitch detection can be toggled via `showSecondaryPitch` property

## VoiceRecorderApp Class

`VoiceRecorderApp` manages the full lifecycle: UI binding, recording, playback,
and save/share.

### Key methods

| Method | Purpose |
|--------|---------|
| `startRecording()` | Requests mic access, creates `AudioContext` / `AnalyserNode`, starts audio and video `MediaRecorder`s, launches the visualizer loop. |
| `stopRecording()` | Stops both recorders; blobs are created in their `onstop` handlers. |
| `togglePlayback()` | Plays or stops the recorded video, rendering each frame onto the canvas. |
| `saveVideo()` / `saveAudio()` | Shares via the Web Share API or falls back to a direct download with a random two-word filename. |
| `pickSupportedType(types)` | Returns the first MIME type from the list that the browser supports, or `''`. |
| `showBrowserCapabilities()` | Logs supported APIs and MIME types into the status area on page load. |

### MIME types

- **Audio** — requires `audio/mp4`. Recording will not start if unsupported.
- **Video** — prefers `video/mp4`, falls back to `video/webm`. If neither is
  reported as supported the browser chooses the default.

## Current Limitations

- No backend storage or upload.
- Pitch overlay uses a lightweight autocorrelation tuned for ~80–400 Hz; unvoiced/noisy segments may drop out rather than show a stable line.
- Secondary pitch detection identifies additional frequency components but may not always find a valid secondary pitch.
- Canvas playback re-renders the recorded video; there is no live waveform during playback.

## Maintenance & Development

### DOM Element Safety

**⚠️ Important:** The JavaScript code relies on specific HTML element IDs. When modifying the UI, always ensure DOM elements and JavaScript references stay in sync.

See [voice-recorder-dom-elements.md](voice-recorder-dom-elements.md) for:
- Complete mapping of HTML elements to JavaScript references
- Maintenance checklist when modifying the UI
- Historical context (PR #21 removed global playback buttons)

A GitHub Actions workflow (`.github/workflows/validate-dom-elements.yml`) automatically validates that all `getElementById()` calls have matching HTML elements on every PR.

### Testing

Before making significant changes or releases, run through the manual test scenarios documented in [voice-recorder-test-scenarios.md](voice-recorder-test-scenarios.md).

Critical regression tests:
- **Multi-Clip Recording and Playback** - ensures video/audio blob URLs are managed correctly
- **Basic Recording** - ensures core functionality works
- **Playback** - ensures video rendering works

## Future Work

The pitch visualizer has been completed! See [voice-recorder-pitch-plan.md](voice-recorder-pitch-plan.md) for the original implementation plan.

For upcoming features and sprint planning, see [voice-recorder-roadmap.md](voice-recorder-roadmap.md).
