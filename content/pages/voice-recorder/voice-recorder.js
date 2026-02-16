class VoiceRecorderApp {
    static adjectives = [
        'swift', 'bright', 'gentle', 'calm', 'wild',
        'quiet', 'bold', 'soft', 'warm', 'cool',
        'happy', 'clever', 'brave', 'kind', 'free',
        'pure', 'neat', 'clear', 'smooth', 'crisp'
    ];

    static nouns = [
        'river', 'cloud', 'forest', 'wave', 'star',
        'moon', 'sky', 'wind', 'rain', 'snow',
        'bird', 'leaf', 'stone', 'light', 'dream',
        'song', 'path', 'lake', 'fire', 'echo'
    ];

    static debugMimeTypes = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm'
    ];

    static preferredVideoTypes = [
        'video/mp4',
        'video/webm'
    ];

    constructor() {
        this.recordButton = document.getElementById('recordButton');
        this.playButton = document.getElementById('playButton');
        this.saveVideoButton = document.getElementById('saveVideoButton');
        this.saveAudioButton = document.getElementById('saveAudioButton');
        this.testSignalButton = document.getElementById('testSignalButton');
        this.debugMsg = document.getElementById('debugMsg');
        this.recordingCanvas = document.getElementById('recordingCanvas');
        this.playbackVideo = document.getElementById('playbackVideo');

        this.recordingCtx = this.recordingCanvas?.getContext('2d') || null;

        this.isRecording = false;

        this.mediaRecorder = null;
        this.mediaStream = null;
        this.audioChunks = [];
        this.audioUrl = null;
        this.audioBlob = null;

        this.audioContext = null;
        this.analyser = null;
        this.visualizer = null;
        this.animationId = null;

        this.videoMediaRecorder = null;
        this.videoChunks = [];
        this.videoUrl = null;
        this.videoBlob = null;
        this.playbackAnimationId = null;

        this.testOscillator = null;
        this.isTestSignalActive = false;

        if (!this.recordButton || !this.playButton || !this.saveVideoButton || !this.saveAudioButton
            || !this.testSignalButton || !this.debugMsg || !this.recordingCanvas || !this.playbackVideo || !this.recordingCtx) {
            return;
        }

        this.playButton.disabled = true;
        this.saveVideoButton.disabled = true;
        this.saveAudioButton.disabled = true;

        this.recordButton.onclick = () => this.onRecordClick();
        this.playButton.onclick = () => this.togglePlayback();
        this.saveVideoButton.onclick = () => this.saveVideo();
        this.saveAudioButton.onclick = () => this.saveAudio();
        this.testSignalButton.onclick = () => this.toggleTestSignal();

        this.playbackVideo.onended = () => {
            this.stopPlaybackRender();
            this.setButtonIcon(this.playButton, 'icon-triangle');
            this.setStatus('Playback finished.');
        };

        this.playbackVideo.onpause = () => {
            this.stopPlaybackRender();
        };

        this.visualizer = new AudioVisualizer(this.recordingCanvas, null);
        this.visualizer.clear();
        this.showBrowserCapabilities();
    }

    pickSupportedType(types) {
        for (const type of types) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return '';
    }

    setStatus(message, details = null) {
        const now = new Date();
        const timestamp = `[${now.toLocaleTimeString('en-US', { hour12: false })}] `;
        let output = timestamp + message;
        if (details) {
            output += `\n${details}`;
        }
        this.debugMsg.textContent = output;
    }

    setButtonIcon(button, iconClass) {
        button.innerHTML = `<span class="icon ${iconClass}"></span>`;
    }

    generateRandomFilename() {
        const { adjectives, nouns } = VoiceRecorderApp;
        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        return `${adjective}-${noun}`;
    }

    downloadBlob(blob, filename, existingUrl = null) {
        const url = existingUrl || URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();

        if (!existingUrl) {
            window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        }
    }

    downloadWithStatus(blob, filename, existingUrl = null) {
        const type = blob.type || 'application/octet-stream';
        this.downloadBlob(blob, filename, existingUrl);
        this.setStatus('Download started.', `Filename: ${filename}\nType: ${type}`);
    }

    async shareOrDownload({ blob, filename, existingUrl, successMessage }) {
        const type = blob.type || 'application/octet-stream';

        if (navigator.share) {
            try {
                if (!window.File) {
                    throw new Error('File API not available');
                }

                const file = new File([blob], filename, { type });
                const shareData = { files: [file] };

                if (navigator.canShare && !navigator.canShare(shareData)) {
                    this.downloadWithStatus(blob, filename, existingUrl);
                    return;
                }

                await navigator.share(shareData);
                this.setStatus(successMessage, `Filename: ${filename}`);
                return;
            } catch (error) {
                if (error && error.name === 'AbortError') {
                    return;
                }
            }
        }

        this.downloadWithStatus(blob, filename, existingUrl);
    }

    showBrowserCapabilities() {
        const lines = [];
        lines.push('=== BROWSER CAPABILITIES ===');

        const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        lines.push(`getUserMedia: ${hasMediaDevices ? '✓' : '✗'}`);

        const hasMediaRecorder = !!window.MediaRecorder;
        lines.push(`MediaRecorder: ${hasMediaRecorder ? '✓' : '✗'}`);

        const hasAudioContext = !!(window.AudioContext || window.webkitAudioContext);
        lines.push(`AudioContext: ${hasAudioContext ? '✓' : '✗'}`);

        if (hasMediaRecorder && MediaRecorder.isTypeSupported) {
            lines.push('\nSupported MIME types:');
            for (const type of VoiceRecorderApp.debugMimeTypes) {
                const supported = MediaRecorder.isTypeSupported(type);
                lines.push(`  ${type}: ${supported ? '✓' : '✗'}`);
            }
        }

        lines.push(`\nUser Agent: ${navigator.userAgent.substring(0, 80)}...`);
        this.setStatus('Browser capabilities checked', lines.join('\n'));
    }

    toggleTestSignal() {
        if (this.isTestSignalActive) {
            this.stopTestSignal();
            return;
        }
        this.startTestSignal();
    }

    startTestSignal() {
        if (this.isRecording) return;

        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;

        this.testOscillator = this.audioContext.createOscillator();
        this.testOscillator.type = 'sine';
        this.testOscillator.frequency.value = 220;

        const gain = this.audioContext.createGain();
        gain.gain.value = 0.3;
        this.testOscillator.connect(gain);
        gain.connect(this.analyser);
        gain.connect(this.audioContext.destination);

        this.testOscillator.start();
        this.isTestSignalActive = true;

        this.visualizer.setAnalyser(this.analyser);
        this.startVisualizer();

        this.recordButton.disabled = true;
        this.testSignalButton.classList.add('active');
        this.setStatus('Test signal active.', `Frequency: ${this.testOscillator.frequency.value} Hz\nWaveform: sine\nSample rate: ${this.audioContext.sampleRate} Hz`);
    }

    stopTestSignal() {
        if (this.testOscillator) {
            this.testOscillator.stop();
            this.testOscillator.disconnect();
            this.testOscillator = null;
        }
        this.isTestSignalActive = false;
        this.stopVisualizer();
        this.recordButton.disabled = false;
        this.testSignalButton.classList.remove('active');
        this.setStatus('Test signal stopped.');
    }

    stopVisualizer() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.visualizer) {
            this.visualizer.clear();
        }
    }

    startVisualizer() {
        if (!this.visualizer) return;
        const loop = () => {
            this.visualizer.render();
            this.animationId = requestAnimationFrame(loop);
        };
        this.animationId = requestAnimationFrame(loop);
    }

    stopPlaybackRender() {
        if (this.playbackAnimationId) {
            cancelAnimationFrame(this.playbackAnimationId);
            this.playbackAnimationId = null;
        }
        this.recordingCtx.clearRect(0, 0, this.recordingCanvas.width, this.recordingCanvas.height);
    }

    startPlaybackRender() {
        const drawFrame = () => {
            if (this.playbackVideo.paused || this.playbackVideo.ended) {
                return;
            }
            this.recordingCtx.clearRect(0, 0, this.recordingCanvas.width, this.recordingCanvas.height);
            this.recordingCtx.drawImage(this.playbackVideo, 0, 0, this.recordingCanvas.width, this.recordingCanvas.height);
            this.playbackAnimationId = requestAnimationFrame(drawFrame);
        };
        this.playbackAnimationId = requestAnimationFrame(drawFrame);
    }

    stopStream() {
        if (!this.mediaStream) return;
        this.mediaStream.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
    }

    async onRecordClick() {
        if (this.isRecording) {
            this.stopRecording();
            return;
        }
        await this.startRecording();
    }

    async startRecording() {
        if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)) {
            this.setStatus(
                'Recording not supported in this browser.',
                `Missing: ${!navigator.mediaDevices ? 'MediaDevices' : !window.MediaRecorder ? 'MediaRecorder' : 'getUserMedia'}`
            );
            return;
        }

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            const details = `Error: ${error.name}\nMessage: ${error.message}\n\nTip: Check browser permissions or use HTTPS`;
            this.setStatus('Microphone permission denied.', details);
            return;
        }

        const mimeType = this.pickSupportedType(['audio/mp4']);
        if (!mimeType) {
            this.setStatus(
                'Unable to start recorder.',
                'Required: audio/mp4 (.mp4), but it is not supported in this browser.'
            );
            this.stopStream();
            return;
        }

        try {
            this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
        } catch (error) {
            const details = `Error: ${error.name}\nMessage: ${error.message}\nAttempted MIME: ${mimeType}`;
            this.setStatus('Unable to start recorder.', details);
            this.stopStream();
            return;
        }

        this.audioChunks = [];
        let totalBytes = 0;

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                this.audioChunks.push(event.data);
                totalBytes += event.data.size;
            }
        };

        this.mediaRecorder.onerror = (event) => {
            this.setStatus('MediaRecorder error occurred', `Error: ${event.error}`);
        };

        this.mediaRecorder.onstop = () => {
            const blobType = mimeType || (this.audioChunks[0] && this.audioChunks[0].type) || 'audio/mp4';
            this.audioBlob = new Blob(this.audioChunks, { type: blobType });
            if (this.audioUrl) {
                URL.revokeObjectURL(this.audioUrl);
            }
            this.audioUrl = URL.createObjectURL(this.audioBlob);
            this.saveAudioButton.disabled = false;

            const details = `Chunks: ${this.audioChunks.length}\nTotal size: ${(totalBytes / 1024).toFixed(2)} KB\nBlob type: ${blobType}`;
            this.setStatus('Recording ready.', details);
            this.stopVisualizer();
            this.stopStream();
            this.testSignalButton.disabled = false;
        };

        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        source.connect(this.analyser);
        this.visualizer.setAnalyser(this.analyser);

        this.mediaRecorder.start();
        this.isRecording = true;
        this.setButtonIcon(this.recordButton, 'icon-square');
        this.playButton.disabled = true;
        this.saveAudioButton.disabled = true;
        this.saveVideoButton.disabled = true;
        this.testSignalButton.disabled = true;

        const details = `MIME type: ${mimeType}\nSample rate: ${this.audioContext.sampleRate} Hz\nFFT size: ${this.analyser.fftSize}\nState: ${this.mediaRecorder.state}`;
        this.setStatus('Recording started.', details);
        this.startVisualizer();

        this.startVideoRecording();
    }

    startVideoRecording() {
        try {
            const canvasStream = this.recordingCanvas.captureStream(30);
            const videoTrack = canvasStream.getVideoTracks()[0];
            const audioTrack = this.mediaStream.getAudioTracks()[0];
            const combinedStream = new MediaStream([videoTrack, audioTrack]);

            const videoMimeType = this.pickSupportedType(VoiceRecorderApp.preferredVideoTypes);
            const videoOptions = videoMimeType ? { mimeType: videoMimeType } : undefined;

            this.videoMediaRecorder = new MediaRecorder(combinedStream, videoOptions);
            this.videoChunks = [];
            let totalVideoBytes = 0;

            this.videoMediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.videoChunks.push(event.data);
                    totalVideoBytes += event.data.size;
                }
            };

            this.videoMediaRecorder.onerror = (event) => {
                this.setStatus('Video MediaRecorder error occurred', `Error: ${event.error}`);
            };

            this.videoMediaRecorder.onstop = () => {
                const blobType = videoMimeType || (this.videoChunks[0] && this.videoChunks[0].type) || 'video/webm';
                this.videoBlob = new Blob(this.videoChunks, { type: blobType });
                if (this.videoUrl) {
                    URL.revokeObjectURL(this.videoUrl);
                }
                this.videoUrl = URL.createObjectURL(this.videoBlob);
                this.saveVideoButton.disabled = false;
                this.playButton.disabled = false;
                this.playbackVideo.src = this.videoUrl;
                this.playbackVideo.load();

                const videoDetails = `Video chunks: ${this.videoChunks.length}\nVideo size: ${(totalVideoBytes / 1024).toFixed(2)} KB\nVideo type: ${blobType}`;
                this.setStatus('Video ready.', videoDetails);
            };

            this.videoMediaRecorder.start();
        } catch (error) {
            this.setStatus('Video recording failed', `Error: ${error.message}\nCanvas recording may not be supported.`);
        }
    }

    stopRecording() {
        if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
            return;
        }

        this.mediaRecorder.stop();
        if (this.videoMediaRecorder && this.videoMediaRecorder.state === 'recording') {
            this.videoMediaRecorder.stop();
        }

        this.isRecording = false;
        this.setButtonIcon(this.recordButton, 'icon-circle');
        this.setStatus('Processing recording...');
    }

    togglePlayback() {
        if (!this.videoUrl) {
            this.setStatus('No video recording yet.');
            return;
        }

        if (!this.playbackVideo.paused && !this.playbackVideo.ended) {
            this.playbackVideo.pause();
            this.playbackVideo.currentTime = 0;
            this.stopPlaybackRender();
            this.setButtonIcon(this.playButton, 'icon-triangle');
            this.setStatus('Playback stopped.');
            return;
        }

        this.playbackVideo.currentTime = 0;
        const playPromise = this.playbackVideo.play();
        if (playPromise && playPromise.catch) {
            playPromise.catch((error) => {
                this.setButtonIcon(this.playButton, 'icon-triangle');
                this.setStatus('Playback failed.', `Error: ${error.message}`);
            });
        }
        this.setButtonIcon(this.playButton, 'icon-square');
        this.setStatus('Playback started.');
        this.stopPlaybackRender();
        this.startPlaybackRender();
    }

    async saveVideo() {
        if (!this.videoBlob) {
            this.setStatus('No video recording available to save.');
            return;
        }

        const videoExt = (this.videoBlob.type.split(/\/|;/)[1] || '').trim();
        const filename = this.generateRandomFilename() + (videoExt ? `.${videoExt}` : '');
        await this.shareOrDownload({
            blob: this.videoBlob,
            filename,
            existingUrl: this.videoUrl,
            successMessage: 'Video share completed.'
        });
    }

    async saveAudio() {
        if (!this.audioBlob) {
            this.setStatus('No recording available to save.');
            return;
        }

        const audioExt = (this.audioBlob.type.split(/\/|;/)[1] || '').trim();
        const filename = this.generateRandomFilename() + (audioExt ? `.${audioExt}` : '');
        await this.shareOrDownload({
            blob: this.audioBlob,
            filename,
            existingUrl: this.audioUrl,
            successMessage: 'Share completed.'
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VoiceRecorderApp();
});
