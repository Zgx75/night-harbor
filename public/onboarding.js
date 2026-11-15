// First-login questionnaire. Shared by the browser and the API so the server
// re-validates answers and recomputes every derived number instead of trusting the client.
export const ONBOARDING_VERSION = 1;

const time = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const minutes = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const nightMinutes = s => minutes(s) < 720 ? minutes(s) + 1440 : minutes(s);
export const clockOf = m => m == null ? '' : `${String(Math.floor((((Math.round(m) % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((Math.round(m) % 60) + 60) % 60).padStart(2, '0')}`;

export const FREQUENCY = [['never', '從不'], ['sometimes', '有時'], ['often', '經常'], ['always', '總是']];
export const TRAITS = [
  ['lightSleeper', '我是一個淺眠的人，容易被聲音或光線吵醒'],
  ['wakeBeforeAlarm', '我通常在鬧鐘響起前就自然醒來，而且早晨精神很好'],
  ['racingThoughts', '夜晚常因為思緒停不下來而難以入睡'],
  ['eveningFocus', '我在晚上做事的效率，比白天更好']
];
export const WELLBEING = [
  ['copeStress', '大部分時間，我覺得能夠處理生活中的各種壓力'],
  ['restedOnWaking', '大部分時間，我睡醒後覺得精神很好、有休息夠'],
  ['selfCareTime', '大部分時間，我覺得有足夠的時間照顧自己']
];
export const CAFFEINE = [['none', '幾乎不喝'], ['before12', '12:00 前'], ['12to15', '12:00–15:00'], ['15to18', '15:00–18:00'], ['after18', '18:00 之後']];
export const ALCOHOL = [['never', '從不'], ['weekly1to2', '每週 1–2 次'], ['weekly3plus', '每週 3 次以上'], ['daily', '幾乎天天']];
export const EXERCISE_TIME = [['none', '目前沒有固定運動'], ['morning', '早晨'], ['afternoon', '下午'], ['evening', '晚上']];
export const INTENSITY = [['light', '輕度 · 散步、伸展'], ['moderate', '中等 · 呼吸變快'], ['vigorous', '較高 · 劇烈運動或重訓']];
export const LATE_REASONS = [
  ['revenge', '白天沒有自己的時間，晚上想多留一點'],
  ['study', '作業、報告或考試'],
  ['social', '滑社群或聊天'],
  ['media', '追劇、影片或遊戲'],
  ['work', '打工或其他工作'],
  ['thoughts', '思緒停不下來'],
  ['environment', '室友、噪音或環境干擾'],
  ['other', '其他原因']
];
export const CHRONOTYPES = { early: '偏早型', intermediate: '中間型', late: '偏晚型', unknown: '資料不足' };
// Product-defined cut-offs on the sleep-corrected free-day mid-sleep (MSFsc). MCTQ itself
// reports a continuous value; these labels are only an easy-to-read description.
export const CHRONOTYPE_CUTOFFS = { early: nightMinutes('03:30'), late: nightMinutes('05:30') };

function invalid(message) { throw Object.assign(new Error(message), { code: 'ONBOARDING' }); }
const pick = (value, options, message) => { if (!options.some(([id]) => id === value)) invalid(message); return value; };
function integer(value, min, max, message) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n) || n < min || n > max) invalid(message);
  return n;
}
function sleepWindow(value, label) {
  if (!value || typeof value !== 'object') invalid(`請填寫${label}的作息時間。`);
  const { bedAt, sleepAt, wakeAt } = value;
  if (!time(bedAt) || !time(sleepAt) || !time(wakeAt)) invalid(`請填寫${label}的上床、入睡與起床時間。`);
  if (nightMinutes(bedAt) < 1080 || nightMinutes(bedAt) > 1800) invalid(`${label}的上床時間請填晚間 18:00 到隔天 06:00。`);
  if (nightMinutes(sleepAt) < nightMinutes(bedAt)) invalid(`${label}的入睡時間不應早於上床時間。`);
  const duration = (minutes(wakeAt) - minutes(sleepAt) + 1440) % 1440;
  if (duration < 120 || duration > 960) invalid(`${label}的入睡到起床需介於 2 到 16 小時，請檢查時間。`);
  return { bedAt, sleepAt, wakeAt };
}

function cleanSchedule(a) {
  const workDays = integer(a.workDays, 0, 7, '每週上課或上班天數請填 0 到 7。');
  const out = { workDays };
  out.work = workDays > 0 ? sleepWindow(a.work, '上課日') : null;
  if (workDays < 7) {
    out.free = sleepWindow(a.free, '非上課日');
    if (typeof a.free.alarm !== 'boolean') invalid('請選擇非上課日是否使用鬧鐘。');
    out.free.alarm = a.free.alarm;
  } else out.free = null;
  return out;
}
function cleanFeelings(a) {
  const out = {};
  for (const [key] of [...TRAITS, ...WELLBEING]) out[key] = pick(a[key], FREQUENCY, '請回答每一題感受題。');
  return out;
}
function cleanHabits(a) {
  const out = {};
  out.caffeine = pick(a.caffeine, CAFFEINE, '請選擇最後一杯含咖啡因飲品的時段。');
  out.alcohol = pick(a.alcohol, ALCOHOL, '請選擇飲酒頻率。');
  out.alcoholBeforeBed = out.alcohol === 'never' ? 'never' : pick(a.alcoholBeforeBed, FREQUENCY, '請選擇睡前三小時內飲酒的頻率。');
  out.exerciseTime = pick(a.exerciseTime, EXERCISE_TIME, '請選擇通常運動的時段。');
  if (out.exerciseTime === 'none') { out.exerciseDays = 0; out.exerciseIntensity = ''; }
  else {
    out.exerciseDays = integer(a.exerciseDays, 1, 7, '每週運動天數請填 1 到 7。');
    out.exerciseIntensity = pick(a.exerciseIntensity, INTENSITY, '請選擇運動強度。');
  }
  return out;
}
function cleanGoal(a) {
  const reasons = Array.isArray(a.lateReasons) ? [...new Set(a.lateReasons)] : [];
  if (!reasons.length || reasons.length > 3) invalid('晚睡原因請選 1 到 3 項。');
  if (!time(a.targetBedtime) || nightMinutes(a.targetBedtime) < 1080 || nightMinutes(a.targetBedtime) > 1800) invalid('目標上床時間請填晚間 18:00 到隔天 06:00。');
  return { lateReasons: reasons.map(r => pick(r, LATE_REASONS, '晚睡原因選項有誤。')), targetBedtime: a.targetBedtime };
}
// One cleaner per questionnaire step, so the form can check a step before moving on.
export const STEP_CLEANERS = [cleanSchedule, cleanFeelings, cleanHabits, cleanGoal];
export function validateStep(step, answers) { return STEP_CLEANERS[step](answers || {}); }
export function cleanAnswers(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) invalid('問卷內容格式有誤。');
  return Object.assign({}, ...STEP_CLEANERS.map(clean => clean(a)));
}

// MCTQ-style calculation (Roenneberg et al., 2003). All clock values are cross-midnight minutes.
function windowStats(w) {
  if (!w) return null;
  const onset = nightMinutes(w.sleepAt);
  const duration = (minutes(w.wakeAt) - minutes(w.sleepAt) + 1440) % 1440;
  return { onset, duration, midSleep: onset + duration / 2 };
}
export function deriveSleep(answers) {
  const work = windowStats(answers.work), free = windowStats(answers.free);
  const workDays = answers.workDays, freeDays = 7 - workDays;
  const weeklyDuration = ((work?.duration || 0) * workDays + (free?.duration || 0) * freeDays) / 7;
  let msfsc = null;
  if (free) msfsc = work && free.duration > work.duration ? free.midSleep - (free.duration - work.duration) / 2 : free.midSleep;
  const chronotype = msfsc == null ? 'unknown' : msfsc < CHRONOTYPE_CUTOFFS.early ? 'early' : msfsc >= CHRONOTYPE_CUTOFFS.late ? 'late' : 'intermediate';
  const round = n => n == null ? null : Math.round(n);
  return {
    workDuration: round(work?.duration ?? null), freeDuration: round(free?.duration ?? null), weeklyDuration: round(weeklyDuration),
    workMidSleep: round(work?.midSleep ?? null), freeMidSleep: round(free?.midSleep ?? null), msfsc: round(msfsc),
    socialJetlag: work && free ? round(Math.abs(free.midSleep - work.midSleep)) : null,
    // Alarm-driven free days do not show the natural timing MCTQ relies on.
    msfscReliable: msfsc != null && answers.free?.alarm === false,
    chronotype
  };
}

export function cleanOnboarding(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || value.version !== ONBOARDING_VERSION) invalid('初次問卷格式有誤。');
  if (value.status === 'skipped') {
    if (!Number.isFinite(Date.parse(value.skippedAt))) invalid('初次問卷格式有誤。');
    return { version: ONBOARDING_VERSION, status: 'skipped', skippedAt: value.skippedAt };
  }
  if (value.status !== 'completed' || !Number.isFinite(Date.parse(value.completedAt))) invalid('初次問卷格式有誤。');
  const answers = cleanAnswers(value.answers);
  return { version: ONBOARDING_VERSION, status: 'completed', completedAt: value.completedAt, answers, derived: deriveSleep(answers) };
}

const label = (options, id) => options.find(([key]) => key === id)?.[1] || '';
export const hours = m => m == null ? null : Math.round(m / 6) / 10;
// The compact, label-only summary given to the planning model. Raw answers stay in the account.
export function plannerSummary(onboarding) {
  if (onboarding?.status !== 'completed') return null;
  const { answers: a, derived: d } = onboarding;
  return {
    chronotype: CHRONOTYPES[d.chronotype], chronotypeReliable: d.msfscReliable,
    workDays: a.workDays, usualWorkdayBedtime: a.work?.bedAt || null, usualFreeDayBedtime: a.free?.bedAt || null,
    workdaySleepHours: hours(d.workDuration), freeDaySleepHours: hours(d.freeDuration), weeklyAverageSleepHours: hours(d.weeklyDuration),
    freeDayMidSleep: clockOf(d.freeMidSleep) || null, socialJetlagMinutes: d.socialJetlag,
    traits: Object.fromEntries(TRAITS.map(([k, q]) => [q, label(FREQUENCY, a[k])])),
    wellbeing: Object.fromEntries(WELLBEING.map(([k, q]) => [q, label(FREQUENCY, a[k])])),
    lastCaffeine: label(CAFFEINE, a.caffeine), alcohol: label(ALCOHOL, a.alcohol), alcoholWithin3hBeforeBed: label(FREQUENCY, a.alcoholBeforeBed),
    exercise: a.exerciseTime === 'none' ? '沒有固定運動' : `${label(EXERCISE_TIME, a.exerciseTime)}，每週 ${a.exerciseDays} 天，${label(INTENSITY, a.exerciseIntensity)}`,
    lateNightReasons: a.lateReasons.map(r => label(LATE_REASONS, r)),
    answeredAt: onboarding.completedAt
  };
}
