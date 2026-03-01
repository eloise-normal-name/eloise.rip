Template: page
Title: 3D Viewer
Status: hidden


{% block extra_head %}
<style>
{% include 'pages/3d-viewer/3d-viewer.css' %}
</style>
<script>
{% include 'pages/3d-viewer/3d-viewer.js' %}
</script>
{% endblock %}

{% block content %}
<section class="viewer-page">

  <div class="viewer-canvas-wrap">
    <canvas id="viewer-canvas" width="640" height="640"></canvas>
    <div id="viewer-status">Initialising WebGPU…</div>
    <div class="tess-badge" id="tess-badge"></div>
  </div>

  <p class="viewer-hint">Drag to rotate · Scroll / pinch to zoom (zoom changes tessellation)</p>

  <div class="viewer-controls">
    <div class="viewer-control">
      <label for="ctrl-albedo">Albedo</label>
      <input type="color" id="ctrl-albedo" value="#b87333">
    </div>

    <div class="viewer-control">
      <label for="ctrl-metallic">
        Metallic
        <span id="ctrl-metallic-val">0.80</span>
      </label>
      <input type="range" id="ctrl-metallic" min="0" max="1" step="0.01" value="0.8">
    </div>

    <div class="viewer-control">
      <label for="ctrl-roughness">
        Roughness
        <span id="ctrl-roughness-val">0.25</span>
      </label>
      <input type="range" id="ctrl-roughness" min="0.02" max="1" step="0.01" value="0.25">
    </div>
  </div>

</section>
{% endblock %}
