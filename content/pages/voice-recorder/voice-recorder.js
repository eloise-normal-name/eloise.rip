/**
 * Voice Recorder App - Multi-clip recording with pitch visualization
 * 
 * DOM Element Dependencies:
 * This class requires specific HTML element IDs defined in voice-recorder.md.
 * When modifying the UI, ensure all getElementById() calls have matching HTML elements.
 * See docs/voice-recorder-dom-elements.md for the complete reference and maintenance guide.
 * 
 * A GitHub Actions workflow validates DOM elements on every PR to prevent initialization failures.
 */
class VoiceRecorderApp {
    static foods = [
        'apple', 'apricot', 'avocado', 'banana', 'basil', 'bean', 'berry', 'biscuit', 'bread', 'broccoli',
        'butter', 'cabbage', 'cake', 'carrot', 'cashew', 'celery', 'cheese', 'cherry', 'chicken', 'chili',
        'chocolate', 'cinnamon', 'coconut', 'coffee', 'cookie', 'corn', 'cracker', 'cream', 'cucumber', 'cupcake',
        'date', 'donut', 'dumpling', 'egg', 'fig', 'fries', 'garlic', 'ginger', 'grape', 'honey',
        'jam', 'kale', 'kiwi', 'lemon', 'lettuce', 'lime', 'mango', 'maple', 'melon', 'milk',
        'mint', 'muffin', 'mushroom', 'noodle', 'nutmeg', 'oat', 'olive', 'onion', 'orange', 'papaya',
        'pasta', 'peach', 'peanut', 'pear', 'pepper', 'pickle', 'pie', 'pineapple', 'pistachio', 'pizza',
        'plum', 'popcorn', 'potato', 'pretzel', 'pumpkin', 'radish', 'raisin', 'rice', 'roll', 'salad',
        'salsa', 'sauce', 'soup', 'spinach', 'sprout', 'squash', 'steak', 'strawberry', 'sugar', 'taco',
        'tea', 'toast', 'tofu', 'tomato', 'truffle', 'tuna', 'vanilla', 'waffle', 'walnut', 'yogurt'
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
        this.testSignalButton = document.getElementById('testSignalButton');
        this.debugMsg = document.getElementById('debugMsg');
        this.recordingCanvas = document.getElementById('recordingCanvas');
        this.playbackVideo = document.getElementById('playbackVideo');
        this.clipsList = document.getElementById('clipsList');

        this.recordingCtx = this.recordingCanvas?.getContext('2d') || null;

        this.isRecording = false;

        this.mediaRecorder = null;
        this.mediaStream = null;
        this.audioChunks = [];

        this.audioContext = null;
        this.analyser = null;
        this.visualizer = null;
        this.animationId = null;

        this.videoMediaRecorder = null;
        this.videoChunks = [];
        this.playbackAnimationId = null;

        this.testOscillator = null;
        this.testGain = null;
        this.isTestSignalActive = false;

        this.clips = [];
        this.selectedClipId = null;
        this.currentRecordingClipId = null;
        this.recordingStartTime = null;
        this.playingClipId = null;
        this.discardRecordingOnStop = false;

        if (!this.recordButton || !this.testSignalButton || !this.debugMsg 
            || !this.recordingCanvas || !this.playbackVideo || !this.recordingCtx || !this.clipsList) {
            return;
        }

        this.recordButton.onclick = () => this.onRecordClick();
        this.testSignalButton.onclick = () => this.toggleTestSignal();

        this.playbackVideo.onended = () => {
            this.stopPlaybackRender();
            this.playingClipId = null;
            this.renderClipsList();
            this.setStatus('Playback finished.');
        };

        this.playbackVideo.onpause = () => {
            this.stopPlaybackRender();
        };

        this.visualizer = new AudioVisualizer(this.recordingCanvas, null);
        this.visualizer.setContextRecoveryHandler((context) => this.handleVisualizerContextRecovery(context));
        this.visualizer.clear();
        this.setupConfigurationSliders();
        this.showBrowserCapabilities();
        this.renderClipsList();
    }

    getMostRecentClip() {
        if (!this.clips.length) return null;

        return this.clips.reduce((latest, clip) => {
            if (!latest) return clip;
            return clip.timestamp > latest.timestamp ? clip : latest;
        }, null);
    }

    ensureSelectedClipForRestore() {
        if (!this.clips.length) return null;

        const selectedClip = this.clips.find((clip) => clip.id === this.selectedClipId);
        if (selectedClip) {
            return selectedClip;
        }

        const mostRecentClip = this.getMostRecentClip();
        if (mostRecentClip) {
            this.selectedClipId = mostRecentClip.id;
            this.renderClipsList();
        }

        return mostRecentClip;
    }

    resetPlaybackToStartIfAvailable() {
        if (!this.playbackVideo) return false;

        const selectedClip = this.ensureSelectedClipForRestore();
        if (selectedClip && selectedClip.videoUrl) {
            const currentSource = this.playbackVideo.currentSrc || this.playbackVideo.src;
            if (currentSource !== selectedClip.videoUrl) {
                this.playbackVideo.src = selectedClip.videoUrl;
                this.playbackVideo.load();
            }
        }

        const currentSource = this.playbackVideo.currentSrc || this.playbackVideo.src;
        if (!currentSource) {
            return false;
        }

        this.playbackVideo.pause();
        this.stopPlaybackRender();

        try {
            this.playbackVideo.currentTime = 0;
        } catch (error) {
            // If seeking fails before metadata is ready, reload and keep paused at start
            this.playbackVideo.load();
        }

        if (this.playingClipId !== null) {
            this.playingClipId = null;
            this.renderClipsList();
        }

        return true;
    }

    handleVisualizerContextRecovery(context = {}) {
        if (this.isRecording) {
            this.stopRecording({ discard: true, dueToContextRecovery: true });
            return;
        }

        if (this.isTestSignalActive) {
            this.stopTestSignal();
        }

        this.stopVisualizer();
        this.visualizer.setAnalyser(null);
        this.visualizer.clear();

        const playbackReset = this.resetPlaybackToStartIfAvailable();
        const restoredWhileIdle = Boolean(context.whileIdle);
        const details = restoredWhileIdle
            ? (playbackReset
                ? 'Recovered while idle. Playback reset to the beginning. Press record to start a new clip.'
                : 'Recovered while idle. No saved clip video to reset yet. Press record to start a new clip.')
            : 'Current sample discarded. Press record to start a new clip.';

        this.setStatus('Canvas context recovered. Recorder reset.', details);
    }

    setupConfigurationSliders() {
        const minHzSlider = document.getElementById('minHzSlider');
        const maxHzSlider = document.getElementById('maxHzSlider');
        const primaryThresholdSlider = document.getElementById('primaryThresholdSlider');
        const secondaryThresholdSlider = document.getElementById('secondaryThresholdSlider');
        const smoothingSlider = document.getElementById('smoothingSlider');

        const minHzValue = document.getElementById('minHzValue');
        const maxHzValue = document.getElementById('maxHzValue');
        const primaryThresholdValue = document.getElementById('primaryThresholdValue');
        const secondaryThresholdValue = document.getElementById('secondaryThresholdValue');
        const smoothingValue = document.getElementById('smoothingValue');

        if (!minHzSlider || !maxHzSlider || !primaryThresholdSlider || 
            !secondaryThresholdSlider || !smoothingSlider) {
            return;
        }

        minHzSlider.oninput = () => {
            const minHz = parseInt(minHzSlider.value, 10);
            const maxHz = parseInt(maxHzSlider.value, 10);
            if (minHz >= maxHz) {
                minHzSlider.value = maxHz - 10;
                minHzValue.textContent = minHzSlider.value;
                return;
            }
            minHzValue.textContent = minHz;
            this.visualizer.updatePitchRange(minHz, maxHz);
        };

        maxHzSlider.oninput = () => {
            const minHz = parseInt(minHzSlider.value, 10);
            const maxHz = parseInt(maxHzSlider.value, 10);
            if (maxHz <= minHz) {
                maxHzSlider.value = minHz + 10;
                maxHzValue.textContent = maxHzSlider.value;
                return;
            }
            maxHzValue.textContent = maxHz;
            this.visualizer.updatePitchRange(minHz, maxHz);
        };

        primaryThresholdSlider.oninput = () => {
            const threshold = parseFloat(primaryThresholdSlider.value);
            primaryThresholdValue.textContent = threshold.toFixed(2);
            this.visualizer.updatePrimaryThreshold(threshold);
        };

        secondaryThresholdSlider.oninput = () => {
            const threshold = parseFloat(secondaryThresholdSlider.value);
            secondaryThresholdValue.textContent = threshold.toFixed(2);
            this.visualizer.updateSecondaryThreshold(threshold);
        };

        smoothingSlider.oninput = () => {
            const smoothing = parseInt(smoothingSlider.value, 10);
            smoothingValue.textContent = smoothing;
            this.visualizer.updateSmoothing(smoothing / 100);
        };
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
        const { foods } = VoiceRecorderApp;
        const food1 = foods[Math.floor(Math.random() * foods.length)];
        const food2 = foods[Math.floor(Math.random() * foods.length)];
        const food3 = foods[Math.floor(Math.random() * foods.length)];
        return `${food1}-${food2}-${food3}`;
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
                // For non-abort errors, show error and fall through to download
                this.setStatus('Share failed, downloading instead.', `Error: ${error.message}`);
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
        this.testGain = gain;

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
        if (this.testGain) {
            this.testGain.disconnect();
            this.testGain = null;
        }
        this.isTestSignalActive = false;
        this.stopVisualizer();
        this.visualizer.setAnalyser(null);
        this.recordButton.disabled = false;
        this.testSignalButton.classList.remove('active');
        this.setStatus('Test signal stopped.');
    }

    stopVisualizer() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        // Don't clear the visualizer - keep the last frame visible
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
        this.discardRecordingOnStop = false;
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
            const audioBlob = new Blob(this.audioChunks, { type: blobType });
            const duration = this.recordingStartTime ? (Date.now() - this.recordingStartTime) / 1000 : 0;
            const details = `Chunks: ${this.audioChunks.length}\nTotal size: ${(totalBytes / 1024).toFixed(2)} KB\nBlob type: ${blobType}`;

            if (this.discardRecordingOnStop) {
                this.setStatus('Recording reset after canvas recovery.', `${details}\nAction: Current recording discarded. Start a new recording.`);
            } else {
                const audioUrl = URL.createObjectURL(audioBlob);
                const pitchStats = this.visualizer.getPitchStatistics();
                this.addClip(audioBlob, audioUrl, duration, pitchStats);
                this.setStatus('Recording ready.', details);
            }

            this.discardRecordingOnStop = false;
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
        this.recordingStartTime = Date.now();
        this.setButtonIcon(this.recordButton, 'icon-square');
        this.testSignalButton.disabled = true;

        const details = `MIME type: ${mimeType}\nSample rate: ${this.audioContext.sampleRate} Hz\nFFT size: ${this.analyser.fftSize}\nState: ${this.mediaRecorder.state}`;
        this.setStatus('Recording started.', details);
        this.startVisualizer();

        this.startVideoRecording();
    }

    startVideoRecording() {
        try {
            const canvasStream = this.recordingCanvas.captureStream(60);
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
                const videoBlob = new Blob(this.videoChunks, { type: blobType });
                let videoUrl = null;

                if (!this.discardRecordingOnStop) {
                    videoUrl = URL.createObjectURL(videoBlob);
                }

                if (this.currentRecordingClipId !== null) {
                    const clip = this.clips.find((c) => c.id === this.currentRecordingClipId);
                    if (clip && videoUrl) {
                        clip.videoBlob = videoBlob;
                        clip.videoUrl = videoUrl;
                        if (this.selectedClipId === clip.id) {
                            this.playbackVideo.src = videoUrl;
                            this.playbackVideo.load();
                        }
                        this.renderClipsList();
                    }
                }

                if (!this.discardRecordingOnStop) {
                    const videoDetails = `Video chunks: ${this.videoChunks.length}\nVideo size: ${(totalVideoBytes / 1024).toFixed(2)} KB\nVideo type: ${blobType}`;
                    this.setStatus('Video ready.', videoDetails);
                }

                this.currentRecordingClipId = null;
            };

            this.videoMediaRecorder.start();
        } catch (error) {
            this.setStatus('Video recording failed', `Error: ${error.message}\nCanvas recording may not be supported.`);
        }
    }

    stopRecording({ discard = false, dueToContextRecovery = false } = {}) {
        if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
            return;
        }

        this.discardRecordingOnStop = discard;

        this.mediaRecorder.stop();
        if (this.videoMediaRecorder && this.videoMediaRecorder.state === 'recording') {
            this.videoMediaRecorder.stop();
        }

        this.isRecording = false;
        this.setButtonIcon(this.recordButton, 'icon-circle');

        if (dueToContextRecovery) {
            this.setStatus('Canvas context recovered. Resetting recorder...', 'Current sample discarded; this recording will be dropped.');
            return;
        }

        this.setStatus('Processing recording...');
    }

    toggleClipPlayback(id) {
        const clip = this.clips.find((c) => c.id === id);
        if (!clip || !clip.videoUrl) {
            this.setStatus('No video available for this clip.');
            return;
        }

        if (this.playingClipId === id && !this.playbackVideo.paused) {
            this.playbackVideo.pause();
            this.playbackVideo.currentTime = 0;
            this.stopPlaybackRender();
            this.playingClipId = null;
            this.setStatus('Playback stopped.');
            this.renderClipsList();
            return;
        }

        if (this.playingClipId !== null && this.playingClipId !== id) {
            this.playbackVideo.pause();
            this.playbackVideo.currentTime = 0;
            this.stopPlaybackRender();
        }

        this.playbackVideo.src = clip.videoUrl;
        this.playbackVideo.load();
        this.playbackVideo.currentTime = 0;
        
        const playPromise = this.playbackVideo.play();
        if (playPromise && playPromise.catch) {
            playPromise.catch((error) => {
                this.playingClipId = null;
                this.setStatus('Playback failed.', `Error: ${error.message}`);
                this.renderClipsList();
            });
        }
        
        this.playingClipId = id;
        this.selectedClipId = id;
        this.setStatus('Playback started.');
        this.stopPlaybackRender();
        this.startPlaybackRender();
        this.renderClipsList();
    }

    async shareClipVideo(id) {
        const clip = this.clips.find((c) => c.id === id);
        if (!clip || !clip.videoBlob) {
            this.setStatus('No video recording available to save.');
            return;
        }

        const videoExt = (clip.videoBlob.type.split(/\/|;/)[1] || '').trim();
        const filename = clip.name + (videoExt ? `.${videoExt}` : '');
        await this.shareOrDownload({
            blob: clip.videoBlob,
            filename,
            existingUrl: clip.videoUrl,
            successMessage: 'Video share completed.'
        });
    }

    async shareClipAudio(id) {
        const clip = this.clips.find((c) => c.id === id);
        if (!clip || !clip.audioBlob) {
            this.setStatus('No audio recording available to save.');
            return;
        }

        // Extract extension from MIME type, but use .m4a for audio/mp4 to avoid Photos app on iOS
        let audioExt = (clip.audioBlob.type.split(/\/|;/)[1] || '').trim();
        if (audioExt === 'mp4') {
            audioExt = 'm4a';
        }
        const filename = clip.name + (audioExt ? `.${audioExt}` : '');
        await this.shareOrDownload({
            blob: clip.audioBlob,
            filename,
            existingUrl: clip.audioUrl,
            successMessage: 'Audio share completed.'
        });
    }

    addClip(audioBlob, audioUrl, duration, pitchStats = null) {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        const name = this.generateRandomFilename();
        const timestamp = new Date();
        
        const clip = {
            id,
            name,
            timestamp,
            duration,
            audioBlob,
            audioUrl,
            videoBlob: null,
            videoUrl: null,
            pitchStats
        };
        
        this.clips.push(clip);
        this.selectedClipId = id;
        this.currentRecordingClipId = id;
        this.renderClipsList();
    }

    deleteClip(id) {
        const clipIndex = this.clips.findIndex((c) => c.id === id);
        if (clipIndex === -1) return;
        
        const clip = this.clips[clipIndex];
        if (clip.audioUrl) {
            URL.revokeObjectURL(clip.audioUrl);
        }
        if (clip.videoUrl) {
            URL.revokeObjectURL(clip.videoUrl);
        }
        
        this.clips.splice(clipIndex, 1);
        
        if (this.selectedClipId === id) {
            if (this.clips.length > 0) {
                const newIndex = Math.min(clipIndex, this.clips.length - 1);
                this.selectedClipId = this.clips[newIndex].id;
            } else {
                this.selectedClipId = null;
            }
        }
        
        if (this.playingClipId === id) {
            this.playbackVideo.pause();
            this.stopPlaybackRender();
            this.playingClipId = null;
        }
        
        this.renderClipsList();
    }

    selectClip(id) {
        this.selectedClipId = id;
        this.renderClipsList();
    }

    renameClip(id, newName) {
        const clip = this.clips.find((c) => c.id === id);
        if (clip) {
            clip.name = newName;
            this.renderClipsList();
        }
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatTimestamp(date) {
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        
        if (isToday) {
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();
        
        if (isYesterday) {
            return 'Yesterday';
        }
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    renderClipsList() {
        if (!this.clipsList) return;
        
        if (this.clips.length === 0) {
            this.clipsList.innerHTML = '<div class="clips-empty">No recordings yet</div>';
            return;
        }
        
        const clipsHtml = this.clips.map((clip) => {
            const isSelected = clip.id === this.selectedClipId;
            const isPlaying = clip.id === this.playingClipId;
            const hasVideo = !!clip.videoUrl;
            const hasAudio = !!clip.audioUrl;
            
            let pitchInfo = '';
            if (clip.pitchStats && typeof clip.pitchStats === 'object') {
                const { min, max, average, sampleCount, filteredCount } = clip.pitchStats;
                if (Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(average)) {
                    let filterNote = '';
                    if (filteredCount && sampleCount && filteredCount < sampleCount) {
                        const removedCount = sampleCount - filteredCount;
                        filterNote = ` (${removedCount} outlier${removedCount > 1 ? 's' : ''} filtered)`;
                    }
                    pitchInfo = `<div class="clip-pitch-stats">Pitch: ${min.toFixed(1)} - ${max.toFixed(1)} Hz (avg: ${average.toFixed(1)} Hz)${filterNote}</div>`;
                }
            }
            
            return `
                <div class="clip-item ${isSelected ? 'selected' : ''}" data-clip-id="${clip.id}">
                    <div class="clip-info">
                        <div class="clip-name" data-clip-id="${clip.id}">${clip.name}</div>
                        <div class="clip-meta">
                            <span class="clip-timestamp">${this.formatTimestamp(clip.timestamp)}</span>
                            <span class="clip-duration">${this.formatDuration(clip.duration)}</span>
                        </div>
                        ${pitchInfo}
                    </div>
                    <div class="clip-actions">
                        <button class="clip-play" data-clip-id="${clip.id}" ${!hasVideo ? 'disabled' : ''} title="${isPlaying ? 'Stop' : 'Play'}">
                            <span class="icon ${isPlaying ? 'icon-square-small' : 'icon-triangle-small'}"></span>
                        </button>
                        <button class="clip-share-video" data-clip-id="${clip.id}" ${!hasVideo ? 'disabled' : ''} title="Share Video">
                            🎬
                        </button>
                        <button class="clip-share-audio" data-clip-id="${clip.id}" ${!hasAudio ? 'disabled' : ''} title="Share Audio">
                            🎵
                        </button>
                        <button class="clip-delete" data-clip-id="${clip.id}" title="Delete">✕</button>
                    </div>
                </div>
            `;
        }).join('');
        
        this.clipsList.innerHTML = clipsHtml;
        
        this.clipsList.querySelectorAll('.clip-item').forEach((item) => {
            item.addEventListener('click', (event) => {
                if (!event.target.closest('.clip-actions')) {
                    const id = parseInt(item.dataset.clipId, 10);
                    this.selectClip(id);
                }
            });
        });
        
        this.clipsList.querySelectorAll('.clip-play').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const id = parseInt(button.dataset.clipId, 10);
                this.toggleClipPlayback(id);
            });
        });
        
        this.clipsList.querySelectorAll('.clip-share-video').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const id = parseInt(button.dataset.clipId, 10);
                this.shareClipVideo(id);
            });
        });
        
        this.clipsList.querySelectorAll('.clip-share-audio').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const id = parseInt(button.dataset.clipId, 10);
                this.shareClipAudio(id);
            });
        });
        
        this.clipsList.querySelectorAll('.clip-delete').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const id = parseInt(button.dataset.clipId, 10);
                this.deleteClip(id);
            });
        });
        
        this.clipsList.querySelectorAll('.clip-name').forEach((nameEl) => {
            nameEl.addEventListener('dblclick', (event) => {
                event.stopPropagation();
                const id = parseInt(nameEl.dataset.clipId, 10);
                const clip = this.clips.find((c) => c.id === id);
                if (clip) {
                    const newName = prompt('Rename recording:', clip.name);
                    if (newName && newName.trim()) {
                        this.renameClip(id, newName.trim());
                    }
                }
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.voiceRecorderApp = new VoiceRecorderApp();
});
