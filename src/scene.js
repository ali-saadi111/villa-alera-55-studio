// Renderer, camera, lights, environment and the on-demand render loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FAR_GROUND } from './util.js';

const SUN_DAY = [-10, 26, -20], SUN_DUSK = [-26, 7.5, -13];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// dusk backdrop: deep blue overhead, a warm glow along the horizon (reference photo 10)
function duskTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#1d2f57'); gr.addColorStop(0.32, '#35508a'); gr.addColorStop(0.52, '#7d84aa');
  gr.addColorStop(0.64, '#d99d78'); gr.addColorStop(0.7, '#e9b184'); gr.addColorStop(0.78, '#9a7466'); gr.addColorStop(1, '#4b3e3b');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#7fa9d3'); gr.addColorStop(0.42, '#bcd3e6'); gr.addColorStop(0.62, '#e8ece9'); gr.addColorStop(1, '#d9d1c2');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Stage {
  constructor(container) {
    this.container = container;
    const canvas = document.createElement('canvas');
    canvas.className = 'gl'; canvas.setAttribute('aria-label', '3D view of the villa');
    container.prepend(canvas);
    this.canvas = canvas;
    this.mobile = matchMedia('(pointer: coarse)').matches;
    let r;
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { this.failed = e; return; }
    this.renderer = r;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;
    r.localClippingEnabled = true;

    const scene = this.scene = new THREE.Scene();
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(0xe4e8e6, 70, 260);
    const pm = new THREE.PMREMGenerator(r);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envTex;
    scene.environmentIntensity = 0.85;
    pm.dispose();

    const hemi = this.hemi = new THREE.HemisphereLight(0xe3ecf7, 0x9a8a72, 0.55);
    scene.add(hemi);
    // sun high in the south-south-west, over the street, as in the reference photos: the street and west faces are lit
    const sun = this.sun = new THREE.DirectionalLight(0xfff0da, 2.3);
    sun.position.set(...SUN_DAY);
    sun.target.position.set(0.5, 0, 0);
    sun.castShadow = true;
    const s = sun.shadow, size = this.mobile ? 2048 : 4096;
    s.mapSize.set(size, size);
    s.camera.left = -17; s.camera.right = 17; s.camera.top = 17; s.camera.bottom = -17;
    s.camera.near = 5; s.camera.far = 75;
    s.bias = -0.0004; s.normalBias = 0.025;
    scene.add(sun, sun.target);

    // far ground so the plot doesn't end at a cliff
    const far = new THREE.Mesh(new THREE.CircleGeometry(320, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa7aa88, roughness: 1 }));
    far.position.y = FAR_GROUND - 0.02; far.receiveShadow = false; far.name = 'far-ground';
    scene.add(far);

    const cam = this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
    cam.position.set(18, 14, -26);
    const ctl = this.controls = new OrbitControls(cam, canvas);
    ctl.enableDamping = true; ctl.dampingFactor = 0.09;
    ctl.screenSpacePanning = true;
    ctl.minDistance = 1.2; ctl.maxDistance = 140;
    ctl.maxPolarAngle = Math.PI * 0.495;
    ctl.target.set(-1, 2, 0);
    ctl.addEventListener('change', () => this.dirty());

    // lighting: the painted day sky until the HDR sky arrives (setSky); dusk is a preset on top of either
    this.sky = { background: scene.background, environment: this.envTex, rotation: 0, boost: 1, envScale: 1, fog: 0xe4e8e6, hemi: 0.55 };
    this.dusk = false;
    this._dirty = true; this._shadows = true; this.tween = null; this.hooks = []; this.renderHooks = [];
    this.inset = 0; this.insetTarget = 0; this.insetY = 0; this.insetYTarget = 0;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now();
      for (const h of this.hooks) h(now);
      if (Math.abs(this.inset - this.insetTarget) > 0.5 || Math.abs(this.insetY - this.insetYTarget) > 0.5) {
        this.inset += (this.insetTarget - this.inset) * 0.22; this.insetY += (this.insetYTarget - this.insetY) * 0.22; this._applyView();
      } else if (this.inset !== this.insetTarget || this.insetY !== this.insetYTarget) { this.inset = this.insetTarget; this.insetY = this.insetYTarget; this._applyView(); }
      if (this.tween) this._stepTween(now);
      if (ctl.enabled) ctl.update();
      if (this._dirty) this.render();
    };
    requestAnimationFrame(loop);
  }
  dirty(shadows = false) { this._dirty = true; if (shadows) this._shadows = true; }
  // swap the painted gradient and studio reflections for a real sky (HDRI), turned so its sun matches the sun light
  // (the backdrop is brightened like a real-estate photograph)
  setSky({ background, environment }, { rotation = 2.650, envScale = 0.72, fog = 0xd3dbe3, skyBoost = 3.0 } = {}) {
    this.sky = { background, environment, rotation, boost: skyBoost, envScale, fog, hemi: 0.35 };
    this._light();
  }
  setDusk(on) { this.dusk = !!on; this._light(); }
  setEnvBase(v) { this.envBase = v; this._light(); }
  _light() {
    const sc = this.scene, k = this.sky, d = this.dusk;
    sc.environment = k.environment; sc.environmentRotation.set(0, k.rotation, 0);
    sc.background = d ? (this._duskSky ||= duskTexture()) : k.background;
    sc.backgroundRotation.set(0, d ? 0 : k.rotation, 0);
    sc.backgroundIntensity = d ? 1 : k.boost;
    sc.environmentIntensity = (this.envBase ?? 0.85) * k.envScale * (d ? 0.28 : 1);
    sc.fog.color.set(d ? 0x56688c : k.fog);
    this.hemi.intensity = d ? 0.85 : k.hemi;
    this.hemi.color.set(d ? 0x8494c6 : 0xe3ecf7); this.hemi.groundColor.set(d ? 0xb08460 : 0x9a8a72);
    this.sun.position.set(...(d ? SUN_DUSK : SUN_DAY));
    this.sun.color.set(d ? 0xffad72 : 0xfff0da); this.sun.intensity = d ? 0.6 : 2.3;
    this.dirty(true);
  }
  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this._applyView();
  }
  // keep the picture centred in the part of the screen that side panels leave free
  setInset(px, py = 0) { this.insetTarget = px; this.insetYTarget = py; }
  _applyView() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    if (Math.abs(this.inset) > 0.5 || Math.abs(this.insetY) > 0.5) this.camera.setViewOffset(w, h, -this.inset / 2, this.insetY / 2, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.dirty();
  }
  render() {
    this._dirty = false;
    if (this._shadows) { this.renderer.shadowMap.needsUpdate = true; this._shadows = false; }
    this.renderer.render(this.scene, this.camera);
    for (const h of this.renderHooks) h();
  }
  // fly the orbit camera to a new position/target
  flyTo(pos, target, dur = 700) {
    this.tween = { t0: performance.now(), dur, p0: this.camera.position.clone(), p1: pos.clone(), q0: this.controls.target.clone(), q1: target.clone() };
    this.dirty();
  }
  _stepTween(now) {
    const T = this.tween, k = Math.min(1, (now - T.t0) / T.dur), e = ease(k);
    this.camera.position.lerpVectors(T.p0, T.p1, e);
    if (T.q0) {
      this.controls.target.lerpVectors(T.q0, T.q1, e);
      if (!this.controls.enabled) this.camera.lookAt(this.controls.target);
    }
    if (T.onStep) T.onStep(e);
    if (k >= 1) { this.tween = null; if (T.done) T.done(); }
    this.dirty();
  }
  // render a snapshot at a given scale and return a PNG blob
  async snapshot(scale = 2) {
    const r = this.renderer, pr = r.getPixelRatio();
    r.setPixelRatio(Math.min(3, (window.devicePixelRatio || 1) * scale));
    const w = this.container.clientWidth, h = this.container.clientHeight;
    r.setSize(w, h, false);
    r.shadowMap.needsUpdate = true;
    r.render(this.scene, this.camera);
    const blob = await new Promise((res) => r.domElement.toBlob(res, 'image/png'));
    r.setPixelRatio(pr); r.setSize(w, h, false); this.dirty(true);
    return blob;
  }
}
