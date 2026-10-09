# Villa Alera 55 — Layout Studio

A 3D model of Villa Alera 55 that runs in the browser: walk through the house, furnish it, and mark up any view with notes. Built with [three.js](https://threejs.org) and bundled by esbuild into a single HTML page.

![The villa from the street, with the furniture catalog open](docs/overview.jpg)

## What it does

- **Explore** the house from outside or floor by floor (basement, ground, first, attic). Low walls turn a floor into a plan; Walk mode puts you inside at eye level (W A S D, or click the floor to go there).
- **Furnish** it from a catalog of 68 pieces in 9 categories (seating, tables, storage, beds, lighting, decor, kitchen, bath, outdoor). Drag to move, drag the ring to turn, set exact sizes and colours, duplicate, lock or hide.
- **Bring in your own pieces**: 3D models (GLB/GLTF or the .zip they came in, FBX, OBJ + MTL, DAE, 3DS, STL, PLY, USDZ) at their real size, or a product photo shown as a stand-up cut-out, box, panel or rug.
- **Notes**: circle what should change on any view, say what you want and attach reference pictures (pick, paste or drop them). Each note keeps its camera, so opening it flies back to that exact view with the circles in place. Comment on notes, mark them done, edit or delete them; numbered pins show where they are.
- **More**: tape measure, undo/redo, saved layouts, layout export/import (.json), a picture of the current view, day and dusk lighting, phone layout.

![A note: circles on the view, the comment and reference pictures](docs/notes.jpg)

## Run it

```sh
npm install
npm run build              # → dist/villa.html (one page) and dist/textures/
npx serve dist             # or: python3 -m http.server -d dist
```

Then open `villa.html`. three.js loads from jsDelivr; the Poly Haven textures and sky load from `textures/` next to the page (until they arrive, procedural materials stand in).

**Where things are saved.** Published as a claude.ai artifact, the page uses the artifact's shared store (`window.claude`: `db`, `assets`, `user`), so the layout, imported models and notes follow you across devices. Opened anywhere else, it keeps everything in the browser (localStorage and IndexedDB).

## Project layout

| Path | What's in it |
| --- | --- |
| `src/main.js` | The app: views, Walk mode, items, history, storage sync |
| `src/building.js` | The villa itself, in metres: walls and openings, stairs, roofs, the pool hall, the site |
| `src/acc.js`, `src/kit.js`, `src/util.js` | Geometry helpers and shared constants (levels, the angled wing's frame) |
| `src/materials.js`, `src/realtex.js` | Procedural materials; real textures and the HDR sky swapped in once loaded |
| `src/furniture.js`, `src/layout.js`, `src/items.js` | The furniture catalog, the starting layout (with migrations), placed items |
| `src/editor.js` | Selecting, dragging, turning, walking, measuring |
| `src/notes.js` | Notes: circles on a view, comments, reference pictures |
| `src/ui.js`, `src/app.css`, `src/index.html` | Toolbar, panels, dialogs, the page shell |
| `src/store.js` | Saving: the artifact store or this browser |
| `src/importer.js`, `src/thumbs.js` | Model and photo import; catalog thumbnails |
| `build.mjs` | Bundles everything into `dist/villa.html` |
| `tests/` | Model checks and headless-browser tests |
| `tools/` | The Poly Haven texture fetcher and texture preparation |
| `textures/` | The prepared texture pack and sky |

## Tests

```sh
npm test                   # the model: geometry sanity, furniture against walls
npm run test:browser       # headless Chromium: the main flows, then notes
```

The browser tests use Playwright (`npm i -D playwright`, or a global install found through `npm root -g` or `NPM_G`). They run on software WebGL, so allow about ten minutes for each.

## Credits

- [three.js](https://threejs.org) (MIT), loaded from [jsDelivr](https://www.jsdelivr.com)
- Textures and sky HDRI from [Poly Haven](https://polyhaven.com) (CC0)
- [esbuild](https://esbuild.github.io)
