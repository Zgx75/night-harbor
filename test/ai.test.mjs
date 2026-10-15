import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiResponder } from '../ai.mjs';
import { createAdviceGenerator } from '../advice.mjs';
const session={moodLabel:'還捨不得睡',bedtime:'00:30',turn:0,messages:[]};
const reply=(value,finishReason='STOP')=>new Response(JSON.stringify({candidates:[{finishReason,content:{parts:[{text:JSON.stringify(value)}]}}]}),{status:200});
test('Gemini key stays in backend header and final round cannot return more quick replies',async()=>{
  let request;
  const generate=createGeminiResponder({apiKey:'test-key',fetchImpl:async(url,options)=>{request={url,options};return reply({message:'今天先到這裡，明天再繼續。',quickReplies:['繼續聊'],summary:'你的努力已經足夠。'});}});
  const r=await generate({...session,turn:2},'我準備好了');
  assert.deepEqual(r.quickReplies,[]);assert.ok(!request.url.includes('test-key'));assert.equal(request.options.headers['x-goog-api-key'],'test-key');assert.equal(JSON.parse(request.options.body).store,false);
});
test('missing key, service quota, malformed and truncated replies are explicit failures',async()=>{
  await assert.rejects(createGeminiResponder({apiKey:''})(session,'hi'),e=>e.code==='AI_NOT_CONFIGURED');
  await assert.rejects(createGeminiResponder({apiKey:'x',fetchImpl:async()=>new Response('{}',{status:429})})(session,'hi'),e=>e.code==='AI_BUSY');
  for(const response of [reply({message:'',quickReplies:[],summary:''}),reply({message:'x',quickReplies:[],summary:''},'MAX_TOKENS')]) await assert.rejects(createGeminiResponder({apiKey:'x',fetchImpl:async()=>response})(session,'hi'),e=>e.code==='AI_FORMAT');
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
