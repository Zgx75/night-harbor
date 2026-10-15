import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { AppError } from '../ai.mjs';
import { demoProfile } from '../public/progress.js';
async function fixture(t,options={}) {
  const server=createApp({apiKey:'test-key',respond:async()=>({message:'謝謝你說出來。',quickReplies:[],summary:''}),...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  return {base,get:p=>fetch(base+p),post:(p,body,headers={})=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)})};
}
const createSession=async f=>(await f.post('/api/sessions',{mood:'reluctant',bedtime:'00:30'})).json();
test('three turns are enforced on the server and closing invalidates the session',async t=>{
  const f=await fixture(t),s=await createSession(f);
  for(let n=1;n<=3;n++){const r=await(await f.post(`/api/sessions/${s.id}/messages`,{text:'今天有點累'})).json();assert.equal(r.turn,n);assert.equal(r.done,n===3);}
  assert.equal((await f.post(`/api/sessions/${s.id}/messages`,{text:'繼續'})).status,409);
  assert.equal((await f.post(`/api/sessions/${s.id}/close`,{})).status,200);
  assert.equal((await f.post(`/api/sessions/${s.id}/messages`,{text:'繼續'})).status,404);
});
test('provider failure does not consume a conversation turn',async t=>{
  let calls=0;
  const f=await fixture(t,{respond:async()=>{if(++calls===1)throw new AppError(504,'AI_TIMEOUT','測試逾時');return {message:'已恢復',quickReplies:[],summary:''};}}),s=await createSession(f);
  assert.equal((await f.post(`/api/sessions/${s.id}/messages`,{text:'測試'})).status,504);
  const r=await(await f.post(`/api/sessions/${s.id}/messages`,{text:'重試'})).json();assert.equal(r.turn,1);
});
test('concurrent sends cannot bypass the turn counter',async t=>{
  let release,entered;
  const started=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);
  const f=await fixture(t,{respond:async()=>{entered();await blocked;return{message:'回覆',quickReplies:[],summary:''};}}),s=await createSession(f);
  const first=f.post(`/api/sessions/${s.id}/messages`,{text:'第一則'});await started;
  const second=await f.post(`/api/sessions/${s.id}/messages`,{text:'第二則'});assert.equal(second.status,409);release();assert.equal((await(await first).json()).turn,1);
});
test('cross-origin spend, malformed mood and empty messages are rejected',async t=>{
  const f=await fixture(t);
  assert.equal((await f.post('/api/sessions',{mood:'reluctant',bedtime:'00:30'},{Origin:'https://other.example'})).status,403);
  assert.equal((await f.post('/api/sessions',{mood:'invented',bedtime:'00:30'})).status,400);
  const s=await createSession(f);assert.equal((await f.post(`/api/sessions/${s.id}/messages`,{text:' '})).status,400);
});
test('static server only serves public files and does not expose secrets',async t=>{
  const f=await fixture(t);
  assert.equal((await f.get('/')).status,200);assert.equal((await f.get('/.env')).status,404);assert.equal((await f.get('/server.mjs')).status,404);
  const response=await f.get('/api/health'),text=await response.text();assert.ok(!text.includes('test-key'));assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));
});
test('knowledge and record validation work offline; AI plans require a connected model',async t=>{
  const f=await fixture(t,{apiKey:''});
  assert.equal((await(await f.get('/api/knowledge')).json()).sources.length,9);
  const p=await f.post('/api/plan',{records:[],currentBedtime:'03:00',targetBedtime:'00:30',wakeTime:'08:30',asOf:'2026-10-15'});assert.equal(p.status,503);assert.equal((await p.json()).code,'AI_NOT_CONFIGURED');
  const r=await(await f.post('/api/records/validate',{records:[{date:'2026-10-15',fatigue:'4'}]})).json();assert.equal(r.records[0].fatigue,4);
});
test('daily and weekly report APIs return real calculated stats and validated model context',async t=>{
  let received;
  const f=await fixture(t,{advise:async input=>{received=input;return{answer:'測試回報',sources:[],suggestions:[]};}}),profile=demoProfile('2026-10-15');
  const weekly=await(await f.post('/api/reports',{...profile,mode:'weekly',asOf:'2026-10-15'})).json();
  assert.equal(weekly.current.recordDays,7);assert.ok(weekly.changes.earlierBedtime>0);
  profile.targets['2026-10-15']={bedtime:'00:20',createdAt:'2026-10-15T12:00:00+08:00',source:'gemini'};
  const daily=await f.post('/api/reports/advice',{...profile,mode:'daily',asOf:'2026-10-15'});assert.equal(daily.status,200);assert.equal(received.reportContext.mode,'daily');assert.equal(received.reportContext.tonight.bedtime,'00:20');
});
test('generic advice cannot submit its own trusted report calculations',async t=>{
  let received;const f=await fixture(t,{advise:async input=>{received=input;return{answer:'test'};}});
  await f.post('/api/advice',{question:'睡眠',records:[],asOf:'2026-10-15',reportContext:{fabricated:true}});
  assert.equal(received.reportContext,undefined);
});
