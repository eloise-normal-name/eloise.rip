# Voice Recorder

## Overview
The voice recorder page is a client-side-only feature that captures microphone audio, shows a simple waveform, and allows local playback. There is no server upload or saving logic yet.

## Design Summary
- Minimal UI: Record, Play, and disabled download buttons.
- Capture audio via `getUserMedia` and `MediaRecorder`.
- Playback uses a temporary blob URL and an `Audio` element.
- Waveform uses a simple line based on time-domain samples.
- Static-site friendly: everything runs in the browser.

## File Map
- Template: themes/cute-theme/templates/voice-recorder.html
- Recorder logic + waveform visualizer: inlined in themes/cute-theme/templates/voice-recorder.html
- Styles: inlined in themes/cute-theme/templates/voice-recorder.html
- Page source: content/voice-recorder/voice-recorder.md

## Recording Flow
1. User clicks Record.
2. Browser requests microphone permission via `getUserMedia`.
3. `MediaRecorder` starts and accumulates audio chunks.
4. On stop, chunks become a Blob and a local object URL.
5. Play uses the object URL and an `Audio` element.

## Waveform Visualizer
- Uses `AnalyserNode.getByteTimeDomainData`.
- Draws a single line waveform on the canvas while recording.
- Rendering loop runs only during active recording.

## MIME Fallback
- Prefer `audio/mp4` when supported (iOS-friendly).
- Fallback to `audio/webm;codecs=opus` and then `audio/webm`.
- If no supported MIME type is reported, let the browser choose.

## Limitations (Current)
- Download/save buttons are disabled and show a placeholder message if clicked.
- No upload or backend storage.
- No waveform during playback (recording only).
