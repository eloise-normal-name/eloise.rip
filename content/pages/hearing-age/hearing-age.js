/**
 * HearingAgeGuesser sweeps a sine tone upward until the listener reports it is gone,
 * then approximates a hearing age from the last audible frequency. Built to mirror
 * the voice recorder's in-page initialization pattern.
 */
class HearingAgeGuesser {
    constructor() {
        // DOM elements
        this.frequencyValueEl = document.getElementById('frequencyValue');
        this.lastHeardValueEl = document.getElementById('lastHeardValue');
        this.sweepStatusEl = document.getElementById('sweepStatus');
        this.ageGuessEl = document.getElementById('ageGuess');
        this.ageDetailEl = document.getElementById('ageDetail');
        this.progressFillEl = document.getElementById('progressFill');
        this.startButton = document.getElementById('startSweep');
        this.cantHearButton = document.getElementById('cantHearButton');
        this.resetButton = document.getElementById('resetButton');

        // Sweep configuration
        this.startFrequency = 8000;
        this.maxFrequency = 20000;
        this.stepHz = 250;
        this.tickMs = 450;
        this.outputGain = 0.08;

        // State
        this.audioContext = null;
        this.oscillator = null;
        this.gainNode = null;
        this.sweepTimer = null;
        this.currentFrequency = this.startFrequency;
        this.lastAudibleFrequency = null;
        this.isRunning = false;
        this.hasResult = false;

        this.bindEvents();
        this.updateReadout();
    }

    bindEvents() {
        this.startButton.addEventListener('click', () => {
            if (this.isRunning) {
                this.pauseSweep();
                return;
            }
            this.startSweep();
        });

        this.cantHearButton.addEventListener('click', () => {
            if (!this.isRunning && !this.hasResult) {
                return;
            }
            this.finishWithGuess();
        });

        this.resetButton.addEventListener('click', () => {
            this.reset();
        });
    }

    updateReadout() {
        this.frequencyValueEl.textContent = Math.round(this.currentFrequency);
        this.lastHeardValueEl.textContent = this.lastAudibleFrequency ? Math.round(this.lastAudibleFrequency) : '—';

        const progress = (this.currentFrequency - this.startFrequency) / (this.maxFrequency - this.startFrequency);
        this.progressFillEl.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
    }

    updateStatus(label, state) {
        this.sweepStatusEl.textContent = label;
        this.sweepStatusEl.classList.remove('status--active', 'status--paused', 'status--done');
        if (state) {
            this.sweepStatusEl.classList.add(state);
        }
    }

    ensureAudioContext() {
        if (this.audioContext) {
            return;
        }
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            this.ageDetailEl.textContent = 'AudioContext is unavailable in this browser.';
            this.startButton.disabled = true;
            this.cantHearButton.disabled = true;
            return;
        }
        this.audioContext = new AudioContextClass();
    }

    startSweep() {
        this.ensureAudioContext();
        if (!this.audioContext) {
            return;
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        this.stopTone();
        this.isRunning = true;
        this.hasResult = false;
        this.startButton.textContent = 'Pause';
        this.cantHearButton.disabled = false;
        this.updateStatus('Sweeping…', 'status--active');

        this.oscillator = this.audioContext.createOscillator();
        this.oscillator.type = 'sine';
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.outputGain;
        this.oscillator.frequency.value = this.currentFrequency;
        this.oscillator.connect(this.gainNode).connect(this.audioContext.destination);
        this.oscillator.start();

        this.lastAudibleFrequency = this.currentFrequency;
        this.updateReadout();
        this.ageGuessEl.textContent = '—';
        this.ageDetailEl.textContent = 'Tap "Can\'t hear it" the instant the tone vanishes for you.';

        this.sweepTimer = window.setInterval(() => this.advanceFrequency(), this.tickMs);
    }

    pauseSweep() {
        this.stopTone();
        this.isRunning = false;
        this.startButton.textContent = 'Resume sweep';
        this.cantHearButton.disabled = true;
        this.updateStatus('Paused', 'status--paused');
    }

    stopTone() {
        if (this.sweepTimer) {
            window.clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
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

    advanceFrequency() {
        if (!this.isRunning || !this.oscillator) {
            return;
        }
        if (this.currentFrequency >= this.maxFrequency) {
            this.finishWithGuess(true);
            return;
        }

        this.lastAudibleFrequency = this.currentFrequency;
        const nextFrequency = Math.min(this.maxFrequency, this.currentFrequency + this.stepHz);
        this.currentFrequency = nextFrequency;

        this.oscillator.frequency.setTargetAtTime(nextFrequency, this.audioContext.currentTime, 0.08);
        this.updateReadout();
    }

    finishWithGuess(hitCeiling = false) {
        this.stopTone();
        this.isRunning = false;
        this.hasResult = true;

        const guessedFrequency = hitCeiling
            ? this.currentFrequency
            : (this.lastAudibleFrequency || this.currentFrequency);

        const estimate = this.estimateAgeFromFrequency(guessedFrequency);
        this.ageGuessEl.textContent = `${estimate.age} yrs`;
        this.ageDetailEl.textContent = `${estimate.context} (cutoff ~${this.formatFrequency(guessedFrequency)}).`;

        this.updateStatus(hitCeiling ? 'Maxed out' : 'Captured', 'status--done');
        this.startButton.textContent = 'Restart sweep';
        this.cantHearButton.disabled = true;
        this.updateReadout();
    }

    reset() {
        this.stopTone();
        this.isRunning = false;
        this.hasResult = false;
        this.currentFrequency = this.startFrequency;
        this.lastAudibleFrequency = null;
        this.startButton.textContent = 'Start sweep';
        this.cantHearButton.disabled = true;
        this.updateStatus('Idle');
        this.ageGuessEl.textContent = '—';
        this.ageDetailEl.textContent = 'Press start to begin a quick sweep.';
        this.updateReadout();
    }

    estimateAgeFromFrequency(freq) {
        const referencePoints = [
            { freq: 19500, age: 12 },
            { freq: 18500, age: 16 },
            { freq: 17500, age: 20 },
            { freq: 16500, age: 24 },
            { freq: 15500, age: 28 },
            { freq: 14500, age: 32 },
            { freq: 13500, age: 36 },
            { freq: 12500, age: 40 },
            { freq: 11500, age: 45 },
            { freq: 10500, age: 50 },
            { freq: 9500, age: 55 },
            { freq: 8500, age: 60 },
            { freq: 7500, age: 65 },
            { freq: 6500, age: 70 },
            { freq: 5500, age: 75 }
        ];

        if (freq >= referencePoints[0].freq) {
            return { age: referencePoints[0].age, context: 'Teen-like hearing range' };
        }
        const last = referencePoints[referencePoints.length - 1];
        if (freq <= last.freq) {
            return { age: last.age, context: 'Speech-focused range; age guess skews older' };
        }

        for (let i = 0; i < referencePoints.length - 1; i += 1) {
            const upper = referencePoints[i];
            const lower = referencePoints[i + 1];
            if (freq <= upper.freq && freq >= lower.freq) {
                const ratio = (upper.freq - freq) / (upper.freq - lower.freq);
                const age = Math.round(upper.age + (lower.age - upper.age) * ratio);
                const context = `Similar to ~${age}s hearing`;
                return { age, context };
            }
        }

        return { age: 40, context: 'Mid-range hearing profile' };
    }

    formatFrequency(freq) {
        if (freq >= 1000) {
            return `${(freq / 1000).toFixed(1)} kHz`;
        }
        return `${Math.round(freq)} Hz`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HearingAgeGuesser();
});
