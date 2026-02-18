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

        // Pitch statistics tracking
        this.pitchStats = {
            min: null,
            max: null,
            sum: 0,
            count: 0,
            // Store all samples for outlier filtering
            samples: [],
            // Store correlation strengths for weighted averaging
            strengths: []
        };

        this.pitchGridSpacing = 50;
        // Subtle gray grid (works on white background introduced in main)
        this.pitchGridColor = 'rgba(0,0,0,0.08)';
        this.pitchGridWidth = 1;

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
        this.pitchStats = {
            min: null,
            max: null,
            sum: 0,
            count: 0,
            samples: [],
            strengths: []
        };
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

    getPitchStatistics() {
        if (this.pitchStats.count === 0) {
            return null;
        }
        
        // If we have very few samples, just return basic statistics
        if (this.pitchStats.samples.length < 10) {
            return {
                min: this.pitchStats.min,
                max: this.pitchStats.max,
                average: this.pitchStats.sum / this.pitchStats.count,
                sampleCount: this.pitchStats.count,
                filteredCount: this.pitchStats.count
            };
        }
        
        // Sort samples for outlier detection
        const sortedSamples = [...this.pitchStats.samples].sort((a, b) => a - b);
        const n = sortedSamples.length;
        
        // Calculate quartiles for IQR method
        const q1Index = Math.floor(n * 0.25);
        const q3Index = Math.floor(n * 0.75);
        const q1 = sortedSamples[q1Index];
        const q3 = sortedSamples[q3Index];
        const iqr = q3 - q1;
        
        // Handle case where IQR is 0 (very stable/quantized signal)
        // Skip IQR filtering but still compute confidence-weighted average
        if (iqr === 0) {
            let weightedSum = 0;
            let totalWeight = 0;
            for (let i = 0; i < this.pitchStats.samples.length; i++) {
                const sample = this.pitchStats.samples[i];
                const strength = this.pitchStats.strengths[i] || 1.0;
                weightedSum += sample * strength;
                totalWeight += strength;
            }
            return {
                min: this.pitchStats.min,
                max: this.pitchStats.max,
                average: weightedSum / totalWeight,
                sampleCount: this.pitchStats.count,
                filteredCount: this.pitchStats.count
            };
        }
        
        // Define outlier bounds (using 1.5 * IQR, standard method)
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        
        // Filter samples and calculate statistics without outliers
        let filteredMin = null;
        let filteredMax = null;
        let weightedSum = 0;
        let totalWeight = 0;
        let filteredCount = 0;
        
        for (let i = 0; i < this.pitchStats.samples.length; i++) {
            const sample = this.pitchStats.samples[i];
            const strength = this.pitchStats.strengths[i] || 1.0;
            
            // Include sample if it's within the IQR bounds
            if (sample >= lowerBound && sample <= upperBound) {
                if (filteredMin === null || sample < filteredMin) {
                    filteredMin = sample;
                }
                if (filteredMax === null || sample > filteredMax) {
                    filteredMax = sample;
                }
                // Use correlation strength as weight for averaging
                weightedSum += sample * strength;
                totalWeight += strength;
                filteredCount++;
            }
        }
        
        // Fall back to unfiltered stats if filtering removed too many samples
        // Use >50% threshold as documented (but minimum of 5 samples for statistical validity)
        const removalPercentage = (this.pitchStats.count - filteredCount) / this.pitchStats.count;
        if (filteredCount < 5 || removalPercentage > 0.5) {
            return {
                min: this.pitchStats.min,
                max: this.pitchStats.max,
                average: this.pitchStats.sum / this.pitchStats.count,
                sampleCount: this.pitchStats.count,
                filteredCount: this.pitchStats.count
            };
        }
        
        return {
            min: filteredMin,
            max: filteredMax,
            average: weightedSum / totalWeight,
            sampleCount: this.pitchStats.count,
            filteredCount: filteredCount
        };
    }

    pushPitchSample(pitchData) {
        let primaryValue = null;
        let secondaryValue = null;
        let primaryStrength = 1.0;

        if (pitchData !== null) {
            if (typeof pitchData === 'number') {
                primaryValue = pitchData;
            } else if (typeof pitchData === 'object') {
                primaryValue = pitchData.primary;
                secondaryValue = pitchData.secondary;
                primaryStrength = pitchData.primaryStrength || 1.0;
            }
        }

        if (primaryValue !== null && Number.isFinite(primaryValue)) {
            const clampedValue = Math.min(this.pitchMaxHz, Math.max(this.pitchMinHz, primaryValue));
            
            // Temporal consistency check: reject if too far from recent average
            // This helps filter out octave errors and spurious detections
            let isConsistent = true;
            if (this.pitchStats.samples.length >= 3) {
                // Calculate recent average from last 10 samples
                const recentSamples = this.pitchStats.samples.slice(-10);
                const recentAvg = recentSamples.reduce((a, b) => a + b, 0) / recentSamples.length;
                const maxJump = recentAvg * 0.3; // Allow 30% deviation
                
                // Reject if jump is too large and confidence is not very high
                if (Math.abs(clampedValue - recentAvg) > maxJump && primaryStrength < 0.7) {
                    isConsistent = false;
                }
            }
            
            // Only update statistics for consistent, valid samples
            if (isConsistent) {
                // Store raw sample and strength for outlier filtering later
                this.pitchStats.samples.push(clampedValue);
                this.pitchStats.strengths.push(primaryStrength);
                
                // Update simple running statistics (kept for backward compatibility)
                if (this.pitchStats.min === null || clampedValue < this.pitchStats.min) {
                    this.pitchStats.min = clampedValue;
                }
                if (this.pitchStats.max === null || clampedValue > this.pitchStats.max) {
                    this.pitchStats.max = clampedValue;
                }
                this.pitchStats.sum += clampedValue;
                this.pitchStats.count += 1;
            }
            
            // Apply smoothing for display (always done, even for inconsistent samples)
            primaryValue = clampedValue;
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

        // Draw pitch reference grid (static layer)
        if (range > 0) {
            const spacing = this.pitchGridSpacing;
            const firstHz = Math.ceil(this.pitchMinHz / spacing) * spacing;

            this.ctx.strokeStyle = this.pitchGridColor;
            this.ctx.lineWidth = this.pitchGridWidth;

            for (let hz = firstHz; hz <= this.pitchMaxHz; hz += spacing) {
                const y = hzToY(hz);
                this.ctx.beginPath();
                this.ctx.moveTo(0, y);
                this.ctx.lineTo(width, y);
                this.ctx.stroke();
            }
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
