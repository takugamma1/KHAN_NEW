/*
  KHAN — S1 hero WebGL scene (8 rocks + ember/smoke particles).
  Ships alongside khan-three.min.js (exposes window.THREE + window.GLTFLoader).

  Public API:
    var ctrl = window.KHANHero3D.init(canvasEl, opts);
      opts = { modelUrl, emberSprite, particles, embers, smoke, dprCap, mobile }
    ctrl.setProgress(0..1)  // scroll-driven route (called from the pinned timeline)
    ctrl.play() / ctrl.pause()   // RAF gating (pause when hero off-screen)
    ctrl.resize()
    ctrl.dispose()

  Notes:
    - Renders transparent; the section background / other layers show through.
    - prefers-reduced-motion: the caller skips init and shows the poster instead;
      we still guard here and render a single static frame if invoked.
    - All work is sine-float + CPU particle drift (no physics). Geometry is the
      quantized merged GLB (KHR_mesh_quantization, decoded natively by three).
*/
(function () {
  'use strict';

  var Hero3D = (window.KHANHero3D = window.KHANHero3D || {});

  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 749px)').matches;
  }

  /* ---------- particle layer: embers rising + red smoke pooled at the base ---------- */
  function buildParticles(THREE, scene, opts) {
    var count = opts.count || 6000;
    if (opts.mobile) count = Math.round(count * 0.5);
    var SPREAD = opts.spread || 7.0;   // horizontal spawn radius
    var BASE_Y = opts.baseY != null ? opts.baseY : -2.6; // pool height
    var TOP_Y = opts.topY != null ? opts.topY : 4.5;     // recycle ceiling

    var positions = new Float32Array(count * 3);
    var colors = new Float32Array(count * 3);
    var vel = new Float32Array(count * 3);
    var life = new Float32Array(count);
    var seed = new Float32Array(count);

    var cEmber = new THREE.Color(0xff7a2a); // ember orange
    var cSmoke = new THREE.Color(0x8e1b16); // deep red smoke

    function respawn(i, atBase) {
      var i3 = i * 3;
      var ang = Math.random() * Math.PI * 2;
      var rad = Math.pow(Math.random(), 0.6) * SPREAD;
      positions[i3] = Math.cos(ang) * rad;
      positions[i3 + 1] = atBase ? BASE_Y + Math.random() * 0.6 : BASE_Y + Math.random() * (TOP_Y - BASE_Y);
      positions[i3 + 2] = Math.sin(ang) * rad * 0.6;
      vel[i3] = (Math.random() - 0.5) * 0.12;
      vel[i3 + 1] = 0.25 + Math.random() * 0.6;     // rise speed
      vel[i3 + 2] = (Math.random() - 0.5) * 0.12;
      life[i] = Math.random();
      seed[i] = Math.random() * Math.PI * 2;
      // colour: low = smoke red, high = ember orange
      var h = (positions[i3 + 1] - BASE_Y) / (TOP_Y - BASE_Y);
      var col = cSmoke.clone().lerp(cEmber, Math.min(1, h * 1.2));
      colors[i3] = col.r; colors[i3 + 1] = col.g; colors[i3 + 2] = col.b;
    }
    for (var i = 0; i < count; i++) respawn(i, false);

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    var map = null;
    if (opts.emberSprite) {
      map = new THREE.TextureLoader().load(opts.emberSprite);
      if ('colorSpace' in map) map.colorSpace = THREE.SRGBColorSpace;
    }
    var mat = new THREE.PointsMaterial({
      size: opts.size || 0.14,
      map: map,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      opacity: 0.0
    });
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    var progress = 0;
    return {
      object: points,
      setProgress: function (p) { progress = p; },
      update: function (dt, t) {
        // intensity ramps in with scroll progress; embers gain, smoke pools at base
        mat.opacity = 0.25 + 0.6 * progress;
        var posAttr = geo.attributes.position;
        var arr = posAttr.array;
        for (var i = 0, n = count; i < n; i++) {
          var i3 = i * 3;
          // turbulence drift
          arr[i3] += (vel[i3] + Math.sin(t * 0.6 + seed[i]) * 0.05) * dt;
          arr[i3 + 1] += vel[i3 + 1] * dt * (0.6 + 0.7 * progress);
          arr[i3 + 2] += (vel[i3 + 2] + Math.cos(t * 0.5 + seed[i]) * 0.05) * dt;
          life[i] -= dt * 0.18;
          if (arr[i3 + 1] > TOP_Y || life[i] <= 0) {
            // bias a chunk of respawns to the base => dense red smoke pool
            respawn(i, Math.random() < 0.55);
          }
        }
        posAttr.needsUpdate = true;
      },
      setCount: function () {},
      dispose: function () { geo.dispose(); mat.dispose(); if (map) map.dispose(); }
    };
  }

  /* ---------------------------------- scene ---------------------------------- */
  Hero3D.init = function (canvas, opts) {
    if (!canvas || !window.THREE || !window.GLTFLoader) return null;
    var THREE = window.THREE;
    opts = opts || {};
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var mobile = isMobile();

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    var dprCap = opts.dprCap || (mobile ? 1.5 : 1.75);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    scene.add(new THREE.AmbientLight(0x3a3438, 0.65));
    var key = new THREE.DirectionalLight(0xfff1e6, 1.15); key.position.set(3.5, 5, 4); scene.add(key);
    var rim = new THREE.DirectionalLight(0xff2a22, 0.9); rim.position.set(-4.5, -1, -3); scene.add(rim);
    var emberLight = new THREE.PointLight(0xff4a2a, 0.8, 26); emberLight.position.set(0, -2.2, 2.5); scene.add(emberLight);

    var rocksGroup = new THREE.Group(); scene.add(rocksGroup);
    var rocks = [];
    var particles = (opts.particles !== false)
      ? buildParticles(THREE, scene, {
          emberSprite: opts.emberSprite, mobile: mobile,
          count: opts.particleCount || 6000
        })
      : null;

    var clock = new THREE.Clock();
    var progress = 0, loaded = false, running = false, rafId = 0;

    var loader = new window.GLTFLoader();
    loader.load(opts.modelUrl, function (gltf) {
      var meshes = [];
      gltf.scene.traverse(function (o) { if (o.isMesh && o.geometry) meshes.push(o); });
      var mat = new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 0.96, metalness: 0.02 });
      meshes.slice(0, 8).forEach(function (m, i) {
        m.material = mat;
        m.geometry.computeBoundingBox();
        var bb = m.geometry.boundingBox, c = new THREE.Vector3(), size = new THREE.Vector3();
        bb.getCenter(c); bb.getSize(size);
        m.geometry.translate(-c.x, -c.y, -c.z);
        var unit = 1 / (Math.max(size.x, size.y, size.z) || 1);
        m.scale.setScalar(unit);

        var wrap = new THREE.Group();
        wrap.add(m);
        var ang = (i / 8) * Math.PI * 2;
        var rad = 2.5 + (i % 2) * 0.9;
        var base = { x: Math.cos(ang) * rad, y: ((i % 3) - 1) * 1.25, z: Math.sin(ang) * rad * 0.55 - (i % 2) * 0.8 };
        wrap.position.set(base.x, base.y, base.z);
        wrap.scale.setScalar(0.75 + (i % 3) * 0.28);
        rocksGroup.add(wrap);
        rocks.push({
          obj: wrap, base: base,
          f: {
            ax: 0.12 + Math.random() * 0.2, ay: 0.2 + Math.random() * 0.26, az: 0.1 + Math.random() * 0.16,
            sx: 0.45 + Math.random() * 0.4, sy: 0.4 + Math.random() * 0.5, sz: 0.3 + Math.random() * 0.4,
            rx: 0.04 + Math.random() * 0.08, ry: 0.06 + Math.random() * 0.1, phase: Math.random() * Math.PI * 2
          },
          // scroll-route: where the rock drifts to as progress 0->1
          route: { x: (Math.random() - 0.5) * 2.4, y: 1.4 + Math.random() * 1.6, z: (Math.random() - 0.5) * 1.8, rot: (Math.random() - 0.5) * 1.4 }
        });
      });
      loaded = true;
      resize();
      if (reduced) { renderFrame(true); } else { play(); }
      if (typeof opts.onLoad === 'function') opts.onLoad();
    }, undefined, function (err) { if (window.console) console.warn('[KHANHero3D] model load failed', err); });

    function resize() {
      var w = canvas.clientWidth || canvas.parentElement.clientWidth || 1;
      var h = canvas.clientHeight || canvas.parentElement.clientHeight || 1;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }

    function renderFrame(force) {
      var dt = Math.min(clock.getDelta(), 0.05);
      var t = clock.elapsedTime;
      for (var i = 0; i < rocks.length; i++) {
        var r = rocks[i], f = r.f, o = r.obj, b = r.base, rt = r.route;
        var ex = b.x + rt.x * progress, ey = b.y + rt.y * progress, ez = b.z + rt.z * progress;
        o.position.x = ex + Math.sin(t * f.sx + f.phase) * f.ax;
        o.position.y = ey + Math.sin(t * f.sy + f.phase * 1.3) * f.ay;
        o.position.z = ez + Math.cos(t * f.sz + f.phase) * f.az;
        if (!reduced || force) {
          o.rotation.x += f.rx * dt * 0.5;
          o.rotation.y += f.ry * dt * 0.6;
        }
        o.rotation.z = rt.rot * progress;
      }
      rocksGroup.rotation.y = progress * 0.5;
      camera.position.y = THREE.MathUtils.lerp(0, 2.0, progress);
      camera.position.z = THREE.MathUtils.lerp(9, 6.4, progress);
      camera.lookAt(0, THREE.MathUtils.lerp(0, 1.1, progress), 0);
      if (particles) { particles.setProgress(progress); if (!reduced || force) particles.update(dt, t); }
      renderer.render(scene, camera);
    }

    function loop() { rafId = window.requestAnimationFrame(loop); renderFrame(false); }
    function play() { if (running || reduced) return; running = true; clock.start(); loop(); }
    function pause() { if (!running) return; running = false; window.cancelAnimationFrame(rafId); }

    window.addEventListener('resize', resize);

    return {
      setProgress: function (p) { progress = Math.max(0, Math.min(1, p)); if (reduced || !running) renderFrame(true); },
      play: play,
      pause: pause,
      resize: resize,
      get loaded() { return loaded; },
      dispose: function () {
        pause();
        window.removeEventListener('resize', resize);
        if (particles) particles.dispose();
        rocks.forEach(function (r) { r.obj.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); });
        renderer.dispose();
      }
    };
  };
})();
