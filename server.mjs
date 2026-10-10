import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { handleImport } from './lib/api.mjs';

const types = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
const port = Number(process.env.PORT || 3000);
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/api/series') {
      const answer = await handleImport(new Request(url, { method: req.method }));
      res.writeHead(answer.status, Object.fromEntries(answer.headers)); res.end(Buffer.from(await answer.arrayBuffer())); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const file = types[url.pathname];
    if (!file) { res.writeHead(404); res.end('Nie znaleziono.'); return; }
    const body = await readFile(fileURLToPath(new URL(`./public/${file[0]}`, import.meta.url)));
    res.writeHead(200, { 'Content-Type': file[1], 'X-Content-Type-Options': 'nosniff' }); res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('Błąd serwera.'); }
}).listen(port, '0.0.0.0', () => console.log(`Player: http://localhost:${port}\nZatrzymanie: Ctrl+C`));
