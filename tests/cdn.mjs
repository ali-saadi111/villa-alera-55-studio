// Serve three.js "from the CDN" out of node_modules during tests.
import fs from 'fs'; import path from 'path';
const ROOT = path.resolve('node_modules/three');
export async function routeCdn(target) {
  await target.route(/cdn\.jsdelivr\.net\/npm\/three@0\.169\.0\/(.*)$/, (route) => {
    const rel = route.request().url().replace(/^.*three@0\.169\.0\//, '').split('?')[0];
    const f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'missing ' + rel });
    route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
  });
  await target.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
}
