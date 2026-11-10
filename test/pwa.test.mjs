import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { createApp } from '../server.mjs';
import { cleanRecords } from '../public/records.js';
import { lanAddresses } from '../scripts/start-iphone.mjs';

test('the installable shell is complete, works from cache and never caches API data', async t => {
  const app = createApp({ apiKey: '', dbPath: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const events = new Map(), stores = new Map();
  let offline = false, activated = 0;
  const network = input => {
    if (offline) throw new Error('offline');
    return fetch(input);
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(requests) {
          const responses = await Promise.all(requests.map(async request => {
            const response = await network(request);
            assert.equal(response.status, 200, request.url);
            return [new URL(request.url).pathname, response];
          }));
          for (const [key, response] of responses) store.set(key, response);
        },
        async match(key) { return store.get(new URL(key, base).pathname)?.clone(); }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  const context = vm.createContext({
    caches, URL, fetch: network,
    Request: class extends Request { constructor(url, options) { super(new URL(url, base), options); } },
    self: {
      location: { origin: base },
      addEventListener(type, handler) { events.set(type, handler); },
      async skipWaiting() { activated++; },
      clients: { async claim() {} }
    }
  });
  vm.runInContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  let pending;
  events.get('install')({ waitUntil(value) { pending = value; } });
  await pending;

  await t.test('all local scripts, styles and iPhone PNG icons can load', async () => {
    const shell = [...stores.values()][0];
    for (const name of await readdir(new URL('../public/', import.meta.url))) {
      // Recovery must fetch current code even when the installed shell is stale.
      if (/\.(js|css)$/.test(name) && !['sw.js','update.js'].includes(name)) assert.ok(shell.has(`/${name}`), `${name} missing from offline shell`);
    }
    const manifest = await shell.get('/manifest.webmanifest').clone().json();
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.scope, '/');
    for (const icon of manifest.icons.filter(icon => icon.type === 'image/png')) {
      const response = shell.get(icon.src);
      assert.equal(response.headers.get('content-type'), 'image/png');
      const png = Buffer.from(await response.clone().arrayBuffer());
      assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
      assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
    }
    const html = await shell.get('/').clone().text();
    assert.match(html, /apple-touch-icon/);
    assert.match(html, /id="install-dialog"/);
  });

  await t.test('a cached launch works without the server and API routes bypass cache', async () => {
    offline = true;
    let response;
    events.get('fetch')({ request: new Request(`${base}/`), respondWith(value) { response = value; } });
    assert.match(await (await response).text(), /<title>夜泊/);
    for (const [url, method] of [[`${base}/api/health`, 'GET'], [`${base}/api/plan`, 'POST'], [`${base}/update.html`, 'GET'], [`${base}/update.js`, 'GET'], ['https://other.example/app.js', 'GET']]) {
      let intercepted = false;
      events.get('fetch')({ request: new Request(url, { method }), respondWith() { intercepted = true; } });
      assert.equal(intercepted, false, `${method} ${url} should use the network`);
    }
  });

  await t.test('updates wait for the user and cleanup preserves other applications', async () => {
    assert.equal(activated, 0);
    events.get('message')({ data: { type: 'ACTIVATE_UPDATE' }, waitUntil(value) { pending = value; } });
    await pending;
    assert.equal(activated, 1);
    stores.set('night-harbor-shell-old', new Map());
    stores.set('other-app-cache', new Map());
    events.get('activate')({ waitUntil(value) { pending = value; } });
    await pending;
    assert.ok(stores.has('other-app-cache'));
    assert.ok(!stores.has('night-harbor-shell-old'));
  });
});

test('phone records validate locally without a network or server imports', () => {
  const record = cleanRecords([{ date: '2026-11-01', bedAt: '00:30', fatigue: '3' }])[0];
  assert.equal(record.fatigue, 3);
  assert.throws(() => cleanRecords([{ date: '2026-11-01', bedAt: '12:00' }]), /上床時間/);
  assert.throws(() => cleanRecords([{ date: '2026-02-30' }]), /日期/);
});

test('phone startup prefers Wi-Fi and ignores generically named VirtualBox adapters', () => {
  const entry = address => ({ family: 'IPv4', internal: false, address });
  assert.deepEqual(lanAddresses({
    'Ethernet 3': [{ ...entry('192.168.56.1'), mac: '0a:00:27:00:00:0d' }],
    Ethernet: [entry('192.168.0.123')],
    'Wi-Fi': [entry('10.232.64.46'), entry('203.0.113.1')],
    Docker: [entry('172.17.0.1')],
    Loopback: [{ ...entry('127.0.0.1'), internal: true }]
  }), [{ name: 'Wi-Fi', address: '10.232.64.46' }, { name: 'Ethernet', address: '192.168.0.123' }]);
});
