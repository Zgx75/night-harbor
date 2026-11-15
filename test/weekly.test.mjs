import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyFacts, weeklyQuestion } from '../weekly.mjs';
import { weekFactors } from '../public/factor-survey.js';
import { weeklyRecapDue, cleanWeeklyRecap } from '../public/responses.js';
import { createAdviceGenerator } from '../advice.mjs';
import { addDays, nightInstant } from '../public/progress.js';
import { createApp } from '../server.mjs';

const today = '2026-10-15';
const now = Date.parse('2026-10-15T12:00:00+08:00');
function history(days, late = []) {
  const records = [], targets = {};
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i), night = addDays(date, -1);
    targets[night] = { bedtime: '00:30', createdAt: new Date(nightInstant(night, 1080)).toISOString() };
    records.push({ date, bedAt: late.includes(i) ? '01:10' : '00:30', sleepQuality: 3 });
  }
  return { records, targets };
}
const round = (on, answers) => ({ id: `round-${on}`, status: 'completed', triggeredOn: on, completedOn: on, lateDates: [on], answers });
const surveys = [
  round(addDays(today, -1), { factors: ['caffeine', 'study'], caffeine: { taken: 'yes', drinks: ['coffee'], amount: 'one', lastAt: '17:30' }, study: { delayed: 'yes' } }),
  round(addDays(today, -4), { factors: ['study'], study: { delayed: 'yes' } }),
  round(addDays(today, -9), { factors: ['media'], media: { delayed: 'yes' } }),
  { id: `round-${today}`, status: 'pending', triggeredOn: today, lateDates: [today] }
];
const recap = { start: addDays(today, -6), end: today, generatedOn: today, answer: '這週有五晚達標。', suggestion: { title: '提早收心', detail: '下週試著提早 15 分鐘開始收心。', sourceIds: ['K2'] }, sources: [{ id: 'K2', title: '作息一致與睡前環境', publisher: 'NIH · NHLBI', url: 'https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits' }] };

test('the weekly reply needs five reported bedtimes before any AI call', () => {
  const four = history(4);
  assert.throws(() => weeklyFacts({ asOf: today, ...four }, now), e => e.code === 'REPORT_DATA' && /資料還不夠/.test(e.message));
});

test('facts are computed by the program, and late-day factors cover only this week', () => {
  const h = history(14, [0, 3, 9]);
  const facts = weeklyFacts({ asOf: today, ...h, factorSurveys: surveys }, now);
  assert.equal(facts.達標晚數, 5); assert.equal(facts.偏離晚數, 2); assert.equal(facts.平均上床, '00:41');
  assert.equal(facts.比上週提早分鐘, -6);
  assert.deepEqual(facts.偏離日曾回報的因素, [{ 因素: '咖啡、茶或其他含咖啡因飲品', 次數: 1 }, { 因素: '課業、報告或考試', 次數: 2 }]);
  // This round's late date is yesterday, reported at 00:30: the last cup at 17:30 is 7 hours earlier.
  assert.deepEqual(facts.偏離日回報的咖啡因, [{ 最後一杯: '17:30', 距離那幾晚平均上床: '約 7 小時' }]);
  assert.deepEqual(facts.偏離日回報的運動, []);
  assert.equal(facts.偏離日追問次數, 2);
  assert.match(facts.說明, /不代表整週或晚睡的原因/);
  const q = weeklyQuestion(facts);
  assert.ok(q.length <= 800); assert.match(q, /不把因素說成晚睡或失眠的原因/);
  assert.equal(weekFactors(surveys, today, today).rounds, 0);
  assert.deepEqual(weekFactors([round(today, { factors: ['none'] })], today, today), { rounds: 1, factors: [], caffeine: [], exercise: [] });
});

test('the weekly reply is generated at most once every seven days', () => {
  assert.equal(weeklyRecapDue(null, today), true);
  assert.equal(weeklyRecapDue({ ...recap, generatedOn: addDays(today, -6) }, today), false);
  assert.equal(weeklyRecapDue({ ...recap, generatedOn: addDays(today, -7) }, today), true);
});

test('saved replies are validated and unsafe links are refused', () => {
  assert.deepEqual(cleanWeeklyRecap(recap), recap);
  assert.equal(cleanWeeklyRecap(null), null);
  assert.throws(() => cleanWeeklyRecap({ ...recap, sources: [{ ...recap.sources[0], url: 'javascript:alert(1)' }] }));
  assert.throws(() => cleanWeeklyRecap({ ...recap, answer: '' }));
  assert.deepEqual(cleanWeeklyRecap({ ...recap, suggestion: null, sources: [] }).suggestion, null);
});

test('the model rules forbid causes and ask for one step', async () => {
  let system;
  const advise = createAdviceGenerator({ apiKey: 'test', fetchImpl: async (_u, o) => {
    system = JSON.parse(o.body).systemInstruction.parts[0].text;
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ answer: '這週有五晚達標。', suggestions: [{ title: '提早收心', detail: '下週試著提早十五分鐘開始收心。', sourceIds: ['K2'] }] }) }] } }] }));
  } });
  const h = history(7);
  const facts = weeklyFacts({ asOf: today, ...h }, now);
  const result = await advise({ question: weeklyQuestion(facts), records: h.records, asOf: today, reportContext: facts });
  assert.match(system, /mode 是 weeklyReply/); assert.match(system, /suggestions 只給一項/); assert.match(system, /不能說成原因/);
  assert.equal(result.suggestions.length, 1);
});

test('the API returns one suggestion with only its sources, and refuses thin weeks', async t => {
  let received;
  const advise = async input => { received = input; return { answer: '這週有七晚達標。', suggestions: [{ title: 'A', detail: '一', sourceIds: ['K2'] }, { title: 'B', detail: '二', sourceIds: ['K5'] }], sources: [{ id: 'K2', title: 't2', publisher: 'p2', url: 'https://a.example', text: 'x', reviewedAt: 'r' }, { id: 'K5', title: 't5', publisher: 'p5', url: 'https://b.example' }] }; };
  const app = createApp({ apiKey: '', dbPath: ':memory:', advise, now: () => now });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const reg = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'weekly_user', password: 'test-password-123' }) });
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const thin = await post('/api/reports/weekly', { asOf: today, ...history(4) });
  assert.equal(thin.status, 400); assert.equal((await thin.json()).code, 'REPORT_DATA'); assert.equal(received, undefined);
  const ok = await (await post('/api/reports/weekly', { asOf: today, ...history(7), factorSurveys: surveys })).json();
  assert.equal(received.reportContext.mode, 'weeklyReply');
  assert.equal(ok.suggestion.title, 'A'); assert.deepEqual(ok.sources, [{ id: 'K2', title: 't2', publisher: 'p2', url: 'https://a.example' }]);
  assert.equal(ok.generatedOn, today); assert.equal(ok.start, addDays(today, -6));
  // The saved reply survives in the account.
  const saved = await (await post('/api/profile', { revision: 0, profile: { weeklyRecap: ok } })).json();
  assert.deepEqual(saved.profile.weeklyRecap, cleanWeeklyRecap(ok));
});
