Title: Voice Practice
Template: page

{% set voice_dir = Path('content/media/voice') %}
{% set voice_files = voice_dir.glob('*.m4a') | sort | list if voice_dir.exists() else [] %}
{% set voice_done = voice_files | length %}
{% set voice_total = 720 %}
{% set voice_percent = ((voice_done / voice_total * 100) | round(2)) if voice_total else 0 %}


[🔗 Old Threads Practice](https://www.threads.com/@eloise_normal_name/post/Cyd1v7sxkt2?xmt=AQF02aaArZSSLu8ZJnlUFBkQVm7vC5rJyQKlWayDHYDHAA) Threads lost voice its recording technology.


<style>
  .voice-progress {
    max-width: 640px;
    margin: 0.5rem 0 1.2rem;
  }
  .voice-progress .progress-track {
    background: linear-gradient(135deg, rgba(255, 233, 241, 0.45), rgba(255, 208, 224, 0.25));
    border-radius: 999px;
    padding: 4px;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.12);
  }
  .voice-progress .progress-fill {
    width: {{ voice_percent }}%;
    height: 14px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--primary-color), #ffa6c6);
    box-shadow: 0 6px 14px var(--shadow);
  }
  .voice-progress .progress-meta {
    display: flex;
    justify-content: space-between;
    margin-top: 0.55rem;
    font-size: 0.92rem;
    color: var(--text-light);
  }
  .voice-progress .progress-meta .label {
    font-weight: 700;
  }
  .page-content > h3 {
    font-family: 'Nunito Sans', sans-serif;
    font-size: 1.5rem;
    font-weight: 300;
    color: #222222;
    margin: 2rem 0 0.75rem;
    text-align: center;
  }
  .page-content > h3 a {
    color: #222222;
    text-decoration: none;
    font-weight: 300;
  }
  .page-content > h3 a:hover {
    color: #00b8d4;
    text-decoration: none;
  }
</style>

<div class="voice-progress">
  <div class="progress-track">
    <div class="progress-fill"></div>
  </div>
  <div class="progress-meta">
    <span class="label">{{ voice_done }}/{{ voice_total }} complete</span>
    <span>{{ voice_percent }}%</span>
  </div>
</div>

{% for i in range(0, voice_files | length, 10) %}
{% set set_num = (i // 10) + 1 %}
<h3 id="H{{ set_num }}"><a href="https://harvardsentences.com/#h{{ set_num }}-harvard-sentences">H{{ set_num }} Harvard Sentences</a></h3>
<ol class="voice-list" start="{{ i + 1 }}">
{% for file in voice_files[i:i+10] %}
  <li><audio src="media/voice/{{ file.name }}" controls></audio></li>
{% endfor %}
</ol>
{% endfor %}
