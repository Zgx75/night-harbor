import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { AppError } from './ai.mjs';
import { cleanRecords } from './domain.mjs';
import { createAdviceGenerator } from './advice.mjs';
import { knowledge } from './knowledge.mjs';
import { reportData, reportQuestion, reportFacts } from './reports.mjs';
import { createPlanGenerator } from './planner.mjs';
import { createAccountStore } from './accounts.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req, maxBytes = 48000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError(415, 'CONTENT_TYPE', '請使用 JSON 格式。');
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) throw new AppError(413, 'TOO_LARGE', '內容太長了，請縮短後再送出。');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError(400, 'INVALID_JSON', '內容格式有誤，請重新送出。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(400, 'INVALID_JSON', '內容格式有誤。');
  return value;
}

export function createApp({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite', advise, plan, now = Date.now, dbPath = process.env.SQLITE_PATH || path.join(ROOT, 'data', 'night-harbor.sqlite') } = {}) {
  const accounts = createAccountStore({ filename: dbPath, now });
  const generateAdvice = advise || createAdviceGenerator({ apiKey, model });
  const generatePlan = plan || createPlanGenerator({apiKey,model,now});
  const limits = new Map();
  const authLimits = new Map();
  function purge() {
    for (const [id, s] of limits) if (now() - s.started > 15 * 60000) limits.delete(id);
    for (const [id, s] of authLimits) if (now() - s.started > 15 * 60000) authLimits.delete(id);
  }
  const timer = setInterval(purge, 60000).unref();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
        let originAllowed = true;
        if (req.headers.origin) { try { originAllowed = new URL(req.headers.origin).host === req.headers.host; } catch { originAllowed = false; } }
        if (!originAllowed) throw new AppError(403, 'ORIGIN', '請從夜泊頁面操作。');
        if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError(403, 'ORIGIN', '請從夜泊頁面操作。');
        if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { version:'3.0.0', configured: Boolean(apiKey?.trim()), provider: 'Gemini', model });
        if (req.method === 'GET' && url.pathname === '/api/auth/session') return send(res, 200, { user: accounts.currentUser(req) });
        if (req.method === 'GET' && url.pathname === '/api/profile') return send(res, 200, accounts.profile(accounts.requireUser(req).id));
        const socialPath=url.pathname==='/api/social'?'':url.pathname.startsWith('/api/social/')?url.pathname.slice('/api/social/'.length):null;
        const isAuth = ['/api/auth/login', '/api/auth/register', '/api/auth/logout'].includes(url.pathname);
        const knownOperation = ['/api/profile', '/api/records/validate', '/api/plan', '/api/advice', '/api/reports', '/api/reports/advice'].includes(url.pathname);
        if (!isAuth && !knownOperation && url.pathname !== '/api/knowledge' && socialPath===null) throw new AppError(404, 'NOT_FOUND', '找不到這個操作。');
        const user = isAuth ? null : accounts.requireUser(req);
        if(req.method==='GET'&&socialPath!==null) {
          if(socialPath==='')return send(res,200,accounts.social.dashboard(user.id));
          if(socialPath==='search')return send(res,200,accounts.social.search(user.id,url.searchParams.get('q')));
          if(socialPath==='leaderboard')return send(res,200,accounts.social.leaderboard(user.id,url.searchParams.get('scope')||'friends',url.searchParams.get('metric')||'onTime'));
          throw new AppError(404,'NOT_FOUND','找不到這個社群操作。');
        }
        if (req.method === 'GET' && url.pathname === '/api/knowledge') return send(res, 200, { sources: knowledge });
        if (req.method !== 'POST') throw new AppError(405, 'METHOD', '此操作不支援這個方法。');
        const data = await readJson(req, url.pathname === '/api/profile' ? 512000 : 48000);
        purge();
        const ip = req.socket.remoteAddress;
        const limit = limits.get(ip) || { started: now(), count: 0 };
        if (++limit.count > 80) throw new AppError(429, 'RATE_LIMIT', '操作有些頻繁，稍後再試。');
        limits.set(ip, limit);
        if(socialPath!==null)return send(res,200,accounts.social.mutate(user.id,socialPath,data));
        if (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/register') {
          const authLimit = authLimits.get(ip) || { started: now(), count: 0 };
          if (++authLimit.count > 20) throw new AppError(429, 'AUTH_RATE_LIMIT', '登入或註冊次數較多，請十五分鐘後再試。');
          authLimits.set(ip, authLimit);
          const result = await accounts[url.pathname.endsWith('/register') ? 'register' : 'login'](data);
          accounts.logout(req);
          res.setHeader('Set-Cookie', accounts.cookie(req, result.token));
          return send(res, url.pathname.endsWith('/register') ? 201 : 200, { user: result.user });
        }
        if (url.pathname === '/api/auth/logout') {
          accounts.logout(req);
          res.setHeader('Set-Cookie', accounts.cookie(req));
          return send(res, 200, { loggedOut: true });
        }
        if (url.pathname === '/api/profile') return send(res, 200, accounts.saveProfile(user.id, data));
        if (url.pathname === '/api/records/validate') return send(res, 200, { records: cleanRecords(data.records) });
        if (url.pathname === '/api/plan') return send(res, 200, await generatePlan(data));
        if (url.pathname === '/api/advice') return send(res, 200, await generateAdvice({question:data.question,records:data.records,asOf:data.asOf}));
        if (url.pathname === '/api/reports') return send(res,200,reportData(data,now()));
        if (url.pathname === '/api/reports/advice') {
          const report=reportData(data,now());
          const question=reportQuestion(report,data.mode);
          return send(res,200,{report,advice:await generateAdvice({question,records:data.records,asOf:data.asOf,reportContext:reportFacts(report,data.mode)})});
        }
        throw new AppError(404, 'NOT_FOUND', '找不到這個操作。');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new AppError(405, 'METHOD', '不支援這個操作。');
      const pathname = decodeURIComponent(url.pathname);
      const file = path.resolve(PUBLIC, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(PUBLIC + path.sep) || path.basename(file).startsWith('.')) throw new AppError(404, 'NOT_FOUND', '找不到頁面。');
      const ext = path.extname(file);
      if (!types[ext] || !(await stat(file)).isFile()) throw new AppError(404, 'NOT_FOUND', '找不到頁面。');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[ext], 'Cache-Control': 'no-cache', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (error instanceof AppError) return send(res, error.status, { code: error.code, error: error.message });
      if (error.code === 'ENOENT' || error instanceof URIError) return send(res, 404, { error: '找不到頁面。' });
      // Never log user messages, provider response bodies, or credentials.
      console.error('Request failed:', error.name);
      send(res, 500, { code: 'INTERNAL', error: '剛剛有個小問題，請再試一次。' });
    }
  });
  server.requestTimeout = 45000;
  server.on('close', () => { clearInterval(timer); accounts.close(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const envPath = path.join(ROOT, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const app = createApp();
  app.listen(port, host, () => {
    console.log(`Night Harbor / 夜泊: http://${host}:${port}`);
    console.log(`Gemini: ${process.env.GEMINI_API_KEY?.trim() ? 'configured' : 'not configured; see README.md'}`);
  });
  app.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Change PORT in .env.` : `Server error: ${error.code}`);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close(() => process.exit(0)));
}
