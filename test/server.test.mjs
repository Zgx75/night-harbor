import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.mjs';
async function fixture(t,options={}) {
  const server=createApp({apiKey:'test-key',dbPath:':memory:',...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const registration=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'test_account',password:'test-password-123'})});
  const cookie=registration.headers.get('set-cookie').split(';')[0];
  return {base,get:p=>fetch(base+p,{headers:{Cookie:cookie}}),post:(p,body,headers={})=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...headers},body:JSON.stringify(body)})};
}
test('removed bedtime conversation and old daily/weekly report APIs return not found',async t=>{
  const f=await fixture(t,{apiKey:''});
  for(const route of ['/api/sessions','/api/sessions/00000000-0000-0000-0000-000000000000/messages','/api/sessions/00000000-0000-0000-0000-000000000000/close','/api/reports','/api/reports/advice']) {
    const response=await f.post(route,{});
    assert.equal(response.status,404);
    assert.equal((await response.json()).code,'NOT_FOUND');
  }
  assert.equal((await(await f.get('/api/health')).json()).maxTurns,undefined);
});

test('cross-origin requests and malformed records are rejected',async t=>{
  const f=await fixture(t);
  assert.equal((await f.post('/api/records/validate',{records:[]},{Origin:'https://other.example'})).status,403);
  assert.equal((await f.post('/api/records/validate',{records:[{date:'invalid'}]})).status,400);
  assert.equal((await f.post('/api/records/validate',{records:[]})).status,200);
});

test('static server only serves public files and does not expose secrets',async t=>{
  const f=await fixture(t);
  assert.equal((await f.get('/')).status,200);assert.equal((await f.get('/.env')).status,404);assert.equal((await f.get('/server.mjs')).status,404);
  const response=await f.get('/api/health'),text=await response.text();assert.ok(!text.includes('test-key'));assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));
});
test('knowledge and record validation work offline; AI plans require a connected model',async t=>{
  const f=await fixture(t,{apiKey:''});
  assert.equal((await(await f.get('/api/knowledge')).json()).sources.length,10);
  const p=await f.post('/api/plan',{records:[],currentBedtime:'03:00',targetBedtime:'00:30',wakeTime:'08:30',asOf:'2026-10-15'});assert.equal(p.status,503);assert.equal((await p.json()).code,'AI_NOT_CONFIGURED');
  const r=await(await f.post('/api/records/validate',{records:[{date:'2026-10-15',fatigue:'4'}]})).json();assert.equal(r.records[0].fatigue,4);
});
test('generic advice cannot submit its own trusted report calculations',async t=>{
  let received;const f=await fixture(t,{advise:async input=>{received=input;return{answer:'test'};}});
  await f.post('/api/advice',{question:'睡眠',records:[],asOf:'2026-10-15',reportContext:{fabricated:true}});
  assert.equal(received.reportContext,undefined);
});
