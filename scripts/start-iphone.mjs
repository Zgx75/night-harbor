import { networkInterfaces } from 'node:os';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createApp } from '../server.mjs';

export function lanAddresses(interfaces = networkInterfaces()) {
  const privateIP = address => /^10\./.test(address) || /^192\.168\./.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
  const virtualMac = mac => /^(?:08|0a):00:27:/i.test(mac || '');
  const wireless = name => /wi[\s-]?fi|wlan|wireless|無線/i.test(name);
  return Object.entries(interfaces)
    .filter(([name]) => !/loopback|virtual|vmware|vbox|vethernet|docker|wsl|tailscale/i.test(name))
    // Host-only adapters can have generic names such as "Ethernet 3".
    .flatMap(([name, values]) => (values || []).filter(value => value.family === 'IPv4' && !value.internal && privateIP(value.address) && !virtualMac(value.mac)).map(value => ({ name, address: value.address })))
    .sort((a, b) => Number(wireless(b.name)) - Number(wireless(a.name)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const env = path.join(root, '.env');
  if (existsSync(env)) process.loadEnvFile(env);
  const addresses = lanAddresses();
  const host = process.env.MOBILE_HOST || addresses[0]?.address;
  const port = Number(process.env.MOBILE_PORT || process.env.PORT || 3000);
  if (!host || !addresses.some(value => value.address === host)) {
    console.error('找不到可用的區網 IPv4。請先連接家中或學校的網路；若有多張網卡，可用 MOBILE_HOST 指定上列區網介面。');
    for (const value of addresses) console.error(`${value.name}: ${value.address}`);
    process.exitCode = 1;
  } else if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT 或 MOBILE_PORT 必須是 1 到 65535。');
    process.exitCode = 1;
  } else {
    const app = createApp();
    app.listen(port, host, () => {
      console.log('\n夜泊 · iPhone 安裝試用\n');
      console.log(`1. iPhone 連上和電腦相同的 Wi-Fi／區域網路。`);
      console.log(`2. 在 iPhone 的 Safari 開啟：http://${host}:${port}`);
      console.log('3. 點「分享」→「加入主畫面」→「新增」。');
      console.log('\n請保持電腦及此視窗開啟，按 Ctrl+C 結束。');
      console.log('此區網 HTTP 模式支援連線使用；離線啟動需要 HTTPS。');
      console.log(`Gemini: ${process.env.GEMINI_API_KEY?.trim() ? 'configured' : 'not configured; see README.md'}`);
      if (addresses.length > 1) {
        console.log('\n偵測到多張網卡。若手機無法連線，請確認所選網卡與 Wi-Fi 同一網段：');
        for (const value of addresses) console.log(`  ${value.name}: ${value.address}`);
        console.log('可用 MOBILE_HOST 指定上列其他 IP，再重新啟動。');
      }
    });
    app.on('error', error => {
      console.error(error.code === 'EADDRINUSE' ? `連接埠 ${port} 已使用，請停止原啟動視窗，或用 MOBILE_PORT 改成 3001。` : `啟動失敗：${error.code}`);
      process.exitCode = 1;
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close(() => process.exit(0)));
  }
}
