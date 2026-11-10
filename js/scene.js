/* The Tius mark rebuilt in glass: four journeys round one centre, a ring of small stops between
   them, floating over a soft moving gradient with the rounded hero frame drawn in the shader.
   main.js drives `state` from the scroll position; this file only renders it.
   Classic script (no modules) so the page also runs when opened straight from the disk. */
(function () {
  'use strict';

  // Terracotta, pink beige, sand and cocoa (the old names stay so the layout below reads the same)
  const COLORS = { sky: '#d38a6c', peach: '#e8bfa8', lemon: '#d8a993', sage: '#8c6b58' };

  // Same layout as the 2D mark (viewBox 100, centre 50) mapped to scene units: 36px -> 1.8
  const U = 1 / 20;
  const big = [[0, -36, 'sky'], [36, 0, 'peach'], [0, 36, 'lemon'], [-36, 0, 'sage']];
  const small = [[25.5, -25.5, 'lemon'], [25.5, 25.5, 'sage'], [-25.5, 25.5, 'sky'], [-25.5, -25.5, 'peach']];
  const NODES = [
    { color: 'peach', p: [0, 0, 0], r: 0.55, core: true },
    ...big.map(([x, y, c], i) => ({ color: c, p: [x * U, -y * U, i % 2 ? 0.2 : -0.2], r: 0.52, rod: true })),
    ...small.map(([x, y, c], i) => ({ color: c, p: [x * U, -y * U, i % 2 ? -0.35 : 0.35], r: 0.28, ring: true })),
    // Little satellites half way along each spoke
    ...big.map(([x, y, c]) => ({ color: c, p: [x * U * 0.5, -y * U * 0.5, 0.05], r: 0.12 })),
  ];
  const MARK_RADIUS = 2.3;

  const bgVertex = 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

  // Gradient with drifting colour clouds and a slow wave of light, plus the rounded hero frame
  const bgFragment = `
    uniform float uTime;
    uniform float uScroll;
    uniform float uPixelRatio;
    uniform vec2 uViewport;
    uniform vec4 uInset;
    uniform float uRadius;
    uniform float uFrame;
    uniform vec3 uBase;
    uniform vec3 uA;
    uniform vec3 uB;
    uniform vec3 uC;
    uniform vec3 uD;
    uniform vec3 uE;
    uniform vec3 uNight;
    uniform vec3 uEmber;
    uniform vec3 uEdge;

    float cloud(vec2 p, vec2 c, float r) {
      vec2 d = (p - c) * vec2(uViewport.x / uViewport.y, 1.0);
      return smoothstep(r, 0.0, length(d));
    }
    float box(vec2 p, vec2 b, float r) {
      vec2 q = abs(p) - b + r;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    }

    void main() {
      vec2 px = gl_FragCoord.xy / uPixelRatio;
      vec2 p = px / uViewport;
      float t = uTime * 0.055;
      float s = uScroll;

      vec3 col = uBase;
      col = mix(col, uA, cloud(p, vec2(0.18 + sin(t * 1.2) * 0.1, 0.82 - s * 0.4 + cos(t * 0.8) * 0.06), 0.78) * 0.9);
      col = mix(col, uB, cloud(p, vec2(0.86 + cos(t) * 0.06, 0.94 - s * 0.55), 0.5) * 0.45);
      col = mix(col, uC, cloud(p, vec2(0.84 + sin(t * 0.8) * 0.08, 0.16 + s * 0.38 + sin(t * 1.5) * 0.05), 0.72) * 0.85);
      col = mix(col, uD, cloud(p, vec2(0.5 + sin(t * 1.4) * 0.16, 0.44 + cos(t * 1.1) * 0.1 + s * 0.12), 0.4) * 0.55);
      col = mix(col, uE, cloud(p, vec2(0.1 + cos(t * 1.3) * 0.07, 0.12 + s * 0.28), 0.48) * 0.6);
      // A faint band of light sweeping diagonally, like sun through a plane window
      float band = sin((p.x * 1.4 + p.y) * 3.0 - uTime * 0.25) * 0.5 + 0.5;
      col += vec3(1.0) * pow(band, 8.0) * 0.035;

      if (uFrame > 0.001) {
        vec2 lo = vec2(uInset.w, uInset.z);
        vec2 hi = uViewport - vec2(uInset.y, uInset.x);
        float d = box(px - (lo + hi) * 0.5, (hi - lo) * 0.5, uRadius);
        float inside = smoothstep(1.0, -1.0, d);
        float shadow = smoothstep(60.0, 0.0, d) * (1.0 - inside) * 0.07;
        col = mix(col, col * 0.86, shadow * uFrame);
        // Inside the frame: a near-black cocoa face with two slow ember glows and the faint light band
        float glow = cloud(p, vec2(0.8 + sin(t) * 0.06, 0.8 + cos(t * 0.9) * 0.05), 0.7);
        float glow2 = cloud(p, vec2(0.14 + cos(t * 1.1) * 0.05, 0.12 + sin(t * 1.2) * 0.05), 0.5);
        vec3 face = mix(uNight, uEmber, min(glow * 0.85 + glow2 * 0.4, 1.0));
        face += uEdge * pow(band, 10.0) * 0.025;
        col = mix(col, face, inside * uFrame);
        col = mix(col, uEdge, smoothstep(1.5, 0.0, abs(d)) * 0.3 * uFrame);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <encodings_fragment>
    }
  `;

  const easeOutBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

  // Small stand-in for RoomEnvironment: a bright box with a few glowing panels to reflect
  function makeEnvironment(THREE) {
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: '#d8c8b4', side: THREE.BackSide }));
    env.add(room);
    const panel = (w, h, pos, color, intensity) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(6, 2, [0, 4.8, 0], '#ffffff', 3);
    panel(2.5, 4, [-4.8, 1, 1], '#ffffff', 2);
    panel(2.5, 4, [4.8, 0, -1], '#fff3e6', 1.6);
    panel(4, 1.5, [0, -1, 4.8], '#fff0e0', 1.4);
    return env;
  }

  function createScene(canvas, opts) {
    const reduced = Boolean(opts && opts.reduced);
    const state = { x: 0, y: 0, scale: 0.8, rotX: 0, rotY: 0, burst: 0, blur: 0, spin: 0, intro: reduced ? 1 : 0, frame: 1, frameExpand: 0, scroll: 0 };
    const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    const THREE = window.THREE;
    const fallback = { state, ready: Promise.resolve(), view: { halfW: 1, halfH: 1 }, setMouse() {}, setPaused() {} };
    if (!THREE) { canvas.style.display = 'none'; document.documentElement.classList.add('no-webgl'); return fallback; }
    // Treat hex colours as sRGB, so the gradient and glass show the palette as written
    if (THREE.ColorManagement) {
      THREE.ColorManagement.legacyMode = false;
      THREE.ColorManagement.enabled = true;
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      canvas.style.display = 'none';
      document.documentElement.classList.add('no-webgl');
      return fallback;
    }
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
    camera.position.z = 10;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(makeEnvironment(THREE), 0.04).texture;
    const sun = new THREE.DirectionalLight('#ffffff', 1.5);
    sun.position.set(4, 6, 8);
    scene.add(sun);
    scene.add(new THREE.AmbientLight('#ffffff', 0.25));

    const bgUniforms = {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uPixelRatio: { value: 1 },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uInset: { value: new THREE.Vector4() },
      uRadius: { value: 36 },
      uFrame: { value: 1 },
      // Kraft paper with soft sand, terracotta and pink-beige clouds
      uBase: { value: new THREE.Color('#f3ead9') },
      uA: { value: new THREE.Color('#ead6b8') },
      uB: { value: new THREE.Color('#d9a080') },
      uC: { value: new THREE.Color('#f0d0bd') },
      uD: { value: new THREE.Color('#f8efdd') },
      uE: { value: new THREE.Color('#dcc4a4') },
      // The hero's dark face
      uNight: { value: new THREE.Color('#1f140e') },
      uEmber: { value: new THREE.Color('#3d2619') },
      uEdge: { value: new THREE.Color('#e3a084') },
    };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({ vertexShader: bgVertex, fragmentShader: bgFragment, uniforms: bgUniforms, depthWrite: false }),
    );
    bg.position.z = -8;
    bg.renderOrder = -1;
    scene.add(bg);

    /* The mark */
    const mark = new THREE.Group();
    scene.add(mark);
    const lowPower = innerWidth < 900;
    const sphereGeo = new THREE.SphereGeometry(1, lowPower ? 32 : 48, lowPower ? 20 : 32);
    const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
    const ringGeo = new THREE.TorusGeometry(1.8, 0.012, 8, 160);
    const glass = {};
    const solid = {};
    Object.keys(COLORS).forEach((name) => {
      const hex = COLORS[name];
      glass[name] = new THREE.MeshPhysicalMaterial({
        color: hex, roughness: 0.15, transmission: 0.82, thickness: 1.1, ior: 1.42,
        attenuationColor: new THREE.Color(hex), attenuationDistance: 1.1,
        clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.15,
      });
      solid[name] = new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.35, clearcoat: 0.6 });
    });
    // The dotted orbit of the 2D mark becomes a thin glass ring
    const orbit = new THREE.Mesh(ringGeo, new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.2, transmission: 0.6, thickness: 0.2, clearcoat: 1 }));
    mark.add(orbit);

    const nodes = NODES.map((def) => {
      const mesh = new THREE.Mesh(sphereGeo, glass[def.color]);
      mark.add(mesh);
      const base = new THREE.Vector3(def.p[0], def.p[1], def.p[2]);
      return Object.assign({}, def, { mesh, base, phase: Math.random() * Math.PI * 2, delay: (base.length() / MARK_RADIUS) * 0.45 });
    });
    const rods = nodes.filter((n) => n.rod).map((node) => {
      const mesh = new THREE.Mesh(rodGeo, solid[node.color]);
      mark.add(mesh);
      return { mesh, node };
    });

    const view = { halfW: 1, halfH: 1, mobile: false };
    function resize() {
      const w = innerWidth;
      const h = innerHeight;
      const dpr = Math.min(devicePixelRatio, lowPower ? 1.5 : 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      view.halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      view.halfW = view.halfH * camera.aspect;
      view.mobile = w < 900;
      const bgH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - bg.position.z) * 1.04;
      bg.scale.set(bgH * camera.aspect, bgH, 1);
      bgUniforms.uPixelRatio.value = dpr;
      bgUniforms.uViewport.value.set(w, h);
      bgUniforms.uRadius.value = view.mobile ? 24 : 36;
    }
    resize();
    addEventListener('resize', resize);

    const UP = new THREE.Vector3(0, 1, 0);
    const tmp = new THREE.Vector3();
    const clock = new THREE.Clock();
    let time = 0;
    let lastBlur = -1;
    let paused = false;

    function frameInset() {
      const k = 1 - state.frameExpand;
      return view.mobile ? [76 * k, 12 * k, 16 * k, 12 * k] : [76 * k, 64 * k, 56 * k, 64 * k];
    }

    function render() {
      if (paused) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!reduced) time += dt;
      bgUniforms.uTime.value = time;
      bgUniforms.uScroll.value = state.scroll;
      bgUniforms.uFrame.value = state.frame;
      bgUniforms.uInset.value.set(...frameInset());

      // The small stops travel round the orbit as the mark opens up
      const turn = state.burst * 0.7 + time * 0.08;
      const spread = 1 + state.burst * 0.45;
      for (const n of nodes) {
        let bx = n.base.x;
        let by = n.base.y;
        if (n.ring) {
          const c = Math.cos(turn);
          const s = Math.sin(turn);
          const rx = bx * c - by * s;
          by = bx * s + by * c;
          bx = rx;
        }
        const k = spread + Math.sin(time * 1.3 + n.phase) * 0.035;
        n.mesh.position.set(bx * k, by * k, n.base.z + Math.sin(time * 0.9 + n.phase) * 0.12 * (0.4 + state.burst));
        const intro = Math.min(Math.max(state.intro * 1.6 - n.delay, 0), 1);
        const e = intro <= 0 ? 0.0001 : easeOutBack(intro);
        n.mesh.scale.setScalar(n.r * e);
      }
      for (const r of rods) {
        const target = r.node.mesh.position;
        const reach = Math.max(target.length() - r.node.r * 0.8, 0.001) * Math.min(Math.max(state.intro * 1.4 - 0.2, 0), 1);
        tmp.copy(target).normalize();
        r.mesh.quaternion.setFromUnitVectors(UP, tmp);
        r.mesh.position.copy(tmp).multiplyScalar(reach / 2);
        r.mesh.scale.set(0.03, Math.max(reach, 0.0001), 0.03);
      }
      const ringIn = Math.min(Math.max(state.intro * 1.3 - 0.3, 0), 1);
      orbit.scale.setScalar(Math.max(ringIn * spread, 0.0001));
      orbit.rotation.x = Math.sin(time * 0.4) * 0.15 + state.burst * 0.5;

      mouse.sx += (mouse.x - mouse.sx) * 0.05;
      mouse.sy += (mouse.y - mouse.sy) * 0.05;
      const unit = Math.min(view.halfW, view.halfH) / MARK_RADIUS;
      mark.position.set(state.x * view.halfW, state.y * view.halfH, 0);
      mark.scale.setScalar(Math.max(unit * state.scale, 0.0001));
      mark.rotation.set(
        state.rotX + Math.sin(time * 0.23) * 0.12 - mouse.sy * 0.18,
        state.rotY + Math.sin(time * 0.3) * 0.22 + mouse.sx * 0.3,
        state.spin + time * 0.05,
      );

      // Depth-of-field stand-in: blur the canvas while copy sits over the mark
      const blur = Math.round(state.blur * 2) / 2;
      if (blur !== lastBlur) {
        canvas.style.filter = blur > 0 ? `blur(${blur}px)` : '';
        canvas.style.transform = blur > 0 ? 'scale(1.04)' : '';
        lastBlur = blur;
      }
      renderer.render(scene, camera);
    }
    renderer.setAnimationLoop(render);

    // Compile up front so the opening does not stutter
    const ready = new Promise((resolve) => {
      try { renderer.compile(scene, camera); } catch (e) { /* render will compile */ }
      requestAnimationFrame(() => resolve());
    });

    return {
      state,
      ready,
      view,
      setMouse(x, y) { mouse.x = x; mouse.y = y; },
      // Freeze the last frame (e.g. while someone is typing in the form)
      setPaused(value) { paused = value; clock.getDelta(); },
    };
  }

  window.TiusScene = { createScene };
})();
