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
        
        // Scrolling visualization settings
        this.currentX = 0; // Current X position where next sample will be drawn
        this.pixelsPerSample = 2; // Width in pixels for each sample

        // Pitch statistics tracking
        this.pitchStats = {
            min: null,
            max: null,
            sum: 0,
            count: 0
        };

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
        // Redraw the background and reconstruct the visible pitch trace from history
        this.paintFrame();
        this.reconstructPitchTrace();
    }

    reconstructPitchTrace() {
        // Reconstruct the pitch trace from stored history after a context loss or clear
        // This draws all samples currently in history, positioning them based on currentX
        if (!this.ensureContext()) return;
        if (!this.pitchHistory.length) return;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const padding = 6;
        const usableHeight = height - padding * 2;
        const range = this.pitchMaxHz - this.pitchMinHz || 1;

        // Calculate the starting X position based on current state
        const samplesInHistory = this.pitchHistory.length;
        const totalWidth = samplesInHistory * this.pixelsPerSample;
        
        // If the trace fits within the canvas, start from the left
        // Otherwise, start from a position that aligns with currentX
        let startX = 0;
        if (totalWidth > width) {
            // Calculate offset so the newest sample aligns with currentX
            startX = this.currentX - (samplesInHistory - 1) * this.pixelsPerSample;
        }

        // Draw primary pitch trace
        this.ctx.strokeStyle = this.pitchColor;
        this.ctx.lineWidth = 1.5;
        let pathOpen = false;
        let lastX = null;
        let lastY = null;

        for (let i = 0; i < this.pitchHistory.length; i++) {
            const sample = this.pitchHistory[i];
            const x = startX + i * this.pixelsPerSample;

            // Skip samples that are off the left edge of the canvas
            if (x < -this.pixelsPerSample) continue;
            // Stop drawing if we're past the right edge
            if (x > width) break;

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
            // Draw glow effect at the tip if we have valid coordinates
            if (lastX !== null && lastY !== null) {
                this.drawSparkGlow(lastX, lastY, this.pitchColor);
            }
        }

        // Draw secondary pitch trace if enabled
        if (this.showSecondaryPitch && this.secondaryPitchHistory.length) {
            this.ctx.strokeStyle = this.secondaryPitchColor;
            this.ctx.lineWidth = 1.2;
            pathOpen = false;
            let lastSecondaryX = null;
            let lastSecondaryY = null;

            for (let i = 0; i < this.secondaryPitchHistory.length; i++) {
                const sample = this.secondaryPitchHistory[i];
                const x = startX + i * this.pixelsPerSample;

                if (x < -this.pixelsPerSample) continue;
                if (x > width) break;

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
                if (lastSecondaryX !== null && lastSecondaryY !== null) {
                    this.drawSparkGlow(lastSecondaryX, lastSecondaryY, this.secondaryPitchColor);
                }
            }
        }
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
        this.currentX = 0;
        this.pitchStats = {
            min: null,
            max: null,
            sum: 0,
            count: 0
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
        return {
            min: this.pitchStats.min,
            max: this.pitchStats.max,
            average: this.pitchStats.sum / this.pitchStats.count
        };
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
            const clampedValue = Math.min(this.pitchMaxHz, Math.max(this.pitchMinHz, primaryValue));
            
            // Update pitch statistics with the raw (clamped but not smoothed) value
            if (this.pitchStats.min === null || clampedValue < this.pitchStats.min) {
                this.pitchStats.min = clampedValue;
            }
            if (this.pitchStats.max === null || clampedValue > this.pitchStats.max) {
                this.pitchStats.max = clampedValue;
            }
            this.pitchStats.sum += clampedValue;
            this.pitchStats.count += 1;
            
            // Apply smoothing for display
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
        // Don't call paintFrame() here - we only repaint during scrolling or explicit clear
        // This allows the pitch trace to persist and scroll properly
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
        const range = this.pitchMaxHz - this.pitchMinHz || 1;
        
        // Check if we need to scroll (currentX has reached the right edge)
        if (this.currentX >= width) {
            // Use drawImage to efficiently copy and shift the canvas content
            // First, save the current canvas state to a temporary canvas
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            
            if (tempCtx) {
                // Preferred path: use an offscreen canvas for efficient scrolling
                tempCtx.drawImage(this.canvas, 0, 0);
                
                // Shift the existing content left by pixelsPerSample without
                // clearing the entire canvas, so the trace is preserved
                this.ctx.drawImage(tempCanvas, -this.pixelsPerSample, 0);
                
                // Clear and repaint only the newly revealed rightmost strip with
                // the background and voice range bands
                this.ctx.save();
                this.ctx.fillStyle = this.backgroundColor;
                this.ctx.fillRect(width - this.pixelsPerSample, 0, this.pixelsPerSample, height);
                
                // Redraw voice range bands in the cleared strip
                const padding = 6;
                const usableHeight = height - padding * 2;
                const hzRange = this.pitchMaxHz - this.pitchMinHz || 1;
                
                const hzToY = (hz) => {
                    const ratio = (hz - this.pitchMinHz) / hzRange;
                    const clamped = Math.min(1, Math.max(0, ratio));
                    return padding + (1 - clamped) * usableHeight;
                };
                
                // Draw masculine voice range band (blue) in the strip
                if (this.masculineVoiceMaxHz > this.pitchMinHz && this.masculineVoiceMinHz < this.pitchMaxHz) {
                    const topY = hzToY(Math.min(this.masculineVoiceMaxHz, this.pitchMaxHz));
                    const bottomY = hzToY(Math.max(this.masculineVoiceMinHz, this.pitchMinHz));
                    this.ctx.fillStyle = this.masculineVoiceColor;
                    this.ctx.fillRect(width - this.pixelsPerSample, topY, this.pixelsPerSample, bottomY - topY);
                }
                
                // Draw feminine voice range band (pink) in the strip
                if (this.feminineVoiceMaxHz > this.pitchMinHz && this.feminineVoiceMinHz < this.pitchMaxHz) {
                    const topY = hzToY(Math.min(this.feminineVoiceMaxHz, this.pitchMaxHz));
                    const bottomY = hzToY(Math.max(this.feminineVoiceMinHz, this.pitchMinHz));
                    this.ctx.fillStyle = this.feminineVoiceColor;
                    this.ctx.fillRect(width - this.pixelsPerSample, topY, this.pixelsPerSample, bottomY - topY);
                }
                
                this.ctx.restore();
            } else {
                // Fallback path: use getImageData/putImageData if temp context creation fails
                const scrollWidth = Math.max(0, width - this.pixelsPerSample);
                if (scrollWidth > 0) {
                    const imageData = this.ctx.getImageData(this.pixelsPerSample, 0, scrollWidth, height);
                    
                    // Redraw the background for the entire canvas
                    this.paintFrame();
                    
                    // Draw the saved content shifted left by pixelsPerSample
                    this.ctx.putImageData(imageData, 0, 0);
                } else {
                    // If there's nothing to scroll, just repaint the frame
                    this.paintFrame();
                }
            }
            
            // Reset currentX to continue drawing at the right edge
            this.currentX = width - this.pixelsPerSample;
        }
        
        // Get the most recent sample (the one we just added)
        const latestIndex = this.pitchHistory.length - 1;
        const primarySample = this.pitchHistory[latestIndex];
        const secondarySample = this.secondaryPitchHistory[latestIndex];
        
        // Draw the new primary pitch sample
        if (primarySample !== null) {
            const ratio = (primarySample - this.pitchMinHz) / range;
            const clamped = Math.min(1, Math.max(0, ratio));
            const y = padding + (1 - clamped) * usableHeight;
            
            this.ctx.strokeStyle = this.pitchColor;
            this.ctx.lineWidth = 1.5;
            
            // If we have a previous sample, draw a line from it to the new one
            if (latestIndex > 0) {
                const prevSample = this.pitchHistory[latestIndex - 1];
                if (prevSample !== null) {
                    const prevRatio = (prevSample - this.pitchMinHz) / range;
                    const prevClamped = Math.min(1, Math.max(0, prevRatio));
                    const prevY = padding + (1 - prevClamped) * usableHeight;
                    const prevX = this.currentX - this.pixelsPerSample;
                    
                    this.ctx.beginPath();
                    this.ctx.moveTo(prevX, prevY);
                    this.ctx.lineTo(this.currentX, y);
                    this.ctx.stroke();
                } else {
                    // Previous sample was null, just draw a point
                    this.ctx.fillStyle = this.pitchColor;
                    this.ctx.beginPath();
                    this.ctx.arc(this.currentX, y, 1, 0, 2 * Math.PI);
                    this.ctx.fill();
                }
            } else {
                // First sample, just draw a point
                this.ctx.fillStyle = this.pitchColor;
                this.ctx.beginPath();
                this.ctx.arc(this.currentX, y, 1, 0, 2 * Math.PI);
                this.ctx.fill();
            }
            
            // Draw glow effect at the tip of the pitch trace
            this.drawSparkGlow(this.currentX, y, this.pitchColor);
        }
        
        // Draw the new secondary pitch sample
        if (this.showSecondaryPitch && secondarySample !== null) {
            const ratio = (secondarySample - this.pitchMinHz) / range;
            const clamped = Math.min(1, Math.max(0, ratio));
            const y = padding + (1 - clamped) * usableHeight;
            
            this.ctx.strokeStyle = this.secondaryPitchColor;
            this.ctx.lineWidth = 1.2;
            
            // If we have a previous sample, draw a line from it to the new one
            if (latestIndex > 0) {
                const prevSample = this.secondaryPitchHistory[latestIndex - 1];
                if (prevSample !== null) {
                    const prevRatio = (prevSample - this.pitchMinHz) / range;
                    const prevClamped = Math.min(1, Math.max(0, prevRatio));
                    const prevY = padding + (1 - prevClamped) * usableHeight;
                    const prevX = this.currentX - this.pixelsPerSample;
                    
                    this.ctx.beginPath();
                    this.ctx.moveTo(prevX, prevY);
                    this.ctx.lineTo(this.currentX, y);
                    this.ctx.stroke();
                } else {
                    // Previous sample was null, just draw a point
                    this.ctx.fillStyle = this.secondaryPitchColor;
                    this.ctx.beginPath();
                    this.ctx.arc(this.currentX, y, 1, 0, 2 * Math.PI);
                    this.ctx.fill();
                }
            } else {
                // First sample, just draw a point
                this.ctx.fillStyle = this.secondaryPitchColor;
                this.ctx.beginPath();
                this.ctx.arc(this.currentX, y, 1, 0, 2 * Math.PI);
                this.ctx.fill();
            }
            
            // Draw glow effect at the tip of the secondary pitch trace
            this.drawSparkGlow(this.currentX, y, this.secondaryPitchColor);
        }
        
        // Advance the X position for the next sample
        this.currentX += this.pixelsPerSample;
    }
}
