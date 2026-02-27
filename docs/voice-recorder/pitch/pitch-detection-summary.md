# Pitch Detection: Algorithm Explanation & Secondary Pitch Feature

## Quick Summary

**Question 1**: How does the pitch algorithm work?
- Uses **normalized autocorrelation** in the time domain
- Finds periodic patterns in the audio signal (80-400 Hz range)
- Amplitude-independent, robust to noise, computationally efficient
- See [voice-recorder-pitch-algorithm.md](voice-recorder-pitch-algorithm.md) for full explanation

**Question 2**: Can we show secondary pitch?
- **YES! ✅ Now implemented**
- Detects and displays a second frequency component
- Orange trace shows secondary pitch alongside the blue primary pitch
- Useful for harmonics, overtones, and complex voice analysis

---

## Part 1: How the Pitch Algorithm Works

### The Big Picture

The voice recorder detects pitch using **autocorrelation** - a classic signal processing technique that finds repeating patterns in a waveform. Instead of converting to frequency domain (like FFT), it works directly with the time-domain audio samples.

### Why Autocorrelation?

Think of autocorrelation as "sliding" the signal over itself and measuring similarity:
```
Original:  [wave pattern]
Shifted:      [wave pattern]
           ↓ Compare overlap

If they match well → periodic signal → we found the pitch!
```

### Step-by-Step Process

#### 1. **Remove DC Bias** (Center the Signal)
Calculate the average value and subtract it from all samples. This removes any constant offset and ensures the signal oscillates around zero.

#### 2. **Silence Detection**
Calculate RMS (root mean square) to measure signal energy. If RMS < 0.01, the signal is too quiet to analyze reliably, so return null.

#### 3. **Define Search Range**
- Minimum frequency: 80 Hz (low male voice)
- Maximum frequency: 400 Hz (high female/child voice)
- Convert to lag values (time delays in samples)

#### 4. **Calculate Correlation for Each Lag**
For each possible lag (period):
```javascript
correlation = Σ[(signal[i] - mean) × (signal[i + lag] - mean)]
```
Then normalize by:
- Number of samples (to average)
- Signal energy (to make amplitude-independent)

This gives correlation values from 0 to 1.

#### 5. **Find Best Match**
The lag with the highest correlation represents the signal's period. Convert to frequency:
```javascript
pitch (Hz) = sampleRate / bestLag
```

#### 6. **Confidence Check**
Only accept detections with correlation ≥ 0.2 (20%). Lower values indicate:
- Non-periodic signal (noise, consonants)
- Multiple competing frequencies
- Insufficient signal quality

### Key Advantages

✅ **Fast**: O(n²) but n is small (2048 samples)  
✅ **Robust**: Handles moderate noise well  
✅ **Simple**: No FFT or complex libraries needed  
✅ **Amplitude-independent**: Works at any volume  
✅ **Octave-proof**: Finds fundamental, not harmonics  

### Normalization Magic

The crucial innovation is **dividing by signal energy**:
```javascript
correlation /= energy;  // energy = rms²
```

This makes correlation values:
- Range from 0 to 1 (standardized)
- Independent of signal amplitude
- Comparable across different sounds

**Result**: A whisper and a shout at 220 Hz will both show ~220 Hz, not different values!

---

## Part 2: Secondary Pitch Detection

### What Is Secondary Pitch?

While the primary pitch is the fundamental frequency (the "note" you hear), complex sounds have additional frequency components:
- **Harmonics**: Integer multiples of the fundamental (2x, 3x, etc.)
- **Overtones**: Non-harmonic frequency components
- **Formants**: Resonances that give voice its character
- **Secondary resonances**: Weaker periodic components

### Implementation

The secondary pitch detector extends the algorithm:

**After finding the primary pitch**:
1. **Store all correlations** during the initial search
2. **Find second-best peak** with constraints:
   - Must be >15% different lag from primary (avoids nearby noise)
   - Must NOT be an octave (filters out 2x harmonics)
   - Must have correlation >0.15 (strong enough to be real)
3. **Return both pitches** with their strength values

**Algorithm specifics**:
```javascript
// Exclusion range: 15% around primary lag
const exclusionRange = bestLag * 0.15;

// Harmonic filter: reject if ratio ≈ 2.0
const ratio = max(lag1, lag2) / min(lag1, lag2);
if (ratio >= 1.9 && ratio <= 2.1) {
    // Skip - this is an octave
}
```

### Why Filter Octaves?

Harmonic sounds naturally have strong correlations at 2x, 3x, 4x the fundamental frequency. Without filtering, the "secondary" pitch would almost always be the first harmonic (octave above), which is less interesting than detecting truly independent frequency components.

### Visualization

**Primary pitch**: 
- Color: Blue (`rgba(116, 192, 252, 0.9)`)
- Line width: 1.5px
- Always shown when detected

**Secondary pitch**:
- Color: Orange (`rgba(255, 180, 100, 0.7)`)
- Line width: 1.2px (slightly thinner)
- Only shown when a valid secondary pitch is detected
- Can be toggled via `showSecondaryPitch` property

Both traces:
- Use same 80-400 Hz range mapping
- Apply 35% exponential smoothing independently
- Support gaps (null values) when not detected

### When Will You See a Secondary Pitch?

**Common scenarios**:
- **Rich, resonant voices**: Multiple strong formants
- **Vibrato**: Pitch modulation creates frequency spread
- **Vocal fry**: Creates subharmonics below the fundamental
- **Harmonically rich tones**: Voices with strong overtones
- **Test signals**: Pure tones may not have secondary components

**When you won't**:
- **Pure sine waves**: Only one frequency component
- **Weak signals**: Secondary components below threshold
- **Noisy/breathy voices**: No clear secondary periodicity
- **Whispers**: Unvoiced sounds have no pitch

### Usage

**JavaScript API**:
```javascript
// With secondary detection
const result = detectPitch(buffer, sampleRate, true);
// Returns:
// {
//     primary: 220,           // Main pitch in Hz
//     secondary: 155,         // Secondary pitch in Hz (or null)
//     primaryStrength: 0.85,  // Correlation value
//     secondaryStrength: 0.22 // Correlation value
// }

// Without secondary detection (backward compatible)
const pitch = detectPitch(buffer, sampleRate, false);
// Returns: 220 (just a number)
```

**AudioVisualizer**:
```javascript
visualizer.showSecondaryPitch = true;  // Enable (default)
visualizer.showSecondaryPitch = false; // Disable orange trace
```

### Practical Applications

1. **Vocal training**: Visualize voice quality and resonance
2. **Pitch analysis**: See vibrato and modulation patterns
3. **Voice characterization**: Understand overtone structure
4. **Debugging**: Verify signal complexity with test tones
5. **Music analysis**: Detect multiple instruments/voices

---

## Testing the Implementation

### Using the Test Signal

The voice recorder includes a **220 Hz test signal button**:

1. Click the 🌊 "Test Signal" button
2. You'll see a blue line appear (primary pitch at ~220 Hz)
3. The orange line (secondary) may appear if harmonics are strong enough
4. Click again to stop the test signal

### What to Expect

**With test signal (pure 220 Hz sine wave)**:
- Blue trace at consistent height (220 Hz)
- Orange trace may be sparse or absent (pure tones have few overtones)

**With voice/singing**:
- Blue trace follows your pitch (fundamental)
- Orange trace appears for harmonically rich sounds
- Both traces will have gaps during unvoiced sounds (consonants, breathing)
- Vibrato creates wavy patterns in both traces

### Interpreting the Display

**Vertical position**:
- Top of canvas = 400 Hz (high pitch)
- Middle = ~240 Hz
- Bottom = 80 Hz (low pitch)

**Trace behavior**:
- Smooth line = stable pitch
- Wavy line = vibrato/pitch variation
- Gaps = unvoiced segments or weak signal
- Two traces = multiple frequency components detected

---

## Technical Details

### File Locations

- **Pitch detector**: `content/pages/voice-recorder/pitch-detector.js`
- **Visualizer**: `content/pages/voice-recorder/audio-visualizer.js`
- **Full algorithm docs**: `docs/voice-recorder-pitch-algorithm.md`
- **Architecture**: `docs/voice-recorder.md`

### Performance

- **FFT size**: 2048 samples
- **Sample rate**: 48000 Hz (typical)
- **Analysis window**: ~43ms per frame
- **Frame rate**: 60 fps (visualizer)
- **Processing time**: <2ms per frame (negligible)

### Memory Usage

- **Primary history**: 200 samples × 4 bytes = 800 bytes
- **Secondary history**: 200 samples × 4 bytes = 800 bytes
- **Correlations array**: ~320 samples × 12 bytes = ~3.8 KB
- **Total**: <5 KB additional memory

### Browser Compatibility

Works in all modern browsers supporting:
- Web Audio API
- Canvas 2D
- Float32Array

---

## Related Documentation

- [voice-recorder-pitch-algorithm.md](voice-recorder-pitch-algorithm.md) - Complete algorithm explanation with examples
- [voice-recorder.md](voice-recorder.md) - Overall architecture and components
- [voice-recorder-pitch-plan.md](archive/voice-recorder-pitch-plan.md) - Original implementation plan (archived)
- [voice-recorder-roadmap.md](voice-recorder-roadmap.md) - Future features and improvements
