class AudioVisualizer {
    constructor(canvas, analyserNode) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.analyserNode = null;
        this.floatData = null;

        this.backgroundColor = 'rgba(16, 12, 20, 1)';
        this.borderColor = 'rgba(255, 107, 157, 0.65)';
        this.borderWidth = 2;

        this.pitchHistory = [];
        this.secondaryPitchHistory = [];
        this.pitchMaxSamples = 200;
        this.pitchMinHz = 80;
        this.pitchMaxHz = 400;
        this.pitchColor = 'rgba(116, 192, 252, 0.9)';
        this.secondaryPitchColor = 'rgba(255, 180, 100, 0.7)';
        this.pitchSmoothing = 0.35;
        this.showSecondaryPitch = true;

        this.pitchGridSpacing = 50;
        this.pitchGridColor = 'rgba(255,255,255,0.08)';
        this.pitchGridWidth = 1;

        this.pitchDetectionOptions = {
            minHz: 80,
            maxHz: 400,
            primaryThreshold: 0.2,
            secondaryThreshold: 0.15
        };

        this.setAnalyser(analyserNode);
    }

    setAnalyser(analyserNode) {
        this.analyserNode = analyserNode;
        if (this.analyserNode) {
            this.floatData = new Float32Array(this.analyserNode.fftSize);
        } else {
            this.floatData = null;
        }
        this.resetPitchHistory();
    }

    resetPitchHistory() {
        this.pitchHistory = [];
        this.secondaryPitchHistory = [];
    }

    updatePitchRange(minHz, maxHz) {
        this.pitchMinHz = minHz;
        this.pitchMaxHz = maxHz;
        this.pitchDetectionOptions.minHz = minHz;
        this.pitchDetectionOptions.maxHz = maxHz;
    }

    updatePrimaryThreshold(threshold) {
        this.pitchDetectionOptions.primaryThreshold = threshold;
    }

    updateSecondaryThreshold(threshold) {
        this.pitchDetectionOptions.secondaryThreshold = threshold;
    }

    updateSmoothing(smoothing) {
        this.pitchSmoothing = smoothing;
    }

    pushPitchSample(pitchData) {
        let primaryValue = null;
        let secondaryValue = null;

        if (pitchData !== null) {
            if (typeof pitchData === 'number') {
                primaryValue = pitchData;
            } else if (typeof pitchData === 'object') {
                primaryValue = pitchData.primary;
                secondaryValue = pitchData.secondary;
            }
        }

        if (primaryValue !== null && Number.isFinite(primaryValue)) {
            primaryValue = Math.min(this.pitchMaxHz, Math.max(this.pitchMinHz, primaryValue));
            if (this.pitchHistory.length) {
                const previous = this.pitchHistory[this.pitchHistory.length - 1];
                if (previous !== null) {
                    primaryValue = previous + (primaryValue - previous) * this.pitchSmoothing;
                }
            }
        } else {
            primaryValue = null;
        }

        if (secondaryValue !== null && Number.isFinite(secondaryValue)) {
            secondaryValue = Math.min(this.pitchMaxHz, Math.max(this.pitchMinHz, secondaryValue));
            if (this.secondaryPitchHistory.length) {
                const previous = this.secondaryPitchHistory[this.secondaryPitchHistory.length - 1];
                if (previous !== null) {
                    secondaryValue = previous + (secondaryValue - previous) * this.pitchSmoothing;
                }
            }
        } else {
            secondaryValue = null;
        }

        this.pitchHistory.push(primaryValue);
        if (this.pitchHistory.length > this.pitchMaxSamples) {
            this.pitchHistory.shift();
        }

        this.secondaryPitchHistory.push(secondaryValue);
        if (this.secondaryPitchHistory.length > this.pitchMaxSamples) {
            this.secondaryPitchHistory.shift();
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
        this.renderPitchGrid();
        if (!this.analyserNode) return;
        if (!this.floatData || this.floatData.length !== this.analyserNode.fftSize) {
            this.floatData = new Float32Array(this.analyserNode.fftSize);
        }

        if (this.floatData && typeof detectPitch === 'function') {
            this.analyserNode.getFloatTimeDomainData(this.floatData);
            const pitchData = detectPitch(
                this.floatData, 
                this.analyserNode.context.sampleRate, 
                this.showSecondaryPitch,
                this.pitchDetectionOptions
            );
            this.pushPitchSample(pitchData);
        } else {
            this.pushPitchSample(null);
        }

        this.renderPitchTrace();
    }

    renderPitchGrid() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const padding = 6;
        const usableHeight = height - padding * 2;
        const range = this.pitchMaxHz - this.pitchMinHz;
        if (range <= 0) return;

        const spacing = this.pitchGridSpacing;
        const firstHz = Math.ceil(this.pitchMinHz / spacing) * spacing;

        this.ctx.save();
        this.ctx.strokeStyle = this.pitchGridColor;
        this.ctx.lineWidth = this.pitchGridWidth;

        for (let hz = firstHz; hz <= this.pitchMaxHz; hz += spacing) {
            const ratio = (hz - this.pitchMinHz) / range;
            const clamped = Math.min(1, Math.max(0, ratio));
            const y = padding + (1 - clamped) * usableHeight;

            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }

        this.ctx.restore();
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

        this.ctx.strokeStyle = this.pitchColor;
        this.ctx.lineWidth = 1.5;

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
                this.ctx.moveTo(x, y);
                pathOpen = true;
            } else {
                this.ctx.lineTo(x, y);
            }
        }

        if (pathOpen) {
            this.ctx.stroke();
        }

        if (this.showSecondaryPitch && this.secondaryPitchHistory.length) {
            this.ctx.strokeStyle = this.secondaryPitchColor;
            this.ctx.lineWidth = 1.2;

            pathOpen = false;
            for (let i = 0; i < this.secondaryPitchHistory.length; i += 1) {
                const sample = this.secondaryPitchHistory[i];
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
}
