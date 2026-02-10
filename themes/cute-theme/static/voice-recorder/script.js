// Voice Recorder - 30fps animation with configurable bars, silence trimming, and video export

// ============================================================================
// Configuration Constants
// ============================================================================

const CONFIG = {
    MAX_DURATION: 60.0,        // seconds
    FRAME_RATE: 30,            // fps
    SILENCE_THRESHOLD: -40,    // dB
    SILENCE_WINDOW: 0.1,       // seconds (100ms)
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 200,
    SMOOTHING_ALPHA: 0.18,     // smoothing for audio values (0-1)
    BAR_COLOR_FILLED_START: '#f5a5b8',   // Light pink gradient start
    BAR_COLOR_FILLED_END: '#d19fb8',     // Darker pink gradient end
    BAR_COLOR_EMPTY_START: '#e8e8e8',    // Light grey gradient start
    BAR_COLOR_EMPTY_END: '#cccccc',      // Darker grey gradient end
    BAR_GLOW_COLOR: '#f5a5b8',           // Glow color for filled bars
};

// Platform detection
const IS_IOS = typeof navigator !== 'undefined' && (/iP(hone|od|ad)/.test(navigator.platform) || (navigator.userAgent && /iPad|iPhone|iPod/.test(navigator.userAgent)) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform)));



// ============================================================================
// DOM helpers
// ============================================================================

const els = {
    recordBtn: null,
    stopBtn: null,
    previewBtn: null,
    downloadVideoBtn: null,
    downloadAudioBtn: null,
    saveToPhotosBtn: null,
    exportHevcBtn: null,
    statusText: null,
    recordingCanvas: null,
};

function bindEls() {
    els.recordBtn = document.getElementById('recordBtn');
    els.stopBtn = document.getElementById('stopBtn');
    els.previewBtn = document.getElementById('previewBtn');
    els.downloadVideoBtn = document.getElementById('downloadVideoBtn');
    els.downloadAudioBtn = document.getElementById('downloadAudioBtn');
    els.saveToPhotosBtn = document.getElementById('saveToPhotosBtn');
    els.exportHevcBtn = document.getElementById('exportHevcBtn');
    els.statusText = document.getElementById('statusText');
    els.recordingCanvas = document.getElementById('recordingCanvas');
}


// ============================================================================
// State Management
// ============================================================================

// Global state
const state = {
    isRecording: false,
    stream: null,
    mediaRecorder: null,
    audioContext: null,
    recordedBlob: null,
    startTime: null,
    elapsedTime: 0,
    animationId: null,
    timer: null,
    lastVideoMime: null,
    recordedDuration: null,
    audioBuffer: null,
    audioAnalyser: null,
    audioData: [],  // Store frequency data indexed by frame
    analyserNode: null,
    streamInitialized: false, // Track if we've already requested permissions
    barUnit: 0.05,  // Fixed at 0.05 seconds per bar
    stopCheckIntervalId: null,
};

// ============================================================================
// DOM Elements & Event Listeners
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    bindEls();

    // Update button text based on platform
    if (IS_IOS && els.downloadVideoBtn) {
        els.downloadVideoBtn.textContent = 'Save to Photos';
    }

    if (els.recordBtn) els.recordBtn.addEventListener('click', startRecording);
    if (els.stopBtn) els.stopBtn.addEventListener('click', stopRecording);
    if (els.previewBtn) els.previewBtn.addEventListener('click', previewVideo);
    if (els.downloadVideoBtn) els.downloadVideoBtn.addEventListener('click', generateVideo);
    if (els.downloadAudioBtn) els.downloadAudioBtn.addEventListener('click', downloadAudio);

    if (els.saveToPhotosBtn) {
        els.saveToPhotosBtn.addEventListener('click', saveToPhotos);
    }

    if (els.exportHevcBtn) {
        els.exportHevcBtn.addEventListener('click', exportHevcMov);
    }

    // Initialize audio context
    if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Configure canvas for devicePixelRatio to avoid flicker/aliasing on Retina displays
    function configureCanvas() {
        const canvas = els.recordingCanvas;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        // Set logical canvas size (CSS width remains responsive)
        canvas.width = Math.round(CONFIG.CANVAS_WIDTH * dpr);
        canvas.height = Math.round(CONFIG.CANVAS_HEIGHT * dpr);
        canvas.style.width = `${Math.min(CONFIG.CANVAS_WIDTH, canvas.parentElement.clientWidth)}px`;
        canvas.style.height = `${CONFIG.CANVAS_HEIGHT}px`;
        const ctx = canvas.getContext('2d');
        // Scale drawing operations to account for DPR
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    configureCanvas();
    window.addEventListener('resize', configureCanvas);

    updateStatus();
});

// Cleanup function to properly release microphone when page unloads
function cleanupMicrophone() {
    if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
        state.stream = null;
        state.streamInitialized = false;
    }
    if (state.audioContext) {
        state.audioContext.close();
        state.audioContext = null;
    }
}

// Clean up when page unloads or user navigates away
window.addEventListener('beforeunload', cleanupMicrophone);
window.addEventListener('pagehide', cleanupMicrophone);

// ============================================================================
// Recording Control
// ============================================================================

async function startRecording() {
    try {
        // Basic feature checks
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            updateStatus('Microphone not supported by this browser');
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

        // Get microphone stream - reuse if already initialized
        if (!state.stream || !state.streamInitialized) {
            state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.streamInitialized = true;
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

        // Initialize smoothed audio buffer for stable rendering
        state.smoothedAudioData = [];

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

        els.recordBtn.disabled = true;
        els.stopBtn.disabled = false;

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

    // Don't stop tracks - keep stream active for next recording
    // Only stop if we're cleaning up completely
    // state.stream.getTracks().forEach(track => track.stop());

    // Render final frame with all bars (progress = 1.0 to show all bars)
    const canvas = els.recordingCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const finalFrameCount = state.audioData.length - 1;
    drawProgressBars(ctx, canvas, 1.0, finalFrameCount);

    els.recordBtn.disabled = false;
    els.stopBtn.disabled = true;
}

// ============================================================================
// Canvas Animation (30fps)
// ============================================================================

function startCanvasAnimation() {
    const canvas = els.recordingCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
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
        state.animationId = requestAnimationFrame(drawBars);
    }

    drawBars();

    // Cleanup when recording stops
    if (state.stopCheckIntervalId) {
        clearInterval(state.stopCheckIntervalId);
    }
    state.stopCheckIntervalId = setInterval(() => {
        if (!state.isRecording) {
            clearInterval(state.stopCheckIntervalId);
            state.stopCheckIntervalId = null;
            if (state.animationId) {
                cancelAnimationFrame(state.animationId);
                state.animationId = null;
            }
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
        let audioIntensity = 0.08;  // Default minimal height
        if (state.audioData.length > 0) {
            const framePerBar = Math.max(1, Math.floor(state.audioData.length / barCount));
            const barFrameIndex = Math.floor(i * framePerBar);
            if (barFrameIndex < state.audioData.length) {
                // Raw value scaled for visibility
                const raw = Math.min(1.0, state.audioData[barFrameIndex] * 1.1);
                // Apply gentle curve but keep dynamic range (avoid squaring which exaggerates small differences)
                const scaled = Math.max(0.05, raw);
                // Smooth abrupt changes to reduce flicker using exponential moving average
                const prev = state.smoothedAudioData[i] ?? scaled;
                const alpha = CONFIG.SMOOTHING_ALPHA ?? 0.18;
                audioIntensity = prev * (1 - alpha) + scaled * alpha;
                state.smoothedAudioData[i] = audioIntensity;
            }
        }

        // Draw bar with height based on audio intensity, vertically centered
        const maxBarHeight = canvas.height - 20;
        const barHeight = maxBarHeight * audioIntensity;
        const barY = (canvas.height - barHeight) / 2;  // Center vertically
        const barPadding = Math.max(1, barWidth * 0.15);  // 15% padding

        // Add glow effect for filled bars with color varying by height
        if (isFilled) {
            // Slightly reduced blur on iOS for performance/stability
            const blurBase = IS_IOS ? 5 : 8;
            const blurScale = IS_IOS ? (audioIntensity * 2) : (audioIntensity * 3);
            ctx.shadowBlur = blurBase + blurScale;

            // Subtle theme-based blend
            const blend = audioIntensity * 0.55;
            const baseR = 116, baseG = 192, baseB = 252;  // Blue base
            const targetR = 255, targetG = 107, targetB = 157;  // Pink target
            const r = Math.round(baseR + (targetR - baseR) * blend);
            const g = Math.round(baseG + (targetG - baseG) * blend);
            const b = Math.round(baseB + (targetB - baseB) * blend);
            ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.55)`;
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
    els.downloadVideoBtn.disabled = false;
    els.downloadAudioBtn.disabled = false;
    els.previewBtn.disabled = false;
    if (els.saveToPhotosBtn) els.saveToPhotosBtn.disabled = false;
    if (els.exportHevcBtn) els.exportHevcBtn.disabled = false;
}

// ============================================================================
// Video Generation
// ============================================================================

// Share video blob to iOS Photos via Web Share API (best-effort)
async function shareBlobToIOS(blob, filename) {
    if (!blob) {
        updateStatus('No video available to share');
        return false;
    }
    
    console.log('Attempting to share blob:', blob.size, 'bytes, type:', blob.type);
    
    // Wrap blob in File for Web Share API
    const file = new File([blob], filename, { type: blob.type || 'video/webm' });
    console.log('Created file:', file.name, file.size, file.type);
    
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            console.log('Using Web Share API...');
            await navigator.share({ 
                files: [file], 
                title: 'Voice Recording', 
                text: 'Save to Photos' 
            });
            updateStatus('Opened share sheet — choose Save Video to add to Photos.');
            return true;
        } catch (err) {
            console.warn('Share failed or cancelled:', err);
            if (err.name === 'AbortError') {
                updateStatus('Share cancelled by user');
            } else {
                updateStatus('Share failed: ' + err.message);
            }
            return false;
        }
    } else {
        console.log('Web Share API not available, using fallback...');
        // Fallback: open file in a new tab (mobile Safari allows Share → Save Video)
        const url = URL.createObjectURL(blob);
        console.log('Opening blob URL:', url);
        
        // For iOS, we need to be more explicit about the fallback
        if (IS_IOS) {
            updateStatus('Opening video in new tab. Use the Share button → Save Video.');
        } else {
            updateStatus('Opened file. Use Share → Save Video to add to Photos.');
        }
        
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return false;
    }
}

async function generateVideo() {
    const downloadVideoBtn = els.downloadVideoBtn;
    if (!downloadVideoBtn) return;
    downloadVideoBtn.disabled = true;
    updateStatus('Generating video (preferring MP4 for compatibility)...');
    console.log('Starting video generation...');

    try {
        const canvas = els.recordingCanvas;
        if (!canvas) {
            updateStatus('Canvas not found');
            downloadVideoBtn.disabled = false;
            return;
        }
        console.log('Canvas found, starting encoding...');
        const { blob, mimeType } = await encodeCanvasVideo(canvas, true);
        console.log('Video encoded successfully, blob size:', blob.size, 'type:', blob.type);
        
        state.lastVideoBlob = blob;
        state.lastVideoMime = mimeType;
        const ext = mimeType && mimeType.includes('mp4') ? 'mp4' : 'webm';
        
        // On iOS, use share functionality instead of download
        if (IS_IOS) {
            console.log('iOS detected, using share to save to Photos...');
            updateStatus('Preparing to save to Photos...');
            const success = await shareBlobToIOS(blob, `voice-recording.${ext}`);
            if (success) {
                updateStatus('Video saved to Photos successfully!');
            } else {
                updateStatus('Share cancelled - try again or use download button on desktop');
            }
        } else {
            console.log('Desktop detected, downloading video...');
            updateStatus('Downloading video...');
            downloadBlob(blob, `voice-recording.${ext}`);
            updateStatus('Video downloaded successfully!');
        }
        
        const saveBtn = els.saveToPhotosBtn;
        if (saveBtn) {
            saveBtn.disabled = false;
            console.log('Save to Photos button enabled');
        }
        
        downloadVideoBtn.disabled = false;

    } catch (err) {
        console.error('Error generating video:', err);
        updateStatus('Error generating video: ' + err.message);
        downloadVideoBtn.disabled = false;
    }
}

async function previewVideo() {
    const previewBtn = els.previewBtn;
    if (!previewBtn) return;
    previewBtn.disabled = true;
    updateStatus('Playing preview...');

    try {
        const canvas = els.recordingCanvas;
        if (!canvas) {
            updateStatus('Canvas not found');
            previewBtn.disabled = false;
            return;
        }
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

    // Try different codec configurations, starting with most compatible
    const codecCandidates = [
        'video/mp4;codecs="avc1.42E01E, mp4a.40.2"',  // H.264 Baseline + AAC
        'video/mp4;codecs="avc1.42E01E"',            // H.264 Baseline only
        'video/mp4',                                  // Generic MP4
        'video/webm;codecs="vp8, opus"',             // WebM VP8 + Opus
        'video/webm'                                  // Generic WebM
    ];

    return new Promise((resolve, reject) => {
        let mediaRecorder;
        let selectedMime = '';
        
        // Try each codec until one works
        for (const mime of codecCandidates) {
            try {
                if (MediaRecorder.isTypeSupported(mime)) {
                    mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
                    selectedMime = mime;
                    console.log('Using codec:', mime);
                    break;
                }
            } catch (err) {
                console.warn('Codec not supported:', mime, err);
                continue;
            }
        }

        // If no specific codec worked, try default
        if (!mediaRecorder) {
            try {
                mediaRecorder = new MediaRecorder(stream);
                selectedMime = mediaRecorder.mimeType || 'video/webm';
                console.log('Using default codec:', selectedMime);
            } catch (err) {
                console.error('Failed to create MediaRecorder with any codec', err);
                reject(err);
                return;
            }
        }

        const chunks = [];
        mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: selectedMime });
            resolve({ blob, mimeType: blob.type || selectedMime });
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

        // Start audio and canvas animation together
        audioSource.start(0);
        requestAnimationFrame(renderFrame);
    });
}

async function saveToPhotos() {
    updateStatus('Preparing to save to Photos...');

    console.log('iOS detected:', IS_IOS);
    console.log('Web Share API available:', !!navigator.share);
    console.log('Can share files:', navigator.canShare ? navigator.canShare({ files: [] }) : false);

    if (!state.lastVideoBlob) {
        console.log('No existing video blob, generating new one...');
        const canvas = els.recordingCanvas;
        try {
            updateStatus('Generating video for iOS...');
            const { blob, mimeType } = await encodeCanvasVideo(canvas, true);
            console.log('Video generated successfully, size:', blob.size, 'type:', blob.type);
            state.lastVideoBlob = blob;
            state.lastVideoMime = mimeType;
        } catch (err) {
            console.error('Error creating video for sharing:', err);
            updateStatus('Error: ' + err.message);
            return;
        }
    } else {
        console.log('Using existing video blob, size:', state.lastVideoBlob.size, 'type:', state.lastVideoBlob.type);
    }

    const ext = (state.lastVideoBlob && state.lastVideoBlob.type && state.lastVideoBlob.type.includes('mp4')) || (state.lastVideoMime && state.lastVideoMime.includes('mp4')) ? 'mp4' : 'webm';
    console.log('File extension determined as:', ext);

    try {
        const success = await shareBlobToIOS(state.lastVideoBlob, `voice-recording.${ext}`);
        if (!success) {
            updateStatus('Sharing failed - try downloading the video instead');
        }
    } catch (err) {
        console.error('Save to photos failed:', err);
        updateStatus('Error: ' + err.message);
    }
}

async function exportHevcMov() {
    updateStatus('Checking device support for HEVC + AAC...');

    if (typeof VideoEncoder === 'undefined' || !VideoEncoder.isConfigSupported) {
        updateStatus('HEVC (VideoEncoder) is not available in this browser.');
        return;
    }

    let hevcSupported = false;
    const hevcCandidates = ['hvc1', 'hev1', 'h265'];
    for (const c of hevcCandidates) {
        try {
            const ok = await VideoEncoder.isConfigSupported({ codec: c });
            if (ok && ok.supported) {
                hevcSupported = c;
                break;
            }
        } catch (e) {
        }
    }

    if (!hevcSupported) {
        updateStatus('HEVC hardware encoder not available on this device. Cannot export MOV with HEVC.');
        return;
    }

    let aacSupported = false;
    if (typeof AudioEncoder !== 'undefined' && AudioEncoder.isConfigSupported) {
        try {
            const ok = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2' });
            if (ok && ok.supported) aacSupported = true;
        } catch (e) {
        }
    }

    if (!aacSupported) {
        updateStatus('AAC audio encoder is not available in this browser. Cannot export MOV with AAC.');
        return;
    }

    updateStatus('HEVC + AAC supported. Encoding pipeline for HEVC+alpha is not yet implemented in this build. If you want, I can add the client-side encoder + small muxer to produce a MOV and save to Photos.');
}

// ============================================================================
// Audio Download
// ============================================================================

async function downloadAudio() {
    if (!state.recordedBlob) return;
    
    // Determine correct extension from MIME type
    const mimeType = state.recordedBlob.type || 'audio/webm';
    const ext = mimeType.split('/')[1]?.replace(/;.*$/, '') || 'webm';
    const filename = `voice-recording.${ext}`;
    
    // On iOS, use Web Share API for better compatibility
    if (IS_IOS && navigator.canShare && navigator.canShare({ files: [] })) {
        try {
            const file = new File([state.recordedBlob], filename, { type: mimeType });
            await navigator.share({ 
                files: [file], 
                title: 'Voice Recording', 
                text: 'Save audio' 
            });
            updateStatus('Audio shared successfully');
            return;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.warn('Share failed, falling back to download:', err);
            }
            // User cancelled or share failed - continue to fallback
        }
    }
    
    // Standard download for desktop or fallback
    downloadBlob(state.recordedBlob, filename);
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
    const statusText = els.statusText || document.getElementById('statusText');
    if (!statusText) return;

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
