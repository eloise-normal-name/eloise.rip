
document.addEventListener('DOMContentLoaded', () => {
  const recordBtn = document.getElementById('recordBtn');
  const playBtn = document.getElementById('playBtn');
  const saveVideoBtn = document.getElementById('saveVideoBtn');
  const saveAudioBtn = document.getElementById('saveAudioBtn');
  const debugMsg = document.getElementById('debugMsg');
  const recordingCanvas = document.getElementById('recordingCanvas');

  let isRecording = false;
  let mediaRecorder = null;
  let mediaStream = null;
  let audioChunks = [];
  let audioUrl = null;
  let audioPlayer = null;
  let audioContext = null;
  let analyser = null;
  let visualizer = null;
  let animationId = null;

  const preferredTypes = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm'
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

  const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour12: false });
  };

  const setStatus = (message, details = null) => {
    const timestamp = `[${getTimestamp()}] `;
    let output = timestamp + message;
    if (details) {
      output += '\n' + details;
    }
    debugMsg.textContent = output;
  };

  const showBrowserCapabilities = () => {
    const lines = [];
    lines.push('=== BROWSER CAPABILITIES ===');
    
    // Check MediaDevices API
    const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    lines.push(`getUserMedia: ${hasMediaDevices ? '✓' : '✗'}`);
    
    // Check MediaRecorder API
    const hasMediaRecorder = !!window.MediaRecorder;
    lines.push(`MediaRecorder: ${hasMediaRecorder ? '✓' : '✗'}`);
    
    // Check AudioContext
    const hasAudioContext = !!(window.AudioContext || window.webkitAudioContext);
    lines.push(`AudioContext: ${hasAudioContext ? '✓' : '✗'}`);
    
    // List supported MIME types
    if (hasMediaRecorder && MediaRecorder.isTypeSupported) {
      lines.push('\nSupported MIME types:');
      for (const type of preferredTypes) {
        const supported = MediaRecorder.isTypeSupported(type);
        lines.push(`  ${type}: ${supported ? '✓' : '✗'}`);
      }
    }
    
    // Browser info
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
        'Missing: ' + (!navigator.mediaDevices ? 'MediaDevices' : !window.MediaRecorder ? 'MediaRecorder' : 'getUserMedia'));
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
      const audioBlob = new Blob(audioChunks, { type: blobType });
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      audioUrl = URL.createObjectURL(audioBlob);
      playBtn.disabled = false;
      
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
    recordBtn.textContent = 'Stop';
    playBtn.disabled = true;
    
    const details = `MIME type: ${mimeType || 'default'}\nSample rate: ${audioContext.sampleRate} Hz\nFFT size: ${analyser.fftSize}\nState: ${mediaRecorder.state}`;
    setStatus('Recording started.', details);
    startVisualizer();
  };

  const stopRecording = () => {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') {
      return;
    }
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.textContent = 'Record';
    setStatus('Processing recording...');
  };

  const togglePlayback = () => {
    if (!audioUrl) {
      setStatus('No recording yet.');
      return;
    }

    if (audioPlayer && !audioPlayer.paused) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
      playBtn.textContent = 'Play';
      setStatus('Playback stopped.');
      return;
    }

    audioPlayer = new Audio(audioUrl);
    audioPlayer.onended = () => {
      playBtn.textContent = 'Play';
      setStatus('Playback finished.');
    };
    audioPlayer.play();
    playBtn.textContent = 'Stop';
    setStatus('Playback started.');
  };

  recordBtn.onclick = () => {
    if (isRecording) {
      stopRecording();
      return;
    }
    startRecording();
  };

  playBtn.onclick = () => {
    togglePlayback();
  };

  saveVideoBtn.onclick = () => {
    setStatus('Saving is not implemented yet.');
  };

  saveAudioBtn.onclick = () => {
    setStatus('Saving is not implemented yet.');
  };

  playBtn.disabled = true;
  saveVideoBtn.disabled = true;
  saveAudioBtn.disabled = true;
  
  // Show browser capabilities on page load
  showBrowserCapabilities();
});
