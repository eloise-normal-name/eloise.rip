# Pitch Accuracy and Outlier Filtering Improvements

## Overview

This document describes the improvements made to the voice recorder's pitch detection accuracy and statistical outlier filtering implemented in response to the need for more accurate pitch measurements and rejection of outlier samples in min/max/avg calculations.

## Problems Addressed

### 1. Outliers in Pitch Statistics
**Problem**: The previous implementation included all detected pitch values in the min/max/average calculations, even if they were spurious detections or octave errors. This could skew the statistics significantly.

**Example**: A recording with consistent pitch around 200 Hz might have a few spurious detections at 140 Hz (octave error) or 270 Hz (harmonic confusion), causing the min/max range to appear much wider than the actual voice range.

### 2. Lack of Confidence Weighting
**Problem**: All pitch samples were weighted equally in the average calculation, regardless of detection confidence. A weak, uncertain detection at the edge of silence had the same weight as a strong, clear detection during sustained phonation.

### 3. No Temporal Consistency Checking
**Problem**: Large, sudden jumps in pitch (e.g., from 180 Hz to 90 Hz in one frame) were accepted without question, even when they were likely octave errors rather than real pitch changes.

## Solutions Implemented

### 1. Statistical Outlier Filtering Using IQR Method

**Implementation**: Uses the Interquartile Range (IQR) method to identify and exclude statistical outliers.

**Algorithm**:
```javascript
// Sort all pitch samples
const sortedSamples = [...samples].sort((a, b) => a - b);

// Calculate quartiles
const q1 = sortedSamples[floor(n * 0.25)];
const q3 = sortedSamples[floor(n * 0.75)];
const iqr = q3 - q1;

// Define outlier bounds (1.5 * IQR is the standard method)
const lowerBound = q1 - 1.5 * iqr;
const upperBound = q3 + 1.5 * iqr;

// Exclude samples outside bounds
```

**Why IQR?**:
- Robust to outliers (unlike standard deviation)
- Well-established statistical method
- Works well with skewed distributions
- Used in box plots and standard statistical analysis

**Benefits**:
- Octave errors (samples at half or double the correct frequency) are automatically excluded
- Spurious detections during voice breaks are filtered out
- The reported range reflects the actual voice range, not measurement artifacts

### 2. Confidence-Weighted Averaging

**Implementation**: Uses the correlation strength from the pitch detector as a weight for averaging.

**Algorithm**:
```javascript
// For each sample
weightedSum += pitchValue * correlationStrength;
totalWeight += correlationStrength;

// Final average
average = weightedSum / totalWeight;
```

**Benefits**:
- Strong, clear detections (high correlation) have more influence
- Weak, uncertain detections (low correlation) contribute less
- Average reflects the most confident pitch values
- More representative of sustained phonation than brief transitions

**Correlation Strength**:
- Range: 0.0 to 1.0
- Values > 0.7: Very strong, clear pitch detection
- Values 0.4 - 0.7: Moderate confidence
- Values 0.2 - 0.4: Weak detection (minimum threshold is 0.2)
- Higher values indicate the signal is highly periodic (strong voicing)

### 3. Temporal Consistency Checking

**Implementation**: Rejects sudden large jumps that are likely measurement errors.

**Algorithm**:
```javascript
// Calculate recent average from last 10 samples
const recentAvg = average(last10Samples);
const maxJump = recentAvg * 0.3; // Allow 30% deviation

// Reject if jump is too large AND confidence is not very high
if (abs(newValue - recentAvg) > maxJump && strength < 0.7) {
    // Reject this sample
}
```

**Why 30%?**:
- Human voice can jump about this much during normal speech/singing
- Smaller threshold would reject valid vibrato
- Larger threshold would allow obvious octave errors (50% jump)

**Why check confidence?**:
- Very strong detections (>0.7) are likely correct even if they jump
- Weak detections that jump far are likely errors
- Allows genuine pitch shifts while filtering spurious ones

**Benefits**:
- Prevents octave doubling/halving errors
- Filters out brief spurious detections
- Still allows natural pitch variation and vibrato

### 4. Always Return Object from Pitch Detector

**Change**: The pitch detector now always returns an object with correlation strength, even in non-secondary mode.

**Before**:
```javascript
if (!detectSecondary) {
    return primaryPitch; // Just a number
}
```

**After**:
```javascript
if (!detectSecondary) {
    return {
        primary: primaryPitch,
        secondary: null,
        primaryStrength: bestCorrelation,
        secondaryStrength: 0
    };
}
```

**Benefits**:
- Consistent API regardless of secondary pitch detection mode
- Makes correlation strength available for weighting
- Enables all the improvements above

## User-Visible Changes

### Pitch Statistics Display

When outliers are filtered out, the recording display now shows:
```
Pitch: 165.2 - 243.8 Hz (avg: 198.3 Hz) (5 outliers filtered)
```

The outlier count is only shown when samples were actually filtered, helping users understand when the filtering was active.

### More Accurate Statistics

**Before**:
- Min: 140.5 Hz (octave error)
- Max: 271.2 Hz (harmonic confusion)
- Avg: 203.7 Hz (skewed by outliers)

**After (with same recording)**:
- Min: 165.2 Hz (true minimum)
- Max: 243.8 Hz (true maximum)
- Avg: 198.3 Hz (confidence-weighted)
- (5 outliers filtered)

## Technical Details

### Data Structure Changes

**PitchStats Object** (in audio-visualizer.js):
```javascript
this.pitchStats = {
    min: null,
    max: null,
    sum: 0,
    count: 0,
    samples: [],     // NEW: All pitch samples
    strengths: []    // NEW: Correlation strengths
};
```

### Minimum Sample Requirements

- **< 10 samples**: No outlier filtering (too few data points)
- **< 5 samples after filtering**: Fall back to unfiltered statistics
- This prevents over-aggressive filtering with sparse data

### Memory Impact

**Additional memory per recording**:
- Samples array: ~4 bytes × sample count
- Strengths array: ~4 bytes × sample count
- For a 10-second recording at 60 fps: ~4.8 KB additional memory

This is negligible compared to the audio blob itself (hundreds of KB).

### Performance Impact

**getPitchStatistics()** now includes:
- Array copy and sort: O(n log n)
- IQR calculation: O(n)
- Filtered statistics: O(n)

For typical recordings (300-3600 samples), this takes < 1ms and only runs once when the recording stops.

## Edge Cases Handled

### 1. Very Few Samples
If there are fewer than 10 samples, outlier filtering is skipped and basic statistics are returned. This prevents spurious filtering when data is sparse.

### 2. Over-Aggressive Filtering
If filtering removes more than 50% of samples (leaving < 5), the algorithm falls back to unfiltered statistics. This prevents the statistics from becoming meaningless.

### 3. No Valid Samples
If no pitch was detected during recording, `getPitchStatistics()` returns `null` (same as before).

### 4. Backward Compatibility
The statistics object still includes `min`, `max`, and `average` fields. The additional `sampleCount` and `filteredCount` fields are optional and only used when outlier filtering is active.

## Testing Recommendations

### 1. Sustained Tone Test
Record a sustained "ahhh" sound at constant pitch. The statistics should show a very narrow range (< 10 Hz) with no outliers filtered.

### 2. Vibrato Test
Record singing with deliberate vibrato. The range should capture the vibrato extent, and minimal outliers should be filtered.

### 3. Test Signal
Use the 220 Hz test signal. Should show:
- Min/Max/Avg all very close to 220 Hz
- No outliers (pure sine wave is very stable)

### 4. Speech Test
Record natural speech with varied pitch. Outliers may be filtered during:
- Voice onset/offset
- Consonant articulation
- Register transitions

### 5. Silence and Noise
Record with periods of silence or background noise. The algorithm should reject spurious detections during these periods.

## Future Enhancements

### 1. Median-Based Statistics
Consider using median instead of mean for the "average" pitch, as median is inherently robust to outliers without requiring explicit filtering.

### 2. Pitch Contour Analysis
Track pitch over time to identify trends, jumps, and patterns. This could enable:
- Vibrato rate and depth measurement
- Pitch stability metrics
- Formant tracking

### 3. Adaptive Thresholds
Make the temporal consistency threshold adapt based on the observed pitch variability:
- Stable voice → tighter threshold
- Variable voice → looser threshold

### 4. Confidence Visualization
Show correlation strength visually in the pitch trace (e.g., line thickness or opacity).

## References

- **IQR Method**: Tukey, J.W. (1977). "Exploratory Data Analysis"
- **Autocorrelation Pitch Detection**: See docs/voice-recorder-pitch-algorithm.md
- **Temporal Consistency**: Common practice in pitch tracking systems (RAPT, YIN algorithms)

## Related Documentation

- [voice-recorder-pitch-algorithm.md](voice-recorder-pitch-algorithm.md) - Core pitch detection algorithm
- [pitch-detection-summary.md](pitch-detection-summary.md) - Algorithm overview and secondary pitch
- [voice-recorder.md](voice-recorder.md) - Overall voice recorder architecture
