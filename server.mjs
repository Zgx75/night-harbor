import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, createGeminiResponder } from './ai.mjs';
import { cleanRecords } from './domain.mjs';
import { createAdviceGenerator } from './advice.mjs';
import { knowledge } from './knowledge.mjs';
import { reportData, reportQuestion, reportFacts } from './reports.mjs';
import { createPlanGenerator } from './planner.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const MOODS = { tense: '有點繃緊', empty: '有些空空的', reluctant: '還捨不得睡' };
const TTL = 60 * 60 * 1000;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError(415, 'CONTENT_TYPE', '請使用 JSON 格式。');
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 48000) throw new AppError(413, 'TOO_LARGE', '內容太長了，請縮短後再送出。');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError(400, 'INVALID_JSON', '內容格式有誤，請重新送出。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(400, 'INVALID_JSON', '內容格式有誤。');
  return value;
}

export function createApp({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite', respond, advise, plan, now = Date.now } = {}) {
  const generate = respond || createGeminiResponder({ apiKey, model });
  const generateAdvice = advise || createAdviceGenerator({ apiKey, model });
  const generatePlan = plan || createPlanGenerator({apiKey,model,now});
  const sessions = new Map();
  const limits = new Map();
  function purge() {
    for (const [id, s] of sessions) if (!s.busy && now() - s.updated > TTL) sessions.delete(id);
    for (const [id, s] of limits) if (now() - s.started > 15 * 60000) limits.delete(id);
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
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new AppError(403, 'ORIGIN', '請從夜泊頁面操作。');
        if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError(403, 'ORIGIN', '請從夜泊頁面操作。');
        if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { version:'3.0.0', configured: Boolean(apiKey?.trim()), provider: 'Gemini', model, maxTurns: 3 });
        if (req.method === 'GET' && url.pathname === '/api/knowledge') return send(res, 200, { sources: knowledge });
        if (req.method !== 'POST') throw new AppError(405, 'METHOD', '此操作不支援這個方法。');
        const data = await readJson(req);
        purge();
        const ip = req.socket.remoteAddress;
        const limit = limits.get(ip) || { started: now(), count: 0 };
        if (++limit.count > 80) throw new AppError(429, 'RATE_LIMIT', '操作有些頻繁，稍後再試。');
        limits.set(ip, limit);
        if (url.pathname === '/api/records/validate') return send(res, 200, { records: cleanRecords(data.records) });
        if (url.pathname === '/api/plan') return send(res, 200, await generatePlan(data));
        if (url.pathname === '/api/advice') return send(res, 200, await generateAdvice({question:data.question,records:data.records,asOf:data.asOf}));
        if (url.pathname === '/api/reports') return send(res,200,reportData(data,now()));
        if (url.pathname === '/api/reports/advice') {
          const report=reportData(data,now());
          const question=reportQuestion(report,data.mode);
          return send(res,200,{report,advice:await generateAdvice({question,records:data.records,asOf:data.asOf,reportContext:reportFacts(report,data.mode)})});
        }
        if (url.pathname === '/api/sessions') {
          if (!Object.hasOwn(MOODS, data.mood) || typeof data.bedtime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.bedtime)) throw new AppError(400, 'INPUT', '請選擇今晚的心情與收尾時間。');
          if (sessions.size >= 100) throw new AppError(503, 'CAPACITY', '目前使用人數較多，稍後再試。');
          const greeting = '白天的時間，好像都分給別人了。現在這一小段，我們留給你。\n\n今晚，你最捨不得結束的是什麼？';
          const session = { id: randomUUID(), mood: data.mood, moodLabel: MOODS[data.mood], bedtime: data.bedtime, turn: 0, updated: now(), busy: false, messages: [{ role: 'model', parts: [{ text: greeting }] }] };
          sessions.set(session.id, session);
          return send(res, 201, { id: session.id, greeting, turn: 0, maxTurns: 3 });
        }
        const match = url.pathname.match(/^\/api\/sessions\/([a-f0-9-]{36})\/(messages|close)$/);
        if (!match) throw new AppError(404, 'NOT_FOUND', '找不到這個操作。');
        const session = sessions.get(match[1]);
        if (!session) throw new AppError(404, 'SESSION_EXPIRED', '這段對話已結束或逾時，可以重新開始，或直接選收尾動作。');
        if (match[2] === 'close') {
          sessions.delete(session.id);
          return send(res, 200, { closed: true });
        }
        if (session.turn >= 3) throw new AppError(409, 'SESSION_COMPLETE', '今晚的對話已經完成，接下來選一個小動作就好。');
        if (session.busy) throw new AppError(409, 'IN_FLIGHT', '上一則回覆還在路上，請稍候。');
        if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 1200) throw new AppError(400, 'INPUT', '請輸入 1 到 1200 字的內容。');
        session.busy = true;
        try {
          const text = data.text.trim();
          const reply = await generate(session, text);
          // Commit only after success: an unavailable provider never consumes a turn.
          session.messages.push({ role: 'user', parts: [{ text }] }, { role: 'model', parts: [{ text: reply.message }] });
          session.turn++;
          session.updated = now();
          return send(res, 200, { ...reply, turn: session.turn, done: session.turn >= 3, source: 'gemini' });
        } finally { session.busy = false; }
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
  server.on('close', () => clearInterval(timer));
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
