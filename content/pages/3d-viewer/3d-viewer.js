// 3D Model Viewer — WebGPU, PBR lighting, dynamic tessellation, arcball rotation
// Platforms: iOS Safari 17.4+, Chrome 113+, Edge 113+

(async () => {
  const canvas   = document.getElementById('viewer-canvas');
  const statusEl = document.getElementById('viewer-status');
  const tessBadge = document.getElementById('tess-badge');

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.className = isError ? 'error' : '';
  }

  if (!navigator.gpu) {
    setStatus('WebGPU not available. Use Safari 17.4+, Chrome 113+, or Edge 113+.', true);
    return;
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) { setStatus('No WebGPU adapter found.', true); return; }

  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();
  const ctx    = canvas.getContext('webgpu');
  ctx.configure({ device, format, alphaMode: 'premultiplied' });

  statusEl.className = 'hidden';

  // ── Icosphere generation ──────────────────────────────────────────────────

  function midpoint(a, b, verts, cache) {
    const key = Math.min(a, b) * 65536 + Math.max(a, b);
    if (cache.has(key)) return cache.get(key);
    const [ax, ay, az] = verts[a], [bx, by, bz] = verts[b];
    const l = Math.hypot(ax + bx, ay + by, az + bz);
    verts.push([(ax + bx) / l, (ay + by) / l, (az + bz) / l]);
    const idx = verts.length - 1;
    cache.set(key, idx);
    return idx;
  }

  function buildIcosphere(subdivisions) {
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x/l, y/l, z/l]; });

    let tris = [
      [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
      [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
      [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
      [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
    ];

    for (let s = 0; s < subdivisions; s++) {
      const cache = new Map(), next = [];
      for (const [a, b, c] of tris) {
        const ab = midpoint(a, b, verts, cache);
        const bc = midpoint(b, c, verts, cache);
        const ca = midpoint(c, a, verts, cache);
        next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
      }
      tris = next;
    }

    // Interleaved: position(3) + normal(3) = 6 floats per vertex
    const vertData = new Float32Array(verts.length * 6);
    for (let i = 0; i < verts.length; i++) {
      const [x, y, z] = verts[i];
      vertData.set([x, y, z, x, y, z], i * 6);
    }
    return { vertData, indices: new Uint32Array(tris.flat()) };
  }

  // ── GPU geometry buffers ──────────────────────────────────────────────────

  let vertBuf = null, idxBuf = null, indexCount = 0;

  function uploadGeometry(tessLevel) {
    const sub = tessLevel - 1;             // subdivision count; level 1 = base icosahedron
    const { vertData, indices } = buildIcosphere(sub);
    indexCount = indices.length;

    if (vertBuf) vertBuf.destroy();
    if (idxBuf)  idxBuf.destroy();

    vertBuf = device.createBuffer({
      size: vertData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    idxBuf = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertBuf, 0, vertData);
    device.queue.writeBuffer(idxBuf, 0, indices);

    const triangles = indexCount / 3;
    tessBadge.textContent = `tess L${tessLevel} · ${triangles.toLocaleString()} tris`;
  }

  // ── Uniform buffer (272 bytes) ────────────────────────────────────────────
  // Layout (all vec4 / mat4 for std140-compatible alignment):
  //   0:  mat4  mvp
  //  64:  mat4  model
  // 128:  vec4  cameraPos
  // 144:  vec4  light0Pos   160: vec4 light0Color
  // 176:  vec4  light1Pos   192: vec4 light1Color
  // 208:  vec4  light2Pos   224: vec4 light2Color
  // 240:  vec4  albedo (rgb + metallic)
  // 256:  vec4  params (roughness, unused×3)
  // Total: 272 bytes → round to 288 for alignment

  const UNI_SIZE = 288;
  const uniBuf = device.createBuffer({
    size: UNI_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniData = new Float32Array(UNI_SIZE / 4);

  function mat4mul(a, b) {
    const r = new Float32Array(16);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        for (let k = 0; k < 4; k++)
          r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
    return r;
  }

  function perspectiveMat(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    return new Float32Array([
      f/aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / (near - far), -1,
      0, 0, (2 * far * near) / (near - far), 0,
    ]);
  }

  function updateUniforms(state) {
    const { rotation, camDist, albedo, metallic, roughness } = state;
    const aspect = canvas.width / canvas.height;
    const proj = perspectiveMat(Math.PI / 4, aspect, 0.1, 100);
    const tx = -0, ty = 0, tz = -camDist;
    const view = new Float32Array([
      1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1,
    ]);
    const mvp = mat4mul(mat4mul(view, rotation), proj);

    // MVP (column-major, WGSL expects column-major)
    uniData.set(mvp, 0);
    // model = rotation (no translation — object centred at origin)
    uniData.set(rotation, 16);
    // cameraPos in world space (camera is at (0,0,camDist) in view space → world space)
    uniData.set([0, 0, camDist, 1], 32);
    // 3 point lights: pos(w=1), color(w=intensity)
    const lights = [
      [ 4,  6,  5], [1.0, 0.95, 0.90],   // key: warm white
      [-5,  3, -2], [0.25, 0.30, 0.45],   // fill: cool blue
      [ 0, -4,  4], [0.15, 0.10, 0.20],   // rim: purple
    ];
    let off = 36;
    for (const [pos, col] of lights) {
      uniData.set([...pos, 1], off);     off += 4;
      uniData.set([...col, 1], off);     off += 4;
    }
    // albedo + metallic
    const [r, g, b] = albedo;
    uniData.set([r, g, b, metallic], 60);
    // roughness
    uniData.set([roughness, 0, 0, 0], 64);

    device.queue.writeBuffer(uniBuf, 0, uniData);
  }

  // ── Shaders ───────────────────────────────────────────────────────────────

  const shaderCode = /* wgsl */`
struct Uni {
  mvp       : mat4x4<f32>,
  model     : mat4x4<f32>,
  camPos    : vec4<f32>,
  l0pos     : vec4<f32>, l0col : vec4<f32>,
  l1pos     : vec4<f32>, l1col : vec4<f32>,
  l2pos     : vec4<f32>, l2col : vec4<f32>,
  albedoM   : vec4<f32>,   // rgb = albedo, w = metallic
  params    : vec4<f32>,   // x = roughness
}
@group(0) @binding(0) var<uniform> u : Uni;

struct VIn  { @location(0) pos: vec3<f32>, @location(1) norm: vec3<f32> }
struct VOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) wPos  : vec3<f32>,
  @location(1) wNorm : vec3<f32>,
}

@vertex fn vs(v: VIn) -> VOut {
  let wPos  = (u.model * vec4(v.pos,  1.0)).xyz;
  let wNorm = normalize((u.model * vec4(v.norm, 0.0)).xyz);
  return VOut(u.mvp * vec4(v.pos, 1.0), wPos, wNorm);
}

// ── PBR helpers ──────────────────────────────────────────────────────────

const PI : f32 = 3.14159265;

fn D_GGX(NdH: f32, rough: f32) -> f32 {
  let a  = rough * rough;
  let a2 = a * a;
  let d  = NdH * NdH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

fn G_SchlickGGX(NdV: f32, rough: f32) -> f32 {
  let r = rough + 1.0;
  let k = r * r / 8.0;
  return NdV / (NdV * (1.0 - k) + k);
}

fn G_Smith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, rough: f32) -> f32 {
  return G_SchlickGGX(max(dot(N,V),0.0), rough)
       * G_SchlickGGX(max(dot(N,L),0.0), rough);
}

fn F_Schlick(cosT: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosT, 0.0, 1.0), 5.0);
}

fn cook_torrance(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>,
                 albedo: vec3<f32>, metallic: f32, rough: f32,
                 lightColor: vec3<f32>) -> vec3<f32> {
  let F0  = mix(vec3(0.04), albedo, metallic);
  let H   = normalize(V + L);
  let NdL = max(dot(N, L), 0.0);
  let NdV = max(dot(N, V), 0.0001);
  let NdH = max(dot(N, H), 0.0);
  let HdV = max(dot(H, V), 0.0);

  let F   = F_Schlick(HdV, F0);
  let D   = D_GGX(NdH, rough);
  let G   = G_Smith(N, V, L, rough);

  let spec = (D * G * F) / (4.0 * NdV * NdL + 0.0001);
  let diff = (1.0 - F) * (1.0 - metallic) * albedo / PI;

  return (diff + spec) * lightColor * NdL;
}

// Simple sky + ground ambient
fn ambient(N: vec3<f32>, albedo: vec3<f32>) -> vec3<f32> {
  let sky    = vec3(0.15, 0.20, 0.30);
  let ground = vec3(0.05, 0.04, 0.06);
  let t      = N.y * 0.5 + 0.5;
  return mix(ground, sky, t) * albedo * 0.35;
}

@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let N       = normalize(v.wNorm);
  let V       = normalize(u.camPos.xyz - v.wPos);
  let albedo  = u.albedoM.rgb;
  let metal   = u.albedoM.w;
  let rough   = u.params.x;

  var color = ambient(N, albedo);

  let lights = array<vec4<f32>,6>(
    u.l0pos, u.l0col, u.l1pos, u.l1col, u.l2pos, u.l2col
  );
  for (var i = 0; i < 3; i++) {
    let Lpos  = lights[i * 2].xyz;
    let Lcol  = lights[i * 2 + 1].rgb;
    let L     = normalize(Lpos - v.wPos);
    color    += cook_torrance(N, V, L, albedo, metal, rough, Lcol);
  }

  // Tone-mapping (Reinhard) + gamma
  color = color / (color + 1.0);
  color = pow(color, vec3(1.0 / 2.2));

  return vec4(color, 1.0);
}
`;

  const shaderMod = device.createShaderModule({ code: shaderCode });

  // ── Render pipeline ───────────────────────────────────────────────────────

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' } }],
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: {
      module: shaderMod, entryPoint: 'vs',
      buffers: [{
        arrayStride: 24,
        attributes: [
          { shaderLocation: 0, offset: 0,  format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
        ],
      }],
    },
    fragment: { module: shaderMod, entryPoint: 'fs',
                targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniBuf } }],
  });

  // ── Depth texture ─────────────────────────────────────────────────────────

  let depthTex = null;

  function ensureDepth() {
    const w = canvas.width, h = canvas.height;
    if (depthTex && depthTex.width === w && depthTex.height === h) return;
    depthTex?.destroy();
    depthTex = device.createTexture({
      size: [w, h], format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  // ── Arcball rotation ──────────────────────────────────────────────────────

  function screenToSphere(x, y) {
    const r = Math.min(canvas.width, canvas.height) / 2;
    const nx = (x - canvas.width  / 2) / r;
    const ny = (canvas.height / 2 - y) / r;
    const r2 = nx * nx + ny * ny;
    if (r2 <= 1) return [nx, ny, Math.sqrt(1 - r2)];
    const l = Math.sqrt(r2);
    return [nx / l, ny / l, 0];
  }

  function quatMul([ax,ay,az,aw], [bx,by,bz,bw]) {
    return [
      aw*bx + ax*bw + ay*bz - az*by,
      aw*by - ax*bz + ay*bw + az*bx,
      aw*bz + ax*by - ay*bx + az*bw,
      aw*bw - ax*bx - ay*by - az*bz,
    ];
  }

  function quatNorm([x,y,z,w]) {
    const l = Math.hypot(x,y,z,w);
    return [x/l, y/l, z/l, w/l];
  }

  function quatToMat4([x,y,z,w]) {
    return new Float32Array([
      1-2*(y*y+z*z), 2*(x*y+w*z),   2*(x*z-w*y),   0,
      2*(x*y-w*z),   1-2*(x*x+z*z), 2*(y*z+w*x),   0,
      2*(x*z+w*y),   2*(y*z-w*x),   1-2*(x*x+y*y), 0,
      0,             0,             0,             1,
    ]);
  }

  // ── State ─────────────────────────────────────────────────────────────────

  const state = {
    quat:      [0, 0, 0, 1],
    rotation:  quatToMat4([0, 0, 0, 1]),
    camDist:   3.0,
    tessLevel: 0,            // 0 = unset, forces first upload
    albedo:    [0.72, 0.45, 0.20],
    metallic:  0.8,
    roughness: 0.25,
    drag:      null,         // { lastPt, lastPinchDist }
  };

  function desiredTessLevel() {
    // More subdivisions when closer; range 1–6
    return Math.max(1, Math.min(6, Math.round(8 / state.camDist)));
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  function getPointerXY(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
  }

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    state.drag = { lastPt: getPointerXY(e) };
  });

  canvas.addEventListener('pointermove', e => {
    if (!state.drag) return;
    const cur = getPointerXY(e);
    const prev = state.drag.lastPt;
    const p = screenToSphere(...prev);
    const c = screenToSphere(...cur);
    // axis = cross(p, c), angle = acos(dot(p,c))
    const dot = Math.min(1, p[0]*c[0] + p[1]*c[1] + p[2]*c[2]);
    const angle = Math.acos(dot);
    if (angle > 0.0002) {
      const ax = p[1]*c[2] - p[2]*c[1];
      const ay = p[2]*c[0] - p[0]*c[2];
      const az = p[0]*c[1] - p[1]*c[0];
      const l  = Math.hypot(ax, ay, az) || 1;
      const s  = Math.sin(angle / 2);
      const dq = [ax/l*s, ay/l*s, az/l*s, Math.cos(angle/2)];
      state.quat     = quatNorm(quatMul(dq, state.quat));
      state.rotation = quatToMat4(state.quat);
    }
    state.drag.lastPt = cur;
  });

  canvas.addEventListener('pointerup',   () => { state.drag = null; });
  canvas.addEventListener('pointerleave',() => { state.drag = null; });

  // Scroll wheel zoom (desktop)
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    state.camDist = Math.max(1.2, Math.min(8, state.camDist + e.deltaY * 0.01));
  }, { passive: false });

  // Pinch zoom (iOS / touch)
  let lastPinchDist = null;
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist = Math.hypot(dx, dy);
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && lastPinchDist !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      state.camDist = Math.max(1.2, Math.min(8, state.camDist * (lastPinchDist / dist)));
      lastPinchDist = dist;
    }
  }, { passive: true });

  canvas.addEventListener('touchend', () => { lastPinchDist = null; });

  // ── Controls wiring ───────────────────────────────────────────────────────

  function wireRange(id, key, scale = 1, decimals = 2) {
    const el = document.getElementById(id);
    const lbl = document.getElementById(id + '-val');
    if (!el) return;
    el.addEventListener('input', () => {
      state[key] = el.value * scale;
      if (lbl) lbl.textContent = Number(state[key]).toFixed(decimals);
    });
    if (lbl) lbl.textContent = Number(state[key]).toFixed(decimals);
  }

  wireRange('ctrl-metallic',  'metallic',  1, 2);
  wireRange('ctrl-roughness', 'roughness', 1, 2);

  const colorPicker = document.getElementById('ctrl-albedo');
  if (colorPicker) {
    colorPicker.addEventListener('input', () => {
      const hex = colorPicker.value;
      const r = parseInt(hex.slice(1,3),16)/255;
      const g = parseInt(hex.slice(3,5),16)/255;
      const b = parseInt(hex.slice(5,7),16)/255;
      // gamma-correct: sRGB → linear
      state.albedo = [r**2.2, g**2.2, b**2.2];
    });
  }

  // ── Resize handling ───────────────────────────────────────────────────────

  function resizeCanvas() {
    const wrap = canvas.parentElement;
    const dpr  = Math.min(devicePixelRatio, 2);
    const w = Math.floor(wrap.clientWidth  * dpr);
    const h = Math.floor(wrap.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
  }

  new ResizeObserver(resizeCanvas).observe(canvas.parentElement);
  resizeCanvas();

  // ── Render loop ───────────────────────────────────────────────────────────

  function render() {
    requestAnimationFrame(render);

    resizeCanvas();
    ensureDepth();

    // Dynamic tessellation: update geometry when level changes
    const tl = desiredTessLevel();
    if (tl !== state.tessLevel) {
      state.tessLevel = tl;
      uploadGeometry(tl);
    }

    updateUniforms(state);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0.04, g: 0.04, b: 0.06, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthTex.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear', depthStoreOp: 'store',
      },
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertBuf);
    pass.setIndexBuffer(idxBuf, 'uint32');
    pass.drawIndexed(indexCount);
    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  render();
})();
