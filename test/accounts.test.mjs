import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';
import { demoProfile } from '../public/progress.js';

async function fixture(t, options = {}) {
  const server = createApp({ apiKey: '', dbPath: ':memory:', ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function close() { if (server.listening) await new Promise(resolve => server.close(resolve)); }
  t.after(close);
  function browser(initialCookie = '') {
    let cookie = initialCookie;
    return {
      get cookie() { return cookie; },
      async request(route, body, extra = {}) {
        const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
        if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return response;
      }
    };
  }
  return { server, base, browser, close };
}
const credential = username => ({ username, password: 'test-password-123', displayName: '測試夥伴' });
async function register(browser, username = 'tester') {
  const response = await browser.request('/api/auth/register', credential(username));
  assert.equal(response.status, 201);
  return (await response.json()).user;
}

test('signed-out users see the login shell but cannot access profile or AI endpoints', async t => {
  const f = await fixture(t), anon = f.browser();
  assert.deepEqual(await (await anon.request('/api/auth/session')).json(), { user: null });
  for (const route of ['/api/profile', '/api/knowledge']) assert.equal((await anon.request(route)).status, 401);
  for (const route of ['/api/plan', '/api/advice', '/api/reports', '/api/reports/advice']) assert.equal((await anon.request(route, {})).status, 401);
  const html = await (await anon.request('/')).text();
  assert.match(html, /id="auth-screen"/);
  assert.match(html, /id="app-shell" hidden/);
});

test('registration, login and cookie settings validate credentials without leaking secrets', async t => {
  const f = await fixture(t), a = f.browser();
  const response = await a.request('/api/auth/register', credential('Test_One'));
  assert.equal(response.status, 201);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const user = (await response.json()).user;
  assert.equal(user.username, 'test_one');
  assert.deepEqual(Object.keys(user).sort(), ['displayName', 'id', 'username']);
  assert.equal((await f.browser().request('/api/auth/register', credential('TEST_ONE'))).status, 409);
  assert.equal((await f.browser().request('/api/auth/register', { username: 'short', password: '123' })).status, 400);
  assert.equal((await f.browser().request('/api/auth/register', credential("x' OR 1=1--"))).status, 400);
  const login = f.browser();
  const wrong = await login.request('/api/auth/login', { ...credential('test_one'), password: 'wrong-password' });
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).code, 'INVALID_CREDENTIALS');
  assert.equal((await login.request('/api/auth/login', credential('TEST_ONE'))).status, 200);
  assert.equal((await (await login.request('/api/auth/session')).json()).user.id, user.id);
  const forged = f.browser('night_harbor_session=' + 'A'.repeat(43));
  assert.equal((await forged.request('/api/profile')).status, 401);
});

test('each account owns its records, pet, coins, settings and saved goals', async t => {
  const f = await fixture(t), a = f.browser(), b = f.browser();
  const first = await register(a, 'first'), second = await register(b, 'second');
  const profile = demoProfile('2026-11-02');
  profile.settings = { currentBedtime: '02:00', targetBedtime: '00:30', wakeTime: '08:30', reminders: true, saveClosures: true };
  const saved = await a.request('/api/profile', { revision: 0, profile, userId: second.id });
  assert.equal(saved.status, 200);
  const result = await (await a.request('/api/profile')).json();
  assert.equal(result.profile.economy.pet.name, profile.economy.pet.name);
  assert.equal(result.profile.economy.credits.length, profile.economy.credits.length);
  assert.equal(result.profile.records.length, 14);
  assert.equal(result.profile.settings.reminders, true);
  assert.deepEqual(await (await b.request(`/api/profile?userId=${first.id}`)).json().then(data => data.profile), {});
  const device = f.browser();
  assert.equal((await device.request('/api/auth/login', credential('first'))).status, 200);
  assert.deepEqual((await (await device.request('/api/profile')).json()).profile, result.profile);
});

test('stale device updates are rejected instead of overwriting newer account data', async t => {
  const f = await fixture(t), a = f.browser(), device = f.browser();
  await register(a);
  await device.request('/api/auth/login', credential('tester'));
  assert.equal((await a.request('/api/profile', { revision: 0, profile: { settings: { reminders: true } } })).status, 200);
  const conflict = await device.request('/api/profile', { revision: 0, profile: { settings: { reminders: false } } });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, 'PROFILE_CONFLICT');
  assert.equal((await (await device.request('/api/profile')).json()).profile.settings.reminders, true);
  assert.equal((await device.request('/api/profile', { revision: 1, profile: { records: [{ date: 'invalid' }] } })).status, 400);
  assert.equal((await (await a.request('/api/profile')).json()).revision, 1);
});

test('logout revokes the session and expired sessions cannot access account data', async t => {
  let now = Date.parse('2026-11-02T00:00:00Z');
  const f = await fixture(t, { now: () => now }), a = f.browser();
  await register(a);
  const captured = f.browser(a.cookie);
  const response = await a.request('/api/auth/logout', {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await captured.request('/api/profile')).status, 401);
  await a.request('/api/auth/login', credential('tester'));
  now += 7 * 86400000 + 1;
  assert.equal((await a.request('/api/profile')).status, 401);
  assert.equal((await (await a.request('/api/auth/session')).json()).user, null);
});

test('SQLite persists data and hashed sessions across servers and service restarts', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'night-harbor-auth-'));
  const dbPath = path.join(directory, 'accounts.sqlite');
  t.after(async () => { for (const name of await readdir(directory)) await unlink(path.join(directory, name)); await rmdir(directory); });
  const first = await fixture(t, { dbPath }), a = first.browser();
  const user = await register(a);
  await a.request('/api/profile', { revision: 0, profile: { records: [{ date: '2026-11-01', fatigue: 3 }] } });
  const second = await fixture(t, { dbPath }), b = second.browser();
  await b.request('/api/auth/login', credential('tester'));
  assert.equal((await (await b.request('/api/profile')).json()).profile.records[0].fatigue, 3);
  const db = new DatabaseSync(dbPath);
  const stored = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id).password_hash;
  assert.match(stored, /^scrypt\$32768\$8\$3\$/);
  assert.ok(!stored.includes(credential('tester').password));
  const token = a.cookie.split('=')[1];
  assert.ok(db.prepare('SELECT token_hash FROM account_sessions').all().every(row => row.token_hash !== token));
  db.close();
  const cookie = a.cookie;
  await first.close(); await second.close();
  const restarted = await fixture(t, { dbPath }), remembered = restarted.browser(cookie);
  assert.equal((await (await remembered.request('/api/auth/session')).json()).user.id, user.id);
  assert.equal((await (await remembered.request('/api/profile')).json()).profile.records[0].fatigue, 3);
  await restarted.close();
});

test('auth requests reject cross-origin writes and repeated attempts are limited', async t => {
  const f = await fixture(t), a = f.browser();
  assert.equal((await a.request('/api/auth/register', credential('tester'), { Origin: 'https://other.example' })).status, 403);
  assert.equal((await a.request('/api/auth/register', credential('tester'), { Origin: 'null' })).status, 403);
  for (let i = 0; i < 20; i++) assert.equal((await a.request('/api/auth/login', { username: 'tester', password: 'short' })).status, 400);
  assert.equal((await a.request('/api/auth/login', credential('tester'))).status, 429);
  assert.equal((await a.request('/data/night-harbor.sqlite')).status, 404);
});
