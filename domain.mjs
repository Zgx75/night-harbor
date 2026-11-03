import { cleanRecords as validateRecords } from './public/records.js';
import { AppError } from './ai.mjs';
export const isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export const minutes = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export const nightMinutes = s => minutes(s) < 720 ? minutes(s) + 1440 : minutes(s);
export const clock = n => `${String(Math.floor(((Math.round(n) % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((Math.round(n) % 60) + 60) % 60).padStart(2, '0')}`;
export const addDays = (s, n) => new Date(Date.parse(s) + n * 86400000).toISOString().slice(0, 10);
export function cleanRecords(input = []) {
  try { return validateRecords(input); }
  catch (error) {
    if (error.code === 'RECORDS') throw new AppError(400, 'RECORDS', error.message);
    throw error;
  }
}
export function makePlan({ records: input, currentBedtime, targetBedtime, wakeTime, asOf }) {
  const records = cleanRecords(input);
  if (!isDate(asOf) || !isTime(targetBedtime) || !isTime(wakeTime) || (currentBedtime && !isTime(currentBedtime))) throw new AppError(400, 'PLAN_INPUT', '請設定目前作息、目標就寢與起床時間。');
  for (const t of [targetBedtime, currentBedtime].filter(Boolean)) if (nightMinutes(t) < 1080 || nightMinutes(t) > 1800) throw new AppError(400, 'PLAN_RANGE', '此原型支援 18:00 到隔天 06:00 的就寢作息。');
  const candidates=records.filter(r=>r.date<=asOf&&r.date>=addDays(asOf,-14));
  const bedRecords=candidates.filter(r=>r.bedAt&&nightMinutes(r.bedAt)>=1080&&nightMinutes(r.bedAt)<=1800).slice(-7);
  const usingBed=bedRecords.length>=3;
  const recent = usingBed?bedRecords:candidates.filter(r=>r.sleepAt&&nightMinutes(r.sleepAt)>=1080&&nightMinutes(r.sleepAt)<=1800).slice(-7);
  if (recent.length < 3 && !currentBedtime) return { needsBaseline: true, points: [], message: '先填通常幾點睡，或累積至少三筆近期入睡紀錄，就能開始規劃。' };
  const measured = recent.length >= 3;
  const observed=r=>nightMinutes(usingBed?r.bedAt:r.sleepAt);
  const sorted = recent.map(observed).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const baseline = Math.round(measured ? median : nightMinutes(currentBedtime));
  const target = nightMinutes(targetBedtime);
  const latest = recent.slice(-2);
  const held = latest.some(r => r.fatigue >= 4 || r.insomnia==='yes') || (latest.length === 2 && observed(latest[1]) > observed(latest[0]) + 30);
  const reached = baseline <= target;
  const first = reached ? baseline : Math.max(target, baseline - (held ? 0 : 15));
  const targetOpportunity = (minutes(wakeTime) - minutes(targetBedtime) + 1440) % 1440;
  if (targetOpportunity < 420 || targetOpportunity > 900) return { blocked: true, points: [], message: '目標就寢與起床時間沒有留下合理的睡眠空間，請先檢查兩個時間。成人一般需要至少七小時，個人需求仍有差異。', source: 'https://www.cdc.gov/sleep/about/index.html' };
  const points = Array.from({ length: 14 }, (_, i) => {
    const m = reached ? baseline : Math.max(target, first - Math.floor(i / 2) * 15);
    return { date: addDays(asOf, i), bedtime: clock(m), bedtimeMinutes: m, windDown: clock(m - 30), dimLights: clock(m - 15), wakeTime, opportunityMinutes: (minutes(wakeTime) - m % 1440 + 1440) % 1440 };
  });
  return {
    baseline: clock(baseline), baselineMinutes: baseline, held, reached, recordCount: recent.length, points,
    baselineSource: measured ? `最近 ${recent.length} 筆${usingBed?'上床':'入睡'}時間的中位數` : '你自行填寫的通常就寢時間（暫定）',
    remainingMinutes: Math.max(0, first - target), shortOpportunity: points[0].opportunityMinutes < 420,
    message: reached ? '目前已達到目標，先維持穩定，不再提早。' : held ? '近期疲勞偏高或作息明顯延後，今晚先維持，後續日期為暫定安排。' : '今晚先提早 15 分鐘，後續暫以每兩晚提早 15 分鐘排程；新增紀錄後會重新計算。',
    note: '這是可調整的行為排程，不是經臨床驗證的最佳曲線，也不是失眠治療。圖表是暫定目標，不是已發生的改善。',
    source: 'https://www.cdc.gov/sleep/about/index.html'
  };
}
