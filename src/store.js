// Persistence. With the artifact's shared database the layout and imported items follow
// you across devices; otherwise everything is kept in this browser.
import { blobToBase64, base64ToBuffer } from './importer.js';
import { LAYOUT_REV } from './layout.js';

const LS = 'villa-alera-55/';
const lsGet = (k) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch (e) { return false; } };

function idbOpen() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open('villa-alera-55', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('blobs');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function idb(mode, fn) {
  const d = await idbOpen();
  return new Promise((res, rej) => { const t = d.transaction('blobs', mode); const out = fn(t.objectStore('blobs')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); });
}
const idbPut = (k, v) => idb('readwrite', (s) => s.put(v, k));
const idbGet = (k) => idb('readonly', (s) => s.get(k));
const idbDel = (k) => idb('readwrite', (s) => s.delete(k));

export class Store {
  constructor(onStatus) {
    this.onStatus = onStatus || (() => {});
    this.db = this.assets = this.downloads = this.user = null;
    this.client = Math.random().toString(36).slice(2, 10);
    this.canWrite = true; this.mode = 'local';
    this.localUrls = new Map();
    this._saving = false; this._pending = null; this._timer = 0; this.lastSaved = null;
    this.ready = this._init();
  }
  async _init() {
    const c = window.claude;
    if (c && typeof c.use === 'function') {
      const use = (n) => Promise.resolve().then(() => c.use(n)).catch(() => null);
      [this.db, this.assets, this.downloads, this.user] = await Promise.all([use('db'), use('assets'), use('downloads'), use('user')]);
      if (this.user) { try { if ((await this.user.can('data.write')) === false) this.canWrite = false; } catch (e) { /* unknown: keep */ } }
    }
    this.mode = this.db ? (this.canWrite ? 'shared' : 'readonly') : 'local';
    this.onStatus(this.mode === 'readonly' ? 'readonly' : this.mode === 'shared' ? 'saved' : 'local');
    return this.mode;
  }
  get canUploadShared() { return !!(this.assets && this.db && this.canWrite); }

  // ---------------------------------------------------------- layout
  cachedLayout() { return lsGet('layout'); }
  async loadLayout() {
    await this.ready;
    if (this.db) {
      try {
        const s = await this.db.doc('layouts/main').get();
        if (s.exists) { const d = s.data(); return { items: d.items || [], updatedAt: d.updatedAt || '', rev: d.rev || 1 }; }
        return null;
      } catch (e) { /* fall through to the local copy */ }
    }
    return lsGet('layout');
  }
  watchLayout(cb) {
    if (!this.db) return () => {};
    try {
      return this.db.doc('layouts/main').onSnapshot((s) => {
        if (!s.exists || s.metadata.hasPendingWrites) return;
        const d = s.data();
        if (d.client === this.client) return;
        cb({ items: d.items || [], updatedAt: d.updatedAt || '', rev: d.rev || 1 });
      }, () => {});
    } catch (e) { return () => {}; }
  }
  saveLayout(items) {
    const doc = { v: 1, rev: LAYOUT_REV, items, updatedAt: new Date().toISOString(), client: this.client };
    lsSet('layout', { items, updatedAt: doc.updatedAt, rev: LAYOUT_REV });
    if (!this.db || !this.canWrite) { this.onStatus(this.db ? 'readonly' : 'local'); return; }
    this._pending = doc;
    this.onStatus('dirty');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._flush(), 900);
  }
  async _flush() {
    if (this._saving || !this._pending) return;
    const doc = this._pending; this._pending = null; this._saving = true;
    this.onStatus('saving');
    try {
      await this.db.doc('layouts/main').set(doc);
      this.lastSaved = doc.updatedAt;
      this.onStatus(this._pending ? 'saving' : 'saved');
    } catch (e) {
      const code = e && e.code;
      if (code === 'invalid_argument' || code === 'not_granted') { this.canWrite = false; this.onStatus('readonly'); }
      else if (code === 'unavailable') { this._pending = this._pending || doc; setTimeout(() => this._flush(), 2000 + Math.random() * 1000); }
      else this.onStatus('error', e && e.message);
    } finally {
      this._saving = false;
      if (this._pending) this._flush();
    }
  }

  // ---------------------------------------------------------- saved copies of the layout
  async listSaved() {
    if (this.db) {
      try { const q = await this.db.collection('saved').orderBy('updatedAt', 'desc').limit(100).get(); return q.docs.map((d) => ({ id: d.id, ...pick(d.data(), ['name', 'updatedAt', 'count']) })); } catch (e) { return []; }
    }
    return (lsGet('saved') || []).map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt, count: s.items.length }));
  }
  async saveCopy(name, items) {
    const body = { name, items, count: items.length, updatedAt: new Date().toISOString() };
    if (this.db && this.canWrite) { const ref = await this.db.collection('saved').add(body); return ref.id; }
    const list = lsGet('saved') || [], id = 's' + Date.now().toString(36);
    list.unshift({ id, ...body }); lsSet('saved', list.slice(0, 30)); return id;
  }
  async loadSaved(id) {
    if (this.db) { const s = await this.db.doc('saved/' + id).get(); return s.exists ? s.data().items : null; }
    return (lsGet('saved') || []).find((s) => s.id === id)?.items || null;
  }
  async deleteSaved(id) {
    if (this.db && this.canWrite) return this.db.doc('saved/' + id).delete();
    lsSet('saved', (lsGet('saved') || []).filter((s) => s.id !== id));
  }

  // ---------------------------------------------------------- imported models and photos
  async listModels() {
    await this.ready;
    let out = [];
    if (this.db) {
      try { const q = await this.db.collection('models').limit(500).get(); out = q.docs.map((d) => ({ ...d.data(), id: d.id, shared: true })); } catch (e) { out = []; }
    }
    const local = (lsGet('models') || []).filter((m) => !out.some((o) => o.id === m.id));
    return out.concat(local);
  }
  watchModels(cb) {
    if (!this.db) return () => {};
    try { return this.db.collection('models').onSnapshot((q) => cb(q.docs.map((d) => ({ ...d.data(), id: d.id, shared: true }))), () => {}); } catch (e) { return () => {}; }
  }
  async _putLocalMeta(meta) {
    const list = (lsGet('models') || []).filter((m) => m.id !== meta.id); list.push(meta); lsSet('models', list);
  }
  // store a GLB; returns the saved meta (meta.shared tells where it went)
  async putModel(meta, glb) {
    meta = { ...meta, bytes: glb.byteLength, createdAt: new Date().toISOString() };
    if (this.canUploadShared && glb.byteLength < 14.5 * 1024 * 1024) {
      try {
        const b64 = await blobToBase64(new Blob([glb]));
        const up = await this.assets.upload(new Blob([b64], { type: 'text/plain' }), { type: 'text/plain' });
        const doc = { ...meta, asset: up.id }; delete doc.shared; delete doc.id;
        await this.db.doc('models/' + meta.id).set(doc);
        return { ...doc, id: meta.id, shared: true };
      } catch (e) { meta.uploadError = (e && (e.code || e.message)) || 'upload failed'; }
    }
    await idbPut('model:' + meta.id, glb);
    const m = { ...meta, local: true }; await this._putLocalMeta(m); return m;
  }
  async getModelBuffer(meta) {
    if (meta.asset) {
      const r = await fetch('/_blob/' + meta.asset);
      if (!r.ok) throw new Error('The stored model could not be fetched (' + r.status + ').');
      return base64ToBuffer(await r.text());
    }
    const buf = await idbGet('model:' + meta.id);
    if (!buf) throw new Error('This model was saved in another browser.');
    return buf;
  }
  async putPhoto(meta, blob) {
    meta = { ...meta, bytes: blob.size, createdAt: new Date().toISOString() };
    if (this.canUploadShared) {
      try {
        const up = await this.assets.upload(blob, { type: blob.type || 'image/png' });
        const doc = { ...meta, asset: up.id }; delete doc.id; delete doc.shared;
        await this.db.doc('models/' + meta.id).set(doc);
        return { ...doc, id: meta.id, shared: true };
      } catch (e) { meta.uploadError = (e && (e.code || e.message)) || 'upload failed'; }
    }
    await idbPut('photo:' + meta.id, blob);
    this.localUrls.set(meta.id, URL.createObjectURL(blob));
    const m = { ...meta, local: true }; await this._putLocalMeta(m); return m;
  }
  photoUrl(meta) {
    if (!meta) return null;
    return this.localUrls.get(meta.id) || (meta.asset ? '/_blob/' + meta.asset : null);
  }
  async ensureLocalPhoto(meta) {
    if (meta.asset || this.localUrls.has(meta.id)) return this.photoUrl(meta);
    try { const b = await idbGet('photo:' + meta.id); if (b) { this.localUrls.set(meta.id, URL.createObjectURL(b)); return this.localUrls.get(meta.id); } } catch (e) { /* none */ }
    return null;
  }
  async updateModelMeta(meta, patch) {
    if (meta.shared && this.db && this.canWrite) { try { await this.db.doc('models/' + meta.id).update(patch); } catch (e) { /* keep local */ } }
    else { await this._putLocalMeta({ ...meta, ...patch }); }
  }
  async removeModel(meta) {
    if (meta.shared && this.db && this.canWrite) {
      await this.db.doc('models/' + meta.id).delete();
      if (meta.asset && this.assets) { try { await this.assets.delete(meta.asset); } catch (e) { /* already gone */ } }
    } else {
      lsSet('models', (lsGet('models') || []).filter((m) => m.id !== meta.id));
      try { await idbDel((meta.kind === 'photo' ? 'photo:' : 'model:') + meta.id); } catch (e) { /* none */ }
    }
  }

  // ---------------------------------------------------------- notes: marks on a view of the model, a comment, reference pictures
  async listNotes() {
    await this.ready;
    if (this.db) {
      try { const q = await this.db.collection('notes').limit(500).get(); return q.docs.map((d) => ({ ...d.data(), id: d.id })); } catch (e) { /* fall back to this browser */ }
    }
    return lsGet('notes') || [];
  }
  watchNotes(cb) {
    if (!this.db) return () => {};
    try { return this.db.collection('notes').onSnapshot((q) => cb(q.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {}); } catch (e) { return () => {}; }
  }
  get notesWritable() { return !this.db || this.canWrite; }
  async saveNote(note) {
    const doc = { ...note }; delete doc.id;
    if (this.db && this.canWrite) { await this.db.doc('notes/' + note.id).set(doc); return { ...doc, id: note.id }; }
    const list = (lsGet('notes') || []).filter((n) => n.id !== note.id); list.push({ ...doc, id: note.id });
    if (!lsSet('notes', list)) throw new Error('This browser has no room left to keep the note.');
    return { ...doc, id: note.id };
  }
  async patchNote(id, patch) {
    if (this.db && this.canWrite) { await this.db.doc('notes/' + id).update(patch); return; }
    lsSet('notes', (lsGet('notes') || []).map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }
  async deleteNote(note) {
    if (this.db && this.canWrite) await this.db.doc('notes/' + note.id).delete();
    else lsSet('notes', (lsGet('notes') || []).filter((n) => n.id !== note.id));
    for (const ref of [note.shot, ...(note.images || [])]) if (ref) this.dropNoteImage(ref);
  }
  // a picture for a note: an asset when the shared store takes it, else kept in this browser
  async putNoteImage(blob) {
    if (this.canUploadShared) {
      try { const up = await this.assets.upload(blob, { type: blob.type || 'image/jpeg' }); return { asset: up.id }; } catch (e) { /* keep it here */ }
    }
    const key = 'ni-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    await idbPut('noteimg:' + key, blob);
    this.localUrls.set(key, URL.createObjectURL(blob));
    return { local: key };
  }
  noteImageUrl(ref) {
    if (!ref) return null;
    if (ref.asset) return '/_blob/' + ref.asset;
    return (ref.local && this.localUrls.get(ref.local)) || null;
  }
  async ensureNoteImage(ref) {
    const u = this.noteImageUrl(ref);
    if (u || !ref || !ref.local) return u;
    try { const b = await idbGet('noteimg:' + ref.local); if (b) { this.localUrls.set(ref.local, URL.createObjectURL(b)); return this.localUrls.get(ref.local); } } catch (e) { /* not in this browser */ }
    return null;
  }
  async dropNoteImage(ref) {
    try {
      if (ref.asset && this.assets && this.canWrite) await this.assets.delete(ref.asset);
      else if (ref.local) { await idbDel('noteimg:' + ref.local); const u = this.localUrls.get(ref.local); if (u) URL.revokeObjectURL(u); this.localUrls.delete(ref.local); }
    } catch (e) { /* already gone */ }
  }
  async userId() {
    if (this._uid !== undefined) return this._uid;
    this._uid = null;
    try { if (this.user && typeof this.user.id === 'function') this._uid = (await this.user.id()) || null; } catch (e) { /* not told */ }
    return this._uid;
  }

  // ---------------------------------------------------------- files out
  async download(filename, data) {
    await this.ready;
    if (this.downloads) {
      try { await this.downloads.save({ filename, data }); return 'saved'; }
      catch (e) { if (e && e.code === 'declined') return 'declined'; if (e && e.code !== 'unavailable') throw e; }
    }
    if (!window.claude) {   // opened as a plain page: an ordinary download works
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return 'saved';
    }
    return 'unavailable';
  }
}
function pick(o, keys) { const r = {}; for (const k of keys) if (o && k in o) r[k] = o[k]; return r; }
