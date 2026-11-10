import { assessNight, addDays, nightMinute, nightInstant } from './public/progress.js';

export const MILESTONES = [{ days:3, amount:15, badge:'三晚小星星' }, { days:7, amount:40, badge:'七晚月亮' }, { days:21, amount:150, badge:'二十一晚星河' }];
export const taipeiDate = now => new Date(now + 8*3600000).toISOString().slice(0,10);
export const socialNight = now => taipeiDate(now - 6*3600000);
const average = rows => rows.length ? rows.reduce((sum,r)=>sum+nightMinute(r.bedAt),0)/rows.length : null;
export function validBedtime(row, now) {
  return row && row.date<=taipeiDate(now) && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.bedAt || '') && nightMinute(row.bedAt)>=1080 && nightMinute(row.bedAt)<=1800 && nightInstant(addDays(row.date,-1),nightMinute(row.bedAt))<=now;
}
export function rewardFacts(profile, now) {
  const rows=(profile.records||[]).filter(r=>validBedtime(r,now)).sort((a,b)=>a.date.localeCompare(b.date));
  return rows.map(row=>{
    const assessment=assessNight(row,profile.targets,now);
    const prior=rows.filter(r=>r.date>=addDays(row.date,-7)&&r.date<row.date);
    const improvement=prior.length>=3?Math.round(average(prior)-nightMinute(row.bedAt)):null;
    return {date:row.date, night:addDays(row.date,-1), onTime:assessment.eligible, improvement,
      type:assessment.eligible?'on-time':assessment.status==='late'&&improvement>=15?'improvement':null,
      amount:assessment.eligible?20:assessment.status==='late'&&improvement>=15?10:0,
      bedAt:row.bedAt,target:assessment.target||null};
  });
}
export function rewardSummary(profile, now) {
  const facts=rewardFacts(profile,now), today=taipeiDate(now), dates=new Set(facts.filter(f=>f.onTime).map(f=>f.date));
  let longest=0,run=0,previous='';
  for(const date of [...dates].sort()){run=previous===addDays(date,-1)?run+1:1;longest=Math.max(longest,run);previous=date;}
  let current=0, day=dates.has(today)?today:facts.some(f=>f.date===today)?null:addDays(today,-1);
  while(day&&dates.has(day)){current++;day=addDays(day,-1);}
  const rows=(profile.records||[]).filter(r=>validBedtime(r,now));
  const currentRows=rows.filter(r=>r.date>=addDays(today,-6)&&r.date<=today);
  const previousRows=rows.filter(r=>r.date>=addDays(today,-13)&&r.date<=addDays(today,-7));
  return {currentStreak:current,longestStreak:longest,onTime: facts.filter(f=>f.onTime&&f.date>=addDays(today,-6)&&f.date<=today).length,
    recordDays:currentRows.length,improvement:currentRows.length>=3&&previousRows.length>=3?Math.round(average(previousRows)-average(currentRows)):null};
}
