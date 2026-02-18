# Pitch Detection Algorithms in Voice Software: Industry Comparison

## Overview

This document compares pitch detection algorithms used in popular voice software and analyzes how they handle accuracy and outlier filtering compared to our implementation.

## Our Approach

**Algorithm**: Normalized Autocorrelation
**Enhancements**:
- IQR-based outlier filtering (1.5×IQR bounds)
- Confidence-weighted averaging using correlation strength
- Temporal consistency checks (30% jump threshold)
- Parabolic interpolation for sub-sample precision

## Industry Standard Algorithms

### 1. YIN Algorithm (2002)

**Used in**: Praat, Sonic Visualiser, many research tools

**Key Features**:
- **Difference function** instead of autocorrelation: `d(τ) = Σ(x[i] - x[i+τ])²`
- **Cumulative mean normalized difference function (CMNDF)**: Normalizes by accumulated energy
- **Absolute threshold**: 0.1 (10%) for pitch detection
- **Parabolic interpolation**: For sub-sample accuracy (like ours)

**Advantages over naive autocorrelation**:
- Better octave discrimination through CMNDF normalization
- Fewer spurious octave errors
- More robust to amplitude variations

**Outlier Handling**:
- Uses **median filtering** over time for smoothing
- No explicit statistical outlier removal
- Relies on threshold tuning and temporal smoothing

**Comparison to our approach**:
- YIN's CMNDF is more sophisticated than our basic normalization
- We add IQR filtering which YIN lacks
- Our confidence weighting is similar to YIN's threshold concept
- YIN is computationally more expensive (requires cumulative calculations)

### 2. RAPT (Robust Algorithm for Pitch Tracking) - 1995

**Used in**: Speech coding systems, telecommunications

**Key Features**:
- **Multi-pass algorithm**: Coarse pass → fine pass → tracking
- **Normalized cross-correlation function (NCCF)**: Similar to our autocorrelation
- **Dynamic programming**: Finds optimal pitch contour over time
- **Cost function**: Balances local evidence with temporal continuity

**Outlier Handling**:
- **Dynamic programming** implicitly handles outliers by preferring smooth contours
- **Path cost penalties** for large pitch jumps
- **Voicing probability**: Weights each candidate by confidence

**Comparison to our approach**:
- RAPT uses DP for global optimization; we use local temporal checks
- Both use correlation-based detection
- RAPT is offline (requires full signal); ours is real-time
- Our temporal consistency (30% jump) is simpler than RAPT's DP but real-time friendly
- RAPT's voicing probability is similar to our correlation strength weighting

### 3. SWIPE (Sawtooth Waveform Inspired Pitch Estimator) - 2008

**Used in**: Some research tools, music information retrieval

**Key Features**:
- **Frequency domain**: Uses FFT with sawtooth harmonic templates
- **First difference spectrum**: Computes derivative to enhance harmonics
- **Template matching**: Compares against ideal harmonic series
- **Sub-sample precision**: Through spectral peak fitting

**Outlier Handling**:
- **Strength threshold**: Similar to correlation threshold
- **Spectral continuity**: Prefers harmonically related frequencies
- Minimal post-processing outlier filtering

**Comparison to our approach**:
- Fundamentally different (frequency domain vs. time domain)
- Better at complex/noisy signals
- More computationally expensive (FFT required)
- Our approach is lighter weight for real-time web applications
- Both use strength/confidence for filtering

### 4. pYIN (Probabilistic YIN) - 2014

**Used in**: Sonic Visualiser, Tony (melody extraction tool)

**Key Features**:
- **Extends YIN** with probabilistic framework
- **Hidden Markov Model (HMM)**: Models pitch transitions probabilistically
- **Pitch probability distribution**: Not just single pitch estimate
- **Viterbi algorithm**: Finds most likely pitch sequence

**Outlier Handling**:
- **HMM state transitions**: Automatically penalize unlikely jumps
- **Voicing state**: Explicit model for voiced/unvoiced transitions
- **Probabilistic smoothing**: More sophisticated than median filtering

**Comparison to our approach**:
- pYIN is state-of-the-art research algorithm
- Much more complex (HMM, Viterbi decoding)
- Requires buffering for HMM (not truly real-time)
- Our temporal consistency is a lightweight alternative to HMM
- pYIN's probabilistic framework vs. our deterministic IQR filtering

### 5. Crepe (Convolutional Neural Network) - 2018

**Used in**: Modern pitch tracking research, some DAWs

**Key Features**:
- **Deep learning**: CNN trained on labeled pitch data
- **Direct waveform input**: No manual feature engineering
- **Confidence output**: Network provides certainty estimate
- **State-of-the-art accuracy**: Especially on complex/noisy audio

**Outlier Handling**:
- **Learned implicitly**: Network learns to ignore outliers from training data
- **Confidence scores**: Similar concept to our correlation strength
- **Temporal modeling**: Can use recurrent layers (LSTM) for smoothness

**Comparison to our approach**:
- Crepe requires TensorFlow.js (large dependency, slower)
- Much higher computational cost (not suitable for lightweight web app)
- Better accuracy on difficult signals
- Our correlation strength is interpretable; neural confidence is a black box
- Both use confidence weighting for filtering

### 6. Praat (Boersma) - Default Algorithm

**Used in**: Praat phonetics software (widely used in linguistics)

**Key Features**:
- **Autocorrelation** with Hanning window (similar to ours)
- **Parabolic interpolation** (same as ours)
- **Octave cost**: Penalizes jumps to octave positions
- **Voicing threshold**: Based on correlation strength

**Outlier Handling**:
- **Octave jump cost**: Explicit penalty in tracking algorithm
- **Path finding**: Uses dynamic programming for smooth contours
- **Voicing threshold**: Similar to our 0.2 correlation minimum

**Comparison to our approach**:
- Very similar foundation (normalized autocorrelation)
- Praat's octave cost is similar to our temporal consistency check
- Praat uses DP for offline analysis; we use real-time local checks
- Our IQR filtering is more statistically rigorous than Praat's simple smoothing
- Praat is GUI-focused; ours is web-based real-time

## Outlier Filtering Strategies Comparison

| Algorithm | Outlier Method | Real-time? | Statistical Rigor |
|-----------|---------------|-----------|-------------------|
| **Our implementation** | IQR (1.5×IQR bounds) + temporal consistency | ✅ Yes | High (standard statistical method) |
| **YIN** | Median filtering over time | ✅ Yes | Low (heuristic smoothing) |
| **RAPT** | Dynamic programming path cost | ❌ No | Medium (global optimization) |
| **pYIN** | HMM state transitions | ⚠️ Buffered | High (probabilistic model) |
| **Crepe** | Learned from data + confidence | ✅ Yes | N/A (black box) |
| **Praat** | Octave cost + path finding | ⚠️ Buffered | Low (heuristic) |

## Confidence/Strength Weighting Comparison

| Algorithm | Confidence Metric | Weighted Averaging? |
|-----------|------------------|---------------------|
| **Our implementation** | Correlation strength (0-1) | ✅ Yes (explicit weighting) |
| **YIN** | CMNDF threshold | ⚠️ Implicit (threshold filtering) |
| **RAPT** | Voicing probability | ✅ Yes (cost function) |
| **pYIN** | HMM state probability | ✅ Yes (Viterbi path) |
| **Crepe** | Neural network confidence | ✅ Yes (learned) |
| **Praat** | Autocorrelation peak height | ⚠️ Implicit (voicing decision) |

## What Makes Our Approach Unique

### 1. Lightweight and Web-Optimized
- Pure JavaScript, no external libraries (unlike Crepe)
- Real-time processing with minimal latency
- Suitable for browser-based applications

### 2. Explicit Statistical Outlier Filtering
- **IQR method** is rarely used in pitch tracking specifically
- Most algorithms use temporal smoothing or implicit filtering through DP/HMM
- Our approach is more transparent and tunable

### 3. Confidence-Weighted Statistics
- Most tools report simple min/max/mean
- We use correlation strength as explicit weight
- Provides more representative statistics for voice training

### 4. Hybrid Approach
- Combines time-domain efficiency (autocorrelation)
- With statistical robustness (IQR filtering)
- And temporal consistency checks (jump threshold)
- Balances accuracy, speed, and interpretability

## Recommendations from Industry Practice

### 1. Consider YIN Algorithm Upgrade
**Benefit**: Better octave discrimination
**Trade-off**: More computation (CMNDF calculation)
**Implementation**: Replace autocorrelation with difference function + CMNDF

```javascript
// Current: correlation / energy
// Upgrade to: difference function with CMNDF
function computeCMNDF(buffer, lag) {
    let diff = 0;
    for (let i = 0; i < buffer.length - lag; i++) {
        diff += (buffer[i] - buffer[i + lag]) ** 2;
    }
    // Normalize by cumulative mean
    let cumulativeMean = 0;
    for (let l = 1; l <= lag; l++) {
        let d = 0;
        for (let i = 0; i < buffer.length - l; i++) {
            d += (buffer[i] - buffer[i + l]) ** 2;
        }
        cumulativeMean += d;
    }
    return diff / (cumulativeMean / lag);
}
```

### 2. Add Median Filtering Option
**Benefit**: Simple temporal smoothing used by YIN and others
**Trade-off**: Small latency (need 3-5 samples buffered)

```javascript
// Apply median filter over sliding window
function medianFilter(pitchHistory, windowSize = 5) {
    const filtered = [];
    for (let i = 0; i < pitchHistory.length; i++) {
        const window = pitchHistory.slice(
            Math.max(0, i - Math.floor(windowSize / 2)),
            Math.min(pitchHistory.length, i + Math.ceil(windowSize / 2))
        ).filter(v => v !== null);
        filtered.push(median(window));
    }
    return filtered;
}
```

### 3. Voicing Probability (like RAPT/pYIN)
**Benefit**: Separate pitch confidence from pitch value
**Trade-off**: More complex data structure

```javascript
// Return voicing probability separately
return {
    primary: primaryPitch,
    primaryStrength: bestCorrelation,
    voicingProbability: calculateVoicingProb(rms, bestCorrelation, spectralFlatness)
};
```

### 4. Adaptive Thresholds
**Benefit**: Works better across diverse voices
**Trade-off**: More parameters to tune

```javascript
// Adapt temporal consistency threshold based on observed variance
const pitchVariance = calculateVariance(recentSamples);
const adaptiveThreshold = baseThreshold * (1 + pitchVariance / meanPitch);
```

## Academic References

1. **YIN Algorithm**: 
   - de Cheveigné, A., & Kawahara, H. (2002). "YIN, a fundamental frequency estimator for speech and music". *Journal of the Acoustical Society of America*, 111(4), 1917-1930.

2. **RAPT**:
   - Talkin, D. (1995). "A robust algorithm for pitch tracking (RAPT)". *Speech Coding and Synthesis*, 495-518.

3. **SWIPE**:
   - Camacho, A., & Harris, J. G. (2008). "A sawtooth waveform inspired pitch estimator for speech and music". *Journal of the Acoustical Society of America*, 124(3), 1638-1652.

4. **pYIN**:
   - Mauch, M., & Dixon, S. (2014). "pYIN: A fundamental frequency estimator using probabilistic threshold distributions". *IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)*, 659-663.

5. **Crepe**:
   - Kim, J. W., Salamon, J., Li, P., & Bello, J. P. (2018). "Crepe: A convolutional representation for pitch estimation". *IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)*, 161-165.

6. **Praat**:
   - Boersma, P. (1993). "Accurate short-term analysis of the fundamental frequency and the harmonics-to-noise ratio of a sampled sound". *Proceedings of the Institute of Phonetic Sciences*, 17, 97-110.

## Conclusion

Our implementation strikes a good balance between:
- **Accuracy**: Comparable to classical algorithms (YIN, RAPT, Praat)
- **Efficiency**: Lightweight enough for real-time web applications
- **Robustness**: IQR filtering + temporal consistency provide better outlier handling than most classical methods
- **Interpretability**: Correlation strength and IQR bounds are transparent

For a web-based voice recorder, this is an excellent approach. More sophisticated algorithms (pYIN, Crepe) would require significant computational overhead without proportional benefits for the use case.

### Future Considerations

If accuracy becomes a priority over performance:
1. **Upgrade to YIN algorithm** (moderate complexity increase)
2. **Add HMM-based smoothing** like pYIN (significant complexity)
3. **Explore Crepe** with TensorFlow.js (large dependency, high CPU usage)

For now, the combination of autocorrelation + IQR filtering + confidence weighting is well-suited to the application's needs.

## Related Documentation

- [pitch-accuracy-improvements.md](pitch-accuracy-improvements.md) - Our implementation details
- [voice-recorder-pitch-algorithm.md](voice-recorder-pitch-algorithm.md) - Core autocorrelation algorithm
- [pitch-detection-summary.md](pitch-detection-summary.md) - Algorithm overview
