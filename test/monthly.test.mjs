import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyFacts, monthlyQuestion, monthSnapshot } from '../src/reports/monthly.mjs';
import { monthlySummary, monthlySuggestion, monthlyRecapDue, cleanMonthlyRecap } from '../public/responses.js';
import { createAdviceGenerator } from '../src/ai/advice.mjs';
import { addDays, nightInstant } from '../public/progress.js';
import { createApp } from '../src/server.mjs';

const today = '2026-10-15';
const now = Date.parse('2026-10-15T12:00:00+08:00');
// Mornings `days` back to today. `late` mornings (0 = today) are 40 minutes late; `bed` overrides per morning.
function history(days, late = [], bed = () => null) {
  const records = [], targets = {};
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i), night = addDays(date, -1);
    targets[night] = { bedtime: '00:30', createdAt: new Date(nightInstant(night, 1080)).toISOString() };
    records.push({ date, bedAt: bed(i) || (late.includes(i) ? '01:10' : '00:30'), sleepQuality: 3 });
  }
  return { records, targets };
}
const recap = (over = {}) => ({ start: addDays(today, -55), end: addDays(today, -28), generatedOn: addDays(today, -28), answer: '上個月有二十晚達標。', suggestion: { title: '下午兩點後不喝咖啡', detail: '下個月試試下午兩點後不喝含咖啡因飲品，再比較偏離晚數。', sourceIds: ['K1'] }, sources: [{ id: 'K1', title: '咖啡因與睡眠', publisher: 'NIH · NHLBI', url: 'https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits' }], snapshot: { late: 9, onTimeRate: 0.6, bedtime: 1500 }, ...over });

test('the month covers 28 days and needs 21 reported bedtimes', () => {
  const twenty = history(20);
  const m20 = monthlySummary(twenty.records, twenty.targets, today, now);
  assert.equal(m20.complete, false); assert.equal(m20.start, addDays(today, -27));
  assert.throws(() => monthlyFacts({ asOf: today, ...twenty }, now), e => e.code === 'REPORT_DATA' && /資料還不夠/.test(e.message));
  // Older records outside the 28 days do not count.
  const forty = history(40); forty.records = forty.records.filter(r => r.date < addDays(today, -20) || r.date === today);
  assert.equal(monthlySummary(forty.records, forty.targets, today, now).validDays, 8);
  const full = history(21);
  assert.equal(monthlySummary(full.records, full.targets, today, now).complete, true);
});

test('weekly averages, trend, on-time rate and spread are computed by the program', () => {
  // First week 01:30 (late), later weeks 00:30 with two late nights.
  const h = history(28, [3, 10], i => i >= 21 ? '01:30' : null);
  const m = monthlySummary(h.records, h.targets, today, now);
  assert.equal(m.weeks.length, 4);
  assert.equal(m.weeks[0].bedtime, 1440 + 90); assert.equal(m.weeks[3].bedtime, 1440 + 30 + 40 / 7);
  assert.equal(Math.round(m.earlierBedtime), 54);
  assert.equal(m.late, 9); assert.equal(m.onTime, 19); assert.equal(m.onTimeRate, 19 / 28);
  assert.ok(m.bedtimeSpread > 20);
  // A week with fewer than three bedtimes is missing, never zero.
  const sparse = history(28); // Week one keeps only two mornings.
  sparse.records = sparse.records.filter(r => r.date > addDays(today, -23));
  assert.equal(monthlySummary(sparse.records, sparse.targets, today, now).weeks[0].bedtime, null);
  assert.equal(monthlySummary(sparse.records, sparse.targets, today, now).earlierBedtime, null);
});

test('the fallback suggestion follows fixed rules', () => {
  const low = history(28, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.match(monthlySuggestion(monthlySummary(low.records, low.targets, today, now)), /提早 15 分鐘/);
  const good = history(28);
  assert.match(monthlySuggestion(monthlySummary(good.records, good.targets, today, now)), /維持/);
  assert.match(monthlySuggestion(monthlySummary([], {}, today, now)), /回報/);
});

test('facts compare with the previous period without assuming the suggestion was followed', () => {
  const h = history(28, [3, 10]);
  const surveys = [{ id: `round-${addDays(today, -3)}`, status: 'completed', triggeredOn: addDays(today, -3), completedOn: addDays(today, -3), lateDates: [], answers: { factors: ['caffeine'], caffeine: { taken: 'yes', drinks: ['coffee'], amount: 'one', lastAt: '16:00' } } }];
  const facts = monthlyFacts({ asOf: today, ...h, factorSurveys: surveys, previousRecap: recap() }, now);
  assert.equal(facts.mode, 'monthlyReply'); assert.equal(facts.偏離晚數, 2); assert.equal(facts.達標率百分比, 93);
  assert.deepEqual(facts.上一期, { 期間: `${addDays(today, -55)}~${addDays(today, -28)}`, 偏離晚數: 9, 達標率百分比: 60, 平均上床: '01:00', 當時建議: '下午兩點後不喝咖啡：下個月試試下午兩點後不喝含咖啡因飲品，再比較偏離晚數。' });
  assert.match(facts.說明, /不知道使用者是否照上一期建議做/);
  // Differences with the previous period are precomputed: 9 → 2 late nights, 60% → 93%, 01:00 → about 00:33.
  assert.deepEqual(facts.和上一期相比, { 偏離晚數: '少了 7 晚', 達標率: '增加 33 個百分點', 平均上床時間: '提早 27 分鐘' });
  const worse = monthlyFacts({ asOf: today, ...h, previousRecap: recap({ snapshot: { late: 2, onTimeRate: 26 / 28, bedtime: 1440 } }) }, now).和上一期相比;
  assert.deepEqual(worse, { 偏離晚數: '一樣', 達標率: '持平', 平均上床時間: '延後 33 分鐘' });
  assert.equal(facts.本期內第一週到第四週提早分鐘, Math.round(facts.本期內第一週到第四週提早分鐘));
  // The round's late date has no bedtime in this history, so the hours cannot be converted.
  assert.deepEqual(facts.偏離日回報的咖啡因, [{ 最後一杯: '16:00', 距離那幾晚平均上床: '無法換算' }]);
  // A reply that overlaps this period is not used as "previous".
  assert.equal(monthlyFacts({ asOf: today, ...h, previousRecap: recap({ end: addDays(today, -5) }) }, now).上一期, null);
  const q = monthlyQuestion(facts);
  assert.ok(q.length <= 800); assert.match(q, /具體時間的小實驗/); assert.match(q, /對照上一期/); assert.match(q, /不要逐週列出數字/);
  assert.deepEqual(monthSnapshot({ asOf: today, ...h }, now), { late: 2, onTimeRate: 26 / 28, bedtime: Math.round(1440 + 30 + 80 / 28) });
});

test('the monthly reply runs at most once every 28 days and is validated when saved', () => {
  assert.equal(monthlyRecapDue(null, today), true);
  assert.equal(monthlyRecapDue(recap({ generatedOn: addDays(today, -27) }), today), false);
  assert.equal(monthlyRecapDue(recap({ generatedOn: addDays(today, -28) }), today), true);
  assert.deepEqual(cleanMonthlyRecap(recap()), recap());
  assert.throws(() => cleanMonthlyRecap(recap({ snapshot: { late: -1, onTimeRate: 0.5, bedtime: 1500 } })));
  assert.throws(() => cleanMonthlyRecap(recap({ snapshot: undefined })));
});

test('the model rules forbid claiming the experiment was followed or caused a change', async () => {
  let system;
  const advise = createAdviceGenerator({ apiKey: 'test', fetchImpl: async (_u, o) => {
    system = JSON.parse(o.body).systemInstruction.parts[0].text;
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ answer: '這個月有二十六晚達標。', suggestions: [{ title: '小實驗', detail: '下個月試試下午兩點後不喝咖啡，再比較看看。', sourceIds: ['K1'] }] }) }] } }] }));
  } });
  const h = history(28);
  const facts = monthlyFacts({ asOf: today, ...h, previousRecap: recap() }, now);
  await advise({ question: monthlyQuestion(facts), records: h.records, asOf: today, reportContext: facts });
  assert.match(system, /mode 是 monthlyReply/); assert.match(system, /不能假設使用者照建議做了/); assert.match(system, /可以是一個月的小實驗/);
  // Short, fixed wording, follow up on last period's suggestion, and a concrete time for experiments.
  assert.match(system, /最多 180 字/); assert.match(system, /不要逐週列出/); assert.match(system, /照用「比較晚的那幾天你有提到…」/);
  assert.match(system, /上一期建議過/); assert.match(system, /只能照抄「和上一期相比」欄位/); assert.match(system, /阿拉伯數字/); assert.match(system, /必須寫出具體的時間或做法/);
});

test('the API returns the reply with a snapshot and refuses thin months', async t => {
  let received;
  const advise = async input => { received = input; return { answer: '這個月有二十八晚達標。', suggestions: [{ title: '維持', detail: '下個月維持現在的節奏。', sourceIds: ['K2'] }], sources: [{ id: 'K2', title: 't', publisher: 'p', url: 'https://a.example' }] }; };
  const app = createApp({ apiKey: '', dbPath: ':memory:', advise, now: () => now });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const reg = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'monthly_user', password: 'test-password-123' }) });
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const thin = await post('/api/reports/monthly', { asOf: today, ...history(20) });
  assert.equal(thin.status, 400); assert.equal(received, undefined);
  const ok = await (await post('/api/reports/monthly', { asOf: today, ...history(28) })).json();
  assert.equal(received.reportContext.mode, 'monthlyReply');
  assert.deepEqual(ok.snapshot, { late: 0, onTimeRate: 1, bedtime: 1470 });
  assert.equal(ok.start, addDays(today, -27));
  const saved = await (await post('/api/profile', { revision: 0, profile: { monthlyRecap: ok } })).json();
  assert.deepEqual(saved.profile.monthlyRecap, cleanMonthlyRecap(ok));
});
