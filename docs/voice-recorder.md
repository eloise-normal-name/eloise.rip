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
| `constructor(canvas, analyserNode)` | Stores references, sets colours, calls `setAnalyser`. |
| `setAnalyser(node)` | Attach or detach an `AnalyserNode`. Allocates the `Uint8Array` data buffer when a node is provided. |
| `paintFrame()` | Fills the background and draws the border. Called by both `render` and `clear`. |
| `render()` | Calls `paintFrame`, reads `getByteTimeDomainData`, and draws a pink waveform line. |
| `clear()` | Redraws the empty background frame (no waveform). |

Colours and border width are instance properties set in the constructor.

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
- Waveform is time-domain only — no pitch or frequency information is displayed.
- Canvas playback re-renders the recorded video; there is no live waveform during
  playback.

## Future Work

See [voice-recorder-pitch-plan.md](voice-recorder-pitch-plan.md) for the plan to
add a pitch-signal visualizer overlay.
