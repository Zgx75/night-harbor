import {nightInstant,nightMinute,formatClock} from './progress.js';
export function targetPlan(target,date,wakeTime) {
  const m=nightMinute(target.bedtime);
  return {source:target.source||'legacy',locked:true,message:target.reason||'這晚原先保存的目標已到，先保留這份約定，明晚再由 AI 分析。',points:[{date,bedtime:target.bedtime,bedtimeMinutes:m,windDown:formatClock(m-30),dimLights:formatClock(m-15),wakeTime}],sources:[]};
}
export function planInputKey(settings,records,date) {
  return JSON.stringify([date,settings.currentBedtime,settings.targetBedtime,settings.wakeTime,[...records].sort((a,b)=>a.date.localeCompare(b.date))]);
}
export function cachedPlan(cache,key,date) {
  return cache?.key===key&&cache.plan?.source==='gemini'&&cache.plan.points?.length===1&&cache.plan.points[0].date===date?cache.plan:null;
}
export function lockedTarget(target,date,now=Date.now()) {
  return Boolean(target&&/^([01]\d|2[0-3]):[0-5]\d$/.test(target.bedtime)&&now>=nightInstant(date,nightMinute(target.bedtime)));
}
