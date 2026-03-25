// Dev server: serves static files + proxies /auth/* and /api/* to Go backend
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const API_TARGET = process.env.API_URL || 'http://localhost:8090';
const PORT = parseInt(process.env.PORT || '3000', 10);

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  // Remove query string
  filePath = filePath.split('?')[0];

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback: serve index.html
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });
}

function proxyRequest(req, res) {
  const url = new URL(req.url, API_TARGET);
  const proxyReq = http.request(url, {
    method: req.method,
    headers: { ...req.headers, host: url.host },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Backend unavailable: ' + err.message }));
  });

  req.pipe(proxyReq);
}

// In-memory workspace storage (keyed by auth token)
const workspaceStore = new Map();

const REPORT_DIR = path.join(__dirname, 'playwright-report');

function serveReport(req, res) {
  const urlPath = req.url.replace('/test-report', '').split('?')[0] || '/index.html';
  let filePath = path.join(REPORT_DIR, urlPath === '/' ? 'index.html' : urlPath);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      filePath = path.join(REPORT_DIR, 'index.html');
    }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });
}

function handleWorkspaceApi(req, res) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '') || 'anonymous';

  if (req.method === 'GET') {
    const data = workspaceStore.get(token) || { tabs: [], activeTabId: null };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } else if (req.method === 'PUT') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        workspaceStore.set(token, data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
}

const server = http.createServer((req, res) => {
  // Handle workspace API locally (mock)
  if (req.url === '/api/workspace' || req.url.startsWith('/api/workspace?')) {
    handleWorkspaceApi(req, res);
  } else if (req.url.startsWith('/auth/') || req.url.startsWith('/api/') || req.url.startsWith('/public/') || req.url === '/health') {
    proxyRequest(req, res);
  } else if (req.url === '/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ allowRegistration: process.env.ALLOW_REGISTRATION === 'true' }));
  } else if (req.url.startsWith('/test-report')) {
    serveReport(req, res);
  } else if (req.url.startsWith('/admin')) {
    const adminPath = path.join(PUBLIC_DIR, 'admin.html');
    res.setHeader('Content-Type', 'text/html');
    fs.createReadStream(adminPath).pipe(res);
  } else if (req.url.startsWith('/docs/')) {
    // Serve docs.html for all /docs/* routes (SPA-style)
    const docsPath = path.join(PUBLIC_DIR, 'docs.html');
    res.setHeader('Content-Type', 'text/html');
    fs.createReadStream(docsPath).pipe(res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Dev server on http://localhost:${PORT}`);
  console.log(`  Static: ${PUBLIC_DIR}`);
  console.log(`  API proxy: ${API_TARGET}`);
});
