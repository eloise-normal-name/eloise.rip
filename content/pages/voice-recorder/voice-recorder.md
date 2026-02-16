Template: page
Title: Voice Recorder
Status: hidden


{% block extra_head %} 
<style>
{% include 'pages/voice-recorder/voice-recorder.css' %}
</style>
<script>
{% include 'pages/voice-recorder/pitch-detector.js' %}
{% include 'pages/voice-recorder/audio-visualizer.js' %}
{% include 'pages/voice-recorder/voice-recorder.js' %}
</script>
{% endblock %}

{% block content %}
 
<section class="voice-recorder">
    <div class="recorder-canvas-container">
        <canvas id="recordingCanvas" width="400" height="300"></canvas>
        <video id="playbackVideo" width="400" height="300" class="playback-video" playsinline></video>
    </div>
    <div class="recorder-actions">
        <button id="recordButton" class="btn btn-record">
            <span class="icon icon-circle"></span>
        </button>
        <button id="playButton" class="btn btn-play" disabled>
            <span class="icon icon-triangle"></span>
        </button>
        <div class="button-stack">
            <button id="testSignalButton" class="btn btn-test" title="Test Signal (220 Hz sine wave)">
                <span class="icon icon-sine"></span>
            </button>
        </div>
        <div class="button-stack">
            <button id="saveVideoButton" class="btn btn-download btn-save" disabled title="Download Video">
                <span class="emoji-icon" aria-hidden="true">🎬</span>
                <span class="btn-save-text">Save</span>
            </button>
        </div>
        <div class="button-stack">
            <button id="saveAudioButton" class="btn btn-download-audio btn-save" disabled title="Download Audio">
                <span class="emoji-icon" aria-hidden="true">🎵</span>
                <span class="btn-save-text">Save</span>
            </button>
        </div>
    </div>
    <details class="recorder-status" closed>
        <summary>Status</summary>
        <pre id="debugMsg">Ready</pre>
    </details>
</section>
{% endblock %}
