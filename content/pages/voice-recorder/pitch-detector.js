function detectPitch(buffer, sampleRate, detectSecondary = false) {
    if (!buffer || buffer.length === 0 || !sampleRate) {
        return null;
    }

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

    const minHz = 80;
    const maxHz = 400;
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

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestLag = lag;
        }
    }

    if (bestLag === -1 || bestCorrelation < 0.2) {
        return null;
    }

    const primaryPitch = sampleRate / bestLag;

    if (!detectSecondary) {
        return primaryPitch;
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

    if (secondBestLag !== -1 && secondBestCorrelation > 0.15) {
        const secondaryPitch = sampleRate / secondBestLag;
        return {
            primary: primaryPitch,
            secondary: secondaryPitch,
            primaryStrength: bestCorrelation,
            secondaryStrength: secondBestCorrelation
        };
    }

    return { primary: primaryPitch, secondary: null, primaryStrength: bestCorrelation, secondaryStrength: 0 };
}
