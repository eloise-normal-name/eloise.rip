// Voice Recorder - 60fps animation with configurable bars, silence trimming, and video export

// ============================================================================
// Configuration Constants
// ============================================================================

const CONFIG = {
    MAX_DURATION: 60.0,        // seconds
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
    barUnit: 0.05,  // Fixed at 0.05 seconds per bar
    recordedDuration: null,
    audioBuffer: null,
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
    const downloadVideoBtn = document.getElementById('downloadVideoBtn');
    const downloadAudioBtn = document.getElementById('downloadAudioBtn');

    recordBtn.addEventListener('click', startRecording);
    stopBtn.addEventListener('click', stopRecording);
    previewBtn.addEventListener('click', previewVideo);

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
            state.recordedDuration = state.elapsedTime;
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
            // Use RMS for better amplitude representation
            const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + val * val, 0) / dataArray.length);
            const normalized = Math.min(1.0, rms / 128);  // Normalize to 0-1 range
            state.audioData[frameCount] = normalized;
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
    // Calculate bar count based on duration and bar unit (0.05s per bar)
    // During recording: use elapsed time (normalize to current recording length)
    // During playback: use full recorded duration
    const duration = state.isRecording 
        ? state.elapsedTime 
        : (state.recordedDuration || CONFIG.MAX_DURATION);
    const barCount = Math.max(5, Math.floor(duration / state.barUnit));
    
    const barWidth = canvas.width / barCount;
    
    // Progress determines how far through the bars we are (0.0 to 1.0)
    const progressPosition = progress * barCount;

    for (let i = 0; i < barCount; i++) {
        const x = i * barWidth;
        
        // Bar is filled if it's before the progress position
        const isFilled = i < progressPosition;
        
        // Get audio intensity for this bar (normalized 0-1)
        let audioIntensity = 0.1;  // Default minimal height
        if (state.audioData.length > 0) {
            const framePerBar = Math.max(1, Math.floor(state.audioData.length / barCount));
            const barFrameIndex = Math.floor(i * framePerBar);
            if (barFrameIndex < state.audioData.length) {
                // Use actual audio intensity, amplify it for visibility
                audioIntensity = Math.max(0.05, Math.min(1.0, state.audioData[barFrameIndex] * 1.5));
            }
        }

        ctx.fillStyle = isFilled ? CONFIG.BAR_COLOR_FILLED : CONFIG.BAR_COLOR_EMPTY;
        
        // Draw bar with height based on audio intensity, vertically centered
        const maxBarHeight = canvas.height - 20;
        const barHeight = maxBarHeight * audioIntensity;
        const barY = (canvas.height - barHeight) / 2;  // Center vertically
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
        state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);

        enableDownloadButtons();
        updateStatus();

    } catch (err) {
        console.error('Error processing recording:', err);
        updateStatus('Error processing audio');
    }
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
    const duration = state.recordedDuration;

    // Create audio destination and play buffer
    const audioDestination = state.audioContext.createMediaStreamDestination();
    const audioSource = state.audioContext.createBufferSource();
    audioSource.buffer = state.audioBuffer;
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

        // Render canvas animation synchronized with audio using performance.now()
        const ctx = canvas.getContext('2d');
        const totalFrames = Math.ceil(duration * CONFIG.FRAME_RATE);
        let frameCount = 0;
        let startTime = null;

        const renderFrame = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const elapsed = (timestamp - startTime) / 1000;  // Convert to seconds
            const progress = Math.min(elapsed / duration, 1.0);
            
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawProgressBars(ctx, canvas, progress, frameCount);

            frameCount++;

            if (elapsed < duration) {
                requestAnimationFrame(renderFrame);
            } else {
                // Stop recording after duration complete
                setTimeout(() => {
                    mediaRecorder.stop();
                    stream.getTracks().forEach(track => track.stop());
                    audioSource.stop();
                }, 100);
            }
        };

        // Start audio and canvas animation together
        audioSource.start(0);
        requestAnimationFrame(renderFrame);
    });
}

async function playCanvasVideo(canvas) {
    const duration = state.recordedDuration;

    // Create audio destination and play buffer
    const audioDestination = state.audioContext.createMediaStreamDestination();
    const audioSource = state.audioContext.createBufferSource();
    audioSource.buffer = state.audioBuffer;
    audioSource.connect(audioDestination);
    audioSource.connect(state.audioContext.destination);  // Also connect to speakers

    // Render canvas animation synchronized with audio using performance.now()
    const ctx = canvas.getContext('2d');
    let frameCount = 0;
    let startTime = null;

    return new Promise((resolve) => {
        const renderFrame = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const elapsed = (timestamp - startTime) / 1000;  // Convert to seconds
            const progress = Math.min(elapsed / duration, 1.0);
            
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawProgressBars(ctx, canvas, progress, frameCount);

            frameCount++;

            if (elapsed < duration) {
                requestAnimationFrame(renderFrame);
            } else {
                audioSource.stop();
                resolve();
            }
        };

        // Start audio and canvas animation together
        audioSource.start(0);
        requestAnimationFrame(renderFrame);
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
    } else if (state.audioBuffer) {
        statusText.textContent = `Recorded: ${state.recordedDuration.toFixed(1)}s`;
    } else {
        statusText.textContent = 'Ready';
    }
}
