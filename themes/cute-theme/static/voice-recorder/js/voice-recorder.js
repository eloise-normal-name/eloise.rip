
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

  const setStatus = (message) => {
    debugMsg.textContent = message;
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
      setStatus('Recording not supported in this browser.');
      return;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setStatus('Microphone permission denied.');
      return;
    }

    const mimeType = pickMimeType();
    const options = mimeType ? { mimeType } : undefined;

    try {
      mediaRecorder = new MediaRecorder(mediaStream, options);
    } catch (error) {
      setStatus('Unable to start recorder.');
      stopStream();
      return;
    }

    audioChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blobType = mimeType || (audioChunks[0] && audioChunks[0].type) || 'audio/webm';
      const audioBlob = new Blob(audioChunks, { type: blobType });
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      audioUrl = URL.createObjectURL(audioBlob);
      playBtn.disabled = false;
      setStatus('Recording ready.');
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
    setStatus('Recording started.');
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
});
