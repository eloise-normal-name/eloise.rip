/**
 * HearingAgeGuesser sweeps a sine tone upward until the listener reports it is gone,
 * then approximates a hearing age from the last audible frequency. Built to mirror
 * the voice recorder's in-page initialization pattern.
 */
class HearingAgeGuesser {
    constructor() {
        // Sweep configuration
        this.startFrequency = 440;
        this.maxFrequency = 18000;
        this.stepHz = 250;
        this.tickMs = 450;
        this.outputGain = 0.08;

        // State
        this.audioContext = null;
        this.oscillator = null;
        this.gainNode = null;
        this.sweepTimer = null;
        this.lastSweepTimestamp = null;
        this.currentFrequency = this.startFrequency;
        this.lastAudibleFrequency = null;
        this.isRunning = false;
        this.hasResult = false;
        this.needsResetBeforeStart = false;
        this.isSharing = false;

        this.bindEvents();
        this.updateReadout();
        this.updateShareButtonState();
    }


    getElement(id) {
        return document.getElementById(id);
    }

    bindEvents() {
        this.getElement('startSweep').addEventListener('click', async () => {
            if (this.isRunning) {
                this.finishWithGuess();
                return;
            }
            if (this.needsResetBeforeStart) {
                this.reset();
            }
            await this.startSweep();
        });
        this.getElement('shareResult').addEventListener('click', async () => {
            await this.shareResult();
        });
        // Allow changing waveform type while playing
        const waveSelect = this.getElement('waveType');
        if (waveSelect) {
            waveSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (this.oscillator) {
                    try {
                        this.oscillator.type = val;
                    } catch (err) {
                        // some browsers may restrict changing type mid-playback; ignore safely
                    }
                }
            });
        }
    }

    updateReadout() {
        const progress = (this.currentFrequency - this.startFrequency) / (this.maxFrequency - this.startFrequency);
        const normalized = Math.max(0, Math.min(1, progress));
        this.getElement('gaugeNeedle').style.transform = `rotate(${(normalized * 180) - 90}deg)`;

        if (this.isRunning) {
            const randomAge = Math.floor(Math.random() * (70 - 18 + 1)) + 18;
            this.getElement('ageGuess').textContent = `${randomAge} yrs`;
        }
    }

    updateShareButtonState() {
        const shareButton = this.getElement('shareResult');
        if (!shareButton) {
            return;
        }
        const canShareResult = this.hasResult && !this.isRunning && !this.isSharing;
        shareButton.disabled = !canShareResult;
    }

    ensureAudioContext() {
        if (this.audioContext) {
            return;
        }
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            this.getElement('ageGuess').textContent = 'N/A';
            this.getElement('startSweep').disabled = true;
            return;
        }
        this.audioContext = new AudioContextClass();
    }

    async startSweep() {
        this.ensureAudioContext();
        if (!this.audioContext) {
            return;
        }

        if (this.hasResult) {
            this.currentFrequency = this.startFrequency;
            this.lastAudibleFrequency = null;
            this.hasResult = false;
        }

        if (this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
            } catch (err) {
                this.getElement('ageGuess').textContent = 'N/A';
                return;
            }
        }

        if (this.audioContext.state !== 'running') {
            this.getElement('ageGuess').textContent = 'N/A';
            return;
        }

        this.stopTone();
        this.isRunning = true;
        this.hasResult = false;
        this.needsResetBeforeStart = false;
        this.updateShareButtonState();
        this.getElement('startSweep').textContent = 'Stop';
        this.getElement('startSweep').classList.remove('tone-btn--primary');
        this.getElement('startSweep').classList.add('tone-btn--alert');

        this.oscillator = this.audioContext.createOscillator();
        this.oscillator.type = this.getElement('waveType').value || 'sine';
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        this.gainNode.gain.linearRampToValueAtTime(this.outputGain, this.audioContext.currentTime + 0.06);
        this.oscillator.frequency.value = this.currentFrequency;

        // Keep node connections explicit for Safari compatibility.
        // Some engines do not return the destination node from connect(),
        // which breaks chained calls and leaves the oscillator silent.
        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
        this.oscillator.start();

        this.lastAudibleFrequency = this.currentFrequency;
        this.updateReadout();

        this.lastSweepTimestamp = null;
        this.sweepTimer = window.requestAnimationFrame((timestamp) => this.advanceFrequency(timestamp));
    }

    stopSweep() {
        this.stopTone();
        this.isRunning = false;
        this.needsResetBeforeStart = true;
        this.updateShareButtonState();
        this.getElement('startSweep').textContent = 'Start';
        this.getElement('startSweep').classList.remove('tone-btn--alert');
        this.getElement('startSweep').classList.add('tone-btn--primary');
    }

    stopTone() {
        if (this.sweepTimer) {
            window.cancelAnimationFrame(this.sweepTimer);
            this.sweepTimer = null;
        }
        this.lastSweepTimestamp = null;
        if (this.oscillator) {
            try {
                this.oscillator.stop();
            } catch (err) {
                /* oscillator may already be stopped */
            }
            this.oscillator.disconnect();
            this.oscillator = null;
        }
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }
    }

    advanceFrequency(timestamp) {
        if (!this.isRunning || !this.oscillator) {
            return;
        }

        if (this.lastSweepTimestamp == null) {
            this.lastSweepTimestamp = timestamp;
            this.sweepTimer = window.requestAnimationFrame((nextTimestamp) => this.advanceFrequency(nextTimestamp));
            return;
        }

        const deltaSeconds = Math.max(0, (timestamp - this.lastSweepTimestamp) / 1000);
        this.lastSweepTimestamp = timestamp;

        if (this.currentFrequency >= this.maxFrequency) {
            this.finishWithGuess(true);
            return;
        }

        this.lastAudibleFrequency = this.currentFrequency;
        const rateHzPerSecond = this.getStepHz(this.currentFrequency) / (this.tickMs / 1000);
        const nextFrequency = Math.min(this.maxFrequency, this.currentFrequency + (rateHzPerSecond * deltaSeconds));
        this.currentFrequency = nextFrequency;

        this.oscillator.frequency.setValueAtTime(nextFrequency, this.audioContext.currentTime);
        this.updateReadout();
        this.sweepTimer = window.requestAnimationFrame((nextTimestamp) => this.advanceFrequency(nextTimestamp));
    }

    getStepHz(freq) {
        if (freq >= 17000) {
            return 50;
        }
        if (freq >= 14000) {
            return 125;
        }
        return this.stepHz;
    }

    finishWithGuess(hitCeiling = false) {
        this.stopTone();
        this.isRunning = false;
        this.hasResult = true;
        this.needsResetBeforeStart = true;

        const guessedFrequency = hitCeiling
            ? this.currentFrequency
            : (this.lastAudibleFrequency || this.currentFrequency);

        const estimatedAge = this.estimateAgeFromFrequency(guessedFrequency);
        this.getElement('ageGuess').textContent = `${estimatedAge} yrs`;

        this.getElement('startSweep').textContent = 'Start';
        this.getElement('startSweep').classList.remove('tone-btn--alert');
        this.getElement('startSweep').classList.add('tone-btn--primary');
        this.updateShareButtonState();
        this.updateReadout();
    }

    reset() {
        this.stopTone();
        this.isRunning = false;
        this.hasResult = false;
        this.needsResetBeforeStart = false;
        this.currentFrequency = this.startFrequency;
        this.lastAudibleFrequency = null;
        this.getElement('startSweep').textContent = 'Start';
        this.getElement('startSweep').classList.remove('tone-btn--alert');
        this.getElement('startSweep').classList.add('tone-btn--primary');
        this.getElement('ageGuess').textContent = '—';
        this.updateShareButtonState();
        this.updateReadout();
    }

    renderShareImage() {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 820;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }

        const progress = (this.currentFrequency - this.startFrequency) / (this.maxFrequency - this.startFrequency);
        const normalized = Math.max(0, Math.min(1, progress));
        // Match the on-page gauge sweep: left (0) -> top (mid) -> right (max).
        const angle = Math.PI - (Math.PI * normalized);
        const ageText = this.getElement('ageGuess').textContent || '—';

        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#f7fbff');
        gradient.addColorStop(1, '#eaf4ff');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = 'rgba(205, 222, 238, 1)';
        ctx.lineWidth = 3;
        this.roundRect(ctx, 0, 0, canvas.width, canvas.height, 0);
        ctx.fill();
        ctx.stroke();

        const centerX = canvas.width / 2;
        const centerY = 520;
        const radius = 250;

        // Recreate the gauge card background so the shared image matches the page.
        const cardX = centerX - 300;
        const cardY = 300;
        const cardW = 600;
        const cardH = 300;
        const cardRadius = 24;
        const cardGradient = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
        cardGradient.addColorStop(0, 'rgba(225, 240, 255, 0.65)');
        cardGradient.addColorStop(1, 'rgba(200, 225, 245, 0.28)');
        this.roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
        ctx.fillStyle = cardGradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(210, 230, 245, 0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();

        const cardHighlight = ctx.createRadialGradient(
            centerX,
            cardY + 20,
            20,
            centerX,
            cardY + 20,
            260
        );
        cardHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        cardHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        this.roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
        ctx.fillStyle = cardHighlight;
        ctx.fill();

        // Dial fill mirrors the dark metallic look from the live gauge.
        const dialGradient = ctx.createLinearGradient(centerX - radius, 0, centerX + radius, 0);
        dialGradient.addColorStop(0, '#374151');
        dialGradient.addColorStop(1, '#1f2937');
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, Math.PI, 0, false);
        ctx.lineTo(centerX + radius, centerY);
        ctx.lineTo(centerX - radius, centerY);
        ctx.closePath();
        ctx.fillStyle = dialGradient;
        ctx.fill();

        ctx.lineCap = 'round';
        for (let i = 0; i <= 30; i += 1) {
            const tickRatio = i / 30;
            const tickAngle = (-Math.PI) + (Math.PI * tickRatio);
            const outerX = centerX + Math.cos(tickAngle) * radius;
            const outerY = centerY + Math.sin(tickAngle) * radius;
            const innerX = centerX + Math.cos(tickAngle) * (radius - 18);
            const innerY = centerY + Math.sin(tickAngle) * (radius - 18);
            ctx.strokeStyle = 'rgba(63, 81, 97, 0.7)';
            ctx.lineWidth = i % 5 === 0 ? 4 : 2;
            ctx.beginPath();
            ctx.moveTo(innerX, innerY);
            ctx.lineTo(outerX, outerY);
            ctx.stroke();
        }

        ctx.font = '700 42px Kalam, cursive';
        ctx.fillStyle = '#334155';
        ctx.textAlign = 'center';
        ctx.fillText('0', centerX - 250, centerY + 18);
        ctx.fillText('6k', centerX - 120, centerY - 185);
        ctx.fillText('12k', centerX + 120, centerY - 185);
        ctx.fillText('18k', centerX + 250, centerY + 18);

        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, Math.PI, 0, false);
        ctx.stroke();

        const needleLength = radius - 45;
        const needleX = centerX + Math.cos(angle) * needleLength;
        const needleY = centerY + Math.sin(angle) * needleLength;
        const needleGradient = ctx.createLinearGradient(centerX, centerY, needleX, needleY);
        needleGradient.addColorStop(0, '#ff7eb3');
        needleGradient.addColorStop(1, '#ff758c');
        ctx.strokeStyle = needleGradient;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(needleX, needleY);
        ctx.stroke();

        ctx.fillStyle = '#2d3748';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.arc(centerX - 5, centerY - 5, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '700 42px Kalam, cursive';
        ctx.fillStyle = '#4a4a4a';
        ctx.fillText('Estimated hearing age:', centerX, 190);
        ctx.font = '700 72px Consolas, monospace';
        ctx.fillStyle = '#ff6b9d';
        ctx.fillText(ageText, centerX, 270);

        return canvas;
    }

    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    canvasToBlob(canvas) {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/png');
        });
    }

    downloadBlob(blob, fileName) {
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(downloadUrl);
    }

    async shareResult() {
        if (!this.hasResult || this.isRunning || this.isSharing) {
            return;
        }
        const shareButton = this.getElement('shareResult');
        const canvas = this.renderShareImage();
        if (!canvas) {
            return;
        }

        this.isSharing = true;
        shareButton.textContent = 'Sharing...';
        this.updateShareButtonState();

        try {
            const blob = await this.canvasToBlob(canvas);
            if (!blob) {
                throw new Error('Unable to create image.');
            }
            const fileName = `hearing-age-${Date.now()}.png`;
            const file = new File([blob], fileName, { type: 'image/png' });
            const shareText = `My estimated hearing age is ${this.getElement('ageGuess').textContent}.`;

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'Hearing Age Guesser',
                    text: shareText,
                    files: [file]
                });
            } else {
                this.downloadBlob(blob, fileName);
            }
        } catch (err) {
            // The user may cancel share intent; silently ignore.
        } finally {
            this.isSharing = false;
            shareButton.textContent = 'Share';
            this.updateShareButtonState();
        }
    }

    estimateAgeFromFrequency(freq) {
        /**
         * Hearing age approximations based on general presbycusis (age-related hearing loss) trends.
         * Sources: 
         * - ISO 7029: Acoustics — Statistical distribution of hearing thresholds as a function of age.
         * - General audiology consensus for high-frequency roll-off.
         * Note: Individual hearing varies greatly due to environmental exposure and genetics.
         */
        const referencePoints = [
            { freq: 20000, age: 18 },
            { freq: 19000, age: 20 },
            { freq: 18000, age: 24 },
            { freq: 17000, age: 28 },
            { freq: 16000, age: 30 },
            { freq: 15000, age: 35 },
            { freq: 14000, age: 40 },
            { freq: 13000, age: 45 },
            { freq: 12000, age: 50 },
            { freq: 11000, age: 55 },
            { freq: 10000, age: 60 },
            { freq: 8000, age: 70 }
        ];

        if (freq >= referencePoints[0].freq) {
            return referencePoints[0].age;
        }
        const last = referencePoints[referencePoints.length - 1];
        if (freq <= last.freq) {
            return last.age;
        }

        for (let i = 0; i < referencePoints.length - 1; i += 1) {
            const upper = referencePoints[i];
            const lower = referencePoints[i + 1];
            if (freq <= upper.freq && freq >= lower.freq) {
                const ratio = (upper.freq - freq) / (upper.freq - lower.freq);
                const age = Math.round(upper.age + (lower.age - upper.age) * ratio);
                return age;
            }
        }

        return 40;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HearingAgeGuesser();
});
