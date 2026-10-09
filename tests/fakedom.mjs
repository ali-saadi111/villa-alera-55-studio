// Minimal DOM canvas stand-in so the procedural textures can run under Node.
const grad = { addColorStop() {} };
function ctx2d(canvas) {
  return new Proxy({ canvas }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'getImageData' || k === 'createImageData') return (x, y, w, h) => { w = w ?? x.width ?? x; h = h ?? x.height ?? y; return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k.startsWith && k.startsWith('create')) return () => grad;
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
globalThis.document = {
  createElement(tag) {
    const c = { tagName: tag, width: 300, height: 150, style: {}, getContext() { return this._ctx || (this._ctx = ctx2d(this)); }, addEventListener() {}, toDataURL() { return 'data:,'; } };
    return c;
  },
  createElementNS(ns, tag) { return this.createElement(tag); },
};
export const fakeRenderer = { capabilities: { getMaxAnisotropy: () => 8 } };
