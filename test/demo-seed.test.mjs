import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.mjs';
import { seedDemo, makeHistory, taipeiToday, DEMO_USER, DEMO_PASSWORD } from '../scripts/seed-demo.mjs';
import { weeklySummary, monthlySummary } from '../public/responses.js';

test('the demo history is the same every time and tells the intended story', () => {
  const today = '2026-11-20';
  const spec = { today, days: 28, stages: [38, 24, 11, 4], targets: [1545, 1530, 1515, 1485], seed: 7, lateDays: [6, 5, 4], onTimeDays: [1, 2, 3, 7], missing: [25, 19, 12, 9] };
  const a = makeHistory(spec), b = makeHistory(spec);
  assert.deepEqual(a, b);
  assert.equal(a.records.length, 24, 'four days nobody filled in');
  assert.equal(Object.keys(a.targets).length, 28, 'a target was saved for every night');
  // Every record has the target saved the evening before, so the server can settle it.
  for (const r of a.records) assert.ok(a.targets[new Date(Date.parse(r.date) - 86400000).toISOString().slice(0, 10)]);
});

test('seeding a server gives a complete demo: reviews, coins, friends, a group and a pending request', async t => {
  const app = createApp({ apiKey: '', dbPath: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const result = await seedDemo({ base, log: () => {} });
  assert.equal(result.username, DEMO_USER);

  let cookie = '';
  const call = async (route, body) => {
    const r = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r.json();
  };
  await call('/api/auth/login', { username: DEMO_USER, password: DEMO_PASSWORD });
  const { profile } = await call('/api/profile'), today = taipeiToday();
  assert.equal(profile.records.length, 24);
  assert.ok(profile.economy.credits.length >= 10, 'the server settled coins from the records');
  assert.equal(profile.economy.pet.name, '栗子');assert.ok(profile.economy.placed.length >= 5);
  // Both reviews are ready, and are complete reviews (enough days), so the page never needs the AI.
  assert.equal(profile.weeklyRecap.generatedOn, today);assert.equal(profile.monthlyRecap.generatedOn, today);
  assert.ok(weeklySummary(profile.records, profile.targets, today).complete);assert.ok(monthlySummary(profile.records, profile.targets, today).complete);
  assert.equal(profile.factorSurveys[0].status, 'completed');

  const social = await call('/api/social');
  assert.deepEqual(social.friends.map(f => f.username).sort(), ['leo', 'mika', 'nana']);
  assert.ok(social.friends.every(f => f.pet), 'every friend shows a companion');
  assert.equal(social.requests.filter(r => r.direction === 'incoming')[0].username, 'kai');
  assert.equal(social.group.name, '月亮小隊');assert.equal(social.group.members.length, 2);
  assert.equal(social.group.pendingInvites[0].username, 'nana');
  assert.ok(social.group.economy.placed.length >= 4, 'the group room is furnished');

  // Running it again changes nothing that should stay (no duplicate friends, one group).
  await seedDemo({ base, log: () => {} });
  await call('/api/auth/login', { username: DEMO_USER, password: DEMO_PASSWORD });
  const again = await call('/api/social');
  assert.equal(again.friends.length, 3);assert.equal(again.group.members.length, 2);
});
