import test from 'node:test';
import assert from 'node:assert/strict';
import { openAccount, createProfileSync } from '../public/account.js';

function environment(t, fetchImpl) {
  const names = ['document', 'window', 'navigator', 'localStorage', 'fetch', 'location'];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  t.after(() => { for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  const elements = new Map(), storage = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { hidden: selector === '#app-shell', value: '', textContent: '', elements: [], attributes: {}, listeners: {}, classList: { toggle() {} }, addEventListener(type, callback) { this.listeners[type] = callback; }, setAttribute(key, value) { this.attributes[key] = value; } });
    return elements.get(selector);
  };
  const navigator = { onLine: true };
  const globals = {
    document: { body: { dataset: { auth: 'loading' } }, visibilityState: 'visible', querySelector: element, addEventListener() {} },
    window: { addEventListener() {}, confirm: () => true }, navigator,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: fetchImpl, location: { reload() {} }
  };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  return { element, storage, navigator };
}
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const account = profile => ({ user: { id: 'account-one', username: 'tester', displayName: '夥伴' }, profile, revision: 0, pending: false, conflict: false });

test('first visit shows authentication, then loads only the signed-in account profile', async t => {
  let calls = [];
  const user = account({}).user;
  const env = environment(t, async (url, options) => {
    calls.push(url);
    if (url === '/api/auth/session') return response({ user: null });
    if (url === '/api/auth/login') { assert.equal(JSON.parse(options.body).username, 'tester'); return response({ user }); }
    if (url === '/api/profile') return response({ profile: { records: [], economy: { pet: { id: 'cat', name: '糯米' } } }, revision: 2 });
    throw new Error('Unexpected request');
  });
  const ready = openAccount();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.element('#app-shell').hidden, true);
  assert.equal(document.body.dataset.auth, 'signed-out');
  env.element('#auth-username').value = 'tester';
  env.element('#auth-password').value = 'test-password-123';
  await env.element('#auth-form').listeners.submit({ preventDefault() {} });
  const result = await ready;
  assert.equal(result.profile.economy.pet.name, '糯米');
  assert.equal(result.revision, 2);
  assert.equal(env.element('#app-shell').hidden, false);
  assert.equal(env.element('#auth-screen').hidden, true);
  assert.equal(env.element('#auth-password').value, '');
  assert.deepEqual(calls, ['/api/auth/session', '/api/auth/login', '/api/profile']);
});

test('changes made during a save are serialized against the next server revision', async t => {
  const sent = [];
  let unblock, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const env = environment(t, async (_url, options) => {
    const body = JSON.parse(options.body); sent.push(body);
    if (sent.length === 1) { entered(); await new Promise(resolve => { unblock = resolve; }); }
    return response({ revision: body.revision + 1 });
  });
  const sync = createProfileSync(account({}));
  sync.save({ records: [{ date: '2026-11-01', fatigue: 2 }] });
  const running = sync.flush(); await started;
  sync.save({ records: [{ date: '2026-11-01', fatigue: 4 }] });
  unblock(); await running; await sync.flush();
  assert.deepEqual(sent.map(body => body.revision), [0, 1]);
  const cached = JSON.parse(env.storage.get('night-harbor-account-account-one'));
  assert.equal(cached.pending, false);
  assert.equal(cached.profile.records[0].fatigue, 4);
  assert.equal(cached.revision, 2);
});

test('conflicts preserve the local draft and block automatic overwrites', async t => {
  let requests = 0;
  const env = environment(t, async () => { requests++; return response({ code: 'PROFILE_CONFLICT', error: '另一個裝置已更新' }, 409); });
  const sync = createProfileSync(account({}));
  sync.save({ economy: { pet: { id: 'cat', name: '本機變更' } } });
  assert.equal(await sync.flush(), false);
  assert.equal(await sync.flush(), false);
  assert.equal(requests, 1);
  assert.equal(env.element('#sync-backup').hidden, false);
  assert.equal(env.element('#sync-reload').hidden, false);
  const cached = JSON.parse(env.storage.get('night-harbor-account-account-one'));
  assert.equal(cached.pending, true);
  assert.equal(cached.profile.economy.pet.name, '本機變更');
});

test('offline changes stay under the current account and can sync after reconnection', async t => {
  let requests = 0;
  const env = environment(t, async () => { requests++; return response({ revision: 1 }); });
  env.storage.set('night-harbor-account-other-user', JSON.stringify({ profile: { pet: 'other' }, revision: 9 }));
  const sync = createProfileSync(account({}));
  env.navigator.onLine = false;
  sync.save({ settings: { reminders: true } });
  assert.equal(await sync.flush(), false);
  assert.equal(requests, 0);
  assert.equal(JSON.parse(env.storage.get('night-harbor-account-account-one')).pending, true);
  env.navigator.onLine = true;
  assert.equal(await sync.flush(), true);
  assert.equal(requests, 1);
  assert.equal(JSON.parse(env.storage.get('night-harbor-account-account-one')).pending, false);
  assert.equal(JSON.parse(env.storage.get('night-harbor-account-other-user')).revision, 9);
});
