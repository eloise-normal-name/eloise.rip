class AudioVisualizer {
    constructor(canvas, analyserNode) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.analyserNode = analyserNode;
        this.data = null;
    }

    setAnalyser(analyserNode) {
        this.analyserNode = analyserNode;
        if (this.analyserNode) {
            this.data = new Uint8Array(this.analyserNode.fftSize);
        }
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    render() {
        if (!this.analyserNode) return;
        if (!this.data || this.data.length !== this.analyserNode.fftSize) {
            this.data = new Uint8Array(this.analyserNode.fftSize);
        }

        this.analyserNode.getByteTimeDomainData(this.data);

        const width = this.canvas.width;
        const height = this.canvas.height;
        const mid = height / 2;

        this.ctx.clearRect(0, 0, width, height);
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = 'rgba(255, 107, 157, 0.9)';

        this.ctx.beginPath();
        for (let i = 0; i < this.data.length; i += 1) {
            const x = (i / (this.data.length - 1)) * width;
            const v = (this.data[i] - 128) / 128;
            const y = mid + v * (mid - 6);
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const recordButton = document.getElementById('recordButton');
    const playButton = document.getElementById('playButton');
    const saveVideoButton = document.getElementById('saveVideoButton');
    const saveAudioButton = document.getElementById('saveAudioButton');
    const debugMsg = document.getElementById('debugMsg');
    const recordingCanvas = document.getElementById('recordingCanvas');
    const playbackVideo = document.getElementById('playbackVideo');
    const recordingCtx = recordingCanvas.getContext('2d');

    let isRecording = false;
    let mediaRecorder = null;
    let mediaStream = null;
    let audioChunks = [];
    let audioUrl = null;
    let audioBlob = null;
    let audioContext = null;
    let analyser = null;
    let visualizer = null;
    let animationId = null;
    let playbackAnimationId = null;

    let videoMediaRecorder = null;
    let videoChunks = [];
    let videoUrl = null;
    let videoBlob = null;

    const adjectives = [
        'swift', 'bright', 'gentle', 'calm', 'wild',
        'quiet', 'bold', 'soft', 'warm', 'cool',
        'happy', 'clever', 'brave', 'kind', 'free',
        'pure', 'neat', 'clear', 'smooth', 'crisp'
    ];

    const nouns = [
        'river', 'cloud', 'forest', 'wave', 'star',
        'moon', 'sky', 'wind', 'rain', 'snow',
        'bird', 'leaf', 'stone', 'light', 'dream',
        'song', 'path', 'lake', 'fire', 'echo'
    ];

    const preferredTypes = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm'
    ];

    const preferredVideoTypes = [
        'video/mp4',
        'video/webm'
    ];

    const canRecord = () => {
        return navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder;
    };

    const pickMimeType = () => {
        if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) {
            return '';
        }
        for (const type of preferredTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return '';
    };

    const pickVideoMimeType = () => {
        if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) {
            return '';
        }
        for (const type of preferredVideoTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return '';
    };

    const getTimestamp = () => {
        const now = new Date();
        return now.toLocaleTimeString('en-US', { hour12: false });
    };

    const generateRandomFilename = () => {
        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        return `${adjective}-${noun}`;
    };

    const getFileExtension = (mimeType) => {
        if (!mimeType) return '.audio';
        if (mimeType.startsWith('video/mp4')) return '.mp4';
        if (mimeType.startsWith('video/webm')) return '.webm';
        if (mimeType.startsWith('audio/mp4')) return '.m4a';
        if (mimeType.startsWith('audio/webm')) return '.webm';
        return '.audio';
    };

    const setStatus = (message, details = null) => {
        const timestamp = `[${getTimestamp()}] `;
        let output = timestamp + message;
        if (details) {
            output += `\n${details}`;
        }
        debugMsg.textContent = output;
    };

    const setButtonIcon = (button, iconClass) => {
        button.innerHTML = `<span class="icon ${iconClass}"></span>`;
    };

    const setButtonText = (button, text) => {
        button.textContent = text;
    };

    const showBrowserCapabilities = () => {
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
            for (const type of preferredTypes) {
                const supported = MediaRecorder.isTypeSupported(type);
                lines.push(`  ${type}: ${supported ? '✓' : '✗'}`);
            }
        }

        lines.push(`\nUser Agent: ${navigator.userAgent.substring(0, 80)}...`);

        setStatus('Browser capabilities checked', lines.join('\n'));
    };

    const stopVisualizer = () => {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        if (visualizer) {
            visualizer.clear();
        }
    };

    const stopPlaybackRender = () => {
        if (playbackAnimationId) {
            cancelAnimationFrame(playbackAnimationId);
            playbackAnimationId = null;
        }
        recordingCtx.clearRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    };

    const startPlaybackRender = () => {
        if (!playbackVideo) return;
        const drawFrame = () => {
            if (playbackVideo.paused || playbackVideo.ended) {
                return;
            }
            recordingCtx.clearRect(0, 0, recordingCanvas.width, recordingCanvas.height);
            recordingCtx.drawImage(playbackVideo, 0, 0, recordingCanvas.width, recordingCanvas.height);
            playbackAnimationId = requestAnimationFrame(drawFrame);
        };
        playbackAnimationId = requestAnimationFrame(drawFrame);
    };

    const startVisualizer = () => {
        if (!visualizer) return;
        const loop = () => {
            visualizer.render();
            animationId = requestAnimationFrame(loop);
        };
        animationId = requestAnimationFrame(loop);
    };

    const stopStream = () => {
        if (mediaStream) {
            mediaStream.getTracks().forEach((track) => track.stop());
            mediaStream = null;
        }
    };

    const startRecording = async () => {
        if (!canRecord()) {
            setStatus('Recording not supported in this browser.',
                `Missing: ${!navigator.mediaDevices ? 'MediaDevices' : !window.MediaRecorder ? 'MediaRecorder' : 'getUserMedia'}`);
            return;
        }

        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            const details = `Error: ${error.name}\nMessage: ${error.message}\n\nTip: Check browser permissions or use HTTPS`;
            setStatus('Microphone permission denied.', details);
            return;
        }

        const mimeType = pickMimeType();
        const options = mimeType ? { mimeType } : undefined;

        try {
            mediaRecorder = new MediaRecorder(mediaStream, options);
        } catch (error) {
            const details = `Error: ${error.name}\nMessage: ${error.message}\nAttempted MIME: ${mimeType || 'default'}`;
            setStatus('Unable to start recorder.', details);
            stopStream();
            return;
        }

        audioChunks = [];
        let totalBytes = 0;

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                audioChunks.push(event.data);
                totalBytes += event.data.size;
            }
        };

        mediaRecorder.onerror = (event) => {
            setStatus('MediaRecorder error occurred', `Error: ${event.error}`);
        };

        mediaRecorder.onstop = () => {
            const blobType = mimeType || (audioChunks[0] && audioChunks[0].type) || 'audio/webm';
            audioBlob = new Blob(audioChunks, { type: blobType });
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
            audioUrl = URL.createObjectURL(audioBlob);
            saveAudioButton.disabled = false;

            const details = `Chunks: ${audioChunks.length}\nTotal size: ${(totalBytes / 1024).toFixed(2)} KB\nBlob type: ${blobType}`;
            setStatus('Recording ready.', details);
            stopVisualizer();
            stopStream();
        };

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        const source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(analyser);

        visualizer = new AudioVisualizer(recordingCanvas, analyser);
        visualizer.setAnalyser(analyser);

        mediaRecorder.start();
        isRecording = true;
        setButtonIcon(recordButton, 'icon-square');
        playButton.disabled = true;
        saveAudioButton.disabled = true;
        saveVideoButton.disabled = true;

        const details = `MIME type: ${mimeType || 'default'}\nSample rate: ${audioContext.sampleRate} Hz\nFFT size: ${analyser.fftSize}\nState: ${mediaRecorder.state}`;
        setStatus('Recording started.', details);
        startVisualizer();

        startVideoRecording(mimeType);
    };

    const startVideoRecording = (audioMimeType) => {
        try {
            const canvasStream = recordingCanvas.captureStream(30);
            const videoTrack = canvasStream.getVideoTracks()[0];
            const audioTrack = mediaStream.getAudioTracks()[0];

            const combinedStream = new MediaStream([videoTrack, audioTrack]);

            const videoMimeType = pickVideoMimeType();
            const videoOptions = videoMimeType ? { mimeType: videoMimeType } : undefined;

            videoMediaRecorder = new MediaRecorder(combinedStream, videoOptions);
            videoChunks = [];
            let totalVideoBytes = 0;

            videoMediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    videoChunks.push(event.data);
                    totalVideoBytes += event.data.size;
                }
            };

            videoMediaRecorder.onerror = (event) => {
                setStatus('Video MediaRecorder error occurred', `Error: ${event.error}`);
            };

            videoMediaRecorder.onstop = () => {
                const blobType = videoMimeType || (videoChunks[0] && videoChunks[0].type) || 'video/webm';
                videoBlob = new Blob(videoChunks, { type: blobType });
                if (videoUrl) {
                    URL.revokeObjectURL(videoUrl);
                }
                videoUrl = URL.createObjectURL(videoBlob);
                saveVideoButton.disabled = false;
                playButton.disabled = false;
                playbackVideo.src = videoUrl;
                playbackVideo.load();

                const videoDetails = `Video chunks: ${videoChunks.length}\nVideo size: ${(totalVideoBytes / 1024).toFixed(2)} KB\nVideo type: ${blobType}`;
                setStatus('Video ready.', videoDetails);
            };

            videoMediaRecorder.start();
        } catch (error) {
            setStatus('Video recording failed', `Error: ${error.message}\nCanvas recording may not be supported.`);
        }
    };

    const stopRecording = () => {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') {
            return;
        }
        mediaRecorder.stop();

        if (videoMediaRecorder && videoMediaRecorder.state === 'recording') {
            videoMediaRecorder.stop();
        }

        isRecording = false;
        setButtonIcon(recordButton, 'icon-circle');
        setStatus('Processing recording...');
    };

    const togglePlayback = () => {
        if (!videoUrl || !playbackVideo) {
            setStatus('No video recording yet.');
            return;
        }

        if (!playbackVideo.paused && !playbackVideo.ended) {
            playbackVideo.pause();
            playbackVideo.currentTime = 0;
            stopPlaybackRender();
            setButtonIcon(playButton, 'icon-triangle');
            setStatus('Playback stopped.');
            return;
        }

        playbackVideo.currentTime = 0;
        const playPromise = playbackVideo.play();
        if (playPromise && playPromise.catch) {
            playPromise.catch((error) => {
                setButtonIcon(playButton, 'icon-triangle');
                setStatus('Playback failed.', `Error: ${error.message}`);
            });
        }
        setButtonIcon(playButton, 'icon-square');
        setStatus('Playback started.');
        stopPlaybackRender();
        startPlaybackRender();
    };

    playbackVideo.onended = () => {
        stopPlaybackRender();
        setButtonIcon(playButton, 'icon-triangle');
        setStatus('Playback finished.');
    };

    playbackVideo.onpause = () => {
        stopPlaybackRender();
    };

    recordButton.onclick = () => {
        if (isRecording) {
            stopRecording();
            return;
        }
        startRecording();
    };

    playButton.onclick = () => {
        togglePlayback();
    };

    saveVideoButton.onclick = async () => {
        if (!videoBlob) {
            setStatus('No video recording available to save.');
            return;
        }

        const filename = generateRandomFilename() + getFileExtension(videoBlob.type);

        if (navigator.share && navigator.canShare) {
            try {
                const file = new File([videoBlob], filename, { type: videoBlob.type });
                const shareData = {
                    files: [file]
                };

                if (navigator.canShare(shareData)) {
                    await navigator.share(shareData);
                    setStatus('Video share completed.', `Filename: ${filename}`);
                } else {
                    setStatus('Sharing not supported for this file type.');
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    setStatus('Video share failed.', `Error: ${error.message}`);
                }
            }
        } else {
            setStatus('Web Share API not available on this device.');
        }
    };

    saveAudioButton.onclick = async () => {
        if (!audioBlob) {
            setStatus('No recording available to save.');
            return;
        }

        const filename = generateRandomFilename() + getFileExtension(audioBlob.type);

        if (navigator.share && navigator.canShare) {
            try {
                const file = new File([audioBlob], filename, { type: audioBlob.type });
                const shareData = {
                    files: [file]
                };

                if (navigator.canShare(shareData)) {
                    await navigator.share(shareData);
                    setStatus('Share completed.', `Filename: ${filename}`);
                } else {
                    setStatus('Sharing not supported for this file type.');
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    setStatus('Share failed.', `Error: ${error.message}`);
                }
            }
        } else {
            setStatus('Web Share API not available on this device.');
        }
    };

    playButton.disabled = true;
    saveVideoButton.disabled = true;
    saveAudioButton.disabled = true;

    showBrowserCapabilities();
});
