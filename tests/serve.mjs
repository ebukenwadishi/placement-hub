// Tiny static server for the site folder (no dependencies).
// Also serves tests/mock-firebase at /__mock/ so the checks can test real-account screens offline.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = join(here, '..', 'site');
const MOCK = join(here, 'mock-firebase');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

export function startServer(port = Number(process.env.PORT) || 4173) {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let root = SITE;
      if (path.startsWith('/__mock/')) { root = MOCK; path = path.slice('/__mock'.length); }
      let file = normalize(join(root, path));
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); }
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT) || 4173;
  await startServer(port);
  console.log(`Website: http://localhost:${port}\nApp:     http://localhost:${port}/app/`);
}
