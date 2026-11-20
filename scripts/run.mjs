import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, platform } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const WEB_DIR = join(ROOT, 'dist', 'web');
const LEADERBOARD_PATH = join(homedir(), '.dao-den-long', 'leaderboard.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function loadLeaderboard() {
  try {
    if (!existsSync(LEADERBOARD_PATH)) return [];
    const parsed = JSON.parse(readFileSync(LEADERBOARD_PATH, 'utf8'));
    if (Array.isArray(parsed.entries)) return sortEntries(parsed.entries);
    return [];
  } catch {
    return [];
  }
}

function sortEntries(entries) {
  return [...entries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.achieved_at).localeCompare(String(b.achieved_at));
    })
    .slice(0, 10);
}

function saveLeaderboard(entries) {
  mkdirSync(dirname(LEADERBOARD_PATH), { recursive: true });
  const sorted = sortEntries(entries);
  writeFileSync(LEADERBOARD_PATH, JSON.stringify({ entries: sorted }, null, 2) + '\n', 'utf8');
  return sorted;
}

function validateEntry(body) {
  if (!body || typeof body !== 'object') return null;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  // Allow 3-12 chars: ASCII [A-Za-z0-9_] or Vietnamese Unicode letters
  if (name.length < 3 || name.length > 12 || !/^[\p{L}\p{N}_]+$/u.test(name)) {
    return null;
  }
  const score = Number.isFinite(body.score) ? Math.max(0, Math.floor(body.score)) : 0;
  const nightsWon = Number.isInteger(body.nights_won)
    ? Math.max(0, Math.min(3, body.nights_won))
    : 0;
  const achievedAt =
    typeof body.achieved_at === 'string' && body.achieved_at.length > 0
      ? body.achieved_at
      : new Date().toISOString();
  const seed = Number.isInteger(body.seed) ? body.seed : 2026;
  return { name, score, nights_won: nightsWon, achieved_at: achievedAt, seed };
}

// Check for --export-leaderboard <out.json>
const argv = process.argv.slice(2);
const exportIdx = argv.indexOf('--export-leaderboard');
if (exportIdx !== -1) {
  const outPath = argv[exportIdx + 1];
  if (!outPath) {
    process.stderr.write('Missing output file path for --export-leaderboard\n');
    process.exit(1);
  }
  const entries = loadLeaderboard();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ entries }, null, 2) + '\n', 'utf8');
  process.exit(0);
}

if (!existsSync(join(WEB_DIR, 'index.html'))) {
  process.stderr.write('Missing dist/web/index.html. Run "npm run build" first.\n');
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');

  if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
    const entries = loadLeaderboard();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ entries }));
    return;
  }

  if (url.pathname === '/api/leaderboard' && req.method === 'POST') {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        const entry = validateEntry(JSON.parse(raw));
        if (!entry) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid leaderboard entry' }));
          return;
        }
        const entries = saveLeaderboard([...loadLeaderboard(), entry]);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ entries }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed JSON' }));
      }
    });
    return;
  }

  let filePath = join(WEB_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!existsSync(filePath)) {
    filePath = join(WEB_DIR, 'index.html');
  }
  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
});

const port = Number.parseInt(process.env.PORT || '4173', 10);
server.listen(port, '127.0.0.1', () => {
  const targetUrl = `http://127.0.0.1:${port}/`;
  process.stdout.write(`Đảo Đèn Lồng running at ${targetUrl}\n`);
  process.stdout.write(`Leaderboard stored at ${LEADERBOARD_PATH}\n`);
  if (!argv.includes('--no-open')) {
    const opener = platform() === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(opener, [targetUrl], { stdio: 'ignore', detached: true });
    child.unref();
  }
});
