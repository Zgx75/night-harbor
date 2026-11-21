import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAnswers, cleanOnboarding, deriveSleep, validateStep, plannerSummary, ONBOARDING_VERSION } from '../public/onboarding.js';
import { createPlanGenerator } from '../src/ai/planner.mjs';
import { planInputKey } from '../public/plan-state.js';
import { createApp } from '../src/server.mjs';

const answers = (patch = {}) => ({
  workDays: 5,
  work: { bedAt: '00:30', sleepAt: '01:00', wakeAt: '08:00' },
  free: { bedAt: '02:00', sleepAt: '02:30', wakeAt: '11:30', alarm: false },
  lightSleeper: 'sometimes', wakeBeforeAlarm: 'never', racingThoughts: 'often', eveningFocus: 'always',
  copeStress: 'sometimes', restedOnWaking: 'never', selfCareTime: 'sometimes',
  caffeine: '15to18', alcohol: 'weekly1to2', alcoholBeforeBed: 'sometimes',
  exerciseTime: 'evening', exerciseDays: 3, exerciseIntensity: 'vigorous',
  lateReasons: ['revenge', 'social'], targetBedtime: '23:30', ...patch
});
const completed = (a = answers()) => ({ version: ONBOARDING_VERSION, status: 'completed', completedAt: '2026-10-15T10:00:00.000Z', answers: a });

test('MCTQ mid-sleep, sleep-corrected MSFsc, weekly duration and social jetlag cross midnight', () => {
  const d = deriveSleep(cleanAnswers(answers()));
  // Workdays: 01:00 → 08:00 is 7 h, mid-sleep 04:30. Free days: 02:30 → 11:30 is 9 h, mid-sleep 07:00.
  assert.equal(d.workDuration, 420); assert.equal(d.freeDuration, 540);
  assert.equal(d.workMidSleep, 1440 + 270); assert.equal(d.freeMidSleep, 1440 + 420);
  // MSFsc = MSF − (SDf − SDw) / 2 = 07:00 − 1 h = 06:00.
  assert.equal(d.msfsc, 1440 + 360); assert.equal(d.chronotype, 'late'); assert.equal(d.msfscReliable, true);
  assert.equal(d.socialJetlag, 150);
  assert.equal(d.weeklyDuration, Math.round((420 * 5 + 540 * 2) / 7));
  // Sleep before midnight is handled on the same night scale.
  const early = deriveSleep(cleanAnswers(answers({ work: { bedAt: '22:00', sleepAt: '22:15', wakeAt: '06:15' }, free: { bedAt: '22:30', sleepAt: '22:45', wakeAt: '06:45', alarm: false } })));
  assert.equal(early.workMidSleep, 1335 + 240); assert.equal(early.msfsc, 1365 + 240); assert.equal(early.chronotype, 'early'); assert.equal(early.socialJetlag, 30);
});

test('MSFsc is not corrected when free-day sleep is shorter, and alarm days are flagged', () => {
  const d = deriveSleep(cleanAnswers(answers({ free: { bedAt: '01:00', sleepAt: '01:30', wakeAt: '07:30', alarm: true } })));
  assert.equal(d.freeDuration, 360); assert.equal(d.msfsc, d.freeMidSleep); assert.equal(d.chronotype, 'intermediate'); assert.equal(d.msfscReliable, false);
});

test('all-week schedules omit the missing side instead of inventing it', () => {
  const allWork = cleanAnswers(answers({ workDays: 7, free: undefined }));
  assert.equal(allWork.free, null);
  const d = deriveSleep(allWork);
  assert.equal(d.msfsc, null); assert.equal(d.chronotype, 'unknown'); assert.equal(d.socialJetlag, null); assert.equal(d.weeklyDuration, 420);
  const noWork = deriveSleep(cleanAnswers(answers({ workDays: 0, work: undefined })));
  assert.equal(noWork.socialJetlag, null); assert.equal(noWork.msfsc, noWork.freeMidSleep);
});

test('each step rejects incomplete or impossible answers', () => {
  assert.throws(() => validateStep(0, answers({ work: { bedAt: '01:00', sleepAt: '00:30', wakeAt: '08:00' } })), /不應早於上床/);
  assert.throws(() => validateStep(0, answers({ work: { bedAt: '12:00', sleepAt: '12:30', wakeAt: '20:00' } })), /18:00/);
  assert.throws(() => validateStep(0, answers({ free: { bedAt: '01:00', sleepAt: '01:30', wakeAt: '09:00' } })), /鬧鐘/);
  assert.throws(() => validateStep(1, answers({ restedOnWaking: undefined })), /感受題/);
  assert.throws(() => validateStep(2, answers({ exerciseIntensity: '' })), /強度/);
  assert.throws(() => validateStep(3, answers({ lateReasons: ['study', 'social', 'media', 'work'] })), /1 到 3/);
  assert.throws(() => validateStep(3, answers({ lateReasons: [] })), /1 到 3/);
  // Follow-up questions are answered automatically when they no longer apply.
  const none = validateStep(2, answers({ alcohol: 'never', alcoholBeforeBed: undefined, exerciseTime: 'none', exerciseDays: undefined, exerciseIntensity: undefined }));
  assert.deepEqual([none.alcoholBeforeBed, none.exerciseDays, none.exerciseIntensity], ['never', 0, '']);
});

test('saved derived values are recomputed and unknown fields are dropped', () => {
  const forged = cleanOnboarding({ ...completed(), derived: { chronotype: 'early', socialJetlag: 0 }, answers: { ...answers(), extra: 'x' } });
  assert.equal(forged.derived.chronotype, 'late'); assert.equal(forged.derived.socialJetlag, 150); assert.equal('extra' in forged.answers, false);
  assert.deepEqual(cleanOnboarding({ version: 1, status: 'skipped', skippedAt: '2026-10-15T10:00:00.000Z' }), { version: 1, status: 'skipped', skippedAt: '2026-10-15T10:00:00.000Z' });
  assert.equal(cleanOnboarding(null), null);
  assert.throws(() => cleanOnboarding({ version: 99, status: 'completed' }));
});

test('the questionnaire is saved to the account and rejected when malformed', async t => {
  const app = createApp({ apiKey: '', dbPath: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  let cookie = '';
  const request = async (route, body) => {
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return response;
  };
  assert.equal((await request('/api/auth/register', { username: 'survey_user', password: 'test-password-123' })).status, 201);
  const first = await (await request('/api/profile')).json();
  assert.equal(first.profile.onboarding, undefined);
  const bad = await request('/api/profile', { revision: first.revision, profile: { onboarding: completed(answers({ caffeine: 'sometimes' })) } });
  assert.equal(bad.status, 400);
  const saved = await (await request('/api/profile', { revision: first.revision, profile: { onboarding: completed() } })).json();
  assert.equal(saved.profile.onboarding.derived.chronotype, 'late');
  assert.equal((await (await request('/api/profile')).json()).profile.onboarding.answers.targetBedtime, '23:30');
});

test('the planner receives a label-only summary, and a new questionnaire refreshes the cached plan', async () => {
  const now = Date.parse('2026-10-15T12:00:00+08:00');
  let sent, system;
  const generate = createPlanGenerator({ apiKey: 'test', now: () => now, fetchImpl: async (_u, o) => {
    const body = JSON.parse(o.body); system = body.systemInstruction.parts[0].text; sent = JSON.parse(body.contents[0].parts[0].text);
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ bedtime: '00:30', reason: '最終希望23:30，今晚先維持00:30。', observations: [], nextStep: '睡前避免喝酒。', sourceIds: ['K10'] }) }] } }] }));
  } });
  const input = { records: [], currentBedtime: '00:30', targetBedtime: '23:30', wakeTime: '08:00', asOf: '2026-10-15', targets: {} };
  const plan = await generate({ ...input, onboarding: completed() });
  assert.equal(plan.sources[0].id, 'K10');
  assert.equal(sent.onboarding.chronotype, '偏晚型'); assert.equal(sent.onboarding.socialJetlagMinutes, 150);
  assert.deepEqual(sent.onboarding.lateNightReasons, ['白天沒有自己的時間，晚上想多留一點', '滑社群或聊天']);
  assert.match(system, /不是診斷/);
  await generate(input); assert.equal(sent.onboarding, null);
  await assert.rejects(generate({ ...input, onboarding: completed(answers({ workDays: 9 })) }), /0 到 7/);
  assert.equal(plannerSummary({ version: 1, status: 'skipped', skippedAt: '2026-10-15T10:00:00.000Z' }), null);
  const settings = { currentBedtime: '00:30', targetBedtime: '23:30', wakeTime: '08:00' };
  assert.notEqual(planInputKey(settings, [], '2026-10-15', cleanOnboarding(completed())), planInputKey(settings, [], '2026-10-15', null));
});
