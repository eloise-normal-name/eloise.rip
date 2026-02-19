# Voice Recorder

> **📚 Documentation Index:** See [voice-recorder-README.md](voice-recorder-README.md) for a complete guide to all voice recorder documentation.

## Overview

A client-side voice recorder that captures microphone audio, draws a live waveform with pitch overlay on a canvas, and records the canvas and audio as a video. Everything runs in the browser—no server upload is involved.

## Architecture

### Components

1. **VoiceRecorderApp** (`voice-recorder.js`) - Main application class managing recording, playback, clip storage, and UI state
2. **AudioVisualizer** (`audio-visualizer.js`) - Canvas rendering engine that draws waveforms and pitch traces in real-time
3. **Pitch Detector** (`pitch-detector.js`) - Autocorrelation-based pitch detection (80-400 Hz)

### Data Flow

**Recording:**
```
Microphone (getUserMedia)
  ├─→ AudioContext/AnalyserNode → AudioVisualizer → Canvas
  ├─→ MediaRecorder → Audio Blob (MP4)
  └─→ Canvas.captureStream() + Audio → MediaRecorder → Video Blob (MP4/WebM)
```

**Playback:**
```
Video Blob → <video> element → drawImage() onto Canvas
```

### Key Features

- Real-time waveform with pitch trace overlay
- Multi-clip recording and playback
- Live signal quality indicator
- Web Share API integration
- Optional Pitchy pitch detector engine

## File Structure

```
content/pages/voice-recorder/
├── voice-recorder.md      # Jinja template with embedded HTML/CSS/JS
├── voice-recorder.js      # VoiceRecorderApp class (1162 lines)
├── audio-visualizer.js    # AudioVisualizer canvas renderer (980 lines)
├── pitch-detector.js      # Autocorrelation pitch detection (141 lines)
└── voice-recorder.css     # Styles
```

## API Reference

### AudioVisualizer

**Purpose:** Canvas rendering engine for waveforms and pitch traces.

**Core Methods:**

| Method | Description |
|--------|-------------|
| `constructor(canvas, analyserNode)` | Initialize with canvas element and optional analyser node |
| `setAnalyser(node)` | Attach/detach Web Audio API AnalyserNode |
| `setPitchDetector(detectorFn)` | Inject custom pitch detector function |
| `render()` | Main loop: read audio → detect pitch → draw trace |
| `clear()` | Reset canvas and pitch history |

**Visualization Settings:**
- Primary pitch: Blue trace `rgba(116, 192, 252, 0.9)`
- Scrolling: 2px per sample, left-to-right
- Smoothing: 35% exponential smoothing
- Stabilization: Harmonic correction, post-silence guard, 3-sample gap hold

### VoiceRecorderApp

**Purpose:** Main application managing recording, playback, clips, and UI.

**Core Methods:**

| Method | Description |
|--------|-------------|
| `startRecording()` | Request mic → create AudioContext/Analyser → start MediaRecorders |
| `stopRecording()` | Stop recorders → create audio/video blobs |
| `saveVideo()` / `saveAudio()` | Share via Web Share API or download |
| `togglePitchDetector()` | Switch between autocorrelation and Pitchy engines |

**MIME Type Requirements:**
- Audio: `audio/mp4` (required)
- Video: `video/mp4` (preferred) or `video/webm` (fallback)

## Pitch Detection

The voice recorder uses two pitch detection engines:

1. **Autocorrelation** (default, built-in)
   - Lightweight, no dependencies
   - Range: 80-400 Hz
   - See [voice-recorder-pitch-algorithm.md](voice-recorder-pitch-algorithm.md) for details

2. **Pitchy** (optional, dynamically loaded)
   - Higher accuracy
   - Self-hosted at `/media/voice-recorder/pitchy/`
   - Lazy-loaded when user enables it

## Limitations

- No backend storage (clips stored in memory only)
- Unvoiced/noisy segments show gaps rather than stable lines
- Secondary pitch trace currently disabled in UI
- Canvas playback renders video frames (no live waveform)

## Development Guide

### DOM Element Safety

**⚠️ Critical:** JavaScript relies on specific HTML element IDs. Always keep HTML and JavaScript in sync.

- See [voice-recorder-dom-elements.md](voice-recorder-dom-elements.md) for complete mapping
- GitHub Actions validates DOM elements on every PR
- When removing elements, update constructor and validation check

### Testing

Run manual test scenarios before releases: [voice-recorder-test-scenarios.md](voice-recorder-test-scenarios.md)

**Critical regression tests:**
- Multi-Clip Recording (common regression)
- Basic Recording
- Playback

### Building

```bash
# Build site
pelican content -o output -s pelicanconf.py

# Validate links and media
python validate_output.py
```

## Related Documentation

- **[Documentation Index](voice-recorder-README.md)** - Complete doc guide
- **[DOM Elements](voice-recorder-dom-elements.md)** - HTML/JS mapping
- **[Pitch Algorithm](voice-recorder-pitch-algorithm.md)** - Deep dive into detection
- **[Test Scenarios](voice-recorder-test-scenarios.md)** - Regression test checklist
- **[Known Bugs](voice-recorder-bugs.md)** - Bug tracker
- **[Roadmap](voice-recorder-roadmap.md)** - Feature planning
