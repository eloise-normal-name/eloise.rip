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
        this.tickMs = 375;
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

    setStartButtonRunning(isRunning) {
        const startButton = this.getElement('startSweep');
        if (!startButton) {
            return;
        }
        startButton.textContent = isRunning ? 'Stop' : 'Start';
        startButton.classList.toggle('tone-btn--alert', isRunning);
        startButton.classList.toggle('tone-btn--primary', !isRunning);
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
        this.setStartButtonRunning(true);

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

        this.setStartButtonRunning(false);
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
        this.setStartButtonRunning(false);
        this.getElement('ageGuess').textContent = '—';
        this.updateShareButtonState();
        this.updateReadout();
    }

    getShareTargetElement() {
        return document.querySelector('.hearing-age');
    }

    prepareShareClone(element) {
        const clone = document.createElement('section');
        clone.className = 'hearing-age';

        const gauge = element.querySelector('.analog-gauge');
        if (gauge) {
            clone.appendChild(gauge.cloneNode(true));
        }

        const ageText = element.querySelector('.age-text');
        if (ageText) {
            const ageClone = ageText.cloneNode(true);
            ageClone.style.marginBottom = '0';
            clone.appendChild(ageClone);
        }

        clone.style.margin = '0';
        clone.style.maxWidth = 'none';
        clone.style.paddingBottom = '0';
        return clone;
    }

    measureClone(node) {
        const host = document.createElement('div');
        host.style.position = 'fixed';
        host.style.left = '-100000px';
        host.style.top = '0';
        host.style.visibility = 'hidden';
        host.style.pointerEvents = 'none';
        host.appendChild(node);
        document.body.appendChild(host);

        try {
            const rect = node.getBoundingClientRect();
            return {
                width: Math.max(1, Math.ceil(rect.width)),
                height: Math.max(1, Math.ceil(rect.height))
            };
        } finally {
            document.body.removeChild(host);
        }
    }

    inlineComputedStyles(sourceRoot, targetRoot) {
        const sourceNodes = [sourceRoot, ...sourceRoot.querySelectorAll('*')];
        const targetNodes = [targetRoot, ...targetRoot.querySelectorAll('*')];
        const count = Math.min(sourceNodes.length, targetNodes.length);

        for (let i = 0; i < count; i += 1) {
            const sourceNode = sourceNodes[i];
            const targetNode = targetNodes[i];
            const computed = window.getComputedStyle(sourceNode);
            for (let p = 0; p < computed.length; p += 1) {
                const prop = computed[p];
                const value = computed.getPropertyValue(prop);
                const priority = computed.getPropertyPriority(prop);
                targetNode.style.setProperty(prop, value, priority);
            }
        }
    }

    getShareBackgroundColor() {
        const pageBg = window.getComputedStyle(document.body).backgroundColor;
        if (pageBg && pageBg !== 'rgba(0, 0, 0, 0)' && pageBg !== 'transparent') {
            return pageBg;
        }
        return '#ffffff';
    }

    async renderShareImage() {
        const target = this.getShareTargetElement();
        if (!target) {
            return null;
        }

        try {
            const clonedTarget = this.prepareShareClone(target);
            this.inlineComputedStyles(target, clonedTarget);
            const sourceGauge = target.querySelector('.analog-gauge');
            const clonedGauge = clonedTarget.querySelector('.analog-gauge');
            if (sourceGauge && clonedGauge) {
                this.inlineComputedStyles(sourceGauge, clonedGauge);
            }
            const sourceAgeText = target.querySelector('.age-text');
            const clonedAgeText = clonedTarget.querySelector('.age-text');
            if (sourceAgeText && clonedAgeText) {
                this.inlineComputedStyles(sourceAgeText, clonedAgeText);
            }
            // Do not carry over the live container height (which includes controls).
            // Let the share clone size itself to gauge + age text only.
            clonedTarget.style.height = 'auto';
            clonedTarget.style.minHeight = '0';
            // Do not carry over the live container width constraints.
            // Let the share clone size itself to its own content width.
            clonedTarget.style.width = 'auto';
            clonedTarget.style.minWidth = '0';
            clonedTarget.style.display = 'inline-flex';
            const { width, height } = this.measureClone(clonedTarget);
            const serializedTarget = new XMLSerializer().serializeToString(clonedTarget);
            const backgroundColor = this.getShareBackgroundColor();
            const svgMarkup = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${backgroundColor}" />
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;background:${backgroundColor};">
      ${serializedTarget}
    </div>
  </foreignObject>
</svg>`.trim();

            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Unable to render DOM snapshot.'));
                img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
            });

            const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * pixelRatio));
            canvas.height = Math.max(1, Math.round(height * pixelRatio));
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return null;
            }

            ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            ctx.drawImage(image, 0, 0, width, height);
            return canvas;
        } catch (err) {
            return null;
        }
    }

    async ensureShareFonts() {
        if (!document.fonts || !document.fonts.load) {
            return;
        }
        try {
            await Promise.all([
                document.fonts.load('700 42px Kalam'),
                document.fonts.load('700 27px "Pinyon Script"'),
                document.fonts.load('700 54px Consolas')
            ]);
        } catch (err) {
            // Font loading failures should not block sharing.
        }
    }

    canvasToBlob(canvas) {
        return new Promise((resolve) => {
            if (!canvas || typeof canvas.toBlob !== 'function') {
                resolve(null);
                return;
            }
            try {
                canvas.toBlob((blob) => resolve(blob), 'image/png');
            } catch (err) {
                resolve(null);
            }
        });
    }

    canvasToDataUrl(canvas) {
        if (!canvas || typeof canvas.toDataURL !== 'function') {
            return null;
        }
        try {
            return canvas.toDataURL('image/png');
        } catch (err) {
            return null;
        }
    }

    dataUrlToBlob(dataUrl) {
        if (!dataUrl || !dataUrl.startsWith('data:')) {
            return null;
        }
        const parts = dataUrl.split(',');
        if (parts.length < 2) {
            return null;
        }
        const header = parts[0];
        const mimeMatch = header.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        try {
            const binaryString = atob(parts[1]);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i += 1) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return new Blob([bytes], { type: mimeType });
        } catch (err) {
            return null;
        }
    }

    downloadDataUrl(dataUrl, fileName) {
        const anchor = document.createElement('a');
        anchor.href = dataUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
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
        await this.ensureShareFonts();
        const canvas = await this.renderShareImage();
        if (!canvas) {
            return;
        }

        this.isSharing = true;
        shareButton.textContent = 'Sharing...';
        this.updateShareButtonState();

        try {
            const fileName = `hearing-age-${Date.now()}.png`;
            let blob = await this.canvasToBlob(canvas);
            if (!blob) {
                const dataUrl = this.canvasToDataUrl(canvas);
                blob = this.dataUrlToBlob(dataUrl);
                if (!blob && dataUrl) {
                    this.downloadDataUrl(dataUrl, fileName);
                    return;
                }
            }
            if (!blob) {
                throw new Error('Unable to create image.');
            }
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
    window.__hearingAgeInstance = new HearingAgeGuesser();
});
