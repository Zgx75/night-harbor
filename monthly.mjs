// Monthly AI reply over 28 days. The program computes every number and decides whether there is
// enough data; the model writes a review and one next-stage step, which may be a small experiment.
import { AppError } from './ai.mjs';
import { cleanRecords, isDate } from './domain.mjs';
import { cleanTargets } from './reports.mjs';
import { monthlySummary, cleanMonthlyRecap } from './public/responses.js';
import { cleanSurveys, weekFactors, gapFacts } from './public/factor-survey.js';
import { formatClock } from './public/progress.js';

const round = (v, d = 0) => v == null ? null : Number(v.toFixed(d));
const percent = v => v == null ? null : Math.round(v * 100);

// Ready-made phrases, so the model copies them instead of computing or misreading signs.
function compareWith(last, m) {
  const phrase = (v, more, less, unit, same) => v == null ? null : v === 0 ? same : v > 0 ? `${more} ${v} ${unit}` : `${less} ${-v} ${unit}`;
  const late = last.snapshot.late - m.late;
  const rate = m.onTimeRate == null || last.snapshot.onTimeRate == null ? null : percent(m.onTimeRate) - percent(last.snapshot.onTimeRate);
  const bed = m.bedtime == null || last.snapshot.bedtime == null ? null : Math.round(last.snapshot.bedtime - m.bedtime);
  return { 偏離晚數: phrase(late, '少了', '多了', '晚', '一樣'), 達標率: phrase(rate, '增加', '減少', '個百分點', '持平'), 平均上床時間: phrase(bed, '提早', '延後', '分鐘', '差不多') };
}

export function monthlyFacts(data, now = Date.now()) {
  if (!isDate(data.asOf)) throw new AppError(400, 'REPORT_INPUT', '請提供回顧日期。');
  const records = cleanRecords(data.records).filter(r => r.date <= data.asOf), targets = cleanTargets(data.targets);
  let surveys, previous;
  try { surveys = cleanSurveys(data.factorSurveys ?? []); previous = cleanMonthlyRecap(data.previousRecap ?? null); }
  catch (error) { if (['FACTOR_SURVEY', 'MONTHLY_RECAP'].includes(error.code)) throw new AppError(400, 'REPORT_INPUT', error.message); throw error; }
  const m = monthlySummary(records, targets, data.asOf, now);
  if (!m.complete) throw new AppError(400, 'REPORT_DATA', `每月回顧需要最近二十八天至少 ${m.minDays} 天有上床紀錄。目前資料還不夠，我們會繼續觀察你的作息。`);
  const f = weekFactors(surveys, m.start, m.end, records);
  // Only a reply from an earlier, separate period is compared; the user may or may not have tried it.
  const last = previous && previous.end < m.start ? previous : null;
  return {
    mode: 'monthlyReply', start: m.start, end: m.end,
    有上床紀錄天數: m.validDays, 達標晚數: m.onTime, 偏離晚數: m.late, 達標率百分比: percent(m.onTimeRate),
    平均上床: formatClock(m.bedtime), 每週平均上床: m.weeks.map((w, i) => ({ 週次: i + 1, 期間: `${w.start}~${w.end}`, 紀錄天數: w.validDays, 平均上床: w.bedtime == null ? null : formatClock(w.bedtime) })),
    本期內第一週到第四週提早分鐘: round(m.earlierBedtime), 上床時間起伏分鐘: round(m.bedtimeSpread), 平均睡眠品質: round(m.quality, 1),
    偏離日追問次數: f.rounds, 偏離日曾回報的因素: f.factors.map(x => ({ 因素: x.label, 次數: x.times })), ...gapFacts(f),
    上一期: last ? { 期間: `${last.start}~${last.end}`, 偏離晚數: last.snapshot.late, 達標率百分比: percent(last.snapshot.onTimeRate), 平均上床: last.snapshot.bedtime == null ? null : formatClock(last.snapshot.bedtime), 當時建議: last.suggestion ? `${last.suggestion.title}：${last.suggestion.detail}` : null } : null,
    // Differences are computed here so the model copies them instead of mixing up numbers.
    和上一期相比: last ? compareWith(last, m) : null,
    說明: '偏離指比當晚事先保存的目標晚超過 15 分鐘。生活因素只在偏離後詢問，是偏離日曾回報的因素，不代表整個月或晚睡的原因。距離上床的小時數，是用回報的時間對照那幾個偏離日的平均上床時間換算，只描述那幾晚，不代表一般情況。系統不知道使用者是否照上一期建議做，只能比較兩期的數字。null 表示資料不足。'
  };
}

export const monthSnapshot = (data, now = Date.now()) => {
  const m = monthlySummary(cleanRecords(data.records).filter(r => r.date <= data.asOf), cleanTargets(data.targets), data.asOf, now);
  return { late: m.late, onTimeRate: m.onTimeRate, bedtime: m.bedtime == null ? null : Math.round(m.bedtime) };
};

export function monthlyQuestion(facts) {
  const factorWords = facts.偏離日曾回報的因素.map(x => x.因素).join('、');
  return `請寫這二十八天（${facts.start} 到 ${facts.end}）的作息月回顧。只根據系統提供的事實：達標率、偏離晚數、每週平均上床的變化、上床時間起伏、睡眠品質${factorWords ? `，以及偏離日曾回報的因素（${factorWords}）` : ''}${facts.上一期 ? '，並對照上一期的數字與當時的建議' : ''}。回顧要簡短，最多四句，不要逐週列出數字。先溫和地描述最重要的變化，再給下一階段一項漸進、做得到的調整；若偏離日多次提到同一個因素，可以提議下個月做一個寫出具體時間的小實驗，之後再比較。不責備，不另訂就寢時間，不把因素說成晚睡或失眠的原因。作息、咖啡因與睡眠相關內容需引用來源。`;
}
