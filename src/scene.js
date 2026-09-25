// One picture, lit in a dark room.
// A key light travels over fur and vinyl, the frame breathes, and holding the stage
// pulls the backpack towards you. Opening: the frame unzips from the centre line.

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec4 uRect;     // image placement in buffer px: x, y (from bottom), w, h
uniform float uDpr;
uniform float uTime;
uniform float uZoom;
uniform vec2 uFocus;    // zoom centre, image uv (top down)
uniform vec2 uPar;      // pointer parallax, -1..1
uniform vec2 uLight;    // key light, image uv
uniform float uKey;     // key intensity
uniform float uReveal;  // 0 closed, 1 open
uniform float uShade;   // darken the lower screen for type
uniform float uGrain;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 frag = gl_FragCoord.xy;

  // The opening: a slit along the centre line with fine zipper teeth on its lips.
  float lip = uReveal * uRes.y * 0.5;
  float tooth = abs(fract(frag.x / (6.0 * uDpr)) - 0.5) * 2.0;
  float teeth = tooth * 2.5 * uDpr * (1.0 - smoothstep(0.7, 1.0, uReveal));
  float open = 1.0 - smoothstep(lip + teeth - uDpr, lip + teeth + uDpr, abs(frag.y - uRes.y * 0.5));

  vec2 frame = (frag - uRect.xy) / uRect.zw;
  frame.y = 1.0 - frame.y;

  // Depth without a depth map: the subject moves more than the wall behind it.
  float subject = 1.0 - smoothstep(0.08, 0.5, distance(frame, vec2(0.52, 0.52)));
  vec2 uv = frame + uPar * (0.003 + 0.011 * subject);
  uv = uFocus + (uv - uFocus) / uZoom;

  vec3 c = texture2D(uTex, clamp(uv, 0.0, 1.0)).rgb;
  c = pow(c, vec3(2.2));
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float red = clamp((c.r - max(c.g, c.b)) * 2.5, 0.0, 1.0);

  // Key light with a soft falloff, measured in picture space so it sits on the fur.
  vec2 d = (frame - uLight) * vec2(uRect.z / uRect.w, 1.0);
  float key = exp(-dot(d, d) / 0.075) * uKey;
  float fill = 0.075 + 0.05 * red;
  vec3 lit = c * (fill + key * 1.3);

  // Sheen: highlights on vinyl and fur bloom where the key passes.
  float sheen = smoothstep(0.3, 0.9, luma) * key;
  lit += c * sheen * (0.35 + 0.9 * red);

  // The frame falls off into the room, no hard edge anywhere.
  float ex = smoothstep(0.0, 0.42, frame.x) * smoothstep(0.0, 0.42, 1.0 - frame.x);
  float ey = smoothstep(0.0, 0.14, frame.y) * smoothstep(0.0, 0.3, 1.0 - frame.y);
  lit *= pow(ex, 1.6) * ey;
  // Type sits in shadow: the floor on tall screens, a little at the top for the header.
  float yScreen = frag.y / uRes.y;
  lit *= mix(1.0, smoothstep(0.08, 0.66, yScreen) * mix(1.0, 0.55, smoothstep(0.86, 1.0, yScreen)), uShade);
  lit = lit / (1.0 + lit * 0.6);
  vec3 col = pow(lit, vec3(1.0 / 2.2));

  vec3 room = vec3(0.039, 0.035, 0.031);
  col = room + col * (1.0 - room);

  float g = hash(floor(frag / uDpr) + floor(uTime * 24.0) * 0.137) - 0.5;
  col += g * uGrain;

  gl_FragColor = vec4(col * open, 1.0);
}
`

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const clamp01 = (t) => Math.min(1, Math.max(0, t))

export function createScene(canvas, image, { calm = false } = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
  if (!gl) return null

  const compile = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }
  const prog = gl.createProgram()
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog))
  gl.useProgram(prog)

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)

  const u = {}
  for (const n of ['uTex', 'uRes', 'uRect', 'uDpr', 'uTime', 'uZoom', 'uFocus', 'uPar', 'uLight', 'uKey', 'uReveal', 'uShade', 'uGrain']) {
    u[n] = gl.getUniformLocation(prog, n)
  }
  gl.uniform1i(u.uTex, 0)

  const aspect = image.naturalWidth / image.naturalHeight
  const FACE = [0.44, 0.34] // where the pull goes: the cat's face
  let dpr = 1
  let portrait = false

  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 1.75)
    const w = innerWidth
    const h = innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    gl.viewport(0, 0, canvas.width, canvas.height)
    portrait = w / h < 1.05

    let rw, rh, rx, ry
    if (portrait) {
      // The picture owns the screen; type sits in the shaded floor.
      rh = h * 0.8
      rw = rh * aspect
      if (rw < w * 1.1) { rw = w * 1.1; rh = rw / aspect }
      rx = (w - rw) / 2
      ry = h - rh + h * 0.05 // top slightly above the screen, measured from the bottom
    } else {
      rh = h * 1.06
      rw = rh * aspect
      rx = w * 0.64 - rw / 2
      ry = (h - rh) / 2
    }
    gl.uniform4f(u.uRect, rx * dpr, ry * dpr, rw * dpr, rh * dpr)
    gl.uniform2f(u.uRes, canvas.width, canvas.height)
    gl.uniform1f(u.uDpr, dpr)
    gl.uniform1f(u.uShade, portrait ? 1 : 0)
  }

  /* Input: pointer parallax and the pull */
  const state = { px: 0, py: 0, tx: 0, ty: 0, pull: 0, pullV: 0, pullTarget: 0, lx: 0, ly: 0 }
  let holding = false

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    state.tx = (e.clientX / innerWidth - 0.5) * 2
    state.ty = (e.clientY / innerHeight - 0.5) * 2
  }, { passive: true })

  const hold = (on) => {
    holding = on
    document.body.classList.toggle('pulling', on)
    if (on) api.onPull?.()
  }

  let wheel = 0
  addEventListener('wheel', (e) => { wheel = Math.min(1, Math.max(0, wheel + e.deltaY * 0.0012)) }, { passive: true })

  /* Loop */
  const t0 = performance.now()
  let running = false
  let raf = 0

  let prev = 0
  function frame(now) {
    if (!running) return
    const t = (now - t0) / 1000
    const dt = Math.min(0.033, prev ? (now - prev) / 1000 : 1 / 60)
    const f = dt * 60 // 1 at 60 fps
    prev = now

    // Opening: unzip over 0.95 s, the camera settles by 1.6 s, then only breathing.
    const reveal = calm ? 1 : ease(clamp01((t - 0.1) / 0.95))
    const settle = calm ? 1 : easeOut(clamp01((t - 0.1) / 1.5))
    const lightIn = calm ? 1 : easeOut(clamp01((t - 0.35) / 1.1))

    state.px += (state.tx - state.px) * 0.045 * f
    state.py += (state.ty - state.py) * 0.045 * f

    // The pull: a spring towards held or released, a little wheel adds to it.
    wheel *= Math.pow(0.965, f)
    state.pullTarget = Math.max(holding ? 1 : 0, wheel)
    const k = holding ? 38 : 16
    const damp = holding ? 11 : 8
    state.pullV += ((state.pullTarget - state.pull) * k - state.pullV * damp) * dt
    state.pull += state.pullV * dt
    const pull = calm ? state.pullTarget : state.pull

    const breathe = calm ? 0 : Math.sin(t * 0.07) * 0.5 + 0.5
    const zoom = 1.03 + breathe * 0.035 + (1 - settle) * 0.16 + pull * 0.5
    const fx = 0.5 + (FACE[0] - 0.5) * Math.min(1, pull * 1.4 + 0.25)
    const fy = 0.5 + (FACE[1] - 0.5) * Math.min(1, pull * 1.4 + 0.25)

    // The key light wanders slowly over the subject, and leans towards the pointer.
    const lx = calm ? 0.47 : 0.5 + Math.sin(t * 0.11) * 0.16 + Math.sin(t * 0.043 + 2) * 0.06 + state.px * 0.08
    const ly = calm ? 0.38 : 0.44 + Math.sin(t * 0.083 + 1) * 0.12 + state.py * 0.06
    state.lx += (lx - state.lx) * (state.lx ? 0.08 * f : 1)
    state.ly += (ly - state.ly) * (state.ly ? 0.08 * f : 1)

    gl.uniform1f(u.uTime, calm ? 0 : t)
    gl.uniform1f(u.uReveal, reveal)
    gl.uniform1f(u.uZoom, zoom)
    gl.uniform2f(u.uFocus, fx, fy)
    gl.uniform2f(u.uPar, calm ? 0 : state.px, calm ? 0 : state.py)
    gl.uniform2f(u.uLight, state.lx - pull * 0.04, state.ly - pull * 0.05)
    gl.uniform1f(u.uKey, lightIn * (1 + pull * 0.45))
    gl.uniform1f(u.uGrain, portrait ? 0.03 : 0.026)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    raf = requestAnimationFrame(frame)
  }

  const start = () => { if (!running) { running = true; prev = 0; raf = requestAnimationFrame(frame) } }
  const stop = () => { running = false; cancelAnimationFrame(raf) }

  layout()
  addEventListener('resize', layout)
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))

  const api = { start, stop, hold, onPull: null }
  return api
}
