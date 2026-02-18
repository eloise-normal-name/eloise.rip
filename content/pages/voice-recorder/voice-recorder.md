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
        <div class="button-stack">
            <button id="testSignalButton" class="btn btn-test" title="Test Signal (220 Hz sine wave)">
                <span class="icon icon-sine"></span>
            </button>
        </div>
    </div>
    <div id="signalIndicator" class="signal-indicator signal-idle" aria-live="polite">Signal: idle</div>
    <div class="clips-container">
        <h3 class="clips-title">Recordings</h3>
        <div id="clipsList" class="clips-list"></div>
    </div>
    <details class="recorder-settings" closed>
        <summary>Settings</summary>
        <div class="settings-grid">
            <div class="setting-item">
                <label for="minHzSlider">Min Frequency: <span id="minHzValue">70</span> Hz</label>
                <input type="range" id="minHzSlider" min="40" max="200" value="70" step="5">
            </div>
            <div class="setting-item">
                <label for="maxHzSlider">Max Frequency: <span id="maxHzValue">280</span> Hz</label>
                <input type="range" id="maxHzSlider" min="200" max="800" value="280" step="10">
            </div>
            <div class="setting-item">
                <label for="primaryThresholdSlider">Primary Threshold: <span id="primaryThresholdValue">0.20</span></label>
                <input type="range" id="primaryThresholdSlider" min="0.05" max="0.50" value="0.20" step="0.05">
            </div>
            <div class="setting-item setting-item-secondary-threshold">
                <label for="secondaryThresholdSlider">Secondary Threshold: <span id="secondaryThresholdValue">0.15</span></label>
                <input type="range" id="secondaryThresholdSlider" min="0.05" max="0.40" value="0.15" step="0.05">
            </div>
            <div class="setting-item">
                <label for="smoothingSlider">Pitch Smoothing: <span id="smoothingValue">35</span>%</label>
                <input type="range" id="smoothingSlider" min="10" max="80" value="35" step="5">
            </div>
            <div class="setting-item setting-item-toggle">
                <label for="usePitchyToggle">Use Pitchy detector (optional)</label>
                <input type="checkbox" id="usePitchyToggle" aria-describedby="usePitchyHelp">
                <small id="usePitchyHelp" class="setting-help">Keeps autocorrelation as fallback; secondary pitch still uses autocorrelation.</small>
            </div>
        </div>
    </details>
    <details class="recorder-status" closed>
        <summary>Status</summary>
        <pre id="debugMsg">Ready</pre>
    </details>
</section>
{% endblock %}
