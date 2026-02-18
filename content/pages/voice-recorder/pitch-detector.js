function detectPitchAutocorrelation(buffer, sampleRate, detectSecondary = false, options = {}) {
    if (!buffer || buffer.length === 0 || !sampleRate) {
        return null;
    }

    const minHz = options.minHz || 80;
    const maxHz = options.maxHz || 400;
    const primaryThreshold = options.primaryThreshold || 0.2;
    const secondaryThreshold = options.secondaryThreshold || 0.15;

    let mean = 0;
    for (let i = 0; i < buffer.length; i += 1) {
        mean += buffer[i];
    }
    mean /= buffer.length;

    let rms = 0;
    for (let i = 0; i < buffer.length; i += 1) {
        const centered = buffer[i] - mean;
        rms += centered * centered;
    }
    rms = Math.sqrt(rms / buffer.length);
    if (rms < 0.01) {
        return null;
    }

    const minLag = Math.max(1, Math.floor(sampleRate / maxHz));
    const maxLag = Math.min(Math.floor(sampleRate / minHz), buffer.length - 1);

    const energy = rms * rms;

    const correlations = [];
    let bestCorrelation = 0;
    let bestLag = -1;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
        let correlation = 0;
        for (let i = 0; i < buffer.length - lag; i += 1) {
            correlation += (buffer[i] - mean) * (buffer[i + lag] - mean);
        }
        correlation /= (buffer.length - lag);
        correlation /= energy;

        correlations.push({ lag: lag, correlation: correlation });

        // Prefer smaller lags (higher frequencies) to avoid octave errors
        // Accept a new peak if it's significantly better, or slightly better but at a smaller lag
        if (correlation > bestCorrelation * 1.01 || 
            (correlation > bestCorrelation * 0.99 && lag < bestLag)) {
            bestCorrelation = correlation;
            bestLag = lag;
        }
    }

    if (bestLag === -1 || bestCorrelation < primaryThreshold) {
        return null;
    }

    // Apply parabolic interpolation for sub-sample precision
    // This significantly reduces quantization noise in pitch detection
    let refinedLag = bestLag;
    if (bestLag > minLag && bestLag < maxLag) {
        // Get correlation values at lag-1, lag, and lag+1
        const prevCorr = correlations[bestLag - minLag - 1].correlation;
        const currCorr = bestCorrelation;
        const nextCorr = correlations[bestLag - minLag + 1].correlation;
        
        // Parabolic interpolation formula: offset = (prev - next) / (2 * (prev - 2*curr + next))
        const denominator = 2 * (prevCorr - 2 * currCorr + nextCorr);
        if (denominator !== 0) {
            const offset = (prevCorr - nextCorr) / denominator;
            // Clamp offset to reasonable range to avoid outliers
            if (offset >= -0.5 && offset <= 0.5) {
                refinedLag = bestLag + offset;
            }
        }
    }

    const primaryPitch = sampleRate / refinedLag;

    if (!detectSecondary) {
        return { primary: primaryPitch, secondary: null, primaryStrength: bestCorrelation, secondaryStrength: 0 };
    }

    let secondBestCorrelation = 0;
    let secondBestLag = -1;
    const exclusionRange = bestLag * 0.15;

    for (let i = 0; i < correlations.length; i += 1) {
        const item = correlations[i];
        const lagDiff = Math.abs(item.lag - bestLag);
        
        if (lagDiff > exclusionRange && item.correlation > secondBestCorrelation) {
            const ratio = Math.max(item.lag, bestLag) / Math.min(item.lag, bestLag);
            if (ratio < 1.9 || ratio > 2.1) {
                secondBestCorrelation = item.correlation;
                secondBestLag = item.lag;
            }
        }
    }

    if (secondBestLag !== -1 && secondBestCorrelation > secondaryThreshold) {
        // Apply parabolic interpolation for secondary pitch as well
        let refinedSecondaryLag = secondBestLag;
        if (secondBestLag > minLag && secondBestLag < maxLag) {
            const idx = secondBestLag - minLag;
            if (idx > 0 && idx < correlations.length - 1) {
                const prevCorr = correlations[idx - 1].correlation;
                const currCorr = secondBestCorrelation;
                const nextCorr = correlations[idx + 1].correlation;
                
                const denominator = 2 * (prevCorr - 2 * currCorr + nextCorr);
                if (denominator !== 0) {
                    const offset = (prevCorr - nextCorr) / denominator;
                    if (offset >= -0.5 && offset <= 0.5) {
                        refinedSecondaryLag = secondBestLag + offset;
                    }
                }
            }
        }
        
        const secondaryPitch = sampleRate / refinedSecondaryLag;
        return {
            primary: primaryPitch,
            secondary: secondaryPitch,
            primaryStrength: bestCorrelation,
            secondaryStrength: secondBestCorrelation
        };
    }

    return { primary: primaryPitch, secondary: null, primaryStrength: bestCorrelation, secondaryStrength: 0 };
}

function detectPitch(buffer, sampleRate, detectSecondary = false, options = {}) {
    return detectPitchAutocorrelation(buffer, sampleRate, detectSecondary, options);
}

if (typeof window !== 'undefined') {
    window.detectPitchAutocorrelation = detectPitchAutocorrelation;
    window.detectPitch = detectPitch;
}
