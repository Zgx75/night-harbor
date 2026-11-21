import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyKind, lateCount, nextFeedback, cleanFeedback, lineText, DAILY_LINES, weeklySummary, weeklySuggestion } from '../public/responses.js';
import { assessNight, addDays, awardNight, createEconomy, petTransaction, nightInstant } from '../public/progress.js';
import { createApp } from '../src/server.mjs';

const today = '2026-10-15';
const now = Date.parse('2026-10-15T12:00:00+08:00');
const target = (night, bedtime = '00:30') => ({ [night]: { bedtime, createdAt: new Date(nightInstant(night, 1080)).toISOString() } });
const row = (date, bedAt) => ({ date, bedAt, sleepAt: '', wakeAt: '', caffeineAt: '', exerciseAt: '', exerciseIntensity: '', fatigue: null, mood: null, sleepQuality: null, screenMinutes: null, napMinutes: null, insomnia: 'unknown' });
// Mornings `days` back to today; `late` lists which ones (0 = today) were 40 minutes late.
function history(days, late = []) {
  const records = [], targets = {};
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    Object.assign(targets, target(addDays(date, -1)));
    records.push(row(date, late.includes(i) ? '01:10' : '00:30'));
  }
  return { records, targets };
}

test('on time uses exactly the coin check, including the 15-minute grace and midnight', () => {
  const targets = target('2026-10-14');
  for (const [bedAt, onTime] of [['00:30', true], ['00:45', true], ['00:46', false], ['23:50', true]]) {
    const records = [row(today, bedAt)];
    assert.equal(dailyKind(records, targets, today, now) === 'onTime', onTime, bedAt);
    assert.equal(assessNight(records[0], targets, now).eligible, onTime);
  }
  const midnight = target('2026-10-14', '23:50');
  assert.equal(dailyKind([row(today, '00:05')], midnight, today, now), 'onTime');
  assert.equal(dailyKind([row(today, '00:06')], midnight, today, now), null);
});

test('one late night gets no message; a second late night within seven days gets a reminder', () => {
  const one = history(7, [0]);
  assert.equal(lateCount(one.records, one.targets, today, now), 1);
  assert.equal(dailyKind(one.records, one.targets, today, now), null);
  // Not consecutive: today and five mornings ago.
  const two = history(7, [0, 5]);
  assert.equal(dailyKind(two.records, two.targets, today, now), 'reminder');
  // Eight mornings ago is outside the rolling window.
  const old = history(9, [0, 7]);
  assert.equal(lateCount(old.records, old.targets, today, now), 1);
  assert.equal(dailyKind(old.records, old.targets, today, now), null);
  // An on-time morning is praised even after earlier late nights.
  const recovered = history(7, [1, 3]);
  assert.equal(dailyKind(recovered.records, recovered.targets, today, now), 'onTime');
});

test('missing nights are never counted as late, and nights without a prior target ask for one', () => {
  const gaps = history(7, [0]); gaps.records = gaps.records.filter(r => r.date === today || r.date === addDays(today, -2));
  assert.equal(dailyKind(gaps.records, gaps.targets, today, now), null);
  assert.equal(dailyKind([row(today, '00:30')], {}, today, now), 'noTarget');
  assert.equal(dailyKind([row(today, '')], target('2026-10-14'), today, now), null);
  assert.equal(dailyKind([], {}, today, now), null);
});

test('lines rotate without repeating, stay fixed for the same day, and withdraw when no longer due', () => {
  let fb = null; const seen = [];
  for (let i = 0; i < 6; i++) { fb = nextFeedback(fb, addDays(today, i), 'onTime'); seen.push(fb.id); }
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1]);
  assert.equal(new Set(seen.slice(0, 4)).size, 4);
  assert.equal(nextFeedback(fb, fb.date, 'onTime'), fb);
  const changed = nextFeedback(fb, fb.date, 'reminder');
  assert.ok(DAILY_LINES.reminder.includes(lineText(changed.id)));
  // Edited from late to a single late night: today's line disappears, history stays for rotation.
  const withdrawn = nextFeedback(changed, changed.date, null);
  assert.equal(withdrawn.kind, null); assert.deepEqual(withdrawn.recent, changed.recent);
  assert.equal(nextFeedback(fb, '2030-01-01', null), fb);
  for (const value of [changed, withdrawn]) assert.deepEqual(cleanFeedback(value), value);
  assert.throws(() => cleanFeedback({ ...changed, id: 'reminder-9' }));
  assert.throws(() => cleanFeedback({ ...changed, recent: ['x'] }));
});

test('responses never change coins', () => {
  const economy = petTransaction(createEconomy(), { type: 'adopt', id: 'cat', name: '糯米' });
  const targets = target('2026-10-14');
  assert.equal(awardNight(economy, row(today, '00:46'), targets, now).awarded, 0);
  assert.equal(awardNight(economy, row(today, '00:30'), targets, now).awarded, 20);
});

test('the pet response is saved with the account and malformed values are rejected', async t => {
  const app = createApp({ apiKey: '', dbPath: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const reg = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'feedback_user', password: 'test-password-123' }) });
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  const save = (profile, revision) => fetch(base + '/api/profile', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, revision }) });
  const feedback = nextFeedback(null, today, 'onTime');
  assert.equal((await save({ petFeedback: { ...feedback, kind: 'angry' } }, 0)).status, 400);
  assert.deepEqual((await (await save({ petFeedback: feedback }, 0)).json()).profile.petFeedback, feedback);
});

test('the weekly reply needs five reported bedtimes and never fills missing nights', () => {
  const four = history(4, [0]);
  const w4 = weeklySummary(four.records, four.targets, today, now);
  assert.equal(w4.complete, false); assert.equal(w4.validDays, 4);
  assert.match(weeklySuggestion(w4), /回報/);
  assert.equal(w4.days.length, 7); assert.equal(w4.days.filter(d => d.bedAt === '').length, 3);
  const five = history(5);
  assert.equal(weeklySummary(five.records, five.targets, today, now).complete, true);
});

test('weekly counts use the coin check and compare with last week only with enough data', () => {
  // This week: two late nights (today and 3 mornings ago); last week: one.
  const h = history(14, [0, 3, 9]);
  const w = weeklySummary(h.records, h.targets, today, now);
  assert.equal(w.onTime, 5); assert.equal(w.late, 2); assert.equal(w.comparable, 7);
  assert.equal(Math.round(w.changes.earlierBedtime), -6);
  assert.match(weeklySuggestion(w), /提早 15 分鐘/);
  const thin = history(9);
  assert.equal(weeklySummary(thin.records, thin.targets, today, now).changes.earlierBedtime, null);
  // Bedtimes either side of midnight are close, not 23 hours apart.
  const midnight = { records: [], targets: {} };
  for (let i = 0; i < 5; i++) midnight.records.push(row(addDays(today, -i), i % 2 ? '23:50' : '00:10'));
  const m = weeklySummary(midnight.records, midnight.targets, today, now);
  assert.ok(m.bedtimeSpread < 15); assert.equal(Math.round(m.bedtime), 1440 + 2);
});

test('the fallback weekly suggestion follows fixed rules', () => {
  const perfect = history(7);
  const p = weeklySummary(perfect.records, perfect.targets, today, now);
  assert.match(weeklySuggestion(p), /維持/);
  const uneven = history(7); uneven.records.forEach((r, i) => { r.bedAt = i % 2 ? '22:30' : '01:00'; });
  const u = weeklySummary(uneven.records, {}, today, now);
  assert.ok(u.bedtimeSpread >= 45); assert.match(weeklySuggestion(u), /起伏/);
});
