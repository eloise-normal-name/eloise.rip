// Voice Recorder - 60fps animation with configurable bars, silence trimming, and video export

// ============================================================================
// Configuration Constants
// ============================================================================

const CONFIG = {
    MAX_DURATION: 10.0,        // seconds
    FRAME_RATE: 60,            // fps
    SILENCE_THRESHOLD: -40,    // dB
    SILENCE_WINDOW: 0.1,       // seconds (100ms)
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 200,
    BAR_COLOR_FILLED: '#d19fb8',
    BAR_COLOR_EMPTY: '#cccccc',
};

// ============================================================================
// State Management
// ============================================================================

let state = {
    isRecording: false,
    recordedBlob: null,
    audioContext: null,
    mediaRecorder: null,
    stream: null,
    startTime: null,
    elapsedTime: 0,
    barMode: 'finite',
    barCount: 20,
    barUnit: 0.5,
    trimEnabled: true,
    trimmedDuration: null,
    trimmedAudioBuffer: null,
    originalDuration: null,
    audioAnalyser: null,
    audioData: [],  // Store frequency data indexed by frame
    analyserNode: null,
};

// ============================================================================
// DOM Elements & Event Listeners
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    const recordBtn = document.getElementById('recordBtn');
    const stopBtn = document.getElementById('stopBtn');
    const previewBtn = document.getElementById('previewBtn');
    const trimToggle = document.getElementById('trimToggle');
    const barCountInput = document.getElementById('barCount');
    const barUnitInput = document.getElementById('barUnit');
    const modeRadios = document.querySelectorAll('input[name="barMode"]');
    const downloadVideoBtn = document.getElementById('downloadVideoBtn');
    const downloadAudioBtn = document.getElementById('downloadAudioBtn');

    recordBtn.addEventListener('click', startRecording);
    stopBtn.addEventListener('click', stopRecording);
    previewBtn.addEventListener('click', previewVideo);
    trimToggle.addEventListener('change', (e) => {
        state.trimEnabled = e.target.checked;
        updateStatus();
    });

    barCountInput.addEventListener('change', (e) => {
        state.barCount = parseInt(e.target.value) || 20;
    });

    barUnitInput.addEventListener('change', (e) => {
        state.barUnit = parseFloat(e.target.value) || 0.5;
    });

    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.barMode = e.target.value;
            barCountInput.disabled = state.barMode !== 'finite';
            barUnitInput.disabled = state.barMode !== 'varying';
            updateStatus();
        });
    });

    downloadVideoBtn.addEventListener('click', generateVideo);
    downloadAudioBtn.addEventListener('click', downloadAudio);

    // Initialize audio context
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();

    updateStatus();
});

// ============================================================================
// Recording Control
// ============================================================================

async function startRecording() {
    try {
        state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.mediaRecorder = new MediaRecorder(state.stream, {
            mimeType: 'audio/webm'
        });

        // Set up audio analysis to capture frequency data
        const audioSource = state.audioContext.createMediaStreamSource(state.stream);
        state.analyserNode = state.audioContext.createAnalyser();
        state.analyserNode.fftSize = 256;
        audioSource.connect(state.analyserNode);

        const audioChunks = [];
        state.mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        state.mediaRecorder.onstop = async () => {
            state.recordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
            state.originalDuration = CONFIG.MAX_DURATION;
            await processRecording();
        };

        state.mediaRecorder.start();
        state.isRecording = true;
        state.startTime = Date.now();
        state.audioData = [];  // Reset audio data

        document.getElementById('recordBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;

        // Auto-stop after 10 seconds
        setTimeout(() => {
            if (state.isRecording) stopRecording();
        }, CONFIG.MAX_DURATION * 1000);

        startCanvasAnimation();
        updateStatus();

    } catch (err) {
        console.error('Error accessing microphone:', err);
        updateStatus('Error: Could not access microphone');
    }
}

function stopRecording() {
    if (!state.isRecording) return;

    state.isRecording = false;
    state.mediaRecorder.stop();

    // Stop all audio tracks
    state.stream.getTracks().forEach(track => track.stop());

    document.getElementById('recordBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
}

// ============================================================================
// Canvas Animation (60fps)
// ============================================================================

function startCanvasAnimation() {
    const canvas = document.getElementById('recordingCanvas');
    const ctx = canvas.getContext('2d');
    let animationId = null;
    let frameCount = 0;

    function drawBars() {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!state.isRecording) {
            return;
        }

        state.elapsedTime = (Date.now() - state.startTime) / 1000;
        const progress = Math.min(state.elapsedTime / CONFIG.MAX_DURATION, 1.0);

        // Capture audio frequency data
        if (state.analyserNode) {
            const dataArray = new Uint8Array(state.analyserNode.frequencyBinCount);
            state.analyserNode.getByteFrequencyData(dataArray);
            const avgFreq = dataArray.reduce((a, b) => a + b) / dataArray.length / 255;
            state.audioData[frameCount] = avgFreq;
        }

        drawProgressBars(ctx, canvas, progress, frameCount);
        frameCount++;
        animationId = requestAnimationFrame(drawBars);
    }

    drawBars();

    // Cleanup when recording stops
    const checkStop = setInterval(() => {
        if (!state.isRecording) {
            clearInterval(checkStop);
            cancelAnimationFrame(animationId);
        }
    }, 100);
}

function drawProgressBars(ctx, canvas, progress, frameCount = 0) {
    const barCount = state.barMode === 'finite' ? state.barCount : 20;
    const barWidth = canvas.width / barCount;
    const filledBars = Math.floor(progress * barCount);

    for (let i = 0; i < barCount; i++) {
        const x = i * barWidth;
        const isFilled = i < filledBars;
        
        // Get audio intensity for this bar (normalized 0-1)
        let audioIntensity = 0.5;  // Default middle height
        if (state.audioData.length > 0) {
            const framePerBar = Math.max(1, Math.floor(state.audioData.length / barCount));
            const barFrameIndex = Math.floor(i * framePerBar);
            if (barFrameIndex < state.audioData.length) {
                audioIntensity = Math.max(0.2, state.audioData[barFrameIndex]);
            }
        }

        ctx.fillStyle = isFilled ? CONFIG.BAR_COLOR_FILLED : CONFIG.BAR_COLOR_EMPTY;
        
        // Draw bar with height based on audio intensity
        const barHeight = (canvas.height - 20) * audioIntensity;
        const barY = canvas.height - 10 - barHeight;
        ctx.fillRect(x + 2, barY, barWidth - 4, barHeight);

        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2, barY, barWidth - 4, barHeight);
    }
}

// ============================================================================
// Recording Processing
// ============================================================================

async function processRecording() {
    updateStatus('Processing audio...');

    try {
        const arrayBuffer = await state.recordedBlob.arrayBuffer();
        const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);

        if (state.trimEnabled) {
            await trimSilence(audioBuffer);
        } else {
            state.trimmedAudioBuffer = audioBuffer;
            state.trimmedDuration = state.originalDuration;
        }

        enableDownloadButtons();
        updateStatus();

    } catch (err) {
        console.error('Error processing recording:', err);
        updateStatus('Error processing audio');
    }
}

async function trimSilence(audioBuffer) {
    updateStatus('Trimming silence...');

    const sampleRate = audioBuffer.sampleRate;
    const windowSize = Math.floor(sampleRate * CONFIG.SILENCE_WINDOW);
    const channelData = audioBuffer.getChannelData(0);

    // Find silence windows
    let windows = [];
    for (let i = 0; i < channelData.length; i += windowSize) {
        const chunk = channelData.slice(i, i + windowSize);
        const rms = Math.sqrt(chunk.reduce((sum, val) => sum + val * val, 0) / chunk.length);
        const db = 20 * Math.log10(rms || 0.0001);
        windows.push({ index: i, db });
    }

    // Find first and last non-silent windows
    let startWindow = 0;
    let endWindow = windows.length - 1;

    for (let i = 0; i < windows.length; i++) {
        if (windows[i].db > CONFIG.SILENCE_THRESHOLD) {
            startWindow = Math.max(0, i - 1);
            break;
        }
    }

    for (let i = windows.length - 1; i >= 0; i--) {
        if (windows[i].db > CONFIG.SILENCE_THRESHOLD) {
            endWindow = Math.min(windows.length - 1, i + 1);
            break;
        }
    }

    const startSample = startWindow * windowSize;
    const endSample = Math.min((endWindow + 1) * windowSize, channelData.length);

    // Ensure minimum length of 1 second
    if ((endSample - startSample) / sampleRate < 1.0) {
        state.trimmedAudioBuffer = audioBuffer;
        state.trimmedDuration = state.originalDuration;
        updateStatus('Recording too short, using full audio');
        return;
    }

    // Create trimmed buffer
    const trimmedLength = endSample - startSample;
    const trimmedBuffer = state.audioContext.createBuffer(
        audioBuffer.numberOfChannels,
        trimmedLength,
        sampleRate
    );

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const source = audioBuffer.getChannelData(ch);
        const target = trimmedBuffer.getChannelData(ch);
        target.set(source.slice(startSample, endSample));
    }

    state.trimmedAudioBuffer = trimmedBuffer;
    state.trimmedDuration = trimmedLength / sampleRate;
}

function enableDownloadButtons() {
    document.getElementById('downloadVideoBtn').disabled = false;
    document.getElementById('downloadAudioBtn').disabled = false;
    document.getElementById('previewBtn').disabled = false;
}

// ============================================================================
// Video Generation
// ============================================================================

async function generateVideo() {
    const downloadVideoBtn = document.getElementById('downloadVideoBtn');
    downloadVideoBtn.disabled = true;
    updateStatus('Generating video...');

    try {
        const canvas = document.getElementById('recordingCanvas');
        const video = await encodeCanvasVideo(canvas, false);
        downloadBlob(video, 'voice-recording.webm');
        updateStatus();
        downloadVideoBtn.disabled = false;

    } catch (err) {
        console.error('Error generating video:', err);
        updateStatus('Error generating video');
        downloadVideoBtn.disabled = false;
    }
}

async function previewVideo() {
    const previewBtn = document.getElementById('previewBtn');
    previewBtn.disabled = true;
    updateStatus('Playing preview...');

    try {
        const canvas = document.getElementById('recordingCanvas');
        await playCanvasVideo(canvas);
        updateStatus();
        previewBtn.disabled = false;

    } catch (err) {
        console.error('Error playing preview:', err);
        updateStatus('Error playing preview');
        previewBtn.disabled = false;
    }
}

async function encodeCanvasVideo(canvas) {
    const stream = canvas.captureStream(CONFIG.FRAME_RATE);
    const duration = state.trimmedDuration;

    // Create audio destination and play trimmed buffer
    const audioDestination = state.audioContext.createMediaStreamDestination();
    const audioSource = state.audioContext.createBufferSource();
    audioSource.buffer = state.trimmedAudioBuffer;
    audioSource.connect(audioDestination);

    // Add audio track to video stream
    stream.addTrack(audioDestination.stream.getAudioTracks()[0]);

    return new Promise((resolve) => {
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm'
        });

        const chunks = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
            resolve(new Blob(chunks, { type: 'video/webm' }));
        };

        mediaRecorder.start();

        // Render canvas animation synchronized with audio
        const ctx = canvas.getContext('2d');
        const frameDuration = 1 / CONFIG.FRAME_RATE;
        let currentTime = 0;
        let frameCount = 0;
        const totalFrames = Math.ceil(duration * CONFIG.FRAME_RATE);

        const renderFrame = () => {
            const progress = currentTime / duration;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawProgressBars(ctx, canvas, Math.min(progress, 1.0), frameCount);

            frameCount++;
            currentTime += frameDuration;

            if (frameCount < totalFrames) {
                requestAnimationFrame(renderFrame);
            } else {
                // Stop recording after all frames rendered
                setTimeout(() => {
                    mediaRecorder.stop();
                    stream.getTracks().forEach(track => track.stop());
                    audioSource.stop();
                }, 100);
            }
        };

        // Start audio and canvas animation together
        audioSource.start(0);
        renderFrame();
    });
}

async function playCanvasVideo(canvas) {
    const duration = state.trimmedDuration;

    // Create audio destination and play trimmed buffer
    const audioDestination = state.audioContext.createMediaStreamDestination();
    const audioSource = state.audioContext.createBufferSource();
    audioSource.buffer = state.trimmedAudioBuffer;
    audioSource.connect(audioDestination);
    audioSource.connect(state.audioContext.destination);  // Also connect to speakers

    // Render canvas animation synchronized with audio
    const ctx = canvas.getContext('2d');
    const frameDuration = 1 / CONFIG.FRAME_RATE;
    let currentTime = 0;
    let frameCount = 0;
    const totalFrames = Math.ceil(duration * CONFIG.FRAME_RATE);

    return new Promise((resolve) => {
        const renderFrame = () => {
            const progress = currentTime / duration;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawProgressBars(ctx, canvas, Math.min(progress, 1.0), frameCount);

            frameCount++;
            currentTime += frameDuration;

            if (frameCount < totalFrames) {
                requestAnimationFrame(renderFrame);
            } else {
                audioSource.stop();
                resolve();
            }
        };

        // Start audio and canvas animation together
        audioSource.start(0);
        renderFrame();
    });
}

// ============================================================================
// Audio Download
// ============================================================================

function downloadAudio() {
    if (!state.recordedBlob) return;
    downloadBlob(state.recordedBlob, 'voice-recording.webm');
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============================================================================
// Status Updates
// ============================================================================

function updateStatus(text) {
    const statusText = document.getElementById('statusText');

    if (text) {
        statusText.textContent = text;
        return;
    }

    if (state.isRecording) {
        statusText.textContent = `Recording: ${state.elapsedTime.toFixed(1)}s / ${CONFIG.MAX_DURATION}s`;
    } else if (state.trimmedAudioBuffer) {
        if (state.trimEnabled && state.trimmedDuration < state.originalDuration) {
            statusText.textContent = `Recorded: ${state.originalDuration.toFixed(1)}s → Trimmed: ${state.trimmedDuration.toFixed(1)}s`;
        } else {
            statusText.textContent = `Recorded: ${state.originalDuration.toFixed(1)}s`;
        }
    } else {
        statusText.textContent = 'Ready';
    }
}
