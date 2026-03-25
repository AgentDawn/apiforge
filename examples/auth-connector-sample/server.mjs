import { createServer } from 'http';
import { randomUUID } from 'crypto';

// ─── Mock Users Database ─────────────────────────────────────
const users = [
  { id: '1', email: 'alice@example.com', name: 'Alice Kim', role: 'admin' },
  { id: '2', email: 'bob@example.com', name: 'Bob Park', role: 'user' },
  { id: '3', email: 'charlie@example.com', name: 'Charlie Lee', role: 'user' },
  { id: '4', email: 'diana@example.com', name: 'Diana Cho', role: 'editor' },
  { id: '5', email: 'eve@example.com', name: 'Eve Jung', role: 'admin' },
];

// ─── Simple JWT-like Token (base64 encoded, not cryptographically secure) ──
function generateToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    jti: randomUUID(),
  })).toString('base64url');
  return `${header}.${payload}.unsigned`;
}

// ─── CORS Headers ────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, data) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ─── Server ──────────────────────────────────────────────────
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /users/search?q=query
  if (req.method === 'GET' && url.pathname === '/users/search') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const results = q
      ? users.filter(u => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
      : users;
    json(res, 200, results);
    return;
  }

  // POST /users/:id/token
  const tokenMatch = url.pathname.match(/^\/users\/(\d+)\/token$/);
  if (req.method === 'POST' && tokenMatch) {
    const user = users.find(u => u.id === tokenMatch[1]);
    if (!user) {
      json(res, 404, { error: 'User not found' });
      return;
    }
    const token = generateToken(user);
    json(res, 200, { token, user: { id: user.id, email: user.email, name: user.name } });
    return;
  }

  // GET / - Health check
  if (req.method === 'GET' && url.pathname === '/') {
    json(res, 200, {
      service: 'APIForge Auth Connector Example',
      endpoints: {
        search: 'GET /users/search?q=<query>',
        token: 'POST /users/{id}/token',
      },
    });
    return;
  }

  json(res, 404, { error: 'Not found' });
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`Auth Connector server running on http://localhost:${PORT}`);
  console.log('');
  console.log('APIForge Connector Config:');
  console.log(`  Search URL: http://localhost:${PORT}/users/search`);
  console.log(`  Token URL:  http://localhost:${PORT}/users/{id}/token`);
});
