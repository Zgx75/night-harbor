import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomy,petTransaction,awardNight,balance,assessNight,weeklyReport,dailyReport,demoProfile,addDays,factorClues,snapshotTargets } from '../public/progress.js';
import {cleanRecords} from '../domain.mjs';
import {makePlan} from '../domain.mjs';
import {reportData,reportQuestion} from '../reports.mjs';
const now=Date.parse('2026-10-15T12:00:00+08:00');
const targets={'2026-10-14':{bedtime:'00:30',createdAt:'2026-10-14T18:00:00+08:00'}};
const row={date:'2026-10-15',bedAt:'00:40',sleepAt:'02:00',insomnia:'yes',sleepQuality:2};
const adopt=()=>petTransaction(createEconomy(),{type:'adopt',id:'cat',name:'糯米'},now);
test('on-time going to bed earns coins even when falling asleep is difficult',()=>{
  const r=awardNight(adopt(),row,targets,now);assert.equal(r.awarded,20);assert.equal(balance(r.economy),20);assert.equal(r.economy.credits[0].night,'2026-10-14');
});
test('editing or deleting and re-saving the same night cannot mint additional coins',()=>{
  const a=awardNight(adopt(),row,targets,now),b=awardNight(a.economy,{...row,bedAt:'00:25'},targets,now);
  assert.equal(b.awarded,0);assert.equal(balance(b.economy),20);assert.equal(b.economy.credits.length,1);
});
test('missing, late-created, future and missed targets do not earn coins',()=>{
  assert.equal(awardNight(adopt(),row,{},now).awarded,0);
  assert.equal(awardNight(adopt(),{...row,bedAt:'01:00'},targets,now).awarded,0);
  const late={'2026-10-14':{bedtime:'00:30',createdAt:'2026-10-15T10:00:00+08:00'}};
  assert.equal(awardNight(adopt(),row,late,now).awarded,0);
  assert.equal(awardNight(adopt(),row,targets,Date.parse('2026-10-14T23:00:00+08:00')).awarded,0);
  assert.equal(assessNight({...row,bedAt:''},targets,now).status,'unknown');
});
test('fifteen-minute grace period handles targets spanning midnight',()=>{
  const t={'2026-10-14':{bedtime:'23:50',createdAt:'2026-10-14T18:00:00+08:00'}};
  assert.equal(assessNight({...row,bedAt:'00:05'},t,now).eligible,true);
  assert.equal(assessNight({...row,bedAt:'00:06'},t,now).eligible,false);
});
test('feeding and furniture spend actual balances, reject overspending and duplicate purchases',()=>{
  let e=awardNight(adopt(),row,targets,now).economy;
  assert.throws(()=>petTransaction(e,{type:'buy',id:'cushion'},now),/金幣還不夠/);
  e=petTransaction(e,{type:'feed'},now);assert.equal(balance(e),15);assert.equal(e.affection,60);
  const second={...row,date:'2026-10-14'};
  const ts={...targets,'2026-10-13':{bedtime:'01:00',createdAt:'2026-10-13T18:00:00+08:00'}};
  e=awardNight(e,second,ts,now).economy;assert.equal(balance(e),35);
  e=petTransaction(e,{type:'buy',id:'ball'},now);assert.equal(balance(e),5);assert.equal(e.equipped.toy,'ball');
  assert.throws(()=>petTransaction(e,{type:'buy',id:'ball'},now),/已經/);
  e=petTransaction(e,{type:'equip',id:'ball'},now);assert.equal(e.equipped.toy,undefined);assert.equal(balance(e),5);
  e=petTransaction(e,{type:'adopt',id:'rabbit',name:'換夥伴'},now);assert.equal(balance(e),5);assert.ok(e.inventory.includes('ball'));
});
test('new sleep fields validate, retain unknowns, and reject impossible time ordering',()=>{
  const r=cleanRecords([row])[0];assert.equal(r.sleepQuality,2);assert.equal(r.screenMinutes,null);assert.equal(r.napMinutes,null);
  for(const patch of [{sleepQuality:0},{screenMinutes:61},{napMinutes:-1},{insomnia:'diagnosed'},{bedAt:'02:30'}])assert.throws(()=>cleanRecords([{...row,...patch}]));
});
test('daily factors use preceding-day caffeine/exercise/nap, and never infer missing behavior',()=>{
  const records=cleanRecords([{date:'2026-10-14',caffeineAt:'19:00',exerciseAt:'23:50',exerciseIntensity:'vigorous',napMinutes:45},{...row,screenMinutes:30,mood:4,caffeineAt:'08:00'}]);
  const d=dailyReport(records,targets,'2026-10-15',null,now);
  assert.equal(d.factors.length,5);assert.ok(d.factors.find(f=>f.id==='caffeine').evidence.includes('19:00'));assert.equal(d.factors.find(f=>f.id==='exercise').flag,true);
  assert.equal(factorClues([row],row.date).find(f=>f.id==='nap').known,false);
});
test('weekly recap computes observed improvement, not zero-filled or fabricated trends',()=>{
  const demo=demoProfile('2026-10-15'),r=weeklyReport(demo.records,demo.targets,'2026-10-15',now);
  assert.equal(r.current.recordDays,7);assert.equal(r.previous.recordDays,7);assert.ok(r.changes.earlierBedtime>0);assert.ok(r.changes.quality>0);
  const sparse=weeklyReport([row],targets,'2026-10-15',now);assert.equal(sparse.current.quality,2);assert.equal(sparse.changes.quality,null);assert.equal(sparse.trend.filter(t=>t.quality===null).length,6);
  assert.equal(weeklyReport([],{},'2026-10-15',now).current.onTimeRate,null);
});
test('weekly averages handle 23:50 and 00:10 as nearby sleep times',()=>{
  const records=[{date:'2026-10-14',bedAt:'23:50'},{date:'2026-10-15',bedAt:'00:10'}];
  const r=weeklyReport(records,{},'2026-10-15',now);assert.equal(r.current.bedtime,1440);
});
test('report service validates snapshots and keeps model prompts within the API limit',()=>{
  const demo=demoProfile('2026-10-15');
  for(const mode of ['daily','weekly']){
    const report=reportData({...demo,mode,asOf:'2026-10-15'},now);assert.ok(reportQuestion(report,mode).length<=800);
  }
  assert.throws(()=>reportData({...demo,targets:{bad:{bedtime:'99:99'}},mode:'daily',asOf:'2026-10-15'},now));
});
test('planning prefers reported bedtimes and does not require knowing actual sleep onset',()=>{
  const records=['2026-10-12','2026-10-13','2026-10-14'].map(date=>({date,bedAt:'00:30',fatigue:2}));
  const p=makePlan({records,currentBedtime:'03:00',targetBedtime:'23:30',wakeTime:'08:30',asOf:'2026-10-15'});
  assert.equal(p.baseline,'00:30');assert.equal(p.points[0].bedtime,'00:15');assert.match(p.baselineSource,/上床/);
});
test('all future scheduled nights are saved, while a past target cannot be rewritten for rewards',()=>{
  const points=Array.from({length:14},(_,i)=>({date:addDays('2026-10-15',i),bedtime:'00:30'}));
  const t=snapshotTargets(targets,points,now);assert.equal(Object.keys(t).length,15);
  assert.equal(t['2026-10-14'].createdAt,targets['2026-10-14'].createdAt);
  const revised=snapshotTargets(t,[{date:'2026-10-14',bedtime:'04:00'}],now);
  assert.equal(revised['2026-10-14'].bedtime,'00:30');
});
