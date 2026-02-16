function detectPitch(buffer, sampleRate) {
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

    let bestCorrelation = 0;
    let bestLag = -1;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
        let correlation = 0;
        for (let i = 0; i < buffer.length - lag; i += 1) {
            correlation += (buffer[i] - mean) * (buffer[i + lag] - mean);
        }
        correlation /= (buffer.length - lag);

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestLag = lag;
        }
    }

    if (bestLag === -1 || bestCorrelation < 0.2) {
        return null;
    }

    return sampleRate / bestLag;
}
