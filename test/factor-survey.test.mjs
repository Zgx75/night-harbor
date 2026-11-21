import test from 'node:test';
import assert from 'node:assert/strict';
import { lateDates, surveyDue, openSurvey, pendingSurvey, cooldownEnds, cleanAnswers, cleanSurveys, needsCareNote, roundGaps, hoursText, gapFacts, weekFactors } from '../public/factor-survey.js';
import { createAdviceGenerator } from '../src/ai/advice.mjs';
import { addDays, nightInstant } from '../public/progress.js';
import { createApp } from '../src/server.mjs';

const today = '2026-10-15';
const now = Date.parse('2026-10-15T12:00:00+08:00');
// Mornings `days` back to today; `late` lists which mornings (0 = today) were 40 minutes late.
function history(days, late = [], end = today) {
  const records = [], targets = {};
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(end, -i), night = addDays(date, -1);
    targets[night] = { bedtime: '00:30', createdAt: new Date(nightInstant(night, 1080)).toISOString() };
    records.push({ date, bedAt: late.includes(i) ? '01:10' : '00:30', sleepAt: '', wakeAt: '', caffeineAt: '', exerciseAt: '', exerciseIntensity: '', fatigue: null, mood: null, sleepQuality: 3, screenMinutes: null, napMinutes: null, insomnia: 'unknown' });
  }
  return { records, targets };
}
const completed = (on, answers = { factors: ['none'] }) => ({ id: `round-${on}`, status: 'completed', triggeredOn: on, completedOn: on, lateDates: [], answers });

test('three late nights in a rolling seven days open a round; two do not, and they need not be consecutive', () => {
  const two = history(7, [0, 4]);
  assert.equal(surveyDue([], two.records, two.targets, today, now), false);
  const three = history(7, [0, 2, 6]);
  assert.deepEqual(lateDates(three.records, three.targets, today, now), [addDays(today, -6), addDays(today, -2), today]);
  assert.equal(surveyDue([], three.records, three.targets, today, now), true);
  // The eighth morning back is outside the window.
  const old = history(8, [0, 2, 7]);
  assert.equal(surveyDue([], old.records, old.targets, today, now), false);
  // Missing nights are unknown, never late.
  const gaps = history(7, [0, 2]); gaps.records = gaps.records.filter((_, i) => i !== 3);
  assert.equal(surveyDue([], gaps.records, gaps.targets, today, now), false);
});

test('only one round waits at a time and a closed round cools down for seven days', () => {
  const h = history(7, [0, 2, 6]);
  const opened = openSurvey([], h.records, h.targets, today, now);
  assert.equal(pendingSurvey(opened).triggeredOn, today); assert.equal(pendingSurvey(opened).lateDates.length, 3);
  assert.equal(surveyDue(opened, h.records, h.targets, today, now), false);
  // Completed six days ago: still cooling. Seven days ago: may open again.
  assert.equal(surveyDue([completed(addDays(today, -6))], h.records, h.targets, today, now), false);
  assert.equal(cooldownEnds([completed(addDays(today, -7))]), today);
  assert.equal(surveyDue([completed(addDays(today, -7))], h.records, h.targets, today, now), true);
  // Dismissing cools down the same way.
  const dismissed = [{ id: `round-${addDays(today, -2)}`, status: 'dismissed', triggeredOn: addDays(today, -2), dismissedOn: addDays(today, -2), lateDates: [] }];
  assert.equal(surveyDue(dismissed, h.records, h.targets, today, now), false);
});

test('follow-ups are asked only for chosen factors and only when they apply', () => {
  assert.deepEqual(cleanAnswers({ factors: ['study'], study: { delayed: 'yes' }, caffeine: { taken: 'yes' } }), { factors: ['study'], study: { delayed: 'yes' } });
  assert.deepEqual(cleanAnswers({ factors: ['caffeine'], caffeine: { taken: 'no', amount: 'two' } }), { factors: ['caffeine'], caffeine: { taken: 'no' } });
  assert.deepEqual(cleanAnswers({ factors: ['caffeine'], caffeine: { taken: 'yes', drinks: ['coffee', 'coffee', 'cola'], amount: 'two', lastAt: '16:30' } }).caffeine, { taken: 'yes', drinks: ['coffee', 'cola'], amount: 'two', lastAt: '16:30' });
  assert.throws(() => cleanAnswers({ factors: ['caffeine'], caffeine: { taken: 'yes', drinks: ['coffee'], amount: 'two' } }), /最後一杯/);
  assert.throws(() => cleanAnswers({ factors: ['nap'], nap: { taken: 'yes', startAt: '13:00', length: 'forever' } }), /午睡大約多久/);
  assert.deepEqual(cleanAnswers({ factors: ['exercise'], exercise: { taken: 'yes', endBand: '20to22' } }).exercise, { taken: 'yes', endBand: '20to22' });
  assert.throws(() => cleanAnswers({ factors: ['study', 'media', 'stress', 'nap'] }), /1 到 3/);
  assert.throws(() => cleanAnswers({ factors: [] }), /1 到 3/);
  assert.throws(() => cleanAnswers({ factors: ['none', 'study'], study: { delayed: 'no' } }), /不能和其他選項/);
  assert.deepEqual(cleanAnswers({ factors: ['other'], otherText: ' 搬家 ' }), { factors: ['other'], otherText: '搬家' });
  assert.throws(() => cleanAnswers({ factors: ['other'], otherText: 'x'.repeat(41) }), /40 字/);
});

test('the professional-care note needs frequent trouble that affects the day, and never diagnoses', () => {
  const ask = (frequency, daytime) => cleanAnswers({ factors: ['sleepDifficulty'], sleepDifficulty: { happened: 'yes', latency: 'over60', frequency, daytime } });
  assert.equal(needsCareNote(ask('weekly', 'yes')), true);
  assert.equal(needsCareNote(ask('daily', 'yes')), true);
  assert.equal(needsCareNote(ask('occasionally', 'yes')), false);
  assert.equal(needsCareNote(ask('daily', 'no')), false);
  assert.equal(needsCareNote(cleanAnswers({ factors: ['sleepDifficulty'], sleepDifficulty: { happened: 'no' } })), false);
});

test('saved rounds are validated with the account and the profile keeps them', async t => {
  assert.throws(() => cleanSurveys([{ id: 'x', status: 'pending', triggeredOn: today, lateDates: [] }]));
  assert.throws(() => cleanSurveys([completed(today, { factors: ['study'] })]), /延後上床/);
  const app = createApp({ apiKey: '', dbPath: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const reg = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'survey_rounds', password: 'test-password-123' }) });
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  const save = (profile, revision) => fetch(base + '/api/profile', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, revision }) });
  assert.equal((await save({ factorSurveys: [{ ...completed(today), status: 'finished' }] }, 0)).status, 400);
  const rounds = [completed(addDays(today, -10), { factors: ['study'], study: { delayed: 'yes' } }), { id: `round-${today}`, status: 'pending', triggeredOn: today, lateDates: [today] }];
  const saved = await (await save({ factorSurveys: rounds }, 0)).json();
  assert.deepEqual(saved.profile.factorSurveys, rounds);
});

test('exercise asks for an end time, and earlier band answers stay valid', () => {
  assert.deepEqual(cleanAnswers({ factors: ['exercise'], exercise: { taken: 'yes', endAt: '21:30' } }).exercise, { taken: 'yes', endAt: '21:30' });
  assert.throws(() => cleanAnswers({ factors: ['exercise'], exercise: { taken: 'yes' } }), /幾點結束/);
  assert.throws(() => cleanAnswers({ factors: ['exercise'], exercise: { taken: 'yes', endAt: '25:00' } }), /幾點結束/);
  // Saved rounds from before the change keep their band.
  assert.deepEqual(cleanSurveys([completed(today, { factors: ['exercise'], exercise: { taken: 'yes', endBand: '20to22' } })])[0].answers.exercise, { taken: 'yes', endBand: '20to22' });
});

test('reported times are converted to hours before the average bedtime of the late nights in that round', () => {
  const records = [{ date: '2026-10-13', bedAt: '01:10' }, { date: '2026-10-14', bedAt: '00:50' }, { date: '2026-10-15', bedAt: '01:30' }];
  const r = answers => ({ ...completed(today, answers), lateDates: ['2026-10-13', '2026-10-14', '2026-10-15'] });
  const g = roundGaps(r({ factors: ['caffeine', 'exercise'], caffeine: { taken: 'yes', drinks: ['coffee'], amount: 'one', lastAt: '19:00' }, exercise: { taken: 'yes', endAt: '21:30' } }), records);
  assert.equal(g.bedtime, 1510); assert.equal(g.caffeine.hoursBeforeBed, 6); assert.equal(g.exercise.hoursBeforeBed, 3.5);
  // A time after midnight is on the same night as the bedtime.
  assert.equal(roundGaps(r({ factors: ['caffeine'], caffeine: { taken: 'yes', drinks: ['cola'], amount: 'one', lastAt: '00:30' } }), records).caffeine.hoursBeforeBed, 0.5);
  // An old band becomes a range.
  assert.deepEqual(roundGaps(r({ factors: ['exercise'], exercise: { taken: 'yes', endBand: '20to22' } }), records).exercise.hoursBeforeBed, [3, 5]);
  // Without bedtimes on those days, nothing is guessed.
  assert.equal(roundGaps(r({ factors: ['caffeine'], caffeine: { taken: 'yes', drinks: ['coffee'], amount: 'one', lastAt: '15:00' } }), []).caffeine.hoursBeforeBed, null);
  assert.equal(roundGaps(r({ factors: ['caffeine'], caffeine: { taken: 'no' } }), records).caffeine, null);
  assert.deepEqual([hoursText(6), hoursText([3, 5]), hoursText(null)], ['約 6 小時', '約 3–5 小時', '無法換算']);
  const f = weekFactors([r({ factors: ['exercise'], exercise: { taken: 'yes', endBand: 'after22' } })], today, today, records);
  assert.deepEqual(gapFacts(f).偏離日回報的運動, [{ 結束: '晚上 10 點以後', 距離那幾晚平均上床: '約 1–3 小時' }]);
});

test('the model may only copy the hours and must not judge them against a general threshold', async () => {
  let system;
  const advise = createAdviceGenerator({ apiKey: 'test', fetchImpl: async (_u, o) => {
    system = JSON.parse(o.body).systemInstruction.parts[0].text;
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ answer: '這週有五晚達標。', suggestions: [{ title: '提早收心', detail: '下週試著提早十五分鐘開始收心。', sourceIds: ['K2'] }] }) }] } }] }));
  } });
  await advise({ question: '請寫這一週的作息回顧與咖啡因觀察。', records: [], asOf: today, reportContext: { mode: 'weeklyReply' } });
  assert.match(system, /只能照抄來描述那幾晚/); assert.match(system, /不能說這個間隔太短/); assert.match(system, /不能套用一般門檻/);
  // Weekly replies must mention the converted hours whenever there is one.
  assert.match(system, /不是「無法換算」，answer 必須用一句照抄時間與小時數/);
  assert.match(system, /不能寫出事實資料的欄位名稱/);
});
