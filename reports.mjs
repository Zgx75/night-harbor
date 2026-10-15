import { AppError } from './ai.mjs';
import { cleanRecords, isDate, isTime, nightMinutes, clock } from './domain.mjs';
import { dailyReport, weeklyReport } from './public/progress.js';
export function cleanTargets(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>90)throw new AppError(400,'TARGETS','睡前目標資料有誤。');
  const output={};
  for(const [date,t] of Object.entries(input)){
    if(!isDate(date)||!t||!isTime(t.bedtime)||!Number.isFinite(Date.parse(t.createdAt)))throw new AppError(400,'TARGETS','睡前目標格式有誤。');
    if(nightMinutes(t.bedtime)<1080||nightMinutes(t.bedtime)>1800)throw new AppError(400,'TARGETS','目標上床時間超出支援範圍。');
    output[date]={bedtime:t.bedtime,createdAt:t.createdAt,source:t.source==='gemini'?'gemini':'legacy',reason:typeof t.reason==='string'?t.reason.slice(0,900):''};
  }
  return output;
}
export function reportData(data,now=Date.now()) {
  if(!isDate(data.asOf)||!['daily','weekly'].includes(data.mode))throw new AppError(400,'REPORT_INPUT','請選擇每日或每週回報日期。');
  const records=cleanRecords(data.records).filter(r=>r.date<=data.asOf),targets=cleanTargets(data.targets);
  // Reports must use the saved nightly agreement, never silently recompute a different bedtime.
  const night=isDate(data.planNight)?data.planNight:data.asOf,t=targets[night];
  const m=t?nightMinutes(t.bedtime):null;
  const plan=t?{points:[{date:night,bedtime:t.bedtime,windDown:clock(m-30),dimLights:clock(m-15),wakeTime:isTime(data.settings?.wakeTime)?data.settings.wakeTime:''}]}:null;
  return data.mode==='daily'?dailyReport(records,targets,data.asOf,plan,now):weeklyReport(records,targets,data.asOf,now);
}
export function reportQuestion(report,mode) {
  if(mode==='daily')return `請提供今天的睡眠回報，溫和地回顧而不責備。日期${report.date}，昨晚上床回報${report.record?.bedAt||'未知'}，原定目標${report.adherence.target||'未知'}，是否依約${report.adherence.label}，自述難入睡或夜醒${report.insomnia}，睡眠評分${report.quality??'未知'}/5。五項線索：${report.factors.map(f=>`${f.title}：${f.evidence}`).join('；')}。今晚已保存目標${report.tonight?.bedtime||'尚未設定'}，開始收心${report.tonight?.windDown||'尚未設定'}。根據紀錄與來源給最多三項今天可試的調整，不把線索說成失眠原因，不懲罰已上床但睡不著的人，不另創就寢時間。`;
  const summary=s=>({記錄天數:s.recordDays,平均上床:s.bedtime,睡眠評分:s.quality,按時上床晚數:s.onTime,可比較晚數:s.comparableDays,自述難入睡或夜醒:s.insomniaDays,有填症狀晚數:s.insomniaKnown});
  return `請提供睡眠每週 recap。最近七天${JSON.stringify(summary(report.current))}；前七天${JSON.stringify(summary(report.previous))}。變化${JSON.stringify(reportFacts(report,'weekly').changes)}，null 表示資料不足，不能宣稱進步或退步。earlierBedtimeMinutes是提早分鐘；onTimePercentagePoints是提升百分點。上床平均時間以跨午夜分鐘表示，1440為00:00。先講有資料支持的變化，再給下週兩個可嘗試的行動；不把同時出現的因素當作失眠原因，也不以缺填代表失敗。睡眠相關內容需有來源。`;
}
export function reportFacts(report,mode) {
  if(mode==='daily')return {mode,date:report.date,adherence:report.adherence,insomnia:report.insomnia,quality:report.quality,tonight:report.tonight,factors:report.factors.map(f=>({title:f.title,evidence:f.evidence,known:f.known,flag:f.flag}))};
  const {rows:currentRows,...current}=report.current,{rows:previousRows,...previous}=report.previous;
  const rounded=(x,digits=1)=>x==null?null:Number(x.toFixed(digits));
  return {mode,current,previous,changes:{earlierBedtimeMinutes:rounded(report.changes.earlierBedtime,0),qualityPoints:rounded(report.changes.quality),lessFatiguePoints:rounded(report.changes.lessFatigue),onTimePercentagePoints:rounded(report.changes.onTimeRate==null?null:report.changes.onTimeRate*100)}};
}
