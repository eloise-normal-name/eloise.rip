Template: page
Title: Hearing Age Guesser
Status: hidden


{% block extra_head %}
<style>
{% include 'pages/hearing-age/hearing-age.css' %}
</style>
<script>
{% include 'pages/hearing-age/hearing-age.js' %}
</script>
{% endblock %}

{% block content %}
<section class="hearing-age">
    <div class="hearing-card">
        <div class="hearing-card__intro">
            <p class="eyebrow">Tone sweep</p>
            <h1>Hearing Age Guesser</h1>
            <p class="lede">Play an increasingly higher pitched tone until it slips out of range, then tap the button to guess your hearing age.</p>
        </div>

        <div class="hearing-readout">
            <div class="readout-block">
                <div class="readout-label">Current tone</div>
                <div class="readout-value">
                    <span id="frequencyValue">440</span>
                    <span class="readout-unit">Hz</span>
                </div>
            </div>
            <div class="readout-block">
                <div class="readout-label">Latest audible</div>
                <div class="readout-value">
                    <span id="lastHeardValue">—</span>
                    <span class="readout-unit">Hz</span>
                </div>
            </div>
            <div class="status-pill" id="sweepStatus">Idle</div>
        </div>

        <div class="age-panel">
            <div class="age-panel__label">Estimated hearing age</div>
            <div id="ageGuess" class="age-panel__value">—</div>
            <div id="ageDetail" class="age-panel__detail">Press start to begin a quick sweep.</div>
        </div>

        <div class="controls">
            <button id="startSweep" class="tone-btn tone-btn--primary">Start sweep</button>
            <button id="cantHearButton" class="tone-btn tone-btn--alert" disabled>Can't hear it</button>
            <button id="resetButton" class="tone-btn tone-btn--ghost">Reset</button>
        </div>

        <div class="progress-shell" aria-hidden="true">
            <div class="progress-track">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <div class="progress-caption">Sweep walks from 440 Hz to 20 kHz. Stay gentle with your volume.</div>
        </div>

        <ul class="notes">
            <li>Use comfortable headphones at a safe volume. Keep your device volume modest.</li>
            <li>Tap <strong>Can't hear it</strong> the moment the tone disappears for you; the app guesses based on the last audible frequency.</li>
            <li>This is a playful approximation, not a medical test.</li>
        </ul>
    </div>
</section>
{% endblock %}
