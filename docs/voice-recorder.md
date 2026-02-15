# Voice Recorder

## Overview
The voice recorder page is a client-side-only feature that captures microphone audio,
draws a live waveform on a canvas, records the canvas + audio as a video, and lets
users play back or save the result. Everything runs in the browser with no server
upload.

## Design Summary
- Minimal UI: Record, Play, Save Video, and Save Audio buttons.
- Capture audio via `getUserMedia` and `MediaRecorder`.
- Live waveform drawn on a `<canvas>` by the `AudioVisualizer` class.
- Canvas frames + audio are combined into a video recording via `captureStream`.
- Playback renders the recorded video onto the canvas.
- Save uses the Web Share API when available, falling back to a direct download.
- Static-site friendly: everything runs in the browser.

## File Map
- **Page source**: `content/pages/voice-recorder/voice-recorder.md`
  Jinja template that includes the CSS and JS below.
- **Styles**: `content/pages/voice-recorder/voice-recorder.css`
  Inlined via `{% include %}`.
- **Visualizer**: `content/pages/voice-recorder/audio-visualizer.js`
  `AudioVisualizer` class — owns the canvas and draws the waveform.
  Inlined via `{% include %}` before `voice-recorder.js`.
- **App logic**: `content/pages/voice-recorder/voice-recorder.js`
  `VoiceRecorderApp` class — recording, playback, save/share, and UI state.
  Inlined via `{% include %}`.

## Recording Flow
1. User clicks Record.
2. Browser requests microphone permission via `getUserMedia`.
3. An `AudioContext` and `AnalyserNode` are created; the mic stream is connected
   to the analyser for live waveform data.
4. A `MediaRecorder` (audio/mp4) starts and accumulates audio chunks.
5. A second `MediaRecorder` captures the canvas stream (30 fps) combined with the
   audio track, producing a video recording.
6. The `AudioVisualizer` render loop draws the waveform each animation frame.
7. User clicks Stop → both recorders stop.
8. Audio and video blobs are created from their respective chunks.
9. The video blob is loaded into a hidden `<video>` element for playback.

## Playback Flow
1. User clicks Play.
2. The hidden `<video>` element plays the recorded video.
3. Each animation frame, the video frame is drawn onto the visible canvas.
4. When playback ends or the user clicks Stop, rendering stops and the canvas
   is cleared.

## AudioVisualizer Class
- Accepts a `<canvas>` and an optional `AnalyserNode`.
- `setAnalyser(node)` — attach or detach the analyser at any time.
- `render()` — reads `getByteTimeDomainData`, draws a pink waveform line over a
  dark background with a pink border.
- `clear()` — redraws the empty background frame.
- Colors and border width are instance properties set in the constructor.

## MIME Types
- **Audio**: requires `audio/mp4`. Recording will not start if the browser does
  not support this type.
- **Video**: prefers `video/mp4`, falls back to `video/webm`. If neither is
  reported as supported the browser chooses the default.

## Save / Share
- Save Video and Save Audio buttons are enabled after a recording completes.
- If the Web Share API is available and the browser can share files, the file is
  offered via the native share sheet.
- Otherwise (or on share failure) the file is downloaded directly with a randomly
  generated two-word filename (e.g. `bright-river.mp4`).

## Limitations (Current)
- No backend storage or upload.
- Waveform is time-domain only — no pitch or frequency information is displayed.
- Canvas playback re-renders the recorded video; there is no live waveform during
  playback.

## Plan: Pitch Signal Visualizer

The current waveform shows raw time-domain amplitude. The goal is to add a pitch
(fundamental-frequency) trace so users can see their vocal pitch over time.

### Steps

1. **Research pitch-detection approaches**
   Evaluate lightweight browser-friendly options:
   - Autocorrelation on time-domain data (no extra dependency).
   - YIN or pYIN algorithm (more accurate, still pure JS feasible).
   - `AnalyserNode.getFloatFrequencyData` (FFT magnitudes — can derive a rough
     peak frequency but not true pitch).
   Choose one and prototype in isolation.

2. **Add a pitch-detection module**
   Create `content/pages/voice-recorder/pitch-detector.js` exporting a function
   like `detectPitch(buffer, sampleRate) → hzOrNull`. Keep it dependency-free so
   it can be inlined the same way as the other scripts.

3. **Collect pitch samples during recording**
   In the `AudioVisualizer` render loop (or a parallel loop), call the pitch
   detector each frame using `AnalyserNode.getFloatTimeDomainData`. Store a
   rolling buffer of `{ time, hz }` samples capped at a reasonable window
   (e.g. last 5–10 seconds).

4. **Render the pitch trace on the canvas**
   Draw a second layer on the canvas (on top of or beside the waveform):
   - Map a useful Hz range (e.g. 80–400 Hz for voice) to the canvas height.
   - Plot the rolling pitch samples as a connected line or series of dots.
   - Use a distinct colour so it is visually separable from the waveform.
   - Grey out or skip frames where no pitch was detected (silence / noise).

5. **Expose optional configuration**
   Let the user (or a future UI toggle) adjust:
   - Hz range (min / max) so the display suits different voice ranges.
   - Whether the pitch trace is shown or hidden.
   - Smoothing amount (running average over N frames).

6. **Test and iterate**
   - Verify pitch detection accuracy against a tone generator or known audio.
   - Profile performance: pitch detection + rendering must stay within a 60 fps
     frame budget on a mid-range phone.
   - Confirm the canvas video recording still captures the pitch trace correctly.
