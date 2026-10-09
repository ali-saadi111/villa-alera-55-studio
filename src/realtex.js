// Photographic surfaces from Poly Haven (CC0, polyhaven.com), published next to the page in textures/.
// The procedural textures show first; these replace them as they arrive (and stay if a file can't load).
// Fetched with tools/polyhaven.mjs and colour-matched to the reference photos by tools/prep_textures.py.
import * as THREE from 'three';

// mats: material names in MAT; size: metres covered by one tile of the texture; stretch: extra [x, y] repeat;
// tint: a linear colour multiplier on the photo
export const PACK = [
  { mats: { limestone: 2.6, cream: 3.2, pavers: 2.0 }, id: 'marble_01', file: 'marble_01', normal: 0.9, ao: 0.6 },
  { mats: { roofTile: 2.5 }, id: 'clay_roof_tiles_02', file: 'clay_roof_tiles_02', normal: 1.2, ao: 1.0, tint: [0.92, 1.2, 1.7] },   // the softer, peachier terracotta of photo 8
  { mats: { stoneWall: 1.3 }, id: 'sandstone_blocks_05', file: 'sandstone_blocks_05', normal: 1.2, ao: 1.0 },
  { mats: { pebbles: 1.4 }, id: 'ganges_river_pebbles', file: 'ganges_river_pebbles', normal: 1.2, ao: 1.0, rough: 0.75 },
  { mats: { tilesGray: 1.825 }, id: 'concrete_tiles_02', file: 'concrete_tiles_02', normal: 0.8, ao: 0.8 },
  { mats: { asphalt: 2.08 }, id: 'asphalt_01', file: 'asphalt_01', normal: 1.0, ao: 1.0 },
  { mats: { woodDeck: 3.4 }, id: 'plank_flooring_04', file: 'plank_flooring_04', normal: 0.8, ao: 0.8 },
  { mats: { lawn: 2.0 }, id: 'leafy_grass', file: 'leafy_grass', normal: 1.0, ao: 0.9 },
];
export const SKY = { id: 'kloofendal_48d_partly_cloudy_puresky', file: 'sky_day.hdr.txt' };   // the .hdr as base64 text
export const CREDIT = 'Textures and sky: Poly Haven (CC0)';

export async function applyRealTextures(M, renderer, { base = 'textures/', onProgress } = {}) {
  const loader = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = (name, srgb) => loader.loadAsync(base + name).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    return t;
  });
  let done = 0, ok = 0;
  await Promise.all(PACK.map(async (p) => {
    try {
      const [d, n, a] = await Promise.all([load(p.file + '_diff.jpg', true), load(p.file + '_nor.jpg', false), load(p.file + '_arm.jpg', false)]);
      for (const [name, size] of Object.entries(p.mats)) {
        const m = M[name]; if (!m) continue;
        const rep = (m.userData.s || 1) / size, [sx, sy] = p.stretch || [1, 1];
        const tile = (t) => { const c = t.clone(); c.repeat.set(rep * sx, rep * sy); c.needsUpdate = true; return c; };
        const arm = tile(a);
        m.map = tile(d); m.normalMap = tile(n); m.roughnessMap = arm; m.aoMap = arm;
        m.bumpMap = null; if (p.tint) m.color.setRGB(...p.tint); else m.color.set(0xffffff);
        m.roughness = p.rough ?? 1; m.normalScale.set(p.normal ?? 1, p.normal ?? 1); m.aoMapIntensity = p.ao ?? 1;
        m.userData.real = p.id;
        m.needsUpdate = true;
      }
      ok++;
    } catch (e) { /* keep the procedural texture for this one */ }
    onProgress && onProgress(++done, PACK.length);
  }));
  return ok;
}

// the HDR sky: lights and reflects the scene and replaces the painted gradient
export async function loadSky(renderer, { base = 'textures/' } = {}) {
  const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
  // fetched and parsed here (not loader.load) so a missing or bad file fails quietly
  const res = await fetch(base + SKY.file);
  if (!res.ok) throw new Error('sky ' + res.status);
  const bin = atob((await res.text()).replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const d = new RGBELoader().setDataType(THREE.FloatType).parse(bytes.buffer);
  // half floats: filterable on every WebGL2 device (full floats are not on many phones)
  const tex = (f32) => {
    const data = new Uint16Array(f32.length);
    for (let i = 0; i < f32.length; i++) data[i] = THREE.DataUtils.toHalfFloat(Math.min(f32[i], 65000));
    const t = new THREE.DataTexture(data, d.width, d.height, THREE.RGBAFormat, THREE.HalfFloatType);
    t.colorSpace = THREE.LinearSRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false; t.flipY = true; t.mapping = THREE.EquirectangularReflectionMapping; t.needsUpdate = true;
    return t;
  };
  const hdr = tex(d.data);
  // the light it casts: the sky's blue toned down and warmed a touch, so shade and interiors stay neutral
  // (photographs of the house read warm in the shade too)
  const L = new Float32Array(d.data);
  for (let i = 0; i < L.length; i += 4) {
    const y = 0.2126 * L[i] + 0.7152 * L[i + 1] + 0.0722 * L[i + 2];
    L[i] = (y + (L[i] - y) * 0.35) * 1.03; L[i + 1] = y + (L[i + 1] - y) * 0.35; L[i + 2] = (y + (L[i + 2] - y) * 0.35) * 0.96;
  }
  const pm = new THREE.PMREMGenerator(renderer), light = tex(L);
  const env = pm.fromEquirectangular(light).texture;
  pm.dispose(); light.dispose();
  return { background: hdr, environment: env };
}
