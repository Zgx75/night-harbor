import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomy,petTransaction,awardNight,balance,assessNight,addDays,snapshotTargets,normaliseEconomy,clampSpot,itemSpot,iconSize,FURNITURE,FLOOR_TOP,level,growth,awakeHours,affectionNow,decayPerHour,careForPet,AFFECTION_FLOOR,RENAME_COST } from '../public/progress.js';
import {cleanRecords} from '../src/domain.mjs';
import {makePlan} from '../src/domain.mjs';
import {cleanTargets} from '../src/reports/reports.mjs';
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
  e=petTransaction(e,{type:'buy',id:'ball'},now);assert.equal(balance(e),5);assert.deepEqual(e.placed,['ball']);
  assert.throws(()=>petTransaction(e,{type:'buy',id:'ball'},now),/已經/);
  e=petTransaction(e,{type:'equip',id:'ball'},now);assert.deepEqual(e.placed,[]);assert.equal(balance(e),5);
  e=petTransaction(e,{type:'adopt',id:'rabbit',name:'換夥伴'},now);assert.equal(balance(e),5);assert.ok(e.inventory.includes('ball'));
});
test('new sleep fields validate, retain unknowns, and reject impossible time ordering',()=>{
  const r=cleanRecords([row])[0];assert.equal(r.sleepQuality,2);assert.equal(r.screenMinutes,null);assert.equal(r.napMinutes,null);
  for(const patch of [{sleepQuality:0},{screenMinutes:61},{napMinutes:-1},{insomnia:'diagnosed'},{bedAt:'02:30'}])assert.throws(()=>cleanRecords([{...row,...patch}]));
});
test('saved nightly targets are validated before coins or reviews use them',()=>{
  const good={'2026-10-14':{bedtime:'01:30',createdAt:'2026-10-14T10:00:00Z'},'2026-10-15':{bedtime:'00:45',createdAt:'2026-10-15T10:00:00Z'}};
  assert.equal(Object.keys(cleanTargets(good)).length,2);
  assert.throws(()=>cleanTargets({bad:{bedtime:'99:99'}}));
  assert.throws(()=>cleanTargets({'2026-10-15':{bedtime:'12:00',createdAt:'2026-10-15T10:00:00Z'}}));
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

test('floor furniture stays on the floor while wall pieces can go anywhere in the room',()=>{
  const high=clampSpot('bed',0.5,0.05),low=clampSpot('bed',0.5,5);
  assert.ok(high.y>=FLOOR_TOP,'a bed cannot be lifted above the floor');assert.equal(low.y,1);
  assert.deepEqual(clampSpot('wall',-1,0.05),{x:0,y:0.05});
  // A piece's own size keeps all of it inside the room.
  assert.deepEqual(clampSpot('toy',0,1,0.05,0.04),{x:0.05,y:0.96});
});
test('saved placements are validated: only owned pieces, only sensible numbers, floor rule enforced',()=>{
  const e=normaliseEconomy({pet:{id:'cat',name:'a'},inventory:['cushion','frame'],placed:['cushion','frame'],layout:{cushion:{x:0.2,y:0.1},frame:{x:0.9,y:0.1},tent:{x:0.5,y:0.9},ball:{x:'x',y:1}}});
  assert.ok(e.layout.cushion.y>=FLOOR_TOP,'a saved bed is pulled back onto the floor');
  assert.deepEqual(e.layout.frame,{x:0.9,y:0.1});
  assert.equal(e.layout.tent,undefined,'unowned pieces are dropped');assert.equal(e.layout.ball,undefined);
  const cushion=FURNITURE.find(f=>f.id==='cushion');
  assert.deepEqual(itemSpot(cushion,{}),{x:0.5,y:0.82},'unplaced pieces use their default spot');
  assert.deepEqual(normaliseEconomy(null).layout,{});
});

test('any number of pieces of one kind can stand in the room, and older accounts carry over',()=>{
  let e={...createEconomy(),pet:{id:'cat',name:'a'},bonusCredits:[{id:'g',type:'group',amount:1000}]};
  for(const id of ['cushion','tent','sofa'])e=petTransaction(e,{type:'buy',id},Date.now());
  assert.deepEqual(e.placed,['cushion','tent','sofa'],'three bed pieces are all placed');
  e=petTransaction(e,{type:'equip',id:'tent'},Date.now());assert.deepEqual(e.placed,['cushion','sofa']);
  e=petTransaction(e,{type:'equip',id:'tent'},Date.now());assert.deepEqual(e.placed,['cushion','sofa','tent']);
  // Several pieces never start on the same spot.
  const spots=new Set(FURNITURE.map(f=>JSON.stringify(itemSpot(f,{}))));assert.equal(spots.size,FURNITURE.length);
  // The old one-per-spot format still loads.
  const legacy=normaliseEconomy({pet:{id:'cat',name:'a'},inventory:['cushion','plant','ball'],equipped:{bed:'cushion',toy:'ball',plant:'tent'}});
  assert.deepEqual(legacy.placed.sort(),['ball','cushion'],'unowned pieces in the old data are dropped');
  assert.equal(legacy.equipped,undefined);
});

test('every piece has its own size, roughly in proportion to the real object',()=>{
  const size=Object.fromEntries(FURNITURE.map(f=>[f.id,f.size]));
  for(const f of FURNITURE){assert.ok(Number.isFinite(f.size)&&f.size>=20&&f.size<=120,f.id);}
  assert.ok(new Set(Object.values(size)).size>10,'sizes are not all the same');
  assert.ok(size.sofa>size.teddy&&size.tent>size.plant&&size.plant>size.candle&&size.piano>size.radio&&size.teddy>size.ball);
  assert.ok(FURNITURE.every(f=>iconSize(f)>=24&&iconSize(f)<=56),'icons stay readable and fit the cards');
});

// 2026-11-10 07:00 on a clock at UTC (offset 0); waking hours 07:00 to 23:00.
const at=(day,time)=>Date.parse(`2026-11-${day}T${time}:00Z`),sleep={wake:'07:00',bed:'23:00'};
const withPet=extra=>({...createEconomy(),pet:{id:'cat',name:'a'},bonusCredits:[{id:'g',type:'group',amount:1000}],...extra});

test('only the awake hours count, and a usual sleeping time never takes satisfaction away',()=>{
  assert.equal(awakeHours(at('10','22:00'),at('11','08:00'),sleep,0),2,'22:00-23:00 and 07:00-08:00');
  assert.equal(awakeHours(at('10','23:00'),at('11','07:00'),sleep,0),0,'a whole night of sleep');
  assert.equal(awakeHours(at('10','07:00'),at('10','23:00'),sleep,0),16);
  // The player's own clock decides which hours are awake.
  assert.equal(awakeHours(at('10','22:00'),at('11','08:00'),sleep,480),9,'on a clock 8 hours ahead that is 06:00-16:00, of which 07:00-16:00 is awake');
  // A bedtime after midnight means the awake hours run past 00:00.
  assert.equal(awakeHours(at('10','23:00'),at('11','01:00'),{wake:'08:00',bed:'02:00'},0),2);
});
test('satisfaction falls with the awake hours, faster at higher levels, and never below the floor',()=>{
  const e=withPet({affection:100,affectionAt:new Date(at('10','07:00')).toISOString()});
  assert.equal(affectionNow(e,at('10','17:00'),sleep,0),80,'level 1 loses 2 a hour');
  assert.equal(affectionNow(e,at('11','07:00'),sleep,0),68,'16 awake hours, none of them while asleep');
  assert.equal(affectionNow(e,at('10','07:00')-1000,sleep,0),100,'a clock set back never raises or lowers it');
  assert.equal(affectionNow(e,at('10','07:00')+20*86400000,sleep,0),AFFECTION_FLOOR,'a long absence stops at the floor');
  assert.equal(affectionNow({...e,affection:12},at('15','07:00'),sleep,0),12,'a value already below the floor stays');
  assert.equal(affectionNow({...e,affectionAt:null},at('20','07:00'),sleep,0),100,'an account whose clock has not started loses nothing');
  assert.equal(decayPerHour(1),2);assert.ok(decayPerHour(4)>2&&decayPerHour(4)<2.5);assert.equal(decayPerHour(6),2.5);assert.equal(decayPerHour(40),2.5);
  const lv5={...e,credits:Array.from({length:16},(_,i)=>({night:`2026-10-${String(i+10)}`,amount:20}))};
  assert.equal(level(lv5),5);assert.equal(Math.round(affectionNow(lv5,at('10','17:00'),sleep,0)),100-10*2.4);
});
test('feeding adds 15 on top of what is left, costs coins, and a day at 70 or more counts as care',()=>{
  const start=new Date(at('10','07:00')).toISOString();
  let e=withPet({affection:100,affectionAt:start,transactions:[]});
  const feed=(eco,time,over={})=>careForPet(eco,{now:at('10',time),sleep,offset:0,day:'2026-11-10',...over});
  assert.throws(()=>feed(e,'07:00'),/已經很滿足/,'a full pet cannot be fed');
  e=feed(e,'17:00');                    // 80 left after ten hours; feeding fills it up
  assert.equal(e.affection,95);assert.equal(e.transactions.at(-1).cost,5);assert.deepEqual(e.careDays,['2026-11-10']);
  e=feed({...e,affection:50},'18:00');  // a second feeding the same day is not counted twice
  assert.equal(e.careDays.length,1);
  const low=withPet({affection:40,affectionAt:start});
  const fed=careForPet(low,{now:at('10','07:00'),sleep,offset:0,day:'2026-11-10'});
  assert.equal(fed.affection,55);assert.deepEqual(fed.careDays,[],'55 is below 70, so no care credit yet');
  assert.throws(()=>careForPet({...createEconomy(),pet:{id:'cat',name:'a'},affection:30},{now:at('10','07:00')}),/需要 5 枚金幣/);
  assert.equal(careForPet({...createEconomy(),pet:{id:'cat',name:'a'},affection:30},{now:at('10','07:00'),free:true}).transactions.length,0,'free feeding costs nothing');
});
test('growth counts on-time nights and care days; old accounts keep their level',()=>{
  const nights=n=>Array.from({length:n},(_,i)=>({night:`2026-09-${String(i+1).padStart(2,'0')}`,amount:20}));
  assert.equal(level({...createEconomy(),credits:nights(3)}),1);assert.equal(level({...createEconomy(),credits:nights(4)}),2);assert.equal(level({...createEconomy(),credits:nights(8)}),3);
  const e={...createEconomy(),credits:nights(2),careDays:['2026-10-01','2026-10-02','2026-10-03','2026-10-04']};
  assert.equal(growth(e),16);assert.equal(level(e),2,'two nights (8) and four care days (8) make one level');
  const saved=normaliseEconomy({pet:{id:'cat',name:'a'},affection:70,affectionAt:'2026-11-10T00:00:00Z',careDays:['2026-11-10','2026-11-10','bad','2026-11-09']});
  assert.deepEqual(saved.careDays,['2026-11-09','2026-11-10'],'duplicates and bad dates are dropped');assert.equal(saved.affectionAt,'2026-11-10T00:00:00.000Z');
  assert.equal(normaliseEconomy({affectionAt:'nope'}).affectionAt,null);
});

test('renaming the pet costs coins, is validated, and never changes its kind',()=>{
  const e=withPet({pet:{id:'fox',name:'栗子'}});
  const renamed=petTransaction(e,{type:'rename',name:'  糯米 '},Date.now());
  assert.equal(renamed.pet.name,'糯米');assert.equal(renamed.pet.id,'fox');assert.equal(balance(e)-balance(renamed),RENAME_COST);
  assert.throws(()=>petTransaction(e,{type:'rename',name:''}),/1 到 16/);
  assert.throws(()=>petTransaction(e,{type:'rename',name:'x'.repeat(17)}),/1 到 16/);
  assert.throws(()=>petTransaction(e,{type:'rename',name:'栗子'}),/已經是/);
  assert.throws(()=>petTransaction({...createEconomy(),pet:{id:'fox',name:'a'}},{type:'rename',name:'b'}),/金幣/);
  assert.throws(()=>petTransaction(createEconomy(),{type:'rename',name:'b'}),/先選一位/);
});
