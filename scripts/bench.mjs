import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const WEB_DIR = join(ROOT, 'dist', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function parseArgs(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected arg: ${token}`);
    const eq = token.indexOf('=');
    if (eq !== -1) {
      map.set(token.slice(0, eq), token.slice(eq + 1));
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`Missing value for ${token}`);
      map.set(token, next);
      i++;
    }
  }
  const seed = Number.parseInt(map.get('--seed') ?? '42', 10);
  const duration = Number.parseFloat(map.get('--duration') ?? '30');
  const out = map.get('--out') ?? 'bench.json';
  if (!Number.isInteger(seed)) throw new Error('Invalid --seed');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid --duration');
  return { seed, duration, out };
}

function findBrowser() {
  const candidates =
    platform() === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        ]
      : ['google-chrome', 'chromium', 'chromium-browser'];

  for (const c of candidates) {
    if (c.startsWith('/')) {
      if (existsSync(c)) return c;
    } else {
      try {
        const found = execFileSync('which', [c], { encoding: 'utf8' }).trim();
        if (found) return found;
      } catch {
        // continue
      }
    }
  }
  return null;
}

function sampleProcessTreeRssMb(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    const kb = Number.parseInt(out, 10);
    return Number.isFinite(kb) ? kb / 1024 : null;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(join(WEB_DIR, 'index.html'))) {
    process.stderr.write('Missing dist/web/index.html. Run "npm run build" first.\n');
    process.exit(1);
  }

  const browserPath = findBrowser();
  if (!browserPath) {
    process.stderr.write('No Chrome/Chromium browser found to run WebGL benchmark.\n');
    process.exit(1);
  }

  const procStartMs = performance.now();
  const profileDir = mkdtempSync(join(tmpdir(), 'ddl-bench-chrome-'));
  let peakMemMb = 0;
  let browserChild = null;
  let memInterval = null;

  const resultPromise = new Promise((resolveResult, rejectResult) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');

      if (url.pathname === '/__bench_result' && req.method === 'POST') {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
          try {
            const payload = JSON.parse(raw);
            server.close();
            resolveResult(payload);
          } catch (e) {
            server.close();
            rejectResult(e);
          }
        });
        return;
      }

      let filePath = join(WEB_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
      if (!existsSync(filePath)) filePath = join(WEB_DIR, 'index.html');
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(readFileSync(filePath));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 4173;
      const benchUrl = `http://127.0.0.1:${port}/?bench=1&seed=${args.seed}&duration=${args.duration}`;

      browserChild = spawn(
        browserPath,
        [
          `--user-data-dir=${profileDir}`,
          '--window-size=1280,720',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-gpu-vsync',
          '--disable-frame-rate-limit',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--autoplay-policy=no-user-gesture-required',
          `--app=${benchUrl}`,
        ],
        { stdio: 'ignore' },
      );

      memInterval = setInterval(() => {
        if (browserChild && browserChild.pid) {
          const mb = sampleProcessTreeRssMb(browserChild.pid);
          if (mb !== null && mb > peakMemMb) peakMemMb = mb;
        }
      }, 500);

      // Safety timeout (warmup 3s + duration + 25s margin)
      const timeout = setTimeout(() => {
        server.close();
        rejectResult(new Error('Benchmark timed out waiting for browser result.'));
      }, (args.duration + 28) * 1000);
      timeout.unref();
    });
  });

  try {
    const payload = await resultPromise;
    const totalLoadMs = Math.round(
      payload.load_ms !== undefined ? payload.load_ms : performance.now() - procStartMs,
    );

    const benchJson = {
      contract_version: '1.3',
      avg_fps: Math.round(payload.avg_fps * 10) / 10,
      p1_low_fps: Math.round(payload.p1_low_fps * 10) / 10,
      frame_ms_p95: Math.round(payload.frame_ms_p95 * 10) / 10,
      frames: payload.frames,
      load_ms: totalLoadMs,
      peak_mem_mb: peakMemMb > 0 ? Math.round(peakMemMb * 10) / 10 : null,
      vsync_off: true,
      renderer: payload.renderer || 'Three.js 0.174 WebGL2',
      os: `${platform()} ${release()} (${arch()})`,
    };

    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, JSON.stringify(benchJson, null, 2) + '\n', 'utf8');
    process.stdout.write(JSON.stringify(benchJson, null, 2) + '\n');
  } finally {
    if (memInterval) clearInterval(memInterval);
    if (browserChild) {
      try {
        browserChild.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Bench Error: ${err.message}\n`);
  process.exit(1);
});
