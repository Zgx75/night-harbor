import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../server.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const STATE = path.join(ROOT, 'data', 'fixed-url.json');

export function fixedOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('固定網址必須是沒有路徑或帳密的 HTTPS 網址。');
  return url.origin;
}
export function configuredOrigin(value) {
  const origin = fixedOrigin(value);
  const hostname = new URL(origin).hostname;
  if (/^[0-9a-f]+-(?:\d{1,3}-){3}\d{1,3}\.ngrok-free\.app$/i.test(hostname)) throw new Error('這是臨時 ngrok 網址，不能用作固定網址。請到 https://dashboard.ngrok.com/domains 取得帳號的開發網域。');
  return origin;
}
export function endpointFromLog(line) {
  try {
    const value = JSON.parse(line);
    if (typeof value.url === 'string' && value.url.startsWith('https://')) return fixedOrigin(value.url);
  } catch { /* Only complete, structured endpoint records are used. */ }
  return null;
}
export function ngrokConfiguration(port, url) {
  return { version: '3', agent: { inspect_db_size: -1 }, endpoints: [{ name: 'night-harbor', ...(url ? { url: fixedOrigin(url) } : {}), upstream: { url: `http://127.0.0.1:${port}` } }] };
}
export function ngrokArguments(userConfig, runtimeConfig) {
  return ['start', 'night-harbor', '--config', `${userConfig},${runtimeConfig}`, '--log=stdout', '--log-format=json', '--log-level=info'];
}
function findNgrok() {
  const candidates = [process.env.NGROK_BIN, path.join(homedir(), 'Downloads', 'ngrok-v3-stable-windows-amd64', 'ngrok.exe'), process.platform === 'win32' ? 'ngrok.exe' : 'ngrok'].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    if (probe.status === 0 && /ngrok version 3\./.test(probe.stdout || '')) return candidate;
  }
  throw new Error('找不到可執行的 ngrok v3。請先安裝 ngrok，或用 NGROK_BIN 指定 ngrok.exe 的完整路徑。');
}

async function main() {
  const env = path.join(ROOT, '.env');
  if (existsSync(env)) process.loadEnvFile(env);
  const binary = findNgrok();
  const previous = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
  const pinned = process.env.PUBLIC_URL ? configuredOrigin(process.env.PUBLIC_URL) : previous?.mode === 'configured-domain' && previous.url ? configuredOrigin(previous.url) : null;
  if (!pinned) throw new Error('請先到 https://dashboard.ngrok.com/domains 取得帳號的固定開發網域，將完整 HTTPS 網址填入 .env 的 PUBLIC_URL 後再啟動。');
  const port = Number(process.env.PUBLIC_PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PUBLIC_PORT 必須是 1 到 65535。');
  const userConfig = process.env.NGROK_CONFIG || path.join(process.env.LOCALAPPDATA || path.join(homedir(), '.config'), 'ngrok', 'ngrok.yml');
  if (!existsSync(userConfig)) throw new Error('找不到 ngrok 帳號設定，請先完成 ngrok 驗證，或用 NGROK_CONFIG 指定原設定檔。');
  const runtimeConfig = path.join(ROOT, 'data', 'ngrok-night-harbor.yml');
  mkdirSync(path.dirname(runtimeConfig), { recursive: true });
  // JSON is valid YAML. Merge only non-secret endpoint settings with the original account config.
  writeFileSync(runtimeConfig, JSON.stringify(ngrokConfiguration(port, pinned), null, 2) + '\n', { mode: 0o600 });
  // This process serves HTTPS visitors through ngrok. Existing LAN processes are unaffected.
  process.env.SECURE_COOKIES = '1';
  const app = createApp();
  try {
    await new Promise((resolve, reject) => { app.once('error', reject); app.listen(port, '127.0.0.1', resolve); });
  } catch (error) {
    app.emit('close');
    if (error.code === 'EADDRINUSE') throw new Error(`固定網址服務的本機連接埠 ${port} 已使用。請先關閉舊的固定網址啟動視窗。`);
    throw error;
  }
  console.log('\n夜泊 · 固定 HTTPS 網址\n');
  console.log('正在連線 ngrok；帳號與 SQLite 資料仍使用這台電腦的原資料庫。');
  console.log('請保持電腦與此視窗開啟。按 Ctrl+C 同時停止本次服務與通道。');
  const child = spawn(binary, ngrokArguments(userConfig, runtimeConfig), { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let finished = false, published = false, lastCode = '', buffer = '';
  let startupTimer;
  function stop(code = 0) {
    if (finished) return;
    finished = true;
    clearTimeout(startupTimer);
    if (child.pid && child.exitCode === null) child.kill();
    app.close(() => { process.exitCode = code; });
    app.closeAllConnections();
  }
  function showReady(url) {
    if (published || finished) return;
    if (pinned && url !== pinned) { console.error('ngrok 回傳了不同網址，已停止通道，避免網址悄悄更換。'); stop(1); return; }
    try {
      mkdirSync(path.dirname(STATE), { recursive: true });
      writeFileSync(STATE, JSON.stringify({ url, mode: 'configured-domain' }, null, 2) + '\n', { mode: 0o600 });
    } catch { console.error('無法保存固定網址設定，已停止。請檢查專案 data 資料夾是否可寫入。'); stop(1); return; }
    published = true;
    clearTimeout(startupTimer);
    console.log(`\n固定網址：${url}\n`);
    console.log('手機、電腦或行動網路都使用上面的網址。下次仍執行 start-fixed-url.cmd。');
    console.log('若第一次出現 ngrok 的網站提示，確認網址後點 Visit Site 繼續。');
    console.log('帳號資料需要登入才能讀取。電腦休眠、關機或通道停止時，網址會暫時無法連線。');
  }
  function consume(chunk) {
    const text = chunk.toString('utf8');
    lastCode = text.match(/ERR_NGROK_\d+/)?.[0] || lastCode;
    buffer += text;
    const lines = buffer.split(/\r?\n/); buffer = lines.pop();
    for (const line of lines) {
      const url = endpointFromLog(line);
      if (url) showReady(url);
    }
    // Raw ngrok diagnostics can contain credentials: never echo them.
    if (buffer.length > 64000) buffer = '';
  }
  child.stdout.on('data', consume);
  child.stderr.on('data', chunk => { lastCode = chunk.toString('utf8').match(/ERR_NGROK_\d+/)?.[0] || lastCode; });
  child.on('error', () => { console.error('ngrok 無法啟動，請確認 NGROK_BIN 或已安裝的程式。'); stop(1); });
  child.on('exit', code => {
    if (finished) return;
    console.error(published ? 'ngrok 通道已中斷，請重新執行 start-fixed-url.cmd。' : 'ngrok 未完成連線。請檢查 ngrok 帳號驗證及網路是否允許連線。');
    if (lastCode) console.error(`ngrok 錯誤代碼：${lastCode}`);
    stop(code || 1);
  });
  startupTimer = setTimeout(() => {
    console.error('ngrok 連線逾時。可能是帳號設定或目前網路阻擋連線；尚未取得固定網址。');
    if (lastCode) console.error(`ngrok 錯誤代碼：${lastCode}`);
    stop(1);
  }, 45000);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
