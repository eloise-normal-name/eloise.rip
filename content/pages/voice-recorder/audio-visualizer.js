class AudioVisualizer {
    constructor(canvas, analyserNode) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.analyserNode = null;
        this.data = null;
        this.floatData = null;

        this.backgroundColor = 'rgba(16, 12, 20, 1)';
        this.borderColor = 'rgba(255, 107, 157, 0.65)';
        this.borderWidth = 2;

        this.pitchHistory = [];
        this.pitchMaxSamples = 200;
        this.pitchMinHz = 80;
        this.pitchMaxHz = 400;
        this.pitchColor = 'rgba(116, 192, 252, 0.9)';
        this.pitchSmoothing = 0.35;

        this.setAnalyser(analyserNode);
    }

    setAnalyser(analyserNode) {
        this.analyserNode = analyserNode;
        if (this.analyserNode) {
            this.data = new Uint8Array(this.analyserNode.fftSize);
            this.floatData = new Float32Array(this.analyserNode.fftSize);
        } else {
            this.data = null;
            this.floatData = null;
        }
        this.resetPitchHistory();
    }

    resetPitchHistory() {
        this.pitchHistory = [];
    }

    pushPitchSample(hz) {
        const isValid = typeof hz === 'number' && Number.isFinite(hz);
        let value = isValid ? hz : null;

        if (value !== null) {
            value = Math.min(this.pitchMaxHz, Math.max(this.pitchMinHz, value));
            if (this.pitchHistory.length) {
                const previous = this.pitchHistory[this.pitchHistory.length - 1];
                if (previous !== null) {
                    value = previous + (value - previous) * this.pitchSmoothing;
                }
            }
        }

        this.pitchHistory.push(value);
        if (this.pitchHistory.length > this.pitchMaxSamples) {
            this.pitchHistory.shift();
        }
    }

    paintFrame() {
        const width = this.canvas.width;
        const height = this.canvas.height;

        this.ctx.save();
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, width, height);

        if (this.borderWidth > 0) {
            const inset = this.borderWidth / 2;
            this.ctx.lineWidth = this.borderWidth;
            this.ctx.strokeStyle = this.borderColor;
            this.ctx.strokeRect(inset, inset, width - this.borderWidth, height - this.borderWidth);
        }
        this.ctx.restore();
    }

    clear() {
        this.paintFrame();
        this.resetPitchHistory();
    }

    render() {
        this.paintFrame();
        if (!this.analyserNode) return;
        if (!this.data || this.data.length !== this.analyserNode.fftSize) {
            this.data = new Uint8Array(this.analyserNode.fftSize);
        }
        if (!this.floatData || this.floatData.length !== this.analyserNode.fftSize) {
            this.floatData = new Float32Array(this.analyserNode.fftSize);
        }

        this.analyserNode.getByteTimeDomainData(this.data);
        if (this.floatData && typeof detectPitch === 'function') {
            this.analyserNode.getFloatTimeDomainData(this.floatData);
            const pitchHz = detectPitch(this.floatData, this.analyserNode.context.sampleRate);
            this.pushPitchSample(pitchHz);
        } else {
            this.pushPitchSample(null);
        }

        const width = this.canvas.width;
        const height = this.canvas.height;
        const mid = height / 2;
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = 'rgba(255, 107, 157, 0.9)';

        this.ctx.beginPath();
        for (let i = 0; i < this.data.length; i += 1) {
            const x = (i / (this.data.length - 1)) * width;
            const v = (this.data[i] - 128) / 128;
            const y = mid + v * (mid - 6);
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();

        this.renderPitchTrace();
    }

    renderPitchTrace() {
        if (!this.pitchHistory.length) return;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const padding = 6;
        const usableHeight = height - padding * 2;
        const step = this.pitchMaxSamples > 1 ? width / (this.pitchMaxSamples - 1) : width;
        const offset = Math.max(this.pitchMaxSamples - this.pitchHistory.length, 0);
        const range = this.pitchMaxHz - this.pitchMinHz || 1;

        let pathOpen = false;
        for (let i = 0; i < this.pitchHistory.length; i += 1) {
            const sample = this.pitchHistory[i];
            const x = (i + offset) * step;

            if (sample === null) {
                if (pathOpen) {
                    this.ctx.stroke();
                    pathOpen = false;
                }
                continue;
            }

            const ratio = (sample - this.pitchMinHz) / range;
            const clamped = Math.min(1, Math.max(0, ratio));
            const y = padding + (1 - clamped) * usableHeight;

            if (!pathOpen) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = this.pitchColor;
                this.ctx.lineWidth = 1.5;
                this.ctx.moveTo(x, y);
                pathOpen = true;
            } else {
                this.ctx.lineTo(x, y);
            }
        }

        if (pathOpen) {
            this.ctx.stroke();
        }
    }
}
