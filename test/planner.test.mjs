import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePlan,validatePlanReply,createPlanGenerator,holdSignals} from '../src/ai/planner.mjs';
import {planInputKey,cachedPlan,lockedTarget} from '../public/plan-state.js';
import {snapshotTargets,assessNight} from '../public/progress.js';
import {nightMinutes} from '../src/domain.mjs';
const now=Date.parse('2026-10-15T12:00:00+08:00');
const input={records:[],currentBedtime:'03:00',targetBedtime:'23:00',wakeTime:'08:00',asOf:'2026-10-15',targets:{}};
const reply=(bedtime='02:40')=>({bedtime,reason:`目前自填通常03:00上床，最終希望23:00；先暫定今晚${bedtime}，之後依紀錄調整。`,observations:['還沒有近期睡眠紀錄。'],nextStep:'先在睡前安排安靜活動。',sourceIds:['K2']});
const response=value=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]}),{status:200});
test('model chooses tonight time instead of a fixed fifteen-minute formula',async()=>{
  let sent;
  const generate=createPlanGenerator({apiKey:'test',now:()=>now,fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return response(reply());}});
  const p=await generate(input);
  assert.equal(p.source,'gemini');assert.equal(p.points.length,1);assert.equal(p.points[0].bedtime,'02:40');assert.equal(p.points[0].windDown,'02:10');assert.equal(p.finalGoal,'23:00');
  assert.match(sent.systemInstruction.parts[0].text,/不能第一晚直接跳到最終目標/);assert.ok(JSON.parse(sent.contents[0].parts[0].text).adherence);
});
test('new daily factors and adherence reach the model, which may hold tonight',async()=>{
  let sent;
  const generate=createPlanGenerator({apiKey:'test',now:()=>now,fetchImpl:async(_u,o)=>{sent=JSON.parse(JSON.parse(o.body).contents[0].parts[0].text);return response(reply('03:00'));}});
  const records=[{date:'2026-10-15',bedAt:'03:00',sleepAt:'03:45',insomnia:'yes',fatigue:5,mood:4,screenMinutes:50,caffeineAt:'17:00',napMinutes:40}];
  const p=await generate({...input,records});assert.equal(p.held,true);assert.equal(sent.records[0].insomnia,'yes');assert.equal(sent.records[0].caffeineAt,'17:00');assert.equal(sent.records[0].napMinutes,40);
});
test('invalid large jumps, fabricated sources and malformed replies are rejected',()=>{
  const ctx=preparePlan(input,now);
  for(const patch of [{bedtime:'23:00'},{bedtime:'03:15'},{bedtime:'02:29'},{sourceIds:['FAKE']},{reason:''},{observations:['x'.repeat(401)]}])assert.throws(()=>validatePlanReply({...reply(),...patch},ctx,now));
  assert.equal(validatePlanReply(reply('02:30'),ctx,now).points[0].bedtime,'02:30');
});
test('cross-midnight bounds and achieved goals are kept stable',()=>{
  const ctx=preparePlan({...input,currentBedtime:'00:10'},now);
  assert.equal(validatePlanReply(reply('23:50'),ctx,now).points[0].bedtimeMinutes,1430);
  const reached=preparePlan({...input,currentBedtime:'22:30'},now);
  assert.equal(validatePlanReply(reply('22:30'),reached,now).reached,true);
  assert.throws(()=>validatePlanReply(reply('22:45'),reached,now));
});
test('missing setup does not invent a baseline and provider failures never become rule-based plans',async()=>{
  let calls=0;const generate=createPlanGenerator({apiKey:'test',now:()=>now,fetchImpl:async()=>{calls++;throw new Error('offline');}});
  assert.equal((await generate({...input,currentBedtime:''})).needsBaseline,true);assert.equal(calls,0);
  await assert.rejects(generate(input),e=>e.code==='AI_TIMEOUT');
  await assert.rejects(createPlanGenerator({apiKey:'',now:()=>now})(input),e=>e.code==='AI_NOT_CONFIGURED');
});
test('saved nightly agreement survives deadline and is the same target used by reports and coins',async()=>{
  const p=validatePlanReply(reply(),preparePlan(input,now),now);
  const targets=snapshotTargets({},p.points.map(x=>({...x,source:p.source,reason:p.message})),now);
  const after=Date.parse('2026-10-16T08:00:00+08:00');
  const record={date:'2026-10-16',bedAt:'02:50',sleepAt:'04:00',insomnia:'yes'};
  assert.equal(assessNight(record,targets,after).eligible,true);
  const generate=createPlanGenerator({apiKey:'test',now:()=>after,fetchImpl:async()=>{throw new Error('Must not run');}});
  const frozen=await generate({...input,targets});assert.equal(frozen.locked,true);assert.equal(frozen.points[0].bedtime,'02:40');
});
test('AI cannot create a new bedtime that already passed tonight',()=>{
  const late=Date.parse('2026-10-16T02:50:00+08:00'),ctx=preparePlan(input,late);
  assert.throws(()=>validatePlanReply(reply('02:40'),ctx,late),e=>e.code==='PLAN_PAST');
});
test('cache changes on daily data, final goal or new night; saved plan is stable on reload',()=>{
  const key=planInputKey(input,[],input.asOf),p=validatePlanReply(reply(),preparePlan(input,now),now),cache={key,plan:p};
  assert.equal(cachedPlan(cache,key,input.asOf),p);
  assert.equal(cachedPlan(cache,planInputKey(input,[{date:input.asOf,fatigue:4}],input.asOf),input.asOf),null);
  assert.notEqual(planInputKey({...input,targetBedtime:'23:30'},[],input.asOf),key);
  assert.equal(cachedPlan(cache,key,'2026-10-16'),null);
  assert.equal(lockedTarget({bedtime:'02:40'},input.asOf,Date.parse('2026-10-16T02:40:00+08:00')),true);
});

test('hold signals list only recorded reasons, and with none the model is told to move earlier',async()=>{
  const day=(date,bedAt,extra={})=>({date,bedAt,sleepQuality:4,...extra});
  const steady=[day('2026-10-12','02:30'),day('2026-10-13','02:20'),day('2026-10-14','02:40'),day('2026-10-15','02:30')];
  assert.deepEqual(preparePlan({...input,currentBedtime:'02:30',targetBedtime:'00:30',records:steady},now).holdSignals,[]);
  const rough=[day('2026-10-13','02:30'),day('2026-10-14','02:20',{sleepQuality:2}),day('2026-10-15','03:20',{fatigue:5})];
  const signals=holdSignals(rough,[],nightMinutes('02:30'));
  assert.equal(signals.length,3);assert.match(signals[0],/03:20.*晚 50 分鐘/);assert.match(signals[1],/1 晚睡眠品質/);assert.match(signals[2],/疲勞/);
  const late=holdSignals([day('2026-10-15','01:10')],[{date:'2026-10-15',status:'late'}],nightMinutes('01:00'));
  assert.match(late[0],/1 晚比當晚目標晚超過 15 分鐘/);
  // Already at the final goal: nothing to hold against.
  const atGoal=['2026-10-13','2026-10-14','2026-10-15'].map(d=>day(d,'23:00',{sleepQuality:2}));
  assert.deepEqual(preparePlan({...input,currentBedtime:'23:00',targetBedtime:'23:30',records:atGoal},now).holdSignals,[]);
  let sent,system;
  const generate=createPlanGenerator({apiKey:'test',now:()=>now,fetchImpl:async(_u,o)=>{const b=JSON.parse(o.body);system=b.systemInstruction.parts[0].text;sent=JSON.parse(b.contents[0].parts[0].text);return response(reply('02:10'));}});
  await generate({...input,currentBedtime:'02:30',targetBedtime:'00:30',records:steady});
  assert.deepEqual(sent.holdSignals,[]);assert.match(system,/holdSignals 是空陣列時，今晚必須比參考起點提早 10 到 30 分鐘/);assert.match(system,/不是維持的理由/);assert.match(system,/不能出現 holdSignals、陣列、規定、界限/);
});
