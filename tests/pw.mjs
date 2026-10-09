// Playwright for the browser tests: this project's node_modules (npm i -D playwright), else the global install
// (`npm root -g`, or set NPM_G to a node_modules folder that has it).
import { createRequire } from 'module';
import { execSync } from 'child_process';
import path from 'path';
const require = createRequire(import.meta.url);
function load() {
  try { return require('playwright'); } catch (e) { /* not installed in the project */ }
  const root = process.env.NPM_G || execSync('npm root -g').toString().trim();
  return require(path.join(root, 'playwright'));
}
export const { chromium } = load();
