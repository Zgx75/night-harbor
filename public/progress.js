// Shared deterministic rules. Coins are local prototype currency, never cash.
export const PETS = [
  {id:'cat',emoji:'🐱',name:'小貓'}, {id:'dog',emoji:'🐶',name:'小狗'},
  {id:'rabbit',emoji:'🐰',name:'小兔'}, {id:'fox',emoji:'🦊',name:'小狐狸'},
  {id:'panda',emoji:'🐼',name:'小熊貓'}, {id:'owl',emoji:'🦉',name:'小貓頭鷹'}
];
export const FURNITURE = [
  {id:'cushion',name:'柔軟睡墊',emoji:'🛏️',cost:40,slot:'bed'},
  {id:'plant',name:'窗邊小盆栽',emoji:'🪴',cost:60,slot:'plant'},
  {id:'lamp',name:'暖暖小夜燈',emoji:'🏮',cost:80,slot:'lamp'},
  {id:'books',name:'晚安故事書',emoji:'📚',cost:40,slot:'toy'},
  {id:'ball',name:'滾滾小皮球',emoji:'🧶',cost:30,slot:'toy'},
  {id:'tent',name:'星星小帳篷',emoji:'⛺',cost:120,slot:'bed'}
];
export const addDays = (s,n) => new Date(Date.parse(s)+n*86400000).toISOString().slice(0,10);
const timeOK = s => typeof s==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const min = s => Number(s.slice(0,2))*60+Number(s.slice(3));
export const nightMinute = s => min(s)<720?min(s)+1440:min(s);
export const nightInstant = (date,m) => Date.parse(date+'T00:00:00+08:00')+m*60000;
export function snapshotTargets(existing,points,now=Date.now()) {
  const targets={...existing};
  for(const p of points) {
    if(!timeOK(p.bedtime)||now>=nightInstant(p.date,nightMinute(p.bedtime)))continue;
    const previous=targets[p.date];
    if(previous&&timeOK(previous.bedtime)&&now>=nightInstant(p.date,nightMinute(previous.bedtime)))continue;
    if(previous&&previous.bedtime===p.bedtime&&previous.source===p.source&&previous.reason===p.reason)continue;
    targets[p.date]={bedtime:p.bedtime,createdAt:previous?.bedtime===p.bedtime?previous.createdAt:new Date(now).toISOString(),...(p.source?{source:p.source,reason:p.reason||''}:{})};
  }
  return Object.fromEntries(Object.entries(targets).sort(([a],[b])=>a.localeCompare(b)).slice(-90));
}
export function formatClock(m) { if(m==null)return '—';m=Math.round(m);return `${String(Math.floor((m%1440)/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
export function createEconomy() {return {pet:null,credits:[],bonusCredits:[],transactions:[],inventory:[],equipped:{},affection:50};}
export function normaliseEconomy(value) {
  const e=createEconomy();if(!value||typeof value!=='object')return e;
  if(value.pet&&PETS.some(p=>p.id===value.pet.id))e.pet={id:value.pet.id,name:String(value.pet.name||'小夥伴').slice(0,16)};
  const seen=new Set();
  e.credits=(Array.isArray(value.credits)?value.credits:[]).filter(c=>c&&/^\d{4}-\d{2}-\d{2}$/.test(c.night)&&!seen.has(c.night)&&seen.add(c.night)).map(c=>({...c,amount:20}));
  const bonusSeen=new Set();
  e.bonusCredits=(Array.isArray(value.bonusCredits)?value.bonusCredits:[]).filter(c=>c&&typeof c.id==='string'&&!bonusSeen.has(c.id)&&bonusSeen.add(c.id)&&['improvement','streak','group'].includes(c.type)&&Number.isSafeInteger(c.amount)&&c.amount>=0&&c.amount<=10000000).map(c=>({...c}));
  e.transactions=(Array.isArray(value.transactions)?value.transactions:[]).filter(t=>t&&Number.isInteger(t.cost)&&t.cost>0);
  e.inventory=[...new Set((Array.isArray(value.inventory)?value.inventory:[]).filter(id=>FURNITURE.some(f=>f.id===id)))];
  for(const f of FURNITURE)if(value.equipped?.[f.slot]===f.id&&e.inventory.includes(f.id))e.equipped[f.slot]=f.id;
  e.affection=Number.isFinite(value.affection)?Math.max(0,Math.min(100,value.affection)):50;
  return e;
}
export const balance = e => e.credits.length*20+(e.bonusCredits||[]).reduce((n,c)=>n+c.amount,0)-e.transactions.reduce((n,t)=>n+t.cost,0);
export const level = e => 1+Math.floor(e.credits.length/4);
export function assessNight(record,targets,now=Date.now()) {
  if(!record)return {status:'missing',label:'還沒回報',eligible:false};
  const night=addDays(record.date,-1), target=targets?.[night];
  if(!timeOK(record.bedAt))return {status:'unknown',label:'還沒有有效上床時間',eligible:false,night};
  if(!target||!timeOK(target.bedtime)||!Number.isFinite(Date.parse(target.createdAt)))return {status:'unknown',label:'昨晚尚無事先設定的目標',eligible:false,night};
  const actual=nightInstant(night,nightMinute(record.bedAt));
  const expected=nightInstant(night,nightMinute(target.bedtime));
  if(Date.parse(target.createdAt)>actual||Date.parse(target.createdAt)>expected)return {status:'unknown',label:'目標設定晚於這次就寢，無法補算',eligible:false,night,target:target.bedtime};
  if(actual>now)return {status:'unknown',label:'這個上床時間還沒到，稍後再回報',eligible:false,night,target:target.bedtime};
  const difference=Math.round((actual-expected)/60000),onTime=difference<=15;
  return {status:onTime?'on-time':'late',label:onTime?'有依約上床':'這晚比較晚收尾',eligible:onTime,night,target:target.bedtime,bedAt:record.bedAt,difference};
}
export function awardNight(economy,record,targets,now=Date.now()) {
  const e=normaliseEconomy(economy), result=assessNight(record,targets,now);
  if(!e.pet)return {economy:e,awarded:0,reason:'先選一位小夥伴，之後就能領取獎勵。'};
  if(!result.eligible)return {economy:e,awarded:0,reason:result.label};
  if(e.credits.some(c=>c.night===result.night))return {economy:e,awarded:0,reason:'這晚的金幣已經領過了。'};
  e.credits.push({night:result.night,amount:20,bedAt:record.bedAt,target:result.target,earnedAt:new Date(now).toISOString()});
  return {economy:e,awarded:20,reason:'按時上床，獲得 20 枚金幣！'};
}
export function petTransaction(economy,event,now=Date.now()) {
  const e=normaliseEconomy(economy);
  if(event.type==='adopt') {
    if(!PETS.some(p=>p.id===event.id))throw new Error('請選擇一個寵物 emoji。');
    const name=String(event.name||'').trim();if(!name||name.length>16)throw new Error('名字請填 1 到 16 個字。');
    e.pet={id:event.id,name};return e;
  }
  if(!e.pet)throw new Error('先選一位小夥伴吧。');
  if(event.type==='feed') {
    if(e.affection>=100)throw new Error('小夥伴已經很滿足了，先把金幣留起來吧。');
    if(balance(e)<5)throw new Error('餵食需要 5 枚金幣，先完成一晚的睡前約定。');
    e.transactions.push({type:'feed',cost:5,at:new Date(now).toISOString()});e.affection=Math.min(100,e.affection+10);return e;
  }
  const f=FURNITURE.find(f=>f.id===event.id);if(!f)throw new Error('找不到這件家具。');
  if(event.type==='buy') {
    if(e.inventory.includes(f.id))throw new Error('這件家具已經在你的收藏裡了。');
    if(balance(e)<f.cost)throw new Error('金幣還不夠，可以先慢慢存。');
    e.transactions.push({type:'furniture',id:f.id,cost:f.cost,at:new Date(now).toISOString()});e.inventory.push(f.id);e.equipped[f.slot]=f.id;return e;
  }
  if(event.type==='equip') {
    if(!e.inventory.includes(f.id))throw new Error('先把這件家具帶回家。');
    if(e.equipped[f.slot]===f.id)delete e.equipped[f.slot];else e.equipped[f.slot]=f.id;return e;
  }
  throw new Error('無法完成這個操作。');
}
