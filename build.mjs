// Bundle the app into one page. three.js itself loads from the jsDelivr CDN through an import map.
import { build } from 'esbuild';
import fs from 'fs';

const THREE_VER = '0.169.0';
const r = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'esm', minify: true, write: false,
  external: ['three', 'three/addons/*'],
  target: ['es2022', 'chrome100', 'safari16', 'firefox110'], legalComments: 'none', logLevel: 'warning',
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const css = fs.readFileSync('src/app.css', 'utf8');
const tpl = fs.readFileSync('src/index.html', 'utf8');
const importmap = JSON.stringify({ imports: {
  three: `https://cdn.jsdelivr.net/npm/three@${THREE_VER}/build/three.module.min.js`,
  'three/addons/': `https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/`,
} });
const html = tpl.replace('/*CSS*/', () => css).replace('/*IMPORTMAP*/', () => importmap).replace('/*JS*/', () => js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/villa.html', html);
// the Poly Haven texture pack is published next to the page (textures/...)
if (fs.existsSync('textures')) fs.cpSync('textures', 'dist/textures', { recursive: true });
fs.writeFileSync('dist/test.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + html + '</body></html>');
console.log('dist/villa.html', (html.length / 1024).toFixed(0) + ' KB', ' js', (js.length / 1024).toFixed(0) + ' KB');
