Title: Voice Practice
Template: page

{% set voice = namespace(dir=Path('content/media/voice'), done=0, total=720, percent=0.0, percent_str='0.00') %}
{% if voice.dir.exists() %}
  {% for pattern in ['*.m4a', '*.mp3', '*.wav', '*.ogg', '*.flac'] %}
    {% set matches = voice.dir.glob(pattern) | list %}
    {% set voice.done = voice.done + (matches | length) %}
  {% endfor %}
{% endif %}
{% if voice.done > voice.total %}
  {% set voice.done = voice.total %}
{% endif %}
{% set voice.percent = (voice.done / voice.total * 100) if voice.total else 0 %}
{% if voice.percent > 100 %}
  {% set voice.percent = 100 %}
{% elif voice.percent < 0 %}
  {% set voice.percent = 0 %}
{% endif %}
{% set voice.percent_str = '%.2f' % voice.percent %}

# Harvard Sentences

From [harvardsentences.com](https://harvardsentences.com/)

<div class="voice-progress">
  <style>
    .voice-progress {
      --voice-accent: #ff6b9d;
      --voice-accent-dark: #c03d6f;
      max-width: 640px;
      margin: 0.5rem 0 1.2rem;
      font-family: 'Nunito', 'Segoe UI', sans-serif;
      color: rgba(75, 10, 25, 0.8);
    }
    .voice-progress .progress-track {
      background: linear-gradient(135deg, rgba(255, 233, 241, 0.45), rgba(255, 208, 224, 0.25));
      border-radius: 999px;
      padding: 4px;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.12);
    }
    .voice-progress .progress-fill {
      width: {{ voice.percent_str }}%;
      height: 14px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--voice-accent), #ffa6c6);
      box-shadow: 0 6px 14px rgba(255, 107, 157, 0.25);
      transition: width 800ms cubic-bezier(.25, .9, .35, 1);
      position: relative;
      overflow: hidden;
    }
    .voice-progress .progress-fill::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(120deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0));
      mix-blend-mode: screen;
      opacity: 0.7;
    }
    .voice-progress .progress-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 0.55rem;
      font-size: 0.92rem;
      color: var(--voice-accent-dark);
    }
    .voice-progress .progress-meta .label {
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .voice-progress .progress-meta .hint {
      font-size: 0.85rem;
      opacity: 0.85;
    }
  </style>

  <div class="progress-track" role="presentation" aria-hidden="true">
    <div class="progress-fill" role="progressbar" aria-valuemin="0" aria-valuemax="{{ voice.total }}" aria-valuenow="{{ voice.done }}" aria-label="Voice practice progress: {{ voice.done }} of {{ voice.total }}"></div>
  </div>

  <div class="progress-meta">
    <div class="label">{{ voice.done }}/{{ voice.total }} complete</div>
    <div class="hint">{{ voice.percent_str }}%</div>
  </div>
</div>

<ol class="voice-list">
	<li><audio src="media/voice/01-01.m4a" controls></audio></li>
	<li><audio src="media/voice/01-02.m4a" controls></audio></li>
	<li><audio src="media/voice/01-03.m4a" controls></audio></li>
	<li><audio src="media/voice/01-04.m4a" controls></audio></li>
	<li><audio src="media/voice/01-05.m4a" controls></audio></li>
	<li><audio src="media/voice/01-06.m4a" controls></audio></li>
</ol>
