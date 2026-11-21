// Life-factor follow-up, opened only after at least three late nights in a rolling seven days.
// A round must be answered: it opens right away, cannot be skipped, and the app returns to it
// until it is completed (including after the app is closed and reopened).
// Fixed program rules decide when it opens; no AI is involved. A round describes "the last few
// days" as a whole and is linked to the late mornings that triggered it.
import { assessNight, addDays } from './progress.js';

export const SURVEY_AFTER = 3, WINDOW_DAYS = 7, COOLDOWN_DAYS = 7, MAX_ROUNDS = 26;
const FREQ = [['never', '從不'], ['sometimes', '有時'], ['often', '經常'], ['always', '總是']];
export const FACTORS = [
  ['caffeine', '咖啡、茶或其他含咖啡因飲品'],
  ['nap', '午睡時間或長度改變'],
  ['exercise', '運動時間改變'],
  ['study', '課業、報告或考試'],
  ['media', '遊戲、追劇或滑手機'],
  ['stress', '最近壓力比較大或思緒停不下來'],
  ['sleepDifficulty', '明明很累卻睡不著'],
  ['environment', '室友或環境干擾'],
  ['none', '沒有特別不一樣'],
  ['other', '其他']
];
// Follow-up questions, shown only for the factors the user picked.
export const FOLLOW_UPS = {
  caffeine: [
    { key: 'taken', label: '最近這幾天有喝含咖啡因的飲品嗎？', type: 'radio', options: [['yes', '有'], ['no', '沒有'], ['unsure', '不確定']] },
    { key: 'drinks', label: '喝了哪些？（可複選）', type: 'checkbox', when: { taken: 'yes' }, options: [['coffee', '咖啡'], ['blackTea', '紅茶'], ['greenTea', '綠茶'], ['oolong', '烏龍茶'], ['energy', '能量飲料'], ['cola', '可樂'], ['other', '其他']] },
    { key: 'amount', label: '一天大約喝多少？', type: 'radio', when: { taken: 'yes' }, options: [['half', '半杯以下'], ['one', '約一杯'], ['two', '兩杯'], ['threePlus', '三杯以上']] },
    { key: 'lastAt', label: '通常最後一杯在幾點？', type: 'time', when: { taken: 'yes' } }
  ],
  nap: [
    { key: 'taken', label: '最近這幾天有午睡嗎？', type: 'radio', options: [['yes', '有'], ['no', '沒有']] },
    { key: 'startAt', label: '午睡通常幾點開始？', type: 'time', when: { taken: 'yes' } },
    { key: 'length', label: '午睡大約多久？', type: 'radio', when: { taken: 'yes' }, options: [['under20', '20 分鐘以下'], ['20to30', '20～30 分鐘'], ['30to60', '30～60 分鐘'], ['over60', '60 分鐘以上']] }
  ],
  exercise: [
    { key: 'taken', label: '最近這幾天有運動嗎？', type: 'radio', options: [['yes', '有'], ['no', '沒有']] },
    // Older answers stored a time band instead; they are still accepted (see LEGACY_EXERCISE_BANDS).
    { key: 'endAt', label: '運動通常幾點結束？', type: 'time', when: { taken: 'yes' }, legacy: 'endBand' }
  ],
  study: [{ key: 'delayed', label: '是否因為報告、考試或作業而延後上床？', type: 'radio', options: [['yes', '是'], ['no', '否']] }],
  media: [{ key: 'delayed', label: '是否因為滑手機、遊戲或追劇而延後上床？', type: 'radio', options: [['yes', '是'], ['no', '否']] }],
  stress: [{ key: 'frequency', label: '最近是否有壓力或情緒因素影響休息？', type: 'radio', options: FREQ }],
  sleepDifficulty: [
    { key: 'happened', label: '是否明明很累，卻遲遲睡不著？', type: 'radio', options: [['yes', '是'], ['no', '否']] },
    { key: 'latency', label: '大約花多久才睡著？', type: 'radio', when: { happened: 'yes' }, options: [['under15', '15 分鐘以下'], ['15to30', '15～30 分鐘'], ['30to60', '30～60 分鐘'], ['over60', '60 分鐘以上']] },
    { key: 'frequency', label: '這種情況多常發生？', type: 'radio', when: { happened: 'yes' }, options: [['occasionally', '偶爾'], ['weekly', '每週幾次'], ['daily', '幾乎每天']] },
    { key: 'daytime', label: '這種情況有影響到白天的精神、上課或生活嗎？', type: 'radio', when: { happened: 'yes' }, options: [['yes', '有'], ['no', '沒有']] }
  ]
};

// Time bands used by the first version of the exercise question, with their clock ranges in minutes.
export const LEGACY_EXERCISE_BANDS = { before18: [0, 1080], '18to20': [1080, 1200], '20to22': [1200, 1320], after22: [1320, 1440] };
const timeOK = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const dateOK = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
function invalid(message) { throw Object.assign(new Error(message), { code: 'FACTOR_SURVEY' }); }
const closedOn = s => s.status === 'completed' ? s.completedOn : s.status === 'dismissed' ? s.dismissedOn : null;

export function lateDates(records, targets, date, now = Date.now()) {
  const start = addDays(date, -(WINDOW_DAYS - 1));
  return records.filter(r => r.date >= start && r.date <= date && assessNight(r, targets, now).status === 'late').map(r => r.date).sort();
}
// The first day a new round may open again after the last completed or dismissed round.
export function cooldownEnds(surveys) {
  const last = (surveys || []).map(closedOn).filter(Boolean).sort().at(-1);
  return last ? addDays(last, COOLDOWN_DAYS) : null;
}
export const pendingSurvey = surveys => (surveys || []).find(s => s.status === 'pending') || null;
export function surveyDue(surveys, records, targets, date, now = Date.now()) {
  if (pendingSurvey(surveys)) return false;
  const ends = cooldownEnds(surveys);
  if (ends && date < ends) return false;
  return lateDates(records, targets, date, now).length >= SURVEY_AFTER;
}
export function openSurvey(surveys, records, targets, date, now = Date.now()) {
  const id = `round-${date}`;
  const round = { id, status: 'pending', triggeredOn: date, lateDates: lateDates(records, targets, date, now) };
  return [...(surveys || []).filter(s => s.id !== id), round].slice(-MAX_ROUNDS);
}

function cleanFollowUp(factor, value) {
  const out = {}, v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  for (const q of FOLLOW_UPS[factor]) {
    if (q.when && Object.entries(q.when).some(([k, want]) => out[k] !== want)) continue;
    const ask = `請回答「${q.label}」`;
    if (q.type === 'time') {
      // Saved answers from before the change keep their band; new answers must give a time.
      if (q.legacy && !(q.key in v) && v[q.legacy] in LEGACY_EXERCISE_BANDS) { out[q.legacy] = v[q.legacy]; continue; }
      if (!timeOK(v[q.key])) invalid(ask); out[q.key] = v[q.key];
    }
    else if (q.type === 'checkbox') {
      const picked = Array.isArray(v[q.key]) ? [...new Set(v[q.key])] : [];
      if (!picked.length || picked.some(x => !q.options.some(([id]) => id === x))) invalid(ask);
      out[q.key] = picked;
    } else { if (!q.options.some(([id]) => id === v[q.key])) invalid(ask); out[q.key] = v[q.key]; }
  }
  return out;
}
export function cleanFactors(value) {
  const factors = Array.isArray(value) ? [...new Set(value)] : [];
  if (!factors.length || factors.length > 3) invalid('請選 1 到 3 項。');
  if (factors.some(f => !FACTORS.some(([id]) => id === f))) invalid('選項有誤。');
  if (factors.includes('none') && factors.length > 1) invalid('「沒有特別不一樣」不能和其他選項一起選。');
  return factors;
}
export function cleanAnswers(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) invalid('問卷內容格式有誤。');
  const factors = cleanFactors(a.factors), out = { factors };
  if (factors.includes('other')) {
    if (typeof a.otherText !== 'string' || a.otherText.trim().length > 40) invalid('「其他」請用 40 字以內描述，也可以留白。');
    out.otherText = a.otherText.trim();
  }
  for (const f of factors) if (FOLLOW_UPS[f]) out[f] = cleanFollowUp(f, a[f]);
  return out;
}

export function cleanSurveys(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_ROUNDS) invalid('生活因素問卷資料有誤。');
  const ids = new Set();
  return value.map(s => {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !/^round-\d{4}-\d{2}-\d{2}$/.test(s.id) || ids.has(s.id) || !dateOK(s.triggeredOn)) invalid('生活因素問卷資料有誤。');
    ids.add(s.id);
    if (!Array.isArray(s.lateDates) || s.lateDates.length > WINDOW_DAYS || s.lateDates.some(d => !dateOK(d))) invalid('生活因素問卷資料有誤。');
    const base = { id: s.id, status: s.status, triggeredOn: s.triggeredOn, lateDates: [...s.lateDates] };
    if (s.status === 'pending') return base;
    if (s.status === 'dismissed') { if (!dateOK(s.dismissedOn)) invalid('生活因素問卷資料有誤。'); return { ...base, dismissedOn: s.dismissedOn }; }
    if (s.status === 'completed') { if (!dateOK(s.completedOn)) invalid('生活因素問卷資料有誤。'); return { ...base, completedOn: s.completedOn, answers: cleanAnswers(s.answers) }; }
    invalid('生活因素問卷資料有誤。');
  });
}

// A fixed, non-diagnostic reminder when trouble sleeping is frequent and affects the day.
export const needsCareNote = answers => {
  const d = answers?.sleepDifficulty;
  return d?.happened === 'yes' && ['weekly', 'daily'].includes(d.frequency) && d.daytime === 'yes';
};

// ---------- Hours between a reported time and going to bed ----------
// The program converts answers into "hours before bed" using the bedtimes reported on that
// round's late mornings. These describe those nights only; no general threshold is applied.
const clockMinutes = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const bedMinutes = s => clockMinutes(s) < 720 ? clockMinutes(s) + 1440 : clockMinutes(s);
// Daytime answers before 06:00 are read as after midnight, on the same night scale as bedtimes.
const eveningMinutes = m => m < 360 ? m + 1440 : m;
const toHours = minutes => Math.max(0, Math.round(minutes / 30) / 2);
export function roundBedtime(round, records) {
  const beds = round.lateDates.map(d => records.find(r => r.date === d)?.bedAt).filter(b => timeOK(b) && bedMinutes(b) >= 1080 && bedMinutes(b) <= 1800).map(bedMinutes);
  return beds.length ? beds.reduce((a, b) => a + b, 0) / beds.length : null;
}
export function roundGaps(round, records) {
  const bed = roundBedtime(round, records), a = round.answers || {};
  const gap = clock => bed == null ? null : toHours(bed - eveningMinutes(clockMinutes(clock)));
  const caffeine = a.caffeine?.taken === 'yes' ? { lastAt: a.caffeine.lastAt, hoursBeforeBed: gap(a.caffeine.lastAt) } : null;
  let exercise = null;
  if (a.exercise?.taken === 'yes' && a.exercise.endAt) exercise = { endAt: a.exercise.endAt, hoursBeforeBed: gap(a.exercise.endAt) };
  else if (a.exercise?.taken === 'yes' && a.exercise.endBand) {
    const [from, to] = LEGACY_EXERCISE_BANDS[a.exercise.endBand];
    exercise = { endBand: a.exercise.endBand, hoursBeforeBed: bed == null ? null : [toHours(bed - eveningMinutes(to)), toHours(bed - eveningMinutes(from))] };
  }
  return { bedtime: bed == null ? null : Math.round(bed), caffeine, exercise };
}
export const LEGACY_BAND_LABELS = { before18: '下午 6 點以前', '18to20': '下午 6～8 點', '20to22': '晚上 8～10 點', after22: '晚上 10 點以後' };
// Rows given to the model and shown on the page: the reported time and the converted hours.
export const gapFacts = f => ({
  偏離日回報的咖啡因: f.caffeine.map(c => ({ 最後一杯: c.lastAt, 距離那幾晚平均上床: hoursText(c.hoursBeforeBed) })),
  偏離日回報的運動: f.exercise.map(e => ({ 結束: e.endAt || LEGACY_BAND_LABELS[e.endBand], 距離那幾晚平均上床: hoursText(e.hoursBeforeBed) }))
});
export const hoursText = h => h == null ? '無法換算' : Array.isArray(h) ? `約 ${h[0]}–${h[1]} 小時` : `約 ${h} 小時`;

// Factors answered in follow-up rounds opened during a period. They were asked only after
// late nights, so they describe those nights and are never a summary of the whole period.
export function weekFactors(surveys, start, end, records = []) {
  const rounds = surveys.filter(s => s.status === 'completed' && s.triggeredOn >= start && s.triggeredOn <= end);
  const counts = new Map();
  for (const s of rounds) for (const f of s.answers.factors) if (f !== 'none') counts.set(f, (counts.get(f) || 0) + 1);
  const gaps = rounds.map(s => roundGaps(s, records));
  return { rounds: rounds.length, factors: [...counts].map(([id, times]) => ({ id, label: FACTORS.find(([key]) => key === id)?.[1] || id, times })),
    caffeine: gaps.map(g => g.caffeine).filter(Boolean), exercise: gaps.map(g => g.exercise).filter(Boolean) };
}
