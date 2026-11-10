import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../public/pwa.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function environment({ready=true}={}) {
  const events=new Map(),workerEvents=new Map(),docEvents=new Map(),intervals=[];
  const nodes=new Map(),query=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{hidden:true,open:false,textContent:'',listeners:new Map(),addEventListener(name,fn){this.listeners.set(name,fn);},close(){this.open=false;},showModal(){this.open=true;}});
    return nodes.get(selector);
  };
  let installs=0,checks=0,reloads=0,guardAllowed=true,saveAllowed=true,saves=0;
  const registration={waiting:null,installing:null,active:{},addEventListener(name,fn){events.set('registration:'+name,fn);},async update(){checks++;}};
  const serviceWorker={controller:{},async register(){return registration;},ready:Promise.resolve(registration),addEventListener(name,fn){workerEvents.set(name,fn);}};
  const document={body:{dataset:{auth:ready?'ready':'signed-out'}},visibilityState:'visible',activeElement:null,
    querySelector:selector=>selector==='dialog[open]'?null:query(selector),addEventListener(name,fn){docEvents.set(name,fn);}};
  const window={isSecureContext:true,addEventListener(name,fn){events.set(name,fn);},nightHarborUpdates:ready?{canUpdate:()=>guardAllowed,async prepare(){saves++;return saveAllowed;}}:undefined};
  const navigator={onLine:true,serviceWorker};
  const context=vm.createContext({window,document,navigator,matchMedia:()=>({matches:true,addEventListener(){}}),sessionStorage:{getItem(){return null;},setItem(){}},location:{reload(){reloads++;}},setInterval(fn){intervals.push(fn);},Date});
  vm.runInContext(source,context);
  function wait(){registration.waiting={postMessage(message){assert.equal(message.type,'ACTIVATE_UPDATE');installs++;registration.waiting=null;workerEvents.get('controllerchange')();}};}
  return {events,docEvents,document,window,navigator,registration,intervals,wait,get counts(){return {installs,checks,reloads,saves};},allow(value){guardAllowed=value;},save(value){saveAllowed=value;},tick(){intervals[0]();}};
}

test('a waiting update applies automatically after the account save succeeds',async()=>{
  const e=environment();await settle();e.wait();e.tick();await settle();
  assert.equal(e.counts.installs,1);assert.equal(e.counts.reloads,1);assert.equal(e.counts.saves,2);
});

test('unsubmitted forms and focused text inputs defer updates until work is saved or left',async()=>{
  const e=environment();await settle();const form={isConnected:true,closest(){return null;}};
  e.docEvents.get('input')({target:{closest:()=>form}});e.wait();e.tick();await settle();assert.equal(e.counts.installs,0);
  form.isConnected=false;e.document.activeElement={matches:()=>true};e.tick();await settle();assert.equal(e.counts.installs,0);
  e.document.activeElement=null;e.tick();await settle();assert.equal(e.counts.installs,1);assert.equal(e.counts.reloads,1);
});

test('hidden login forms do not block future automatic updates',async()=>{
  const e=environment();await settle();const form={isConnected:true,closest:()=>({hidden:true})};
  e.docEvents.get('input')({target:{closest:()=>form}});e.wait();e.tick();await settle();assert.equal(e.counts.reloads,1);
});

test('a failed save or busy app keeps the current release until it becomes safe',async()=>{
  const e=environment();await settle();e.wait();e.save(false);e.tick();await settle();assert.equal(e.counts.installs,0);
  e.save(true);e.allow(false);e.tick();await settle();assert.equal(e.counts.installs,0);
  e.allow(true);e.tick();await settle();assert.equal(e.counts.reloads,1);
});

test('offline and background pages defer activation and resume checks on return',async()=>{
  const e=environment();await settle();e.wait();e.navigator.onLine=false;e.tick();await settle();assert.equal(e.counts.installs,0);
  e.navigator.onLine=true;e.document.visibilityState='hidden';e.tick();await settle();assert.equal(e.counts.installs,0);
  e.document.visibilityState='visible';e.docEvents.get('visibilitychange')();await settle();assert.equal(e.counts.installs,1);
});

test('updates activated by another tab wait for the current tab to finish its work',async()=>{
  const e=environment();await settle();e.allow(false);e.document.visibilityState='hidden';e.events.get('pageshow')();e.document.visibilityState='visible';
  // Simulate another tab activating a release while this tab has unsaved work.
  e.wait();e.registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});await settle();assert.equal(e.counts.reloads,0);
  e.allow(true);e.tick();await settle();assert.equal(e.counts.reloads,1);
});
