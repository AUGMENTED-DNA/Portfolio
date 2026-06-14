const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 4000;
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  // also serve root-level files (manifest, sw, etc.)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.slice(1));
  }
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`PAI Launcher → http://localhost:${PORT}`));
