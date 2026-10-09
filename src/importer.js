// Bringing your own items in: 3D model files of many formats, and product photos.
// Everything is read from the File objects directly (no network), and a model is
// re-packed as one GLB so it can be stored and shared with the layout.
import * as THREE from 'three';

// loaders are fetched only when they are first needed
const A = 'three/addons/';
const lazy = {};
const need = (path) => (lazy[path] ||= import(/* @vite-ignore */ A + path));
const L = {
  gltf: () => need('loaders/GLTFLoader.js'), draco: () => need('loaders/DRACOLoader.js'), meshopt: () => need('libs/meshopt_decoder.module.js'),
  obj: () => need('loaders/OBJLoader.js'), mtl: () => need('loaders/MTLLoader.js'), fbx: () => need('loaders/FBXLoader.js'),
  stl: () => need('loaders/STLLoader.js'), ply: () => need('loaders/PLYLoader.js'), dae: () => need('loaders/ColladaLoader.js'),
  tds: () => need('loaders/TDSLoader.js'), usdz: () => need('loaders/USDZLoader.js'), exporter: () => need('exporters/GLTFExporter.js'),
  fflate: () => need('libs/fflate.module.js'),
};

export const MODEL_EXT = ['glb', 'gltf', 'fbx', 'obj', 'dae', '3ds', 'stl', 'ply', 'usdz'];
export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
const DRACO_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/draco_decoder.js';
export const ext = (name) => (name.split('.').pop() || '').toLowerCase();
const base = (u) => { try { u = decodeURIComponent(u); } catch (e) { /* keep */ } return u.split(/[\\/]/).pop().toLowerCase(); };

let draco = null;
function dracoLoader(DRACOLoader) {
  if (!draco) {
    draco = new DRACOLoader();
    draco.setDecoderConfig({ type: 'js' });
    // the decoder is pulled into the worker as a script (fetching it is not allowed here)
    draco._loadLibrary = (url) => Promise.resolve(url.endsWith('.js') ? `importScripts(${JSON.stringify(DRACO_URL)});` : new ArrayBuffer(0));
    draco.setWorkerLimit(2);
  }
  return draco;
}

export async function parseGLTF(data, manager) {
  const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([L.gltf(), L.draco(), L.meshopt()]);
  const loader = new GLTFLoader(manager);
  loader.setDRACOLoader(dracoLoader(DRACOLoader));
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => {
    // textures are decoded through <img> rather than fetch()-based ImageBitmaps
    const cib = window.createImageBitmap;
    try { window.createImageBitmap = undefined; loader.parse(data, '', resolve, reject); }
    catch (e) { reject(e); }
    finally { window.createImageBitmap = cib; }
  });
}

// ------------------------------------------------------------ a .gltf with side files -> one GLB
function dataUriBytes(uri) {
  const i = uri.indexOf(','), meta = uri.slice(5, i), body = uri.slice(i + 1);
  if (meta.endsWith(';base64')) { const s = atob(body), u = new Uint8Array(s.length); for (let k = 0; k < s.length; k++) u[k] = s.charCodeAt(k); return u; }
  return new TextEncoder().encode(decodeURIComponent(body));
}
const mimeOf = (n) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ktx2: 'image/ktx2' }[ext(n)] || 'image/png');
export async function packGltf(gltfFile, files, warnings = []) {
  const json = JSON.parse(await gltfFile.text());
  const chunks = []; let off = 0;
  const push = (u8) => { const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); off += pad; } const at = off; chunks.push(u8); off += u8.byteLength; return at; };
  const offsets = [];
  for (const b of json.buffers || []) {
    let u8;
    if (b.uri && b.uri.startsWith('data:')) u8 = dataUriBytes(b.uri);
    else if (b.uri) {
      const f = files.get(base(b.uri));
      if (!f) throw new Error(`This .gltf needs “${base(b.uri)}”. Select it together with the .gltf file.`);
      u8 = new Uint8Array(await f.arrayBuffer());
    } else u8 = new Uint8Array(b.byteLength || 0);
    offsets.push(push(u8));
  }
  json.bufferViews = json.bufferViews || [];
  for (const bv of json.bufferViews) { bv.byteOffset = (bv.byteOffset || 0) + offsets[bv.buffer || 0]; bv.buffer = 0; }
  for (const img of json.images || []) {
    if (!img.uri) continue;
    let u8, mime = img.mimeType;
    if (img.uri.startsWith('data:')) { u8 = dataUriBytes(img.uri); mime = mime || img.uri.slice(5, img.uri.indexOf(';')); }
    else {
      const f = files.get(base(img.uri));
      if (!f) { warnings.push(`Texture “${base(img.uri)}” was not included, so that surface shows plain.`); delete img.uri; continue; }
      u8 = new Uint8Array(await f.arrayBuffer()); mime = mime || mimeOf(f.name);
    }
    const at = push(u8);
    img.bufferView = json.bufferViews.length; json.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: u8.byteLength });
    img.mimeType = mime; delete img.uri;
  }
  const total = off + ((4 - (off % 4)) % 4);
  if (total) json.buffers = [{ byteLength: total }]; else delete json.buffers;
  const jb = new TextEncoder().encode(JSON.stringify(json)), jpad = (4 - (jb.length % 4)) % 4;
  const len = 12 + 8 + jb.length + jpad + (total ? 8 + total : 0);
  const out = new Uint8Array(len), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, len, true);
  dv.setUint32(12, jb.length + jpad, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jb, 20); out.fill(0x20, 20 + jb.length, 20 + jb.length + jpad);
  if (total) {
    let o = 20 + jb.length + jpad;
    dv.setUint32(o, total, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
    for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  }
  return out.buffer;
}

// ------------------------------------------------------------ zips (e.g. Sketchfab downloads) and dropped folders
export async function expandZips(files) {
  const out = [];
  for (const f of files) {
    if (ext(f.name) !== 'zip') { out.push(f); continue; }
    out.zipName = f.name.replace(/\.zip$/i, '');
    let entries;
    const { unzipSync } = await L.fflate();
    try { entries = unzipSync(new Uint8Array(await f.arrayBuffer())); } catch (e) { throw new Error(`“${f.name}” couldn’t be unpacked.`); }
    for (const [p, data] of Object.entries(entries)) {
      if (p.endsWith('/') || p.startsWith('__MACOSX') || /(^|\/)\./.test(p) || !data.length) continue;
      const name = p.split('/').pop();
      out.push(new File([data], name, { type: IMAGE_EXT.includes(ext(name)) ? mimeOf(name) : 'application/octet-stream' }));
    }
  }
  return out;
}
export async function filesFromDrop(dt) {
  const items = [...(dt.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!items.some((e) => e.isDirectory)) return [...dt.files];
  const out = [];
  const walk = (entry) => new Promise((res) => {
    if (entry.isFile) entry.file((f) => { out.push(f); res(); }, () => res());
    else if (entry.isDirectory) {
      const rd = entry.createReader(), all = [];
      const more = () => rd.readEntries(async (ents) => { if (!ents.length) { for (const e of all) await walk(e); res(); } else { all.push(...ents); more(); } }, () => res());
      more();
    } else res();
  });
  for (const e of items) await walk(e);
  return out;
}

// ------------------------------------------------------------ load any supported model
function managerFor(files) {
  const urls = new Map();
  for (const [n, f] of files) urls.set(n, URL.createObjectURL(f));
  const m = new THREE.LoadingManager();
  let pending = 0, waiters = [];
  const s0 = m.itemStart.bind(m), e0 = m.itemEnd.bind(m), r0 = m.itemError.bind(m);
  const settle = () => { if (pending <= 0) { const w = waiters; waiters = []; w.forEach((f) => f()); } };
  m.itemStart = (u) => { pending++; s0(u); };
  m.itemEnd = (u) => { pending--; e0(u); settle(); };
  m.itemError = (u) => { r0(u); };
  m.setURLModifier((u) => (u.startsWith('blob:') || u.startsWith('data:') ? u : urls.get(base(u)) || u));
  m.idle = (timeout = 12000) => new Promise((res) => { if (pending <= 0) return res(); waiters.push(res); setTimeout(res, timeout); });
  m.revoke = () => { for (const u of urls.values()) URL.revokeObjectURL(u); };
  return m;
}

const GENERIC = /^(scene|model|untitled|mesh|object|export|exported|file|3d|3dmodel|default|source|asset)(\s*\d*)?$/i;
const tidy = (n) => { n = (n || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); return n ? n[0].toUpperCase() + n.slice(1) : ''; };
export async function loadModelFiles(fileList, { nameHint } = {}) {
  const files = new Map();
  for (const f of fileList) files.set(f.name.toLowerCase(), f);
  const all = [...files.values()];
  const main = MODEL_EXT.map((e) => all.find((f) => ext(f.name) === e)).find(Boolean);
  if (!main) throw new Error('No 3D model found. Supported: ' + MODEL_EXT.map((e) => '.' + e).join(' '));
  const kind = ext(main.name), warnings = [];
  const manager = managerFor(files);
  let object;
  try {
    if (kind === 'glb') object = (await parseGLTF(await main.arrayBuffer(), manager)).scene;
    else if (kind === 'gltf') object = (await parseGLTF(await packGltf(main, files, warnings), manager)).scene;
    else if (kind === 'obj') {
      const [{ OBJLoader }, { MTLLoader }] = await Promise.all([L.obj(), L.mtl()]);
      const text = await main.text(), loader = new OBJLoader(manager);
      const lib = (text.match(/^\s*mtllib\s+(.+?)\s*$/m) || [])[1];
      const mtl = (lib && files.get(base(lib))) || all.find((f) => ext(f.name) === 'mtl');
      if (mtl) { const mc = new MTLLoader(manager).parse(await mtl.text(), ''); mc.preload(); loader.setMaterials(mc); }
      else if (lib) warnings.push(`Material file “${base(lib)}” was not included, so the model shows in grey.`);
      object = loader.parse(text);
    } else if (kind === 'fbx') { const { FBXLoader } = await L.fbx(); object = new FBXLoader(manager).parse(await main.arrayBuffer(), ''); }
    else if (kind === 'dae') { const { ColladaLoader } = await L.dae(); object = new ColladaLoader(manager).parse(await main.text(), '').scene; }
    else if (kind === '3ds') { const { TDSLoader } = await L.tds(); object = new TDSLoader(manager).parse(await main.arrayBuffer(), ''); }
    else if (kind === 'stl' || kind === 'ply') {
      const Loader = kind === 'stl' ? (await L.stl()).STLLoader : (await L.ply()).PLYLoader;
      const geo = new Loader().parse(await main.arrayBuffer());
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: geo.attributes.color ? 0xffffff : 0xb9b4ab, roughness: 0.6, vertexColors: !!geo.attributes.color });
      object = new THREE.Mesh(geo, mat);
    } else if (kind === 'usdz') {
      const { USDZLoader } = await L.usdz();
      object = new USDZLoader(manager).parse(await main.arrayBuffer());
      if (!countTris(object)) throw new Error('This USDZ uses a binary layout this viewer cannot read. Try a .glb version of the same item.');
    }
    await manager.idle();
  } catch (e) {
    manager.revoke();
    const msg = String(e && e.message || e);
    if (/draco|DracoDecoderModule|importScripts/i.test(msg)) throw new Error('This model is Draco-compressed and the decoder could not load. Try an uncompressed .glb.');
    throw e instanceof Error ? e : new Error(msg);
  }
  toStandard(object);
  const tris = countTris(object);
  if (!tris) { manager.revoke(); throw new Error('The file loaded but contains no visible geometry.'); }
  if (tris > 600000) warnings.push(`This model is heavy (${Math.round(tris / 1000)}k triangles) and may slow the view down.`);
  // a useful name: the file's, else the zip's, else the model's own top-level name
  let name = tidy(main.name);
  if (!name || GENERIC.test(name)) {
    let own = ''; object.traverse((o) => { if (!own && o.name && !GENERIC.test(tidy(o.name)) && !/^(root|rootnode|sketchfab_model|gltf|node|group)/i.test(o.name)) own = o.name; });
    name = tidy(nameHint) && !GENERIC.test(tidy(nameHint)) ? tidy(nameHint) : tidy(own) || name || 'Imported item';
  }
  return { object, name, kind, warnings, tris, release: () => manager.revoke(), upZ: ['stl', '3ds', 'ply'].includes(kind) };
}

export function countTris(o) {
  let n = 0;
  o.traverse((c) => { if (c.isMesh && c.geometry) { const g = c.geometry; n += (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3; } });
  return Math.round(n);
}

// Phong/Lambert materials from OBJ/FBX/DAE look flat under the house lighting; use PBR equivalents
export function toStandard(root) {
  const cache = new Map();
  const conv = (m) => {
    if (!m) return new THREE.MeshStandardMaterial({ color: 0xb9b4ab, roughness: 0.7 });
    if (m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isShaderMaterial) return m;
    if (cache.has(m)) return cache.get(m);
    const s = new THREE.MeshStandardMaterial({
      name: m.name, color: m.color ? m.color.clone() : new THREE.Color(0xffffff), map: m.map || null,
      normalMap: m.normalMap || null, alphaMap: m.alphaMap || null, aoMap: m.aoMap || null,
      emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0), emissiveMap: m.emissiveMap || null,
      transparent: !!m.transparent, opacity: m.opacity ?? 1, side: m.side, vertexColors: !!m.vertexColors, alphaTest: m.alphaTest || 0,
      roughness: m.shininess !== undefined ? Math.max(0.18, 1 - Math.min(1, m.shininess / 110)) : 0.75, metalness: 0,
    });
    if (m.bumpMap) { s.bumpMap = m.bumpMap; s.bumpScale = m.bumpScale; }
    if (s.map) s.map.colorSpace = THREE.SRGBColorSpace;
    cache.set(m, s); return s;
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
  });
}

export async function exportGLB(object, maxTextureSize = 2048) {
  const { GLTFExporter } = await L.exporter();
  object.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      // opaque colour maps compress far better as JPEG
      if (m && m.map && m.map.userData && !m.map.userData.mimeType && !m.transparent && !m.alphaTest && !m.alphaMap) m.map.userData.mimeType = 'image/jpeg';
    }
  });
  return new Promise((resolve, reject) => new GLTFExporter().parse(object, resolve, reject, { binary: true, onlyVisible: true, maxTextureSize }));
}

// ------------------------------------------------------------ photos
export function loadImage(src) {
  return new Promise((res, rej) => { const img = new Image(); img.decoding = 'async'; img.onload = () => res(img); img.onerror = () => rej(new Error('That image could not be read.')); img.src = src; });
}
export function drawScaled(img, max = 1600) {
  const k = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * k)); c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
// make the plain light background of a product shot transparent (flood fill from the edges)
export function cutoutBackground(src, tol = 26) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const W = c.width, H = c.height, im = g.getImageData(0, 0, W, H), d = im.data;
  // reference colour: average of the corners
  const corners = [0, W - 1, (H - 1) * W, H * W - 1];
  const ref = [0, 1, 2].map((k) => corners.reduce((s, i) => s + d[i * 4 + k], 0) / 4);
  const near = (i) => Math.abs(d[i * 4] - ref[0]) + Math.abs(d[i * 4 + 1] - ref[1]) + Math.abs(d[i * 4 + 2] - ref[2]) < tol * 3;
  const seen = new Uint8Array(W * H), q = new Int32Array(W * H); let qh = 0, qt = 0;
  const seed = (i) => { if (!seen[i] && near(i)) { seen[i] = 1; q[qt++] = i; } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (qh < qt) {
    const i = q[qh++], x = i % W, y = (i / W) | 0;
    if (x > 0) seed(i - 1); if (x < W - 1) seed(i + 1); if (y > 0) seed(i - W); if (y < H - 1) seed(i + W);
  }
  let cleared = 0;
  for (let i = 0; i < W * H; i++) if (seen[i]) { d[i * 4 + 3] = 0; cleared++; }
  // soften the edge by one pixel
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (seen[i]) continue;
    const n = seen[i - 1] + seen[i + 1] + seen[i - W] + seen[i + W];
    if (n) d[i * 4 + 3] = Math.min(d[i * 4 + 3], 255 - n * 45);
  }
  g.putImageData(im, 0, 0);
  // crop to the remaining content
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0 || cleared < W * H * 0.04) return null;   // nothing (or almost nothing) was background
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
export const canvasBlob = (c, type = 'image/jpeg', q = 0.88) => new Promise((res) => c.toBlob(res, type, q));
export function blobToBase64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
}
export function base64ToBuffer(b64) {
  const s = atob(b64.trim()), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}
