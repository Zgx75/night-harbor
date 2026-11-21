// Fills a running Night Harbor server with a believable demo: one account with four weeks of sleep logs
// (a late sleeper who slowly moves earlier), a grown pet with a furnished room, ready-made weekly and
// monthly reviews, three friends, a co-raised group and a pending friend request.
// It only uses the public API, so coins, streaks and rewards are worked out by the server as usual.
//
//   node scripts/seed-demo.mjs [server address]        (default http://127.0.0.1:3000)
//
// "npm run demo" starts a separate demo server (its own database) and runs this for you.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { addDays, formatClock } from '../public/progress.js';
import { weeklySummary, monthlySummary } from '../public/responses.js';
import { knowledge } from '../src/ai/knowledge.mjs';

export const DEMO_USER = 'demo';
export const DEMO_PASSWORD = 'demo-password-123';
const TAIPEI = 8 * 3600000;

// The same numbers every run, so a retake looks the same.
function random(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const between = (rng, a, b) => Math.round(a + rng() * (b - a));
export const taipeiToday = (now = Date.now()) => new Date(now + TAIPEI).toISOString().slice(0, 10);

// One person's history: for every wake-up day, the target saved the evening before and when they really went to bed.
// `stages` are the average minutes late in each week, oldest first; `lateDays` / `onTimeDays` force certain days
// (counted back from yesterday, 1 = yesterday) and `missing` are days nobody filled in.
export function makeHistory({ today, days, stages, targets: stageTargets, seed, lateDays = [], onTimeDays = [], missing = [] }) {
  const rng = random(seed), records = [], targets = {};
  for (let i = days; i >= 1; i--) {
    const date = addDays(today, -i), night = addDays(date, -1);
    const stage = Math.min(stages.length - 1, Math.floor((days - i) / 7));
    const target = stageTargets[stage];
    targets[night] = { bedtime: formatClock(target), createdAt: new Date(Date.parse(`${night}T12:00:00+08:00`)).toISOString(), source: 'gemini', reason: '依最近的上床時間，往最終方向小幅前進。' };
    if (missing.includes(i)) continue;
    const delta = lateDays.includes(i) ? between(rng, 28, 44) : onTimeDays.includes(i) ? between(rng, 0, 12) : Math.max(-10, Math.round(stages[stage] + (rng() - 0.5) * 24));
    const late = delta > 15;
    records.push({ date, bedAt: formatClock(target + delta), sleepQuality: late ? pick(rng, [2, 3, 3, 2, 4]) : pick(rng, [4, 5, 4, 5, 3]) });
  }
  return { records, targets };
}

function client(base) {
  return async function call(who, route, body) {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(who.cookie ? { Cookie: who.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const cookie = response.headers.get('set-cookie');
    if (cookie) who.cookie = cookie.split(';')[0];
    let data = null;
    try { data = await response.json(); } catch { /* an empty body */ }
    return { status: response.status, ok: response.ok, data };
  };
}

export async function seedDemo({ base = 'http://127.0.0.1:3000', log = console.log } = {}) {
  const call = client(base), today = taipeiToday(), people = {};
  const must = (result, what) => { if (!result.ok) throw new Error(`${what}失敗（${result.status}）：${result.data?.error || ''}`); return result.data; };

  async function account(username, displayName) {
    const who = { username, cookie: '' };
    let result = await call(who, '/api/auth/register', { username, password: DEMO_PASSWORD, displayName });
    if (!result.ok) result = await call(who, '/api/auth/login', { username, password: DEMO_PASSWORD });
    who.id = must(result, `建立或登入 ${username}`).user.id;
    return (people[username] = who);
  }
  async function saveProfile(who, profile) {
    const current = must(await call(who, '/api/profile'), '讀取帳號資料');
    return must(await call(who, '/api/profile', { revision: current.revision, profile }), `保存 ${who.username} 的資料`).profile;
  }
  // Calls that are fine to repeat (the demo can be seeded again): a conflict just means it was already done.
  const again = async (who, route, body) => { const r = await call(who, route, body); if (!r.ok && ![403, 404, 409].includes(r.status)) throw new Error(`${route} 失敗（${r.status}）：${r.data?.error || ''}`); return r; };
  const skipped = { onboarding: { version: 1, status: 'skipped', skippedAt: new Date().toISOString() } };
  const settings = { currentBedtime: '01:30', targetBedtime: '00:30', wakeTime: '08:30' };
  const pet = (id, name) => ({ pet: { id, name }, credits: [], bonusCredits: [], transactions: [], inventory: [], placed: [], layout: {}, affection: 70, affectionAt: new Date().toISOString(), careDays: [] });

  // ------------------------------------------------------------ the demo account
  log('建立示範帳號與四週的睡眠紀錄…');
  const demo = await account(DEMO_USER, '小夜');
  // Four weeks: late at the start, moving earlier every week. Three late nights in the middle of the last week
  // (the follow-up questionnaire below is about them), then three on-time nights in a row.
  const history = makeHistory({ today, days: 28, stages: [28, 16, 6, 3], targets: [1545, 1530, 1515, 1485], seed: 20261121, lateDays: [6, 5, 4], onTimeDays: [1, 2, 3, 7], missing: [25, 19, 12, 9] });
  const tonight = Number(new Date(Date.now() + TAIPEI).getUTCHours()) < 6 ? addDays(today, -1) : today;
  history.targets[tonight] = { bedtime: '00:45', createdAt: new Date(Date.now() - 2 * 3600000).toISOString(), source: 'gemini', reason: '這幾晚都有照約定上床，今晚維持在 00:45，讓節奏更穩。' };
  const factorDay = addDays(today, -4);
  const factorSurveys = [{
    id: `round-${factorDay}`, status: 'completed', triggeredOn: factorDay, completedOn: factorDay,
    lateDates: [addDays(today, -6), addDays(today, -5), addDays(today, -4)],
    answers: { factors: ['caffeine', 'media', 'study'], caffeine: { taken: 'yes', drinks: ['coffee', 'energy'], amount: 'two', lastAt: '19:00' }, media: { delayed: 'yes' }, study: { delayed: 'yes' } }
  }];
  const source = id => { const k = knowledge.find(x => x.id === id); return { id: k.id, title: k.title, publisher: k.publisher, url: k.url }; };
  const w = weeklySummary(history.records, history.targets, today), m = monthlySummary(history.records, history.targets, today);
  const weeklyRecap = {
    start: w.start, end: w.end, generatedOn: today,
    answer: `這一週你回報了 ${w.validDays} 晚，其中 ${w.onTime} 晚照著約定上床、${w.late} 晚比目標晚，平均上床時間約 ${formatClock(w.bedtime)}。比較晚的那三天，你說剛好有報告要趕，也喝了咖啡和能量飲料；其他日子都守住了，最近三晚還連續達標，很不容易。`,
    suggestion: { title: '下週先守住「報告前的收尾時間」', detail: '有報告要趕的晚上，先替自己訂一個「最晚收工時間」，時間到就把剩下的寫成明天的第一件事。下午三點後也可以先換成沒有咖啡因的飲品，看看入睡會不會比較順。', sourceIds: ['K1', 'K4'] },
    sources: [source('K1'), source('K4')]
  };
  const monthlyRecap = {
    start: m.start, end: m.end, generatedOn: today,
    answer: `這四週你有 ${m.validDays} 天回報上床時間，達標率約 ${Math.round(m.onTimeRate * 100)}%。第一週平均 ${formatClock(m.weeks[0].bedtime)} 才上床，到第四週已經提早到 ${formatClock(m.weeks[3].bedtime)}，整整提早約 ${Math.round(m.earlierBedtime)} 分鐘。這不是一下子做到的，而是每週往前一點點累積出來的。`,
    suggestion: { title: '下個月的小實驗：固定起床時間', detail: '試著連續兩週，不管幾點睡都在同一個時間起床，連週末也一樣。起床時間穩定之後，晚上的睡意通常也會更準時出現。', sourceIds: ['K2'] },
    sources: [source('K2')],
    snapshot: { late: m.late, onTimeRate: m.onTimeRate, bedtime: Math.round(m.weeks[3].bedtime) }
  };
  const economy = {
    ...pet('fox', '栗子'), affection: 72,
    inventory: ['cushion', 'plant', 'lamp', 'books', 'teddy', 'frame', 'clock', 'balloon', 'radio'],
    placed: ['cushion', 'plant', 'lamp', 'teddy', 'frame', 'balloon', 'radio'],
    layout: { teddy: { x: 0.64, y: 0.9 }, radio: { x: 0.2, y: 0.88 } },
    careDays: [1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 16, 19].map(n => addDays(today, -n))
  };
  const saved = await saveProfile(demo, { settings, records: history.records, targets: history.targets, economy, factorSurveys, weeklyRecap, monthlyRecap, ...skipped });
  log(`  紀錄 ${saved.records.length} 天，金幣由伺服器依紀錄結算（個人達標 ${saved.economy.credits.length} 晚）。`);

  // ------------------------------------------------------------ friends
  log('建立好友與共養小組…');
  const crew = [
    ['mika', '米卡', 'cat', '麻糬', { stages: [10, 4], targets: [1500, 1470], seed: 11, status: 'sleeping' }],
    ['leo', '里歐', 'panda', '胖胖', { stages: [30, 22], targets: [1515, 1500], seed: 22, status: 'awake' }],
    ['nana', '娜娜', 'penguin', '企鵝先生', { stages: [26, 8], targets: [1530, 1485], seed: 33, status: 'up' }]
  ];
  for (const [username, displayName, kind, petName, plan] of crew) {
    const who = await account(username, displayName);
    const friendHistory = makeHistory({ today, days: 14, stages: plan.stages, targets: plan.targets, seed: plan.seed });
    await saveProfile(who, { settings, records: friendHistory.records, targets: friendHistory.targets, economy: pet(kind, petName), ...skipped });
    await again(demo, '/api/social/friends/request', { username });
    await again(who, '/api/social/friends/respond', { userId: demo.id, action: 'accept' });
    await call(who, '/api/social/preferences', { shareStatus: true, shareLeaderboard: true });
    await call(who, '/api/social/status', { status: plan.status });
  }
  await call(demo, '/api/social/preferences', { shareStatus: true, shareLeaderboard: true });
  await call(demo, '/api/social/status', { status: 'awake' });
  // Someone who has just asked to be your friend, so the invitation block has something to answer.
  const kai = await account('kai', '凱');
  await saveProfile(kai, { settings, economy: pet('owl', '小圓'), ...skipped });
  await again(kai, '/api/social/friends/request', { username: DEMO_USER });

  // ------------------------------------------------------------ the co-raised group
  await again(demo, '/api/social/groups/create', { name: '月亮小隊', petId: 'rabbit', petName: '糯米糰' });
  const group = must(await call(demo, '/api/social'), '讀取社群資料').group;
  if (group) {
    await again(demo, '/api/social/groups/invite', { userId: people.mika.id });
    await again(people.mika, '/api/social/groups/invite/respond', { groupId: group.id, action: 'accept' });
    await again(demo, '/api/social/groups/invite', { userId: people.nana.id });   // still waiting for an answer
    for (const id of ['sofa', 'plant', 'lamp', 'frame', 'balloon']) {
      const r = await call(demo, '/api/social/groups/pet', { type: 'buy', id });
      if (!r.ok && r.status !== 400) throw new Error(`共養商店購買失敗（${r.status}）`);
    }
    await call(demo, '/api/social/groups/pet', { type: 'feed' });
  }
  log('完成。');
  return { base, today, username: DEMO_USER, password: DEMO_PASSWORD };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const base = process.argv[2] || 'http://127.0.0.1:3000';
  seedDemo({ base }).then(result => {
    console.log(`\n用這組帳號登入：${base}\n  帳號 ${result.username}\n  密碼 ${result.password}\n`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
