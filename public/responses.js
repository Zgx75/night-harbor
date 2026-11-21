// Fixed-rule pet responses to the morning report. No AI is involved.
// "Late" always comes from assessNight, the same check used for coins: more than 15 minutes
// after the target saved before that night. Nothing here changes coins, streaks or group rewards.
import { assessNight, addDays } from './progress.js';

const timeOK = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const LATE_WINDOW_DAYS = 7, REMINDER_AFTER = 2;

export const DAILY_LINES = {
  onTime: [
    '昨晚有照約定的時間上床，我都看到了！',
    '準時躺下休息了，今天的你也很棒。',
    '昨晚有好好守住約定，謝謝你照顧自己。',
    '照著目標上床了！我們一起又前進了一小步。'
  ],
  reminder: [
    '這幾天有好幾晚比預定晚了一點，今晚我們早點一起準備休息吧。',
    '最近比較晚睡的晚上多了一些，今天記得替自己留點休息的時間喔。',
    '這週有幾天比約定晚了些，沒關係，今晚再一起試試看。',
    '最近好像常常晚一點才休息，今晚要不要早點開始收心？'
  ],
  survey: [
    '最近一週有幾天比預定時間晚睡，想知道最近是不是有什麼事情影響你的作息？',
    '這幾天好像常常比較晚休息，可以跟我說說最近有什麼不一樣嗎？',
    '最近有好幾晚比約定晚了些，想聽聽是什麼事情讓你比較晚睡。',
    '這一週比較晚睡的晚上多了一點，願意花一分鐘告訴我最近的狀況嗎？'
  ],
  noTarget: [
    '謝謝你告訴我！今晚先一起設一個小目標吧。',
    '收到昨晚的紀錄了，今晚要不要先定個上床時間？',
    '謝謝你的回報，先設定今晚的目標，明天我就能陪你一起看看。',
    '有記下來就很好了！今晚先替自己訂一個小約定吧。'
  ]
};
const ids = kind => DAILY_LINES[kind].map((_, i) => `${kind}-${i}`);
export const lineText = id => { const [kind, i] = String(id).split('-'); return DAILY_LINES[kind]?.[Number(i)] || ''; };

// Late nights among mornings date-6 … date (a rolling window, not a calendar week).
export function lateCount(records, targets, date, now = Date.now()) {
  const start = addDays(date, -(LATE_WINDOW_DAYS - 1));
  return records.filter(r => r.date >= start && r.date <= date && assessNight(r, targets, now).status === 'late').length;
}

// Which response today's morning report gets, or null for no message.
export function dailyKind(records, targets, date, now = Date.now()) {
  const record = records.find(r => r.date === date);
  if (!record || !timeOK(record.bedAt)) return null;
  const a = assessNight(record, targets, now);
  if (a.status === 'on-time') return 'onTime';
  // A single late night gets no reminder; two or more in the rolling window do.
  if (a.status === 'late') return lateCount(records, targets, date, now) >= REMINDER_AFTER ? 'reminder' : null;
  if (/還沒到/.test(a.label)) return null;
  return 'noTarget';
}

// Keeps the same line for the same day and kind; otherwise picks the next line not used recently.
// When today no longer deserves a message, today's line is withdrawn but the history is kept.
export function nextFeedback(previous, date, kind) {
  const recent = Array.isArray(previous?.recent) ? previous.recent : [];
  if (!kind) return previous?.date === date ? (recent.length ? { date: '', kind: null, id: null, recent } : null) : previous || null;
  if (previous?.date === date && previous.kind === kind) return previous;
  const options = ids(kind), last = recent.filter(id => id.startsWith(kind + '-')).at(-1);
  const start = last ? (options.indexOf(last) + 1) % options.length : 0;
  const pick = [...options.slice(start), ...options.slice(0, start)].find(id => !recent.slice(-2).includes(id)) || options[start];
  return { date, kind, id: pick, recent: [...recent, pick].slice(-6) };
}

export function cleanFeedback(value) {
  if (value == null) return null;
  const bad = () => { throw Object.assign(new Error('寵物回應資料格式有誤。'), { code: 'FEEDBACK' }); };
  if (typeof value !== 'object' || Array.isArray(value)) bad();
  const all = Object.keys(DAILY_LINES).flatMap(ids);
  if (!Array.isArray(value.recent) || value.recent.length > 6 || value.recent.some(id => !all.includes(id))) bad();
  if (value.kind === null) {
    if (value.date !== '' || value.id !== null) bad();
    return { date: '', kind: null, id: null, recent: [...value.recent] };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !DAILY_LINES[value.kind] || !ids(value.kind).includes(value.id)) bad();
  return { date: value.date, kind: value.kind, id: value.id, recent: [...value.recent] };
}

// ---------- Weekly: fixed-rule summary, no AI ----------
// Rolling windows: mornings date-6 … date, compared with the seven mornings before.
// Only reported bedtimes are used; a bedtime is never relabelled as a sleep-onset time.
export const WEEKLY_MIN_DAYS = 5, COMPARE_MIN = 3;
const inRange = s => timeOK(s) && nightMinutes(s) >= 1080 && nightMinutes(s) <= 1800;
const nightMinutes = s => { const m = Number(s.slice(0, 2)) * 60 + Number(s.slice(3)); return m < 720 ? m + 1440 : m; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const spread = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
function week(records, targets, start, end, now) {
  const rows = records.filter(r => r.date >= start && r.date <= end);
  const status = rows.map(r => assessNight(r, targets, now).status);
  const bed = rows.filter(r => inRange(r.bedAt)).map(r => nightMinutes(r.bedAt));
  const quality = rows.filter(r => Number.isInteger(r.sleepQuality)).map(r => r.sleepQuality);
  return { start, end, validDays: bed.length, bedtime: mean(bed), bedtimeSpread: bed.length >= COMPARE_MIN ? spread(bed) : null,
    quality: mean(quality), qualityCount: quality.length, onTime: status.filter(s => s === 'on-time').length, late: status.filter(s => s === 'late').length };
}
export function weeklySummary(records, targets, date, now = Date.now()) {
  const current = week(records, targets, addDays(date, -6), date, now), previous = week(records, targets, addDays(date, -13), addDays(date, -7), now);
  const both = count => current[count] >= COMPARE_MIN && previous[count] >= COMPARE_MIN;
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(date, i - 6), r = records.find(x => x.date === day);
    return { date: day, bedAt: r?.bedAt || '', quality: r?.sleepQuality ?? null, status: assessNight(r, targets, now).status };
  });
  return { ...current, comparable: current.onTime + current.late, complete: current.validDays >= WEEKLY_MIN_DAYS, minDays: WEEKLY_MIN_DAYS, previous, days,
    changes: {
      // Positive means earlier than the previous week.
      earlierBedtime: both('validDays') ? previous.bedtime - current.bedtime : null,
      quality: both('qualityCount') ? current.quality - previous.quality : null
    } };
}
// One small, fixed suggestion for next week, chosen from the numbers above.
export function weeklySuggestion(s) {
  if (!s.complete) return '下週試著每天早上花幾秒，回報前一晚的上床時間。';
  if (s.late >= 2) return '下週試著把開始收心的時間提早 15 分鐘，讓上床時間更接近目標。';
  if (s.bedtimeSpread != null && s.bedtimeSpread >= 45) return '這週上床時間起伏比較大，下週試著讓每晚的上床時間更接近一點。';
  return '下週維持現在的節奏，每晚照著目標準時上床就很好。';
}

// ---------- Weekly AI reply, generated at most once every seven days ----------
export const RECAP_EVERY_DAYS = 7;
export const weeklyRecapDue = (recap, date) => !recap || date >= addDays(recap.generatedOn, RECAP_EVERY_DAYS);
const dateOK = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const text = (v, max) => typeof v === 'string' && v.trim() && v.length <= max;
function cleanRecap(value, message, code) {
  if (value == null) return null;
  const bad = () => { throw Object.assign(new Error(message), { code }); };
  if (typeof value !== 'object' || Array.isArray(value) || ![value.start, value.end, value.generatedOn].every(dateOK) || !text(value.answer, 1200)) bad();
  let suggestion = null;
  if (value.suggestion != null) {
    const s = value.suggestion;
    if (!text(s.title, 100) || !text(s.detail, 800) || !Array.isArray(s.sourceIds) || s.sourceIds.length > 4 || s.sourceIds.some(id => typeof id !== 'string' || id.length > 10)) bad();
    suggestion = { title: s.title, detail: s.detail, sourceIds: [...s.sourceIds] };
  }
  if (!Array.isArray(value.sources) || value.sources.length > 4) bad();
  const sources = value.sources.map(s => {
    if (!s || !text(s.id, 10) || !text(s.title, 100) || !text(s.publisher, 100) || typeof s.url !== 'string' || !/^https:\/\/[^\s"'<>]+$/.test(s.url) || s.url.length > 300) bad();
    return { id: s.id, title: s.title, publisher: s.publisher, url: s.url };
  });
  return { start: value.start, end: value.end, generatedOn: value.generatedOn, answer: value.answer, suggestion, sources };
}
export const cleanWeeklyRecap = value => cleanRecap(value, '每週回顧資料格式有誤。', 'WEEKLY_RECAP');

// ---------- Monthly: 28 days, AI reply at most once every 28 days ----------
export const MONTH_DAYS = 28, MONTHLY_MIN_DAYS = 21, MONTHLY_EVERY_DAYS = 28, SPREAD_MIN = 7;
export const monthlyRecapDue = (recap, date) => !recap || date >= addDays(recap.generatedOn, MONTHLY_EVERY_DAYS);
export function monthlySummary(records, targets, date, now = Date.now()) {
  const start = addDays(date, -(MONTH_DAYS - 1)), all = week(records, targets, start, date, now);
  const weeks = [0, 1, 2, 3].map(i => {
    const w = week(records, targets, addDays(start, i * 7), addDays(start, i * 7 + 6), now);
    // A week with fewer than three bedtimes is reported as missing, never as zero.
    return { start: w.start, end: w.end, validDays: w.validDays, bedtime: w.validDays >= COMPARE_MIN ? w.bedtime : null, onTime: w.onTime, late: w.late };
  });
  const first = weeks[0].bedtime, last = weeks[3].bedtime, comparable = all.onTime + all.late;
  return { start, end: date, validDays: all.validDays, complete: all.validDays >= MONTHLY_MIN_DAYS, minDays: MONTHLY_MIN_DAYS,
    onTime: all.onTime, late: all.late, comparable, onTimeRate: comparable ? all.onTime / comparable : null,
    bedtime: all.bedtime, quality: all.quality, qualityCount: all.qualityCount, weeks,
    // Positive means the last week was earlier than the first.
    earlierBedtime: first != null && last != null ? first - last : null,
    bedtimeSpread: all.validDays >= SPREAD_MIN ? spread(records.filter(r => r.date >= start && r.date <= date && inRange(r.bedAt)).map(r => nightMinutes(r.bedAt))) : null };
}
export function monthlySuggestion(m) {
  if (!m.complete) return '下個月試著每天早上花幾秒，回報前一晚的上床時間。';
  if (m.onTimeRate != null && m.onTimeRate < 0.6) return '下個月試著把開始收心的時間提早 15 分鐘，讓上床時間更接近目標。';
  if (m.bedtimeSpread != null && m.bedtimeSpread >= 45) return '這個月上床時間起伏比較大，下個月試著讓每晚的上床時間更接近一點。';
  return '下個月維持現在的節奏，每晚照著目標準時上床就很好。';
}
// The monthly reply also keeps a few numbers, so next month can compare before and after its suggestion.
export function cleanMonthlyRecap(value) {
  const base = cleanRecap(value, '每月回顧資料格式有誤。', 'MONTHLY_RECAP');
  if (!base) return null;
  const s = value.snapshot;
  const ok = s && typeof s === 'object' && Number.isInteger(s.late) && s.late >= 0 && s.late <= MONTH_DAYS
    && (s.onTimeRate === null || (typeof s.onTimeRate === 'number' && s.onTimeRate >= 0 && s.onTimeRate <= 1))
    && (s.bedtime === null || (typeof s.bedtime === 'number' && s.bedtime >= 1080 && s.bedtime <= 1800));
  if (!ok) throw Object.assign(new Error('每月回顧資料格式有誤。'), { code: 'MONTHLY_RECAP' });
  return { ...base, snapshot: { late: s.late, onTimeRate: s.onTimeRate, bedtime: s.bedtime } };
}
