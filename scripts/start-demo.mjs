// Starts a separate demo server with its own database (data/demo.sqlite, never your real one),
// fills it with demo data and keeps running, ready for recording.
//
//   npm run demo           start and (re)fill the demo; the demo data stays in data/demo.sqlite
//   npm run demo:reset     delete the demo database first, so everything starts clean
//
// The demo server uses port 3200 (DEMO_PORT to change it) and the Gemini key from .env, if there is one.
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from '../src/server.mjs';
import { seedDemo } from './seed-demo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = path.join(root, '.env');
if (existsSync(env)) process.loadEnvFile(env);

const dbPath = path.join(root, 'data', 'demo.sqlite');
if (process.argv.includes('--reset')) {
  for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true });
  console.log('已刪除舊的示範資料庫。');
}
const host = '127.0.0.1', port = Number(process.env.DEMO_PORT || 3200);
const base = `http://${host}:${port}`;
const app = createApp({ dbPath });
app.listen(port, host, async () => {
  console.log(`夜泊示範伺服器：${base}`);
  try {
    const { username, password } = await seedDemo({ base });
    console.log(`\n示範資料已就緒。用瀏覽器開 ${base}，登入：\n  帳號 ${username}\n  密碼 ${password}\n\n錄影結束後按 Ctrl+C 關閉。`);
  } catch (error) {
    console.error(`示範資料建立失敗：${error.message}`);
    process.exitCode = 1;
  }
});
app.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `連接埠 ${port} 已被使用。可用 DEMO_PORT 換一個。` : `伺服器錯誤：${error.code}`);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close(() => process.exit(0)));
