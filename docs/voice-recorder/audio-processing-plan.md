# Audio Post-Processing Plan

Planned features for audio enhancement and pitch shifting in the voice recorder, for future implementation.

---

## Overview

The voice recorder currently captures raw microphone audio and stores it as an unprocessed `audio/mp4` blob. No post-processing is applied. These features would let users clean up and enhance a recording after the fact, and optionally experiment with pitch shifting toward masculine or feminine quality.

The three planned features are:

1. **Silence trimming** — remove quiet sections from the start and end of a clip
2. **Audio enhancement** — high-pass filter, presence boost, compression, normalization
3. **Experimental pitch shifting** — shift pitch toward masculine (down) or feminine (up) character

---

## Architecture

### Non-destructive pipeline

Processing never modifies `clip.audioBlob` (the original MediaRecorder output). Instead it writes to `clip.processedAudioBlob`. Re-processing with new settings always starts from the original blob, never from a previously processed copy. This ensures no quality degradation from stacking effects.

Extended clip object fields:

```js
// New fields added to each clip alongside existing audioBlob, videoBlob, etc.
processedAudioBlob: null,      // WAV Blob derived from audioBlob; null until processed
processedAudioUrl: null,       // ObjectURL for processedAudioBlob; revoke on delete
processingState: null,         // null | 'processing' | 'done' | 'error'
processingNote: null,          // e.g. "Trimmed 0.8s, enhanced, +2 semitones ♀"
lastProcessingOptions: null,   // { trim: bool, enhance: bool, pitchShift: number }
```

### Share buttons use best available

`shareClipAudio` should prefer `processedAudioBlob` when it exists:

```js
const blob = clip.processedAudioBlob ?? clip.audioBlob;
const ext = clip.processedAudioBlob ? 'wav' : 'm4a';
```

Video sharing is unchanged — the video blob has audio baked in from the original MediaRecorder session, and swapping audio in-browser without WASM FFmpeg is not practical.

### Output format: WAV

Processed audio is re-encoded as WAV using a pure-JS encoder (~40 lines). Pros: no WASM, no CDN dependency, lossless, universally playable in `<audio>` tags and Web Share API. The size penalty (~10× vs AAC) is acceptable for a therapy tool.

---

## Processing Pipeline

```
clip.audioBlob (audio/mp4, original, never touched)
    ↓
audioContext.decodeAudioData()
    ↓ AudioBuffer (PCM)
[1] trimSilence()           — optional
    ↓ AudioBuffer (trimmed)
[2] enhanceAudio()          — optional, uses OfflineAudioContext
    ↓ AudioBuffer (filtered + compressed + normalized)
[3] shiftPitch()            — optional, uses SoundTouch
    ↓ AudioBuffer (pitch-shifted)
audioBufferToWavBlob()
    ↓
clip.processedAudioBlob (audio/wav)
```

Each step is independently optional. If no steps are selected, the pipeline is a no-op (no processed blob is created).

---

## Feature 1: Silence Trimming

### Algorithm

Scan the decoded AudioBuffer in 10 ms windows and compute the RMS of each window. Find the first window from the start with RMS ≥ threshold, and the last window from the end with the same. Slice the buffer between those points.

Use **threshold = 0.01** to match the existing silence threshold in `pitch-detector.js:49`.

```
Scan forward: find first window with RMS ≥ 0.01 → startSample
Scan backward: find last window with RMS ≥ 0.01 → endSample
Keep one window of lead-in/lead-out on each side
Slice AudioBuffer from startSample to endSample
```

Edge cases:
- If the entire clip is below threshold → skip trim, note "No speech detected"
- If startSample > endSample (shouldn't happen) → skip trim

### Result note

Show how much was removed: `"Trimmed 0.4s from start, 1.1s from end"` or `"Trimmed 0.8s total"`.

---

## Feature 2: Audio Enhancement

### Web Audio API node chain

Processed using `OfflineAudioContext.startRendering()` — fully non-blocking, renders faster than real-time.

```
AudioBufferSourceNode
  → BiquadFilterNode (type: 'highpass', frequency: 80 Hz, Q: 0.7)
  → BiquadFilterNode (type: 'peaking', frequency: 3000 Hz, gain: +4 dB, Q: 1.5)
  → DynamicsCompressorNode
  → GainNode (peak normalization)
  → OfflineAudioContext.destination
```

### Node parameters

| Node | Parameter | Value | Rationale |
|---|---|---|---|
| High-pass filter | frequency | 80 Hz | Removes mic rumble, handling noise, HVAC hum |
| High-pass filter | Q | 0.7 | Butterworth-like rolloff, no resonance bump |
| Presence boost | frequency | 3000 Hz | Consonant clarity; sits in feminine-leaning speech range |
| Presence boost | gain | +4 dB | Subtle — not broadcast-harsh |
| Presence boost | Q | 1.5 | ~1.5-octave bandwidth |
| Compressor | threshold | -24 dB | Engage on peaks, leave whispers alone |
| Compressor | knee | 10 dB | Soft knee for transparent character |
| Compressor | ratio | 3:1 | Gentle; preserves dynamics |
| Compressor | attack | 0.003 s | Fast enough to catch consonants |
| Compressor | release | 0.25 s | Natural release, avoids pumping |
| Normalization gain | gain | 0.891 / peak | Scale peak to -1 dBFS (target: 89.1% of full scale) |

Peak normalization is computed from the **input** buffer before rendering (single-pass approximation). For a two-pass approach (more accurate after compressor): render once, find output peak, multiply samples by correction factor.

---

## Feature 3: Experimental Pitch Shifting

### Library: SoundTouch.js

SoundTouch uses the **WSOLA** (Waveform Similarity-based Overlap-Add) algorithm. This operates on pitch and tempo separately, which inherently handles formant structure better than naive resampling. Naive resampling produces a "chipmunk" effect on pitch-up and a sluggish artifact on pitch-down.

**Package**: `soundtouchjs@0.1.30`
**File**: `dist/soundtouch.js` (UMD, sets `window.SoundTouch`, `window.SimpleFilter`, etc.)

### Vendoring (same pattern as Pitchy)

Pitchy lives at `content/media/voice-recorder/pitchy/pitchy-4.1.0.esm.js` and is loaded via dynamic `import()`.

SoundTouch is a UMD build (not ESM), so it is loaded via a `<script>` element injected at runtime. Download and commit:

```
content/media/voice-recorder/soundtouch/soundtouch-0.1.30.js
```

Source URL to download from:
```
https://cdn.jsdelivr.net/npm/soundtouchjs@0.1.30/dist/soundtouch.js
```

### Lazy loader

```js
async ensureSoundtouchLoaded() {
    if (window.SoundTouch) return true;
    if (this._soundtouchLoadFailed) return false;
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = '/media/voice-recorder/soundtouch/soundtouch-0.1.30.js';
        script.onload = () => resolve(true);
        script.onerror = () => {
            this._soundtouchLoadFailed = true;
            this.setStatus('Pitch shift unavailable (SoundTouch failed to load).');
            resolve(false);
        };
        document.head.appendChild(script);
    });
}
```

### Pitch shift range

Slider: **−6 to +6 semitones**, step 1, default 0

| Range | Character |
|---|---|
| −2 to −4 | Noticeably more masculine resonance |
| −5 to −6 | Strongly masculine; artifacts may appear |
| +2 to +3 | Noticeably more feminine resonance |
| +4 to +6 | Strongly feminine; artifacts more likely |

### Integration pattern

```js
async shiftPitch(audioBuffer, semitones) {
    const st = new window.SoundTouch();
    st.setPitchSemitones(semitones);

    // Interleave channel data (SoundTouch expects stereo interleaved Float32)
    const { numberOfChannels, length, sampleRate } = audioBuffer;
    const inputData = ...; // interleave channels into Float32Array

    const filter = new window.SimpleFilter(new window.SoundtouchFilterSource(inputData, st), st);
    // Read output in blocks; collect into output Float32Array
    // De-interleave back into AudioBuffer channels
    return newAudioBuffer; // AudioBuffer at same sampleRate, same channel count
}
```

Formant control: SoundTouch 0.1.30 does not expose an explicit formant preservation toggle in the JS port. The WSOLA algorithm still sounds significantly better than resampling for ±3 semitones. Users should expect some artifacts at larger shifts.

---

## UI Design

### Processing panel

A `<details class="recorder-process">` block placed between the Settings and Status panels:

```
┌─ Process Audio ──────────────────────────────────┐
│ Selected clip: "apple-banana-carrot"              │
│                                                   │
│ ☑ Trim silence                                    │
│   Removes quiet sections from start and end.      │
│                                                   │
│ ☑ Enhance voice                                   │
│   High-pass filter, presence boost, soft          │
│   compression, peak normalization.                │
│                                                   │
│ Pitch shift: 0 semitones  [Experimental]          │
│ ───────────────────────────────────────────────   │
│ ◄ −6      Masc ← slider → Fem      +6 ►          │
│   Loads SoundTouch (~80 KB) on first use.         │
│   May not sound perfect on all voices.            │
│                                                   │
│  [ Apply Processing ]    [ Revert to Original ]   │
└───────────────────────────────────────────────────┘
```

### Clip card changes

Add one button to each clip's action row:

```
▶  🎬  🎵  ✨  ✕
          │
          └─ Opens process panel for this clip
```

`🎵 Share Audio` automatically uses `processedAudioBlob` when available (no second button needed).

After processing, a small note appears below the clip metadata:

```
apple-banana-carrot  •  0:32  •  148 Hz avg
Trimmed 0.8s, enhanced, +2 semitones ♀
```

---

## Graceful Degradation

| Scenario | Behavior |
|---|---|
| Entire clip is silence | Skip trim; show "No speech detected" |
| `OfflineAudioContext` not supported | Disable enhance checkbox; show capability note |
| SoundTouch file missing / fails to load | Hide or disable pitch slider; show message |
| `decodeAudioData` fails (corrupted blob) | Show "Could not decode audio"; `processingState = 'error'` |
| Very long clip (>10 min) — ArrayBuffer OOM | Show "Clip too long to process in browser" |
| Clip deleted after processing | `deleteClip()` revokes both `audioUrl` and `processedAudioUrl` |

---

## Implementation Steps

Suggested incremental order for a future implementation sprint:

1. Add `audioBufferToWavBlob()` and `findPeakAmplitude()` helpers to `voice-recorder.js`
2. Add `processedAudioBlob`/`processedAudioUrl`/`processingState`/`processingNote`/`lastProcessingOptions` fields to clip objects in `addClip()` and `deleteClip()` cleanup
3. Add `<details class="recorder-process">` HTML panel to `voice-recorder.md`
4. Add CSS for panel, badges, and `✨` button in `voice-recorder.css`
5. Add `setupAudioProcessPanel()` and `openProcessPanelFor()` to `voice-recorder.js`; call from constructor
6. Add `trimSilence()` method; wire into `processAudio()`
7. Add `enhanceAudio()` method; wire into `processAudio()`
8. Add `processAudio()` coordinator and `revertToOriginal()`
9. Update `shareClipAudio()` to use `processedAudioBlob ?? audioBlob`
10. Update `renderClipsList()`: add `✨` button per clip card, add processing note badge
11. Download and commit `soundtouch-0.1.30.js` to `content/media/voice-recorder/soundtouch/`
12. Add `ensureSoundtouchLoaded()` and `shiftPitch()`; wire into `processAudio()`

---

## Verification Scenarios

- Record with 2s silence at start and end → Apply Trim → duration should be ~4s shorter; note shows trimmed amount
- Record a quiet clip → Apply Enhance → share audio → audibly louder and cleaner
- Apply Enhance on a clip already at full scale → no clipping at output (normalized to -1 dBFS)
- Apply pitch shift +3 → share audio → voice is noticeably higher
- Apply processing → change pitch slider to +5 → Apply again → new version replaces old (no stacking)
- Delete a processed clip → DevTools Memory → confirm no leaked ObjectURLs
- Process a clip recorded with `audio/webm` fallback → `decodeAudioData` should handle both formats
- Offline / SoundTouch file missing → trim and enhance still work; pitch slider shows disabled state
