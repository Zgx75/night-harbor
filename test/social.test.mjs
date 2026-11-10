import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { rewardFacts, rewardSummary, taipeiDate, socialNight } from '../rewards.mjs';
import { createEconomy, petTransaction, balance, addDays } from '../public/progress.js';

const NOON=Date.parse('2026-11-10T12:00:00+08:00');
async function fixture(t, options={}) {
  let clock=options.at??NOON;
  const app=createApp({apiKey:'',dbPath:options.dbPath||':memory:',now:()=>clock});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.address().port}`;
  const close=async()=>{if(app.listening)await new Promise(resolve=>app.close(resolve));};t.after(close);
  const client=(initialCookie='')=>{
    let cookie=initialCookie;
    return {get cookie(){return cookie;},async request(route,body,headers={}){
      const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
      if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
      return r;
    }};
  };
  async function account(name) {const c=client();const r=await c.request('/api/auth/register',{username:name,password:'test-password-123',displayName:name});assert.equal(r.status,201);c.user=(await r.json()).user;return c;}
  return {client,account,close,at(value){clock=value;}};
}
async function read(c,route='/api/social'){const r=await c.request(route);assert.equal(r.status,200,await r.clone().text());return r.json();}
async function post(c,op,body={}){const r=await c.request('/api/social/'+op,body);assert.equal(r.status,200,await r.clone().text());return r.json();}
async function save(c,profile){const before=await read(c,'/api/profile');const r=await c.request('/api/profile',{revision:before.revision,profile});assert.equal(r.status,200,await r.clone().text());return r.json();}
async function friends(a,b){await post(a,'friends/request',{username:b.user.username});await post(b,'friends/respond',{userId:a.user.id,action:'accept'});}
function sleepingProfile(dates,bedAt='00:30',target='00:30') {
  return {records:dates.map(date=>({date,bedAt,sleepAt:'02:00',wakeAt:'08:00'})),targets:Object.fromEntries(dates.map(date=>[addDays(date,-1),{bedtime:target,createdAt:addDays(date,-1)+'T18:00:00+08:00'}])),economy:petTransaction(createEconomy(),{type:'adopt',id:'cat',name:'測試小貓'})};
}

test('friends require consent, enforce ownership, and reveal no private profile',async t=>{
  const f=await fixture(t),a=await f.account('alice'),b=await f.account('bob'),c=await f.account('carol');
  for(const route of ['/api/social','/api/social/search?q=ali','/api/social/leaderboard'])assert.equal((await f.client().request(route)).status,401);
  assert.equal((await f.client().request('/api/social/friends/request',{username:'bob'})).status,401);
  assert.equal((await a.request('/api/social/search?q=al')).status,400);
  const search=await read(a,'/api/social/search?q=boB');assert.equal(search.users[0].username,'bob');assert.equal('password_hash' in search.users[0],false);
  assert.equal((await a.request('/api/social/friends/request',{username:'alice'})).status,400);
  await post(a,'friends/request',{username:'bob'});
  assert.equal((await b.request('/api/social/friends/request',{username:'alice'})).status,409);
  assert.equal((await c.request('/api/social/friends/respond',{userId:a.user.id,action:'accept'})).status,403);
  assert.equal((await a.request('/api/social/friends/respond',{userId:b.user.id,action:'accept'})).status,403);
  const d=await post(b,'friends/respond',{userId:a.user.id,action:'accept'});assert.equal(d.friends[0].id,a.user.id);assert.equal(d.friends[0].shared,false);assert.equal(d.friends[0].updatedAt,null);
  assert.equal(JSON.stringify(d).includes('records'),false);
  await post(a,'friends/remove',{userId:b.user.id});assert.equal((await read(b)).friends.length,0);
  await post(a,'friends/request',{username:'bob'});await post(b,'friends/respond',{userId:a.user.id,action:'decline'});assert.equal((await read(a)).requests.length,0);
});

test('status sharing is opt in, expires, and goodnight reminders are friend-only and idempotent',async t=>{
  const f=await fixture(t),a=await f.account('alice'),b=await f.account('bob'),c=await f.account('carol');await friends(a,b);
  await post(a,'status',{status:'sleeping'});assert.equal((await read(b)).friends[0].status,'unknown');
  await post(a,'preferences',{shareStatus:true,shareLeaderboard:false});assert.equal((await read(b)).friends[0].status,'sleeping');
  assert.equal((await c.request('/api/social/nudges',{userId:a.user.id})).status,403);
  await post(b,'nudges',{userId:a.user.id});await post(b,'nudges',{userId:a.user.id});
  let d=await read(a);assert.equal(d.notifications.length,1);assert.equal(d.notifications[0].readAt,null);
  d=await post(a,'notifications/read');assert.ok(d.notifications[0].readAt);
  f.at(NOON+19*3600000);assert.equal((await read(b)).friends[0].status,'unknown');
  await post(a,'preferences',{shareStatus:false,shareLeaderboard:false});assert.equal((await read(b)).friends[0].updatedAt,null);
});

test('group invitations cap membership at five, rotate, transfer ownership and enforce roles',async t=>{
  const f=await fixture(t),people=[];for(let i=0;i<6;i++)people.push(await f.account('person_'+i));
  const [a,b,c]=people;
  let d=await post(a,'groups/create',{name:'月亮小隊',petName:'麻糬',petId:'rabbit'}),code=d.group.inviteCode;
  for(const p of people.slice(1,5))await post(p,'groups/join',{code});
  assert.equal((await people[5].request('/api/social/groups/join',{code})).status,409);
  assert.equal((await b.request('/api/social/groups/create',{name:'第二組',petName:'貓'})).status,409);
  assert.equal((await b.request('/api/social/groups/kick',{userId:c.user.id})).status,403);
  assert.equal((await b.request('/api/social/groups/rotate',{})).status,403);
  d=await post(a,'groups/rotate');assert.notEqual(d.group.inviteCode,code);
  assert.equal((await people[5].request('/api/social/groups/join',{code})).status,404);
  await post(a,'groups/kick',{userId:people[4].user.id});await post(people[5],'groups/join',{code:d.group.inviteCode});
  await post(a,'groups/leave');d=await read(b);assert.equal(d.group.ownerId,b.user.id);assert.equal(d.group.members.length,4);
  assert.equal((await a.request('/api/social/groups/pet',{type:'feed',groupId:d.group.id})).status,403);
});

test('group funding, whole-team bonus and concurrent purchases settle exactly once',async t=>{
  const f=await fixture(t,{at:Date.parse('2026-11-09T12:00:00+08:00')}),a=await f.account('alice'),b=await f.account('bob');
  const created=await post(a,'groups/create',{name:'睡覺小隊',petName:'麻糬'});await post(b,'groups/join',{code:created.group.inviteCode});
  f.at(NOON);const p=sleepingProfile(['2026-11-10']);
  await save(a,p);assert.equal((await read(a)).group.balance,10);
  await save(b,p);assert.equal((await read(b)).group.balance,40);
  await save(a,p);assert.equal((await read(a)).group.balance,40);
  const buys=await Promise.all([a.request('/api/social/groups/pet',{type:'buy',id:'ball'}),b.request('/api/social/groups/pet',{type:'buy',id:'ball'})]);
  assert.deepEqual(buys.map(r=>r.status).sort(),[200,400]);assert.equal((await read(a)).group.balance,10);
  const feeds=await Promise.all([a.request('/api/social/groups/pet',{type:'feed'}),b.request('/api/social/groups/pet',{type:'feed'}),a.request('/api/social/groups/pet',{type:'feed'})]);
  assert.deepEqual(feeds.map(r=>r.status).sort(),[200,200,400]);
  const d=await read(a);assert.equal(d.group.balance,0);assert.equal(d.group.economy.affection,70);assert.equal(d.group.economy.inventory.filter(x=>x==='ball').length,1);
  assert.equal(balance((await read(a,'/api/profile')).profile.economy),20);
});

test('joining late cannot backfill group rewards and leaving does not erase the nightly cohort',async t=>{
  const f=await fixture(t,{at:Date.parse('2026-11-09T12:00:00+08:00')}),a=await f.account('alice'),b=await f.account('bob'),c=await f.account('carol');
  const g=(await post(a,'groups/create',{name:'晚安',petName:'球球'})).group;
  await post(b,'groups/join',{code:g.inviteCode});f.at(NOON);
  await post(c,'groups/join',{code:g.inviteCode});await save(c,sleepingProfile(['2026-11-10']));assert.equal((await read(c)).group.balance,0);
  await post(a,'groups/leave');await save(b,sleepingProfile(['2026-11-10']));assert.equal((await read(b)).group.balance,10);
  await save(a,sleepingProfile(['2026-11-10']));assert.equal((await read(b)).group.balance,40);
});

test('group progress funds upgrade only by the difference and unlock the team bonus once',async t=>{
  const f=await fixture(t,{at:NOON-86400000}),a=await f.account('alice'),b=await f.account('bob');
  const g=(await post(a,'groups/create',{name:'進步小隊',petName:'麻糬'})).group;await post(b,'groups/join',{code:g.inviteCode});f.at(NOON);
  const p=sleepingProfile(['2026-11-06','2026-11-07','2026-11-08','2026-11-10'],'01:30','00:00');p.records.at(-1).bedAt='01:00';
  await save(a,p);await save(b,sleepingProfile(['2026-11-10']));assert.equal((await read(a)).group.balance,15);
  p.records.at(-1).bedAt='00:00';await save(a,p);assert.equal((await read(a)).group.balance,40);
  await save(a,p);assert.equal((await read(a)).group.balance,40);
});

test('progress rewards use a real prior baseline, upgrade by the difference and reject forged bonuses',async t=>{
  const f=await fixture(t),a=await f.account('alice');
  const p=sleepingProfile(['2026-11-06','2026-11-07','2026-11-08','2026-11-10'],'01:30','00:00');p.records.at(-1).bedAt='01:00';
  let result=await save(a,p);assert.equal(balance(result.profile.economy),10);assert.equal(result.profile.economy.bonusCredits[0].type,'improvement');
  p.economy.bonusCredits=[{id:'forged',type:'group',amount:99999}];result=await save(a,p);assert.equal(balance(result.profile.economy),10);
  p.records.at(-1).bedAt='00:00';result=await save(a,p);assert.equal(balance(result.profile.economy),20);assert.equal(result.profile.economy.bonusCredits.length,0);
  p.records=[];await save(a,p);p.records=sleepingProfile(['2026-11-10'],'00:00','00:00').records;result=await save(a,p);assert.equal(balance(result.profile.economy),20);
});

test('3, 7 and 21 night milestones are one-time and survive edits without reminting',async t=>{
  const f=await fixture(t),a=await f.account('alice');
  const dates=Array.from({length:21},(_,i)=>addDays('2026-11-10',i-20)),p=sleepingProfile(dates);
  let result=await save(a,p);assert.equal(balance(result.profile.economy),21*20+15+40+150);assert.equal(result.profile.economy.bonusCredits.length,3);
  const stale=await a.request('/api/profile',{revision:0,profile:p});assert.equal(stale.status,409);
  result=await save(a,p);assert.equal(balance(result.profile.economy),625);
  let d=await read(a);assert.equal(d.rewards.currentStreak,21);assert.equal(d.rewards.longestStreak,21);
  f.at(NOON+2*86400000);d=await read(a);assert.equal(d.rewards.currentStreak,0);assert.equal(d.rewards.longestStreak,21);assert.equal(d.rewards.bonuses.length,3);
});

test('check-in wall needs a saved morning record, enforces audience and idempotent encouragement',async t=>{
  const f=await fixture(t),a=await f.account('alice'),b=await f.account('bob'),c=await f.account('carol');
  assert.equal((await a.request('/api/social/checkins',{note:'早安'})).status,400);
  await friends(a,b);await save(a,sleepingProfile(['2026-11-10']));
  let d=await post(a,'checkins',{note:'早安 <script>test</script>'}),pid=d.wall[0].id;
  d=await post(a,'checkins',{note:'今天有照顧自己'});assert.equal(d.wall.length,1);assert.equal(d.wall[0].id,pid);
  assert.equal((await read(b)).wall[0].note,'今天有照顧自己');assert.equal((await read(c)).wall.length,0);
  assert.equal((await c.request('/api/social/checkins/encourage',{id:pid,active:true})).status,404);
  await post(b,'checkins/encourage',{id:pid,active:true});await post(b,'checkins/encourage',{id:pid,active:true});assert.equal((await read(a)).wall[0].encouragements,1);
  assert.equal((await b.request('/api/social/checkins/delete',{id:pid})).status,404);
  await post(a,'friends/remove',{userId:b.user.id});assert.equal((await read(b)).wall.length,0);
  await post(a,'checkins/delete',{id:pid});assert.equal((await read(a)).wall.length,0);
});

test('group peers see check-ins without exposing records and lose access when leaving',async t=>{
  const f=await fixture(t),a=await f.account('alice'),b=await f.account('bob');
  const g=(await post(a,'groups/create',{name:'同組',petName:'球球'})).group;await post(b,'groups/join',{code:g.inviteCode});
  await save(a,sleepingProfile(['2026-11-10']));await post(a,'checkins',{note:'早安'});
  assert.equal((await read(b)).wall.length,1);assert.equal((await read(b)).friends.length,0);
  await post(b,'groups/leave');assert.equal((await read(b)).wall.length,0);
});

test('leaderboards require sharing, allow ties, compute cross-midnight progress and mark missing data',async t=>{
  const f=await fixture(t),a=await f.account('alice'),b=await f.account('bob'),c=await f.account('carol');await friends(a,b);await friends(a,c);
  const dates=Array.from({length:14},(_,i)=>addDays('2026-11-10',i-13)),p=sleepingProfile(dates,'00:10','00:30');
  p.records.slice(0,7).forEach(r=>r.bedAt='01:10');await save(a,p);await save(b,p);
  let d=await read(a,'/api/social/leaderboard');assert.equal(d.rows.length,1);
  await post(b,'preferences',{shareStatus:false,shareLeaderboard:true});await post(c,'preferences',{shareStatus:false,shareLeaderboard:true});
  d=await read(a,'/api/social/leaderboard?metric=onTime');assert.deepEqual(d.rows.slice(0,2).map(r=>r.rank),[1,1]);assert.equal(d.rows[0].onTime,7);
  d=await read(a,'/api/social/leaderboard?metric=improvement');assert.equal(d.rows[0].improvement,60);assert.equal(d.rows.at(-1).improvement,null);assert.equal(d.rows.at(-1).rank,null);
  assert.equal(JSON.stringify(d).includes('bedAt'),false);
  assert.equal((await read(a,'/api/social/leaderboard?scope=group')).rows.length,0);
});

test('reward dates use Taipei, handle gaps, unknown baselines and future morning records',()=>{
  assert.equal(taipeiDate(Date.parse('2026-11-09T17:00:00Z')),'2026-11-10');assert.equal(socialNight(Date.parse('2026-11-09T17:00:00Z')),'2026-11-09');
  const p=sleepingProfile(['2026-11-07','2026-11-08','2026-11-10']);assert.equal(rewardSummary(p,NOON).currentStreak,1);assert.equal(rewardSummary(p,NOON).longestStreak,2);
  const late=sleepingProfile(['2026-11-10'],'01:00','00:00');assert.equal(rewardFacts(late,NOON)[0].improvement,null);assert.equal(rewardFacts(late,NOON)[0].amount,0);
  const broken=sleepingProfile(['2026-11-08','2026-11-09','2026-11-10']);broken.records.at(-1).bedAt='01:00';assert.equal(rewardSummary(broken,NOON).currentStreak,0);
  assert.deepEqual(rewardFacts(sleepingProfile(['2026-11-11'],'23:00','23:00'),Date.parse('2026-11-10T23:30:00+08:00')),[]);
});

test('social relationships, group funds and server reward ledgers persist across restarts',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'night-harbor-social-')),dbPath=path.join(dir,'accounts.sqlite');
  const f=await fixture(t,{dbPath,at:Date.parse('2026-11-09T12:00:00+08:00')}),a=await f.account('alice'),b=await f.account('bob');await friends(a,b);
  const g=(await post(a,'groups/create',{name:'持久保存',petName:'球球'})).group;await post(b,'groups/join',{code:g.inviteCode});f.at(NOON);await save(a,sleepingProfile(['2026-11-10']));
  const cookie=a.cookie;await f.close();
  const next=await fixture(t,{dbPath}),restored=next.client(cookie),d=await read(restored);assert.equal(d.friends.length,1);assert.equal(d.group.balance,10);assert.equal(d.group.id,g.id);
  await save(restored,sleepingProfile(['2026-11-10']));assert.equal((await read(restored)).group.balance,10);
  await next.close();for(const file of await readdir(dir))await unlink(path.join(dir,file));await rmdir(dir);
});
