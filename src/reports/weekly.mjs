// Weekly AI reply. The program computes every number and decides whether there is enough data;
// the model only turns these facts into a short review and one small step for next week.
import { AppError } from '../ai/ai.mjs';
import { cleanRecords, isDate } from '../domain.mjs';
import { cleanTargets } from './reports.mjs';
import { weeklySummary } from '../../public/responses.js';
import { cleanSurveys, weekFactors, gapFacts } from '../../public/factor-survey.js';
import { formatClock } from '../../public/progress.js';

const round = (v, d = 0) => v == null ? null : Number(v.toFixed(d));

export function weeklyFacts(data, now = Date.now()) {
  if (!isDate(data.asOf)) throw new AppError(400, 'REPORT_INPUT', '請提供回顧日期。');
  const records = cleanRecords(data.records).filter(r => r.date <= data.asOf), targets = cleanTargets(data.targets);
  let surveys;
  try { surveys = cleanSurveys(data.factorSurveys ?? []); }
  catch (error) { if (error.code === 'FACTOR_SURVEY') throw new AppError(400, 'REPORT_INPUT', error.message); throw error; }
  const w = weeklySummary(records, targets, data.asOf, now);
  if (!w.complete) throw new AppError(400, 'REPORT_DATA', `每週回顧需要最近七天至少 ${w.minDays} 天有上床紀錄。目前資料還不夠，我們會繼續觀察你的作息。`);
  const f = weekFactors(surveys, w.start, w.end, records);
  return {
    mode: 'weeklyReply', start: w.start, end: w.end,
    有上床紀錄天數: w.validDays, 達標晚數: w.onTime, 偏離晚數: w.late, 可核對晚數: w.comparable,
    平均上床: formatClock(w.bedtime), 上週平均上床: w.previous.validDays >= 3 ? formatClock(w.previous.bedtime) : null,
    比上週提早分鐘: round(w.changes.earlierBedtime), 上床時間起伏分鐘: round(w.bedtimeSpread),
    平均睡眠品質: round(w.quality, 1), 睡眠品質變化: round(w.changes.quality, 1),
    偏離日追問次數: f.rounds, 偏離日曾回報的因素: f.factors.map(x => ({ 因素: x.label, 次數: x.times })), ...gapFacts(f),
    說明: '偏離指比當晚事先保存的目標晚超過 15 分鐘。生活因素只在偏離後詢問，只代表那幾天曾出現，不代表整週或晚睡的原因。距離上床的小時數，是用回報的時間對照那幾個偏離日的平均上床時間換算，只描述那幾晚，不代表一般情況。null 表示資料不足。'
  };
}

export function weeklyQuestion(facts) {
  const factorWords = facts.偏離日曾回報的因素.map(x => x.因素).join('、');
  return `請寫這一週（${facts.start} 到 ${facts.end}）的作息回顧。只根據系統提供的本週事實：達標與偏離晚數、平均上床時間、與上週比較、上床時間起伏、睡眠品質${factorWords ? `，以及偏離日曾回報的因素（${factorWords}）` : ''}。先溫和地回顧做到的部分，再提一項下週做得到的小調整，例如把開始收心提早 15 分鐘；不要一次改變太多，不另訂就寢時間，不責備，也不把因素說成晚睡或失眠的原因。作息與睡眠相關內容需引用來源。`;
}
