# Voice Recorder Pitch Detection Algorithm

## Overview

The voice recorder uses a **normalized autocorrelation** algorithm to detect the fundamental pitch (frequency) of voice input in real-time. This document explains how the algorithm works and its implementation.

## What is Pitch Detection?

Pitch detection identifies the fundamental frequency of a periodic signal (like a human voice). The fundamental frequency is the lowest frequency component of a sound and determines the perceived pitch (e.g., "middle C" at 261.6 Hz).

## Algorithm: Normalized Autocorrelation

### Why Autocorrelation?

Autocorrelation measures how similar a signal is to a delayed version of itself. For periodic signals (like voiced speech), the autocorrelation will peak at delays that match the signal's period.

**Key advantage**: Works in the time domain, making it computationally efficient and robust to noise compared to frequency-domain methods (like FFT peak picking).

### Implementation Steps

The algorithm in `pitch-detector.js` follows these steps:

#### 1. **Calculate Mean and Center Signal** (lines 6-10)
```javascript
let mean = 0;
for (let i = 0; i < buffer.length; i += 1) {
    mean += buffer[i];
}
mean /= buffer.length;
```
- Computes the average value of all samples
- This mean will be subtracted from each sample to "center" the signal around zero
- Centering removes DC bias and improves correlation accuracy

#### 2. **Calculate RMS and Detect Silence** (lines 12-20)
```javascript
let rms = 0;
for (let i = 0; i < buffer.length; i += 1) {
    const centered = buffer[i] - mean;
    rms += centered * centered;
}
rms = Math.sqrt(rms / buffer.length);
if (rms < 0.01) {
    return null;  // Signal too quiet
}
```
- **RMS (Root Mean Square)**: Measures signal energy/loudness
- If RMS < 0.01 (~1% of max amplitude), the signal is considered silence
- Early return prevents false pitch detection in quiet segments

#### 3. **Define Frequency Search Range** (lines 22-25)
```javascript
const minHz = 80;   // Lowest detectable pitch
const maxHz = 400;  // Highest detectable pitch
const minLag = Math.max(1, Math.floor(sampleRate / maxHz));
const maxLag = Math.min(Math.floor(sampleRate / minHz), buffer.length - 1);
```
- **Lag**: Time delay (in samples) between the signal and its shifted copy
- **80-400 Hz range**: Covers typical human voice fundamental frequencies
  - 80 Hz ≈ Low male voice (E2)
  - 400 Hz ≈ High female/child voice (G4)
- **Lag ↔ Frequency relationship**: `frequency = sampleRate / lag`
  - Higher frequencies → smaller lag periods
  - Lower frequencies → larger lag periods

#### 4. **Calculate Signal Energy** (line 27)
```javascript
const energy = rms * rms;
```
- Used for normalization in the next step
- Makes correlation values independent of signal amplitude

#### 5. **Autocorrelation Search** (lines 29-44)
```javascript
let bestCorrelation = 0;
let bestLag = -1;

for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    for (let i = 0; i < buffer.length - lag; i += 1) {
        correlation += (buffer[i] - mean) * (buffer[i + lag] - mean);
    }
    correlation /= (buffer.length - lag);  // Average over samples
    correlation /= energy;                  // Normalize by energy
    
    if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
    }
}
```

**What's happening**:
1. For each possible lag value (from minLag to maxLag):
   - Multiply the signal by a delayed version of itself
   - Sum all the products
   - Divide by number of samples (average)
   - **Divide by energy** (normalization - this is key!)

2. Track which lag gave the highest correlation

**Normalization Effect**:
- By dividing by energy, correlation values range from 0 to 1
- Makes the algorithm **amplitude-independent**
- A whisper and a shout at the same pitch will have similar correlation values

#### 6. **Confidence Check** (lines 46-48)
```javascript
if (bestLag === -1 || bestCorrelation < 0.2) {
    return null;
}
```
- Correlation < 0.2 (20%) indicates:
  - Signal is not sufficiently periodic (noise, unvoiced speech)
  - Or multiple competing frequencies (complex signal)
- Rejecting low-confidence detections prevents erratic pitch jumping

#### 7. **Convert Lag to Frequency** (line 50)
```javascript
return sampleRate / bestLag;
```
- **Final pitch** (in Hz) is calculated from the best lag
- Example: If sampleRate = 48000 Hz and bestLag = 200 samples:
  - Pitch = 48000 / 200 = 240 Hz (roughly B3)

## Visualization and Smoothing

### Pitch History (audio-visualizer.js)
- Maintains a rolling buffer of 200 pitch samples
- Each sample represents one animation frame (~16ms at 60fps)
- 200 samples ≈ 3.3 seconds of history

### Exponential Smoothing (line 45)
```javascript
value = previous + (value - previous) * 0.35;
```
- **Smoothing factor**: 0.35 (35%)
- Reduces jitter while maintaining responsiveness
- New value is 35% current detection + 65% previous value
- Prevents the trace from jumping erratically between nearby pitches

### Range Mapping
- 80-400 Hz range is linearly mapped to canvas height
- Lower frequencies → bottom of canvas
- Higher frequencies → top of canvas
- Out-of-range values are clamped to min/max

## Strengths of This Approach

1. **Fast**: O(n²) complexity but n is small (2048 samples)
2. **Robust to noise**: Time-domain correlation handles moderate noise well
3. **Simple**: No complex FFT or signal processing libraries needed
4. **Amplitude-independent**: Normalization makes it work for any volume
5. **Octave-proof**: Unlike naive peak-picking, correctly identifies fundamental (not harmonics)

## Limitations

1. **Single pitch only**: Cannot detect multiple simultaneous pitches (polyphonic)
2. **Voiced sounds only**: Unvoiced consonants (s, f, sh) have no pitch
3. **Frequency range**: Only 80-400 Hz (outside this range won't be detected)
4. **Monophonic assumption**: Designed for solo voice, not chords or music
5. **No harmonic analysis**: Doesn't identify overtones or formants

## Possible Enhancements

### 1. **Secondary Pitch Detection** ✅ **IMPLEMENTED**

The algorithm has been extended to detect a second pitch! When `detectSecondary` parameter is `true`:

**Algorithm**:
1. After finding the best correlation peak (primary pitch)
2. Store all correlation values during the search
3. Find the second-best correlation peak with constraints:
   - **Exclusion range**: Must be >15% different lag from primary (avoids detecting noise near the fundamental)
   - **Harmonic filter**: Reject peaks at exact octaves (2x frequency ratio between 1.9-2.1)
   - **Minimum strength**: Secondary correlation must be >0.15 (15%)
4. Return object with both pitches and their correlation strengths

**Use cases**:
- Detecting vocal harmonics (overtones in rich voices)
- Showing vibrato range (pitch modulation)
- Identifying weak secondary resonances
- Visualizing complex tones with multiple frequency components

**Visualization**:
- Primary pitch: Blue trace (`rgba(116, 192, 252, 0.9)`)
- Secondary pitch: Orange trace (`rgba(255, 180, 100, 0.7)`)
- Both traces are smoothed independently
- Secondary trace only appears when detected

**Implementation details**:
```javascript
// Enable secondary detection
const pitchData = detectPitch(buffer, sampleRate, true);
// Returns: { primary: 220, secondary: 155, primaryStrength: 0.85, secondaryStrength: 0.22 }
// Or: { primary: 220, secondary: null, primaryStrength: 0.85, secondaryStrength: 0 }

// Disable secondary detection (backward compatible)
const pitch = detectPitch(buffer, sampleRate, false);
// Returns: 220 (just the number)
```

**Benefits**:
- Richer visualization of voice characteristics
- Helps identify voice quality and resonance
- Useful for vocal training and analysis
- Maintains backward compatibility when disabled

### 2. **Adaptive Frequency Range**
- Auto-adjust min/max Hz based on detected pitch history
- Better accommodate different voice types

### 3. **Improved Confidence Metric**
- Use multiple correlation peaks to assess signal quality
- Adaptive thresholding based on recent history

### 4. **Harmonic Template Matching**
- Compare against expected harmonic patterns
- Better discrimination between fundamental and overtones

## References

- **Autocorrelation pitch detection**: Classic signal processing technique dating to 1960s
- **YIN algorithm** (2002): More sophisticated autocorrelation variant with difference function
- **RAPT algorithm** (1997): Robust algorithm for pitch tracking

## Related Documentation

- [voice-recorder.md](voice-recorder.md) - Overall architecture
- [voice-recorder-pitch-plan.md](voice-recorder-pitch-plan.md) - Implementation plan (historical)
- [voice-recorder-roadmap.md](voice-recorder-roadmap.md) - Future features
