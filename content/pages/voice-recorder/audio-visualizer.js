/**
 * Audio Visualizer - Real-time canvas rendering for waveforms and pitch traces
 * 
 * @class AudioVisualizer
 * 
 * Features:
 * - Scrolling pitch trace visualization (2px per sample)
 * - Voice range bands (masculine 85-155 Hz, feminine 165-255 Hz)
 * - Pitch stabilization pipeline (harmonic correction, gap hold, smoothing)
 * - Signal quality tracking (idle, quiet, weak, lost, tracking)
 * - Canvas context recovery handling
 * 
 * Rendering Flow:
 * - AnalyserNode → getFloatTimeDomainData() → pitch detection → canvas drawing
 */
class AudioVisualizer {
    constructor(canvas, analyserNode) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.analyserNode = null;
        this.floatData = null;

        // === Visual Style Configuration ===
        this.backgroundColor = 'rgba(255, 255, 255, 1)';
        this.borderColor = 'rgba(255, 107, 157, 0.65)';
        this.borderWidth = 0;
        
        // === Voice Range Bands (typical fundamental frequencies) ===
        this.masculineVoiceMinHz = 85;
        this.masculineVoiceMaxHz = 155;
        this.feminineVoiceMinHz = 165;
        this.feminineVoiceMaxHz = 255;
        this.masculineVoiceColor = 'rgba(116, 192, 252, 0.15)';
        this.feminineVoiceColor = 'rgba(255, 107, 157, 0.15)';

        // === Pitch Visualization Settings ===
        this.pitchHistory = [];
        this.secondaryPitchHistory = [];
        this.pitchMaxSamples = 200;
        this.pitchMinHz = 70;
        this.pitchMaxHz = 280;
        this.pitchColor = 'rgba(116, 192, 252, 0.9)';
        this.secondaryPitchColor = 'rgba(255, 180, 100, 0.7)';
        this.sparkColor = 'rgba(255, 88, 66, 0.95)';
        this.secondarySparkColor = 'rgba(255, 120, 84, 0.92)';
        this.pitchSmoothing = 0.35;
        this.showSecondaryPitch = false;

        // === Pitch Stabilization Parameters ===
        this.glowRadius = 12;
        this.lastPrimaryGlowY = null;
        this.lastSecondaryGlowY = null;
        this.pitchGapHoldSamples = 3;              // Hold pitch for N frames during gaps
        this.consecutivePitchMisses = 0;
        this.reacquireLowPitchWindowHz = 18;       // Post-silence reacquisition window
        this.reacquireMinStableSamples = 2;        // Samples needed for stable reacquisition
        this.pendingReacquirePitch = null;
        this.pendingReacquireCount = 0;

        // === Signal Quality Tracking ===
        this.latestSignalRms = 0;
        this.latestTrackingStatus = {
            state: 'idle',
            label: 'Signal: idle',
            rms: 0,
            strength: 0,
            sample: null
        };
        
        // Scrolling visualization settings
        this.currentX = 0; // Current X position where next sample will be drawn
        this.pixelsPerSample = 2; // Width in pixels for each sample
        this.scrollBufferPx = 24; // Start scrolling this many pixels before the right edge
        
        // Cached offscreen canvas for efficient scrolling (avoids allocation/GC on every frame)
        this.offscreenCanvas = null;
        this.offscreenCtx = null;

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
        this.pitchDetectorFn = typeof detectPitch === 'function' ? detectPitch : null;

        this.onContextRecovery = null;
        this.pendingContextRecoveryReset = false;
        this.discardNextAcquiredSample = false;

        // Handle canvas context loss (can occur when switching tabs, especially on mobile)
        this.canvas.addEventListener('contextlost', (event) => {
            event.preventDefault();
            this.pendingContextRecoveryReset = true;
            this.discardNextAcquiredSample = true;
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
        // Redraw the background; recovery flow now resets recording/session state
        this.paintFrame();

        // If context was restored while idle, there is no live sample to discard.
        // Trigger recovery handling immediately so the app can reset playback/UI state.
        if (this.pendingContextRecoveryReset && !this.analyserNode && this.onContextRecovery) {
            this.pendingContextRecoveryReset = false;
            this.discardNextAcquiredSample = false;
            this.onContextRecovery({ whileIdle: true });
        }
    }

    setContextRecoveryHandler(handler) {
        this.onContextRecovery = typeof handler === 'function' ? handler : null;
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

    // Coordinate conversion utilities
    hzToY(hz) {
        // Convert frequency (Hz) to Y coordinate on canvas
        const height = this.canvas.height;
        const padding = 6;
        const usableHeight = height - padding * 2;
        const range = this.pitchMaxHz - this.pitchMinHz || 1;
        const ratio = (hz - this.pitchMinHz) / range;
        const clamped = Math.min(1, Math.max(0, ratio));
        return padding + (1 - clamped) * usableHeight;
    }

    sampleIndexToX(index, latestIndex) {
        // Convert a historical sample index to its X coordinate on the canvas,
        // relative to currentX (the position where the most recent sample was drawn).
        return this.currentX - (latestIndex - index) * this.pixelsPerSample;
    }

    ensureOffscreenCanvas(width, height) {
        // Create or resize the cached offscreen canvas to match the main canvas dimensions
        // This is called during scrolling to avoid allocating a new canvas every frame
        if (!this.offscreenCanvas || this.offscreenCanvas.width !== width || this.offscreenCanvas.height !== height) {
            // Use OffscreenCanvas if available (better performance in some browsers)
            if (typeof OffscreenCanvas !== 'undefined') {
                this.offscreenCanvas = new OffscreenCanvas(width, height);
            } else {
                this.offscreenCanvas = document.createElement('canvas');
                this.offscreenCanvas.width = width;
                this.offscreenCanvas.height = height;
            }
            this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        }
        return this.offscreenCtx;
    }

    /**
     * Attach or detach a Web Audio API AnalyserNode
     * 
     * @param {AnalyserNode|null} analyserNode - The analyser to attach, or null to detach
     */
    setAnalyser(analyserNode) {
        this.analyserNode = analyserNode;
        if (this.analyserNode) {
            this.floatData = new Float32Array(this.analyserNode.fftSize);
        } else {
            this.floatData = null;
        }
        this.resetPitchHistory();
        this.paintFrame();
    }

    /**
     * Inject a custom pitch detector function
     * 
     * @param {Function} detectorFn - Function with signature (buffer, sampleRate, detectSecondary, options) => pitchData
     */
    setPitchDetector(detectorFn) {
        this.pitchDetectorFn = typeof detectorFn === 'function'
            ? detectorFn
            : (typeof detectPitch === 'function' ? detectPitch : null);
    }

    resetPitchHistory() {
        this.pitchHistory = [];
        this.secondaryPitchHistory = [];
        this.currentX = 0;
        this.lastPrimaryGlowY = null;
        this.lastSecondaryGlowY = null;
        this.consecutivePitchMisses = 0;
        this.pendingReacquirePitch = null;
        this.pendingReacquireCount = 0;
        this.latestSignalRms = 0;
        this.latestTrackingStatus = {
            state: 'idle',
            label: 'Signal: idle',
            rms: 0,
            strength: 0,
            sample: null
        };
        this.pitchStats = {
            min: null,
            max: null,
            sum: 0,
            count: 0,
            samples: [],
            strengths: []
        };
    }

    getRecentPrimaryAverage(sampleCount = 8) {
        let sum = 0;
        let count = 0;

        for (let i = this.pitchHistory.length - 1; i >= 0 && count < sampleCount; i -= 1) {
            const value = this.pitchHistory[i];
            if (value !== null && Number.isFinite(value)) {
                sum += value;
                count += 1;
            }
        }

        return count > 0 ? (sum / count) : null;
    }

    applyHarmonicContinuityCorrection(value, strength) {
        if (!Number.isFinite(value)) return value;

        const recentAvg = this.getRecentPrimaryAverage(10);
        if (!Number.isFinite(recentAvg) || recentAvg <= 0) {
            return value;
        }

        // Correct likely low subharmonic selections (e.g., ~73 Hz instead of ~220 Hz)
        // when they approximately match an integer fraction of the recent contour.
        const ratio = recentAvg / value;
        const nearest = Math.round(ratio);
        if (
            nearest >= 2 &&
            nearest <= 4 &&
            Math.abs(ratio - nearest) <= 0.2 &&
            strength < 0.85
        ) {
            const corrected = value * nearest;
            if (corrected >= this.pitchMinHz && corrected <= this.pitchMaxHz) {
                return corrected;
            }
        }

        // Reject abrupt low-frequency dives that are unlikely to be real pitch changes.
        if (value < recentAvg * 0.62 && strength < 0.75) {
            return null;
        }

        return value;
    }

    applyPostSilenceReacquisitionGuard(value, strength) {
        if (!Number.isFinite(value)) {
            return null;
        }

        const wasDropout = this.consecutivePitchMisses > this.pitchGapHoldSamples;
        if (!wasDropout) {
            this.pendingReacquirePitch = null;
            this.pendingReacquireCount = 0;
            return value;
        }

        const nearFloor = value <= this.pitchMinHz + this.reacquireLowPitchWindowHz;
        const lowConfidence = strength < Math.max(this.pitchDetectionOptions.primaryThreshold + 0.08, 0.28);

        // Only gate suspicious reacquisition samples; clear signals pass through immediately.
        if (!nearFloor && !lowConfidence) {
            this.pendingReacquirePitch = null;
            this.pendingReacquireCount = 0;
            return value;
        }

        if (
            this.pendingReacquirePitch === null ||
            Math.abs(this.pendingReacquirePitch - value) > 12
        ) {
            this.pendingReacquirePitch = value;
            this.pendingReacquireCount = 1;
            return null;
        }

        this.pendingReacquireCount += 1;
        if (this.pendingReacquireCount < this.reacquireMinStableSamples) {
            return null;
        }

        const accepted = this.pendingReacquirePitch;
        this.pendingReacquirePitch = null;
        this.pendingReacquireCount = 0;
        return accepted;
    }

    computeSignalRms(buffer) {
        if (!buffer || !buffer.length) return 0;
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i += 1) {
            const value = buffer[i];
            sumSquares += value * value;
        }
        return Math.sqrt(sumSquares / buffer.length);
    }

    updateTrackingStatus(meta = {}) {
        const hasPrimary = Boolean(meta.hasPrimary);
        const strength = Number.isFinite(meta.primaryStrength) ? meta.primaryStrength : 0;
        const rms = Number.isFinite(meta.rms) ? meta.rms : 0;
        const latestSample = this.pitchHistory.length ? this.pitchHistory[this.pitchHistory.length - 1] : null;

        let state = 'tracking';
        if (!this.analyserNode) {
            state = 'idle';
        } else if (rms < 0.01) {
            state = 'quiet';
        } else if (this.consecutivePitchMisses > this.pitchGapHoldSamples) {
            state = 'lost';
        } else if (!hasPrimary || strength < this.pitchDetectionOptions.primaryThreshold + 0.05) {
            state = 'weak';
        }

        const labelByState = {
            idle: 'Signal: idle',
            quiet: 'Signal: quiet',
            weak: 'Signal: weak tracking',
            lost: 'Signal: lost pitch',
            tracking: 'Signal: tracking'
        };

        this.latestTrackingStatus = {
            state,
            label: labelByState[state] || labelByState.tracking,
            rms,
            strength,
            sample: Number.isFinite(latestSample) ? latestSample : null
        };
    }

    getTrackingStatus() {
        return this.latestTrackingStatus;
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

    /**
     * Get pitch statistics for the current recording
     * 
     * Calculates min, max, average pitch with outlier filtering using IQR method
     * 
     * @returns {Object|null} Statistics {min, max, average, sampleCount, filteredCount} or null if no data
     */
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
            const correctedValue = this.applyHarmonicContinuityCorrection(primaryValue, primaryStrength);
            const clampedValue = correctedValue !== null && Number.isFinite(correctedValue)
                ? Math.min(this.pitchMaxHz, Math.max(this.pitchMinHz, correctedValue))
                : null;
            const guardedValue = clampedValue !== null
                ? this.applyPostSilenceReacquisitionGuard(clampedValue, primaryStrength)
                : null;

            if (guardedValue === null) {
                primaryValue = null;
            } else {
                // Temporal consistency check: reject if too far from recent average
                // This helps filter out octave errors and spurious detections
                let isConsistent = true;
                if (this.pitchStats.samples.length >= 3) {
                    // Calculate recent average from last 10 samples
                    const recentSamples = this.pitchStats.samples.slice(-10);
                    const recentAvg = recentSamples.reduce((a, b) => a + b, 0) / recentSamples.length;
                    const maxJump = recentAvg * 0.3; // Allow 30% deviation
                    
                    // Reject if jump is too large and confidence is not very high
                    if (Math.abs(guardedValue - recentAvg) > maxJump && primaryStrength < 0.7) {
                        isConsistent = false;
                    }
                }
                
                // Only update statistics for consistent, valid samples
                if (isConsistent) {
                    // Store raw sample and strength for outlier filtering later
                    this.pitchStats.samples.push(guardedValue);
                    this.pitchStats.strengths.push(primaryStrength);
                    
                    // Update simple running statistics (kept for backward compatibility)
                    if (this.pitchStats.min === null || guardedValue < this.pitchStats.min) {
                        this.pitchStats.min = guardedValue;
                    }
                    if (this.pitchStats.max === null || guardedValue > this.pitchStats.max) {
                        this.pitchStats.max = guardedValue;
                    }
                    this.pitchStats.sum += guardedValue;
                    this.pitchStats.count += 1;
                }
                
                // Apply smoothing for display (always done, even for inconsistent samples)
                primaryValue = guardedValue;
                if (this.pitchHistory.length) {
                    const previous = this.pitchHistory[this.pitchHistory.length - 1];
                    if (previous !== null) {
                        primaryValue = previous + (primaryValue - previous) * this.pitchSmoothing;
                    }
                }
            }
        } else {
            primaryValue = null;
        }

        if (primaryValue === null) {
            this.consecutivePitchMisses += 1;
            if (this.consecutivePitchMisses <= this.pitchGapHoldSamples && this.pitchHistory.length) {
                const previous = this.pitchHistory[this.pitchHistory.length - 1];
                if (previous !== null && Number.isFinite(previous)) {
                    primaryValue = previous;
                }
            }
        } else {
            this.consecutivePitchMisses = 0;
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
        
        // Draw voice range bands across the full width
        this.drawVoiceRangeBands(0, width);

        if (this.borderWidth > 0) {
            const inset = this.borderWidth / 2;
            this.ctx.lineWidth = this.borderWidth;
            this.ctx.strokeStyle = this.borderColor;
            this.ctx.strokeRect(inset, inset, width - this.borderWidth, height - this.borderWidth);
        }
        this.ctx.restore();
    }

    drawVoiceRangeBands(startX, width) {
        // Helper method to draw voice range bands in a specific region of the canvas
        // This reduces code duplication between paintFrame and scrolling logic
        const height = this.canvas.height;
        const padding = 6;
        const usableHeight = height - padding * 2;
        const range = this.pitchMaxHz - this.pitchMinHz || 1;
        
        // Draw masculine voice range band (blue)
        if (this.masculineVoiceMaxHz > this.pitchMinHz && this.masculineVoiceMinHz < this.pitchMaxHz) {
            const topY = this.hzToY(Math.min(this.masculineVoiceMaxHz, this.pitchMaxHz));
            const bottomY = this.hzToY(Math.max(this.masculineVoiceMinHz, this.pitchMinHz));
            this.ctx.fillStyle = this.masculineVoiceColor;
            this.ctx.fillRect(startX, topY, width, bottomY - topY);
        }
        
        // Draw feminine voice range band (pink)
        if (this.feminineVoiceMaxHz > this.pitchMinHz && this.feminineVoiceMinHz < this.pitchMaxHz) {
            const topY = this.hzToY(Math.min(this.feminineVoiceMaxHz, this.pitchMaxHz));
            const bottomY = this.hzToY(Math.max(this.feminineVoiceMinHz, this.pitchMinHz));
            this.ctx.fillStyle = this.feminineVoiceColor;
            this.ctx.fillRect(startX, topY, width, bottomY - topY);
        }

        // Draw pitch reference grid (static layer)
        if (range > 0) {
            const spacing = this.pitchGridSpacing;
            const firstHz = Math.ceil(this.pitchMinHz / spacing) * spacing;

            this.ctx.strokeStyle = this.pitchGridColor;
            this.ctx.lineWidth = this.pitchGridWidth;

            for (let hz = firstHz; hz <= this.pitchMaxHz; hz += spacing) {
                const y = this.hzToY(hz);
                this.ctx.beginPath();
                this.ctx.moveTo(startX, y);
                this.ctx.lineTo(startX + width, y);
                this.ctx.stroke();
            }
        }

        if (this.borderWidth > 0) {
            const inset = this.borderWidth / 2;
            this.ctx.lineWidth = this.borderWidth;
            this.ctx.strokeStyle = this.borderColor;
            this.ctx.strokeRect(inset, inset, width - this.borderWidth, height - this.borderWidth);
        }
    }

    /**
     * Clear the canvas and reset pitch history
     * Repaints the background, voice range bands, and pitch grid
     */
    clear() {
        this.paintFrame();
        this.resetPitchHistory();
    }

    // Rendering utilities
    drawPitchLine(x1, y1, x2, y2, color, lineWidth) {
        // Draw a line segment for the pitch trace
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }

    drawPitchPoint(x, y, color) {
        // Draw an isolated point for the pitch trace
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 1, 0, 2 * Math.PI);
        this.ctx.fill();
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
        const glowRadius = this.glowRadius;
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

    redrawTraceInRegion(history, color, lineWidth, regionStartX, regionEndX, upToIndex, latestIndex) {
        if (upToIndex < 0 || !history.length) return;

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;

        let prevX = null;
        let prevY = null;

        for (let i = 0; i <= upToIndex; i++) {
            const sample = history[i];
            if (sample === null) {
                prevX = null;
                prevY = null;
                continue;
            }

            const x = this.sampleIndexToX(i, latestIndex);
            const y = this.hzToY(sample);

            if (prevX !== null && prevY !== null) {
                const segMinX = Math.min(prevX, x);
                const segMaxX = Math.max(prevX, x);
                if (segMaxX >= regionStartX && segMinX <= regionEndX) {
                    this.drawPitchLine(prevX, prevY, x, y, color, lineWidth);
                }
            } else if (x >= regionStartX && x <= regionEndX) {
                this.drawPitchPoint(x, y, color);
            }

            prevX = x;
            prevY = y;
        }
    }

    clearPreviousTipGlow(previousTipX, latestIndex) {
        if (latestIndex < 1) return;
        if (this.lastPrimaryGlowY === null && this.lastSecondaryGlowY === null) return;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const clearPadding = 4;
        const regionStartX = Math.max(0, Math.floor(previousTipX - this.glowRadius - clearPadding));
        const regionEndX = Math.min(width, Math.ceil(previousTipX + this.glowRadius + clearPadding));
        const regionWidth = regionEndX - regionStartX;

        if (regionWidth <= 0) return;

        // Restore background/bands in the glow strip, then redraw line segments only.
        this.ctx.save();
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(regionStartX, 0, regionWidth, height);
        this.drawVoiceRangeBands(regionStartX, regionWidth);
        this.ctx.restore();

        const upToIndex = latestIndex - 1;
        this.redrawTraceInRegion(
            this.pitchHistory,
            this.pitchColor,
            1.5,
            regionStartX,
            regionEndX,
            upToIndex,
            latestIndex
        );

        if (this.showSecondaryPitch && this.secondaryPitchHistory.length) {
            this.redrawTraceInRegion(
                this.secondaryPitchHistory,
                this.secondaryPitchColor,
                1.2,
                regionStartX,
                regionEndX,
                upToIndex,
                latestIndex
            );
        }

        this.lastPrimaryGlowY = null;
        this.lastSecondaryGlowY = null;
    }

    // Scrolling logic
    shouldScroll() {
        // Check if we need to scroll (trigger a bit before the right edge)
        const width = this.canvas.width;
        const maxAllowedBuffer = Math.max(0, width - this.pixelsPerSample - 1);
        const bufferPx = Math.min(this.scrollBufferPx, maxAllowedBuffer);
        const scrollTriggerX = Math.max(0, width - this.pixelsPerSample - bufferPx);
        return this.currentX >= scrollTriggerX ? scrollTriggerX : null;
    }

    clearAndRepaintStrip(stripX, stripWidth) {
        // Clear and repaint a vertical strip with background and voice range bands
        const height = this.canvas.height;
        this.ctx.save();
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(stripX, 0, stripWidth, height);
        this.drawVoiceRangeBands(stripX, stripWidth);
        this.ctx.restore();
    }

    performScroll(scrollTriggerX) {
        // Scroll the canvas content left and clear the newly revealed strip
        const width = this.canvas.width;
        const height = this.canvas.height;
        const tempCtx = this.ensureOffscreenCanvas(width, height);
        
        if (tempCtx) {
            // Preferred path: use cached offscreen canvas for efficient scrolling
            tempCtx.drawImage(this.canvas, 0, 0);
            
            // Shift the existing content left by pixelsPerSample
            this.ctx.drawImage(this.offscreenCanvas, -this.pixelsPerSample, 0);
            
            // Clear and repaint only the newly revealed rightmost strip
            this.clearAndRepaintStrip(width - this.pixelsPerSample, this.pixelsPerSample);
        } else {
            // Fallback path: use getImageData/putImageData
            const scrollWidth = Math.max(0, width - this.pixelsPerSample);
            if (scrollWidth > 0) {
                const imageData = this.ctx.getImageData(this.pixelsPerSample, 0, scrollWidth, height);
                this.ctx.putImageData(imageData, 0, 0);
                
                const rightStripX = width - this.pixelsPerSample;
                if (rightStripX >= 0) {
                    this.clearAndRepaintStrip(rightStripX, this.pixelsPerSample);
                }
            } else {
                // If there's nothing to scroll, just repaint the frame
                this.paintFrame();
            }
        }
        
        // Keep drawing near the right side (with buffer) while the canvas scrolls left
        this.currentX = scrollTriggerX;
    }

    /**
     * Main rendering loop - called on every animation frame during recording
     * 
     * Flow:
     * 1. Read audio data from AnalyserNode
     * 2. Calculate signal RMS (loudness)
     * 3. Detect pitch using injected detector function
     * 4. Apply stabilization pipeline
     * 5. Update tracking status
     * 6. Render pitch trace on canvas
     * 
     * The canvas persists between frames (no clearing), creating a scrolling visualization
     */
    render() {
        // Don't call paintFrame() here - we only repaint during scrolling or explicit clear
        // This allows the pitch trace to persist and scroll properly
        if (!this.analyserNode) return;
        if (!this.floatData || this.floatData.length !== this.analyserNode.fftSize) {
            this.floatData = new Float32Array(this.analyserNode.fftSize);
        }

        const detector = this.pitchDetectorFn || (typeof detectPitch === 'function' ? detectPitch : null);
        if (this.floatData && detector) {
            this.analyserNode.getFloatTimeDomainData(this.floatData);
            const rms = this.computeSignalRms(this.floatData);
            this.latestSignalRms = rms;

            if (this.discardNextAcquiredSample) {
                this.discardNextAcquiredSample = false;
                this.pushPitchSample(null);
                this.updateTrackingStatus({ hasPrimary: false, primaryStrength: 0, rms });

                if (this.pendingContextRecoveryReset && this.onContextRecovery) {
                    this.pendingContextRecoveryReset = false;
                    this.onContextRecovery({ whileIdle: false });
                }

                this.renderPitchTrace();
                return;
            }

            const pitchData = detector(
                this.floatData, 
                this.analyserNode.context.sampleRate, 
                this.showSecondaryPitch,
                this.pitchDetectionOptions
            );
            this.pushPitchSample(pitchData);
            const hasPrimary = pitchData && typeof pitchData === 'object'
                ? Number.isFinite(pitchData.primary)
                : Number.isFinite(pitchData);
            const primaryStrength = pitchData && typeof pitchData === 'object'
                ? (pitchData.primaryStrength || 0)
                : (hasPrimary ? 1 : 0);
            this.updateTrackingStatus({ hasPrimary, primaryStrength, rms });
        } else {
            this.pushPitchSample(null);
            this.updateTrackingStatus({ hasPrimary: false, primaryStrength: 0, rms: 0 });
        }

        this.renderPitchTrace();
    }


    // Sample rendering
    drawNewPitchSample(sample, prevSample, latestIndex, color, lineWidth, glowColor) {
        // Draw a new pitch sample and connect it to the previous one if available
        if (sample === null) return null;

        const y = this.hzToY(sample);
        const x = this.currentX;
        
        // If we have a previous sample, draw a line from it to the new one
        if (latestIndex > 0 && prevSample !== null) {
            const prevY = this.hzToY(prevSample);
            const prevX = x - this.pixelsPerSample;
            this.drawPitchLine(prevX, prevY, x, y, color, lineWidth);
        } else {
            // No previous sample or first sample, just draw a point
            this.drawPitchPoint(x, y, color);
        }
        
        // Draw glow effect at the tip of the pitch trace
        this.drawSparkGlow(x, y, glowColor);
        return y; // Return Y position for glow tracking
    }

    renderPitchTrace() {
        if (!this.ensureContext()) return;
        if (!this.pitchHistory.length) return;
        
        // Check if we need to scroll and perform scrolling if necessary
        const scrollTriggerX = this.shouldScroll();
        if (scrollTriggerX !== null) {
            this.performScroll(scrollTriggerX);
        }
        
        // Get the most recent samples
        const latestIndex = this.pitchHistory.length - 1;
        const primarySample = this.pitchHistory[latestIndex];
        const secondarySample = this.secondaryPitchHistory[latestIndex];
        const prevPrimarySample = latestIndex > 0 ? this.pitchHistory[latestIndex - 1] : null;
        const prevSecondarySample = latestIndex > 0 ? this.secondaryPitchHistory[latestIndex - 1] : null;

        // Keep only the newest tip glow: clear the previous glow strip and redraw
        // only the line segments in that region
        const previousTipX = this.currentX - this.pixelsPerSample;
        this.clearPreviousTipGlow(previousTipX, latestIndex);
        
        // Draw the new primary pitch sample
        this.lastPrimaryGlowY = this.drawNewPitchSample(
            primarySample,
            prevPrimarySample,
            latestIndex,
            this.pitchColor,
            1.5,
            this.sparkColor
        );
        
        // Draw the new secondary pitch sample if enabled
        if (this.showSecondaryPitch) {
            this.lastSecondaryGlowY = this.drawNewPitchSample(
                secondarySample,
                prevSecondarySample,
                latestIndex,
                this.secondaryPitchColor,
                1.2,
                this.secondarySparkColor
            );
        } else {
            this.lastSecondaryGlowY = null;
        }
        
        // Advance the X position for the next sample
        this.currentX += this.pixelsPerSample;
    }
}
