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
        <div class="analog-gauge" aria-hidden="true">
            <div class="analog-gauge__dial">
                <div class="analog-gauge__ticks"></div>
                <div class="gauge-label gauge-label--1">0</div>
                <div class="gauge-label gauge-label--2">6k</div>
                <div class="gauge-label gauge-label--3">12k</div>
                <div class="gauge-label gauge-label--4">18k</div>
                <div id="gaugeNeedle" class="analog-gauge__needle"></div>
                <div class="analog-gauge__hub"></div>
            </div>
        </div>

        <div class="age-text">
            Estimated hearing age: <strong id="ageGuess">—</strong>
        </div>

        <div class="controls">
            <select id="waveType" class="tone-btn">
                <option value="sine">Sine</option>
                <option value="square">Square</option>
                <option value="sawtooth">Sawtooth</option>
                <option value="triangle">Triangle</option>
            </select>
            <button id="startSweep" class="tone-btn tone-btn--primary">Start</button>
            <button id="shareResult" class="tone-btn tone-btn--share" disabled>Share</button>
        </div>

</section>
{% endblock %}
