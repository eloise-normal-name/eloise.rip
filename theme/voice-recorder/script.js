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
    BAR_COLOR_FILLED_START: '#f5a5b8',   // Light pink gradient start
    BAR_COLOR_FILLED_END: '#d19fb8',     // Darker pink gradient end
    BAR_COLOR_EMPTY_START: '#e8e8e8',    // Light grey gradient start
    BAR_COLOR_EMPTY_END: '#cccccc',      // Darker grey gradient end
    BAR_GLOW_COLOR: '#f5a5b8',           // Glow color for filled bars
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

    const saveToPhotosBtn = document.getElementById('saveToPhotosBtn');
    if (saveToPhotosBtn) {
        saveToPhotosBtn.addEventListener('click', saveToPhotos);
    }

    // Initialize audio context
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();

    updateStatus();
});

// ============================================================================
// Recording Control
// ============================================================================

async function startRecording() {
    try {
        // Choose a getUserMedia implementation (modern + legacy fallback for older iOS)
        let getUserMediaFn = null;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            getUserMediaFn = (opts) => navigator.mediaDevices.getUserMedia(opts);
        } else if (navigator.getUserMedia || navigator.webkitGetUserMedia) {
            // Legacy callback-style API
            getUserMediaFn = (opts) => new Promise((resolve, reject) => {
                const fn = navigator.getUserMedia || navigator.webkitGetUserMedia;
                fn.call(navigator, opts, resolve, reject);
            });
        } else {
            // iOS-specific hint
            const isiOS = /iP(hone|od|ad)/i.test(navigator.userAgent);
            const suggestion = isiOS ? 'On iOS, try Safari (latest) and ensure the site is served over HTTPS.' : 'Use a browser that supports getUserMedia (latest Chrome, Edge, or Safari).';
            updateStatus('Microphone not supported by this browser. ' + suggestion);
            return;
        }

        // If Permissions API is available, check microphone permission state first
        try {
            if (navigator.permissions && navigator.permissions.query) {
                const perm = await navigator.permissions.query({ name: 'microphone' });
                if (perm && perm.state === 'denied') {
                    updateStatus('Microphone permission is denied in your browser. Please enable it in site settings.');
                    return;
                }
            }
        } catch (permErr) {
            // Some browsers don't support permissions.query for 'microphone' — ignore
            console.debug('Permissions API not available for microphone:', permErr);
        }

        state.stream = await getUserMediaFn({ audio: true });

        // Ensure AudioContext is resumed on a user gesture (some browsers start suspended)
        if (state.audioContext && state.audioContext.state === 'suspended') {
            try {
                await state.audioContext.resume();
            } catch (e) {
                console.warn('Failed to resume audio context:', e);
            }
        }

        // Create MediaRecorder with a safe fallback for unsupported mimeTypes (e.g., iOS Safari)
        try {
            state.mediaRecorder = new MediaRecorder(state.stream, { mimeType: 'audio/webm' });
        } catch (e) {
            console.warn('Preferred mimeType unsupported, falling back to default MediaRecorder:', e);
            try {
                state.mediaRecorder = new MediaRecorder(state.stream);
            } catch (err2) {
                console.error('MediaRecorder is not supported on this browser or stream:', err2);
                throw err2; // Let outer catch handle the user-visible error
            }
        }

        // Ensure AudioContext exists and is resumed
        if (!state.audioContext) {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (state.audioContext.state === 'suspended') {
            try { await state.audioContext.resume(); } catch (e) { console.warn('Could not resume AudioContext:', e); }
        }

        // Set up audio analysis to capture frequency data, with robust error handling
        let audioSource;
        try {
            audioSource = state.audioContext.createMediaStreamSource(state.stream);
        } catch (e) {
            console.error('Failed to create media stream source:', e);
            // Stop tracks to avoid dangling permissions/streams
            if (state.stream && state.stream.getTracks) state.stream.getTracks().forEach(t => t.stop());
            updateStatus('Microphone initialization failed. Check device permissions and that no other app is using the microphone.');
            return;
        }
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
        let msg = 'Could not access microphone';
        if (err && err.name) {
            switch (err.name) {
                case 'NotAllowedError':
                case 'PermissionDeniedError':
                    msg = 'Microphone permission denied. Please allow microphone access in your browser or site settings.';
                    break;
                case 'NotFoundError':
                case 'DevicesNotFoundError':
                    msg = 'No microphone found. Check your system device settings.';
                    break;
                case 'NotReadableError':
                case 'TrackStartError':
                    msg = 'Microphone is already in use by another application.';
                    break;
                case 'SecurityError':
                    msg = 'Microphone access unavailable: site may require HTTPS.';
                    break;
                default:
                    msg = `Could not access microphone: ${err.message || err.name}`;
            }
        } else if (err && err.message) {
            msg = `Could not access microphone: ${err.message}`;
        }
        updateStatus(msg);
    }
}

function stopRecording() {
    if (!state.isRecording) return;

    // Calculate final duration before stopping
    const finalTime = (Date.now() - state.startTime) / 1000;
    state.recordedDuration = finalTime;
    
    state.isRecording = false;
    state.mediaRecorder.stop();

    // Stop all audio tracks
    state.stream.getTracks().forEach(track => track.stop());

    // Render final frame with all bars (progress = 1.0 to show all bars)
    const canvas = document.getElementById('recordingCanvas');
    const ctx = canvas.getContext('2d');
    const finalFrameCount = state.audioData.length - 1;
    drawProgressBars(ctx, canvas, 1.0, finalFrameCount);

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
        // Background is drawn by drawProgressBars
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

    // Draw stylized background with subtle gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, '#fafafa');
    bgGradient.addColorStop(1, '#f5f5f5');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw center line
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

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
                audioIntensity = Math.max(0.08, Math.pow(Math.min(1.0, state.audioData[barFrameIndex] * 1.1), 2));
            }
        }
        
        // Draw bar with height based on audio intensity, vertically centered
        const maxBarHeight = canvas.height - 20;
        const barHeight = maxBarHeight * audioIntensity;
        const barY = (canvas.height - barHeight) / 2;  // Center vertically
        const barPadding = Math.max(1, barWidth * 0.15);  // 15% padding

        // Add glow effect for filled bars with color varying by height
        if (isFilled) {
            ctx.shadowBlur = 8 + (audioIntensity * 3);  // Slightly stronger glow for taller bars
            // Use theme colors: primary (#ff6b9d pink), accent (#74c0fc blue)
            // Subtle blend from blue to pink based on intensity (50% less range)
            const r = Math.round(116 + (audioIntensity * 70));   // 116 → 186 (was 255)
            const g = Math.round(192 - (audioIntensity * 43));   // 192 → 149 (was 107)
            const b = Math.round(252 - (audioIntensity * 48));   // 252 → 204 (was 157)
            ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
        } else {
            ctx.shadowBlur = 0;
        }

        // Create vertical gradient for bar with theme colors (subtle variation)
        const gradient = ctx.createLinearGradient(x, barY, x, barY + barHeight);
        if (isFilled) {
            // Subtle blend from blue (#74c0fc) toward pink (#ff6b9d) based on intensity
            const blend = audioIntensity * 0.6;  // Reduced from full range to 60%
            const baseR = 116, baseG = 192, baseB = 252;  // Blue base
            const targetR = 255, targetG = 107, targetB = 157;  // Pink target
            
            // Calculate color with reduced blend amount
            const r = Math.round(baseR + (targetR - baseR) * blend);
            const g = Math.round(baseG + (targetG - baseG) * blend);
            const b = Math.round(baseB + (targetB - baseB) * blend);
            
            // Subtle vertical gradient
            gradient.addColorStop(0, `rgb(${Math.min(255, r + 10)}, ${Math.max(0, g - 5)}, ${Math.max(0, b - 5)})`);
            gradient.addColorStop(0.5, `rgb(${r}, ${g}, ${b})`);
            gradient.addColorStop(1, `rgb(${Math.max(0, r - 15)}, ${Math.max(0, g - 10)}, ${Math.max(0, b - 15)})`);
        } else {
            gradient.addColorStop(0, CONFIG.BAR_COLOR_EMPTY_START);
            gradient.addColorStop(1, CONFIG.BAR_COLOR_EMPTY_END);
        }
        
        ctx.fillStyle = gradient;
        
        // Draw rounded rectangle
        const barX = x + barPadding;
        const barWidthAdjusted = barWidth - (barPadding * 2);
        const radius = Math.min(2, barWidthAdjusted / 2);
        
        ctx.beginPath();
        ctx.moveTo(barX + radius, barY);
        ctx.lineTo(barX + barWidthAdjusted - radius, barY);
        ctx.quadraticCurveTo(barX + barWidthAdjusted, barY, barX + barWidthAdjusted, barY + radius);
        ctx.lineTo(barX + barWidthAdjusted, barY + barHeight - radius);
        ctx.quadraticCurveTo(barX + barWidthAdjusted, barY + barHeight, barX + barWidthAdjusted - radius, barY + barHeight);
        ctx.lineTo(barX + radius, barY + barHeight);
        ctx.quadraticCurveTo(barX, barY + barHeight, barX, barY + barHeight - radius);
        ctx.lineTo(barX, barY + radius);
        ctx.quadraticCurveTo(barX, barY, barX + radius, barY);
        ctx.closePath();
        ctx.fill();
        
        // Reset shadow
        ctx.shadowBlur = 0;
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
    updateStatus('Generating video (preferring MP4 for compatibility)...');

    try {
        const canvas = document.getElementById('recordingCanvas');
        const { blob, mimeType } = await encodeCanvasVideo(canvas, true);
        state.lastVideoBlob = blob;
        state.lastVideoMime = mimeType;
        const ext = mimeType && mimeType.includes('mp4') ? 'mp4' : 'webm';
        downloadBlob(blob, `voice-recording.${ext}`);
        const saveBtn = document.getElementById('saveToPhotosBtn');
        if (saveBtn) saveBtn.disabled = false;
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

async function encodeCanvasVideo(canvas, preferMp4 = true) {
    const stream = canvas.captureStream(CONFIG.FRAME_RATE);
    const duration = state.recordedDuration;

    // Create audio destination and play buffer
    const audioDestination = state.audioContext.createMediaStreamDestination();
    const audioSource = state.audioContext.createBufferSource();
    audioSource.buffer = state.audioBuffer;
    audioSource.connect(audioDestination);

    // Add audio track to video stream
    stream.addTrack(audioDestination.stream.getAudioTracks()[0]);

    // Determine best mime type (prefer MP4 for iOS/Windows compatibility)
    const candidates = [
        'video/mp4;codecs="avc1.42E01E, mp4a.40.2"',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
    ];
    let chosenMime = '';
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        if (preferMp4) {
            for (const t of candidates) {
                if (MediaRecorder.isTypeSupported(t)) {
                    chosenMime = t;
                    break;
                }
            }
        } else {
            // prefer webm
            for (let i = candidates.length - 1; i >= 0; i--) {
                if (MediaRecorder.isTypeSupported(candidates[i])) {
                    chosenMime = candidates[i];
                    break;
                }
            }
        }
    }

    return new Promise((resolve, reject) => {
        let mediaRecorder;
        try {
            if (chosenMime) {
                mediaRecorder = new MediaRecorder(stream, { mimeType: chosenMime });
            } else {
                mediaRecorder = new MediaRecorder(stream);
            }
        } catch (err) {
            console.warn('Failed to construct MediaRecorder with mime', chosenMime, err);
            try { mediaRecorder = new MediaRecorder(stream); } catch (err2) { reject(err2); return; }
        }

        const chunks = [];
        mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: chosenMime || (chunks[0] && chunks[0].type) || 'video/webm' });
            resolve({ blob, mimeType: blob.type || chosenMime });
        };

        mediaRecorder.start();

        // Render canvas animation synchronized with audio using performance.now()
        const ctx = canvas.getContext('2d');
        let frameCount = 0;
        let startTime = null;

        const renderFrame = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const elapsed = (timestamp - startTime) / 1000;  // Convert to seconds
            const progress = Math.min(elapsed / duration, 1.0);

            drawProgressBars(ctx, canvas, progress, frameCount);

            frameCount++;

            if (elapsed < duration + 0.1) {  // Add 0.1s buffer to prevent early truncation
                requestAnimationFrame(renderFrame);
            } else {
                // Stop recording after duration complete
                setTimeout(() => {
                    try { mediaRecorder.stop(); } catch (e) { console.warn(e); }
                    stream.getTracks().forEach(track => track.stop());
                    try { audioSource.stop(); } catch (e) { /* ignore */ }
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
            
            drawProgressBars(ctx, canvas, progress, frameCount);

            frameCount++;

            if (elapsed < duration) {
                requestAnimationFrame(renderFrame);
            } else {
                audioSource.stop();
                resolve();
            }
        };

        // Share video blob to iOS Photos via Web Share API (best-effort)
        async function shareBlobToIOS(blob, filename) {
            if (!blob) {
                updateStatus('No video available to share');
                return false;
            }
            // Wrap blob in File for Web Share API
            const file = new File([blob], filename, { type: blob.type || 'video/webm' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({ files: [file], title: 'Voice Recording', text: 'Save to Photos' });
                    updateStatus('Opened share sheet — choose Save Video to add to Photos.');
                    return true;
                } catch (err) {
                    console.warn('Share failed or cancelled', err);
                    updateStatus('Share cancelled or failed');
                    return false;
                }
            } else {
                // Fallback: open file in a new tab (mobile Safari allows Share → Save Video)
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                updateStatus('Opened file. Use Share → Save Video to add to Photos.');
                setTimeout(() => URL.revokeObjectURL(url), 10000);
                return false;
            }
        }

        async function saveToPhotos() {
            updateStatus('Preparing to save to Photos...');
            // If we already have a generated video, use it; otherwise generate one (prefer MP4)
            if (!state.lastVideoBlob) {
                const canvas = document.getElementById('recordingCanvas');
                try {
                    const { blob, mimeType } = await encodeCanvasVideo(canvas, true);
                    state.lastVideoBlob = blob;
                    state.lastVideoMime = mimeType;
                } catch (err) {
                    console.error('Error creating video for sharing:', err);
                    updateStatus('Error preparing video');
                    return;
                }
            }
            const ext = (state.lastVideoBlob && state.lastVideoBlob.type && state.lastVideoBlob.type.includes('mp4')) || (state.lastVideoMime && state.lastVideoMime.includes('mp4')) ? 'mp4' : 'webm';
            await shareBlobToIOS(state.lastVideoBlob, `voice-recording.${ext}`);
        }

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
