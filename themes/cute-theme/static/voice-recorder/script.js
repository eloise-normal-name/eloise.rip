
// Minimal voice recorder stub
// Handles button state toggling and debug messages

document.addEventListener('DOMContentLoaded', () => {
  const recordBtn = document.getElementById('record-btn');
  const playBtn = document.getElementById('play-btn');
  const saveVideoBtn = document.getElementById('save-video-btn');
  const saveAudioBtn = document.getElementById('save-audio-btn');
  const debugMsg = document.getElementById('debug-msg');

  let isRecording = false;
  let isPlaying = false;

  recordBtn.onclick = () => {
    isRecording = !isRecording;
    recordBtn.textContent = isRecording ? 'Stop' : 'Record';
    debugMsg.textContent = isRecording ? 'Recording started.' : 'Recording stopped.';
  };

  playBtn.onclick = () => {
    isPlaying = !isPlaying;
    playBtn.textContent = isPlaying ? 'Stop' : 'Play';
    debugMsg.textContent = isPlaying ? 'Playback started.' : 'Playback stopped.';
  };

  saveVideoBtn.onclick = () => {
    debugMsg.textContent = 'Save video clicked.';
  };

  saveAudioBtn.onclick = () => {
    debugMsg.textContent = 'Save audio clicked.';
  };
});
