Title: Projects
Template: page

## Current Projects

### Voice Recorder

A browser-based voice recorder with live waveform and pitch visualization.

**Status:** ✅ Complete (v1.0)

**Features:**
- Real-time waveform visualization
- Pitch detection overlay (80-400 Hz, tuned for voice)
- Video recording of canvas with audio
- Audio-only recording option
- Web Share API and download support

**Tech Stack:**
- Web Audio API (AudioContext, AnalyserNode, MediaRecorder)
- Canvas API for visualization
- Autocorrelation-based pitch detection
- No dependencies, all client-side

[Try it out](./voice-recorder.html) | [Technical Docs](https://github.com/eloise-normal-name/eloise.rip/blob/main/docs/voice-recorder.md)

**Future Enhancements:**
- Adjustable pitch range UI
- Toggle pitch trace visibility
- Additional visualizer styles
- User preferences persistence

---

### Voice Practice

Systematic voice practice using Harvard sentences.

**Status:** 🔄 In Progress ({{ (voice_files | length / 720 * 100) | round(1) if voice_files is defined else '0' }}% complete)

**Goal:** Record 720 Harvard sentences for voice training and comparison.

[View Progress](./voice.html)

---

## Future Ideas

- More interactive tools
- Art projects
- Tech experiments

Want to collaborate or have suggestions? [Get in touch!](./about.html)
