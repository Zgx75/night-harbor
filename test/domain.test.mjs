import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlan, cleanRecords, nightMinutes, clock } from '../domain.mjs';
import { retrieve, knowledge } from '../knowledge.mjs';
const setup = { records:[], currentBedtime:'03:00', targetBedtime:'00:30', wakeTime:'08:30', asOf:'2026-10-15' };

test('cross-midnight times are adjacent, not twelve hours apart',()=>{
  assert.equal(nightMinutes('00:10')-nightMinutes('23:50'),20);
  assert.equal(clock(1455),'00:15'); assert.equal(clock(-15),'23:45');
  const records=[['2026-10-12','23:50'],['2026-10-13','00:10'],['2026-10-14','00:00']].map(([date,sleepAt])=>({date,sleepAt}));
  const p=makePlan({...setup,records,targetBedtime:'23:00',wakeTime:'07:00'});
  assert.equal(p.baseline,'00:00');assert.equal(p.points[0].bedtime,'23:45');assert.equal(p.points[0].windDown,'23:15');
});
test('no fabricated baseline when observations and self-report are absent',()=>{
  const p=makePlan({...setup,currentBedtime:''});assert.equal(p.needsBaseline,true);assert.deepEqual(p.points,[]);
});
test('gradual plan progresses every two nights and clamps to target',()=>{
  const p=makePlan(setup);assert.equal(p.points[0].bedtime,'02:45');assert.equal(p.points[1].bedtime,'02:45');assert.equal(p.points[2].bedtime,'02:30');
  assert.equal(p.points[0].dimLights,'02:30');assert.equal(p.points.length,14);assert.equal(p.shortOpportunity,true);
  assert.ok(p.points.every(r=>r.bedtimeMinutes>=nightMinutes('00:30')));
});
test('high fatigue holds tonight; new observations change the resulting plan',()=>{
  const records=[['2026-10-12','03:00',2],['2026-10-13','03:10',3],['2026-10-14','03:00',5]].map(([date,sleepAt,fatigue])=>({date,sleepAt,fatigue}));
  const held=makePlan({...setup,records});assert.equal(held.held,true);assert.equal(held.points[0].bedtime,'03:00');
  records[2].fatigue=2;assert.equal(makePlan({...setup,records}).points[0].bedtime,'02:45');
});
test('recent achieved target is maintained instead of forcing a later bedtime',()=>{
  const p=makePlan({...setup,currentBedtime:'00:00'});assert.equal(p.reached,true);assert.ok(p.points.every(r=>r.bedtime==='00:00'));
});
test('invalid dates, duplicate days, time and fatigue are rejected',()=>{
  for(const row of [{date:'2026-02-30'},{date:'2026-10-15',sleepAt:'25:00'},{date:'2026-10-15',fatigue:6}]) assert.throws(()=>cleanRecords([row]));
  assert.throws(()=>cleanRecords([{date:'2026-10-15'},{date:'2026-10-15'}]));
});
test('old and future records are not treated as current baseline',()=>{
  const p=makePlan({...setup,records:[{date:'2026-09-01',sleepAt:'23:00'},{date:'2026-12-01',sleepAt:'01:00'}]});assert.equal(p.baseline,'03:00');assert.equal(p.recordCount,0);
});
test('unreasonable target sleep opportunity is blocked',()=>{
  const p=makePlan({...setup,targetBedtime:'02:00',wakeTime:'07:00'});assert.equal(p.blocked,true);assert.equal(p.points.length,0);
});
test('actual retrieval selects topic-specific evidence; unrelated topics get none',()=>{
  assert.equal(retrieve('下午喝咖啡因會影響睡眠嗎')[0].id,'K1');
  assert.ok(retrieve('重訓運動後如何安排').some(r=>r.id==='K3'));
  assert.equal(retrieve('褪黑激素營養品')[0].id,'K6');
  assert.deepEqual(retrieve('quantum algorithm qubits'),[]);
  assert.equal(new Set(knowledge.map(s=>s.id)).size,knowledge.length);
  assert.ok(knowledge.every(s=>s.url.startsWith('https://')));
});
