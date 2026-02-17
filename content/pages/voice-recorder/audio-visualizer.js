class AudioVisualizer {
    constructor(canvas, analyserNode) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.analyserNode = null;
        this.floatData = null;

        this.backgroundColor = 'rgba(255, 255, 255, 1)';
        this.borderColor = 'rgba(255, 107, 157, 0.65)';
        this.borderWidth = 0;
        
        // Voice range bands (typical fundamental frequencies)
        this.masculineVoiceMinHz = 85;
        this.masculineVoiceMaxHz = 155;
        this.feminineVoiceMinHz = 165;
        this.feminineVoiceMaxHz = 255;
        this.masculineVoiceColor = 'rgba(116, 192, 252, 0.15)';
        this.feminineVoiceColor = 'rgba(255, 107, 157, 0.15)';

        this.pitchHistory = [];
        this.secondaryPitchHistory = [];
        this.pitchMaxSamples = 200;
        this.pitchMinHz = 70;
        this.pitchMaxHz = 280;
        this.pitchColor = 'rgba(116, 192, 252, 0.9)';
        this.secondaryPitchColor = 'rgba(255, 180, 100, 0.7)';
        this.pitchSmoothing = 0.35;
        this.showSecondaryPitch = false;

        this.pitchDetectionOptions = {
            minHz: 70,
            maxHz: 280,
            primaryThreshold: 0.2,
            secondaryThreshold: 0.15
        };

        // Handle canvas context loss (can occur when switching tabs, especially on mobile)
        this.canvas.addEventListener('contextlost', (event) => {
            event.preventDefault();
        });

        this.canvas.addEventListener('contextrestored', () => {
            this.restoreContext();
        });

        this.setAnalyser(analyserNode);
    }

    restoreContext() {
        // Restore the 2D context after it was lost
        const newCtx = this.canvas.getContext('2d');
        if (!newCtx) {
            console.warn('Failed to restore canvas context');
            return;
        }
        this.ctx = newCtx;
        // Redraw the current visualization state
        this.paintFrame();
        this.renderPitchTrace();
    }

    ensureContext() {
        // Check if context is lost and try to restore it
        if (this.ctx && typeof this.ctx.isContextLost === 'function' && this.ctx.isContextLost()) {
            // Get a fresh context without triggering recursive redraws
            const newCtx = this.canvas.getContext('2d');
            if (newCtx) {
                this.ctx = newCtx;
            }
            return false; // Context was lost, skip this frame
        }
        return true; // Context is valid
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
        if (!this.ensureContext()) return;

        const width = this.canvas.width;
        const height = this.canvas.height;

        this.ctx.save();
        
        // Fill white background
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw voice range bands
        const padding = 6;
        const usableHeight = height - padding * 2;
        const range = this.pitchMaxHz - this.pitchMinHz || 1;
        
        // Helper function to convert Hz to Y coordinate
        const hzToY = (hz) => {
            const ratio = (hz - this.pitchMinHz) / range;
            const clamped = Math.min(1, Math.max(0, ratio));
            return padding + (1 - clamped) * usableHeight;
        };
        
        // Draw masculine voice range band (blue)
        if (this.masculineVoiceMaxHz > this.pitchMinHz && this.masculineVoiceMinHz < this.pitchMaxHz) {
            const topY = hzToY(Math.min(this.masculineVoiceMaxHz, this.pitchMaxHz));
            const bottomY = hzToY(Math.max(this.masculineVoiceMinHz, this.pitchMinHz));
            this.ctx.fillStyle = this.masculineVoiceColor;
            this.ctx.fillRect(0, topY, width, bottomY - topY);
        }
        
        // Draw feminine voice range band (pink)
        if (this.feminineVoiceMaxHz > this.pitchMinHz && this.feminineVoiceMinHz < this.pitchMaxHz) {
            const topY = hzToY(Math.min(this.feminineVoiceMaxHz, this.pitchMaxHz));
            const bottomY = hzToY(Math.max(this.feminineVoiceMinHz, this.pitchMinHz));
            this.ctx.fillStyle = this.feminineVoiceColor;
            this.ctx.fillRect(0, topY, width, bottomY - topY);
        }

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

    drawSparkGlow(x, y, baseColor) {
        // Extract RGB values from the baseColor
        // Note: expects rgba(r,g,b,a) or rgb(r,g,b) format
        const match = baseColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return;
        
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        
        // Create radial gradient for the glow effect
        const glowRadius = 12;
        const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
        
        // Bright center (almost opaque)
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.9)`);
        // Medium glow
        gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.6)`);
        // Soft outer glow
        gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.3)`);
        // Fade to transparent
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        
        // Draw the glow
        this.ctx.save();
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Add a bright white core for extra sparkle
        const coreGradient = this.ctx.createRadialGradient(x, y, 0, x, y, 4);
        coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        coreGradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.8)`);
        coreGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        
        this.ctx.fillStyle = coreGradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    }

    render() {
        this.paintFrame();
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

    renderPitchTrace() {
        if (!this.ensureContext()) return;
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
        let lastX = null;
        let lastY = null;
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
            
            lastX = x;
            lastY = y;
        }

        if (pathOpen) {
            this.ctx.stroke();
            
            // Draw glow effect at the tip (spark-like) only if we have valid coordinates
            if (lastX !== null && lastY !== null) {
                this.drawSparkGlow(lastX, lastY, this.pitchColor);
            }
        }

        if (this.showSecondaryPitch && this.secondaryPitchHistory.length) {
            this.ctx.strokeStyle = this.secondaryPitchColor;
            this.ctx.lineWidth = 1.2;

            pathOpen = false;
            let lastSecondaryX = null;
            let lastSecondaryY = null;
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
                
                lastSecondaryX = x;
                lastSecondaryY = y;
            }

            if (pathOpen) {
                this.ctx.stroke();
                
                // Draw glow effect at the tip (spark-like) only if we have valid coordinates
                if (lastSecondaryX !== null && lastSecondaryY !== null) {
                    this.drawSparkGlow(lastSecondaryX, lastSecondaryY, this.secondaryPitchColor);
                }
            }
        }
    }
}
