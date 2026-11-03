import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdviceGenerator } from '../advice.mjs';
const reply=(value,finishReason='STOP')=>new Response(JSON.stringify({candidates:[{finishReason,content:{parts:[{text:JSON.stringify(value)}]}}]}),{status:200});
test('RAG keeps the Gemini key in the backend header and disables storage',async()=>{
  let request;
  const generate=createAdviceGenerator({apiKey:'test-key',fetchImpl:async(url,options)=>{request={url,options};return reply({answer:'觀察咖啡因時間。',suggestions:[]});}});
  await generate({question:'咖啡因',records:[],asOf:'2026-10-15'});
  assert.ok(!request.url.includes('test-key'));
  assert.equal(request.options.headers['x-goog-api-key'],'test-key');
  assert.equal(JSON.parse(request.options.body).store,false);
});

test('RAG reports missing keys, quota failures, malformed and truncated replies',async()=>{
  const input={question:'咖啡因',records:[],asOf:'2026-10-15'};
  await assert.rejects(createAdviceGenerator({apiKey:''})(input),e=>e.code==='AI_NOT_CONFIGURED');
  await assert.rejects(createAdviceGenerator({apiKey:'x',fetchImpl:async()=>new Response('{}',{status:429})})(input),e=>e.code==='AI_UNAVAILABLE');
  for(const response of [reply({answer:'',suggestions:[]}),reply({answer:'x',suggestions:[]},'MAX_TOKENS')]) {
    await assert.rejects(createAdviceGenerator({apiKey:'x',fetchImpl:async()=>response})(input),e=>e.code==='AI_FORMAT');
  }
});

test('RAG only accepts citations from retrieved sources',async()=>{
  const good=createAdviceGenerator({apiKey:'x',fetchImpl:async()=>reply({answer:'下午較晚的咖啡可能影響睡眠。',suggestions:[{title:'觀察咖啡因時間',detail:'先記錄飲用時間與睡眠狀況。',sourceIds:['K1']}]})});
  const r=await good({question:'咖啡因',records:[],asOf:'2026-10-15'});assert.equal(r.recordCount,0);assert.ok(r.sources.some(s=>s.id==='K1'));
  const bad=createAdviceGenerator({apiKey:'x',fetchImpl:async()=>reply({answer:'test',suggestions:[{title:'x',detail:'y',sourceIds:['FABRICATED']}]})});
  await assert.rejects(bad({question:'咖啡因',records:[],asOf:'2026-10-15'}),e=>e.code==='AI_FORMAT');
});
test('no source match avoids making a provider request',async()=>{
  const generate=createAdviceGenerator({apiKey:'x',fetchImpl:async()=>{throw new Error('must not call');}});
  const r=await generate({question:'quantum algorithm qubits',records:[],asOf:'2026-10-15'});assert.equal(r.retrieved,false);assert.deepEqual(r.sources,[]);
});
