// Shared deterministic rules. Coins are local prototype currency, never cash.
export const PETS = [
  {id:'cat',emoji:'🐱',name:'小貓'}, {id:'dog',emoji:'🐶',name:'小狗'},
  {id:'rabbit',emoji:'🐰',name:'小兔'}, {id:'fox',emoji:'🦊',name:'小狐狸'},
  {id:'panda',emoji:'🐼',name:'小熊貓'}, {id:'owl',emoji:'🦉',name:'小貓頭鷹'},
  {id:'hamster',emoji:'🐹',name:'小倉鼠'}, {id:'bear',emoji:'🐻',name:'小熊'},
  {id:'koala',emoji:'🐨',name:'無尾熊'}, {id:'tiger',emoji:'🐯',name:'小老虎'},
  {id:'pig',emoji:'🐷',name:'小豬'}, {id:'frog',emoji:'🐸',name:'小青蛙'},
  {id:'monkey',emoji:'🐵',name:'小猴子'}, {id:'penguin',emoji:'🐧',name:'小企鵝'},
  {id:'chick',emoji:'🐤',name:'小雞'}, {id:'turtle',emoji:'🐢',name:'小烏龜'},
  {id:'hedgehog',emoji:'🦔',name:'小刺蝟'}, {id:'lion',emoji:'🦁',name:'小獅子'}
];
// size: how big the piece looks in the room (emoji font size in px on a computer screen).
export const FURNITURE = [
  {id:'cushion',name:'柔軟睡墊',emoji:'🛏️',cost:40,slot:'bed',x:.5,y:.82,size:96},
  {id:'tent',name:'星星小帳篷',emoji:'⛺',cost:120,slot:'bed',x:.26,y:.8,size:92},
  {id:'sofa',name:'舒服小沙發',emoji:'🛋️',cost:100,slot:'bed',x:.74,y:.8,size:104},
  {id:'plant',name:'窗邊小盆栽',emoji:'🪴',cost:60,slot:'plant',x:.88,y:.8,size:56},
  {id:'cactus',name:'圓圓仙人掌',emoji:'🌵',cost:50,slot:'plant',x:.78,y:.9,size:50},
  {id:'lamp',name:'暖暖小夜燈',emoji:'🏮',cost:80,slot:'lamp',x:.1,y:.72,size:42},
  {id:'candle',name:'搖搖小蠟燭',emoji:'🕯️',cost:55,slot:'lamp',x:.2,y:.9,size:26},
  {id:'books',name:'晚安故事書',emoji:'📚',cost:40,slot:'toy',x:.22,y:.93,size:30},
  {id:'ball',name:'滾滾小皮球',emoji:'🧶',cost:30,slot:'toy',x:.33,y:.9,size:24},
  {id:'teddy',name:'軟綿綿泰迪熊',emoji:'🧸',cost:90,slot:'toy',x:.62,y:.92,size:34},
  {id:'palette',name:'彩繪小畫板',emoji:'🎨',cost:65,slot:'toy',x:.7,y:.93,size:30},
  {id:'frame',name:'溫暖小畫框',emoji:'🖼️',cost:50,slot:'wall',x:.12,y:.2,size:46},
  {id:'clock',name:'晚安小掛鐘',emoji:'🕰️',cost:70,slot:'wall',x:.3,y:.17,size:36},
  {id:'balloon',name:'飄飄小氣球',emoji:'🎈',cost:45,slot:'ceiling',x:.5,y:.07,size:44},
  {id:'carp',name:'小鯉魚旗',emoji:'🎏',cost:90,slot:'ceiling',x:.66,y:.1,size:58},
  {id:'radio',name:'睡前小收音機',emoji:'📻',cost:80,slot:'side',x:.58,y:.7,size:38},
  {id:'basket',name:'毛毯小籃子',emoji:'🧺',cost:45,slot:'side',x:.06,y:.9,size:42},
  {id:'piano',name:'迷你小鋼琴',emoji:'🎹',cost:150,slot:'side',x:.88,y:.64,size:66}
];
// The floor takes the lower part of the room. Pieces that stand on the floor can never be moved above it;
// wall and ceiling pieces can go anywhere in the room. Positions are fractions of the room (0-1, from the top left).
export const FLOOR_RATIO=0.44, FLOOR_TOP=1-FLOOR_RATIO;
export const FLOOR_SLOTS=['bed','plant','lamp','toy','side'];
const round3=n=>Math.round(n*1000)/1000;
// halfW and halfH are half of the piece's size as fractions of the room, so a piece never leaves the room.
export function clampSpot(slot,x,y,halfW=0,halfH=0) {
  const cx=Math.min(1-halfW,Math.max(halfW,Number(x)));
  const maxY=1-halfH,minY=Math.min(maxY,FLOOR_SLOTS.includes(slot)?FLOOR_TOP+0.02:halfH);
  return {x:cx,y:Math.min(maxY,Math.max(minY,Number(y)))};
}
// Every piece has its own starting spot, so several pieces of one kind never start on top of each other.
export const iconSize=f=>Math.round(26+(f.size-24)*0.3);
export const itemSpot=(furniture,layout={})=>layout[furniture.id]||{x:furniture.x,y:furniture.y};
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
export function createEconomy() {return {pet:null,credits:[],bonusCredits:[],transactions:[],inventory:[],placed:[],layout:{},affection:50,affectionAt:null,careDays:[]};}
export function normaliseEconomy(value) {
  const e=createEconomy();if(!value||typeof value!=='object')return e;
  if(value.pet&&PETS.some(p=>p.id===value.pet.id))e.pet={id:value.pet.id,name:String(value.pet.name||'小夥伴').slice(0,16)};
  const seen=new Set();
  e.credits=(Array.isArray(value.credits)?value.credits:[]).filter(c=>c&&/^\d{4}-\d{2}-\d{2}$/.test(c.night)&&!seen.has(c.night)&&seen.add(c.night)).map(c=>({...c,amount:20}));
  const bonusSeen=new Set();
  e.bonusCredits=(Array.isArray(value.bonusCredits)?value.bonusCredits:[]).filter(c=>c&&typeof c.id==='string'&&!bonusSeen.has(c.id)&&bonusSeen.add(c.id)&&['improvement','streak','group'].includes(c.type)&&Number.isSafeInteger(c.amount)&&c.amount>=0&&c.amount<=10000000).map(c=>({...c}));
  e.transactions=(Array.isArray(value.transactions)?value.transactions:[]).filter(t=>t&&Number.isInteger(t.cost)&&t.cost>0);
  e.inventory=[...new Set((Array.isArray(value.inventory)?value.inventory:[]).filter(id=>FURNITURE.some(f=>f.id===id)))];
  // The pieces standing in the room, any number of each kind. Older accounts stored one piece per spot; those carry over.
  const standing=Array.isArray(value.placed)?value.placed:Object.values(value.equipped&&typeof value.equipped==='object'?value.equipped:{});
  e.placed=[...new Set(standing.filter(id=>e.inventory.includes(id)))];
  // Where each owned piece was placed; anything unknown, out of range or in the wrong area is pulled back.
  for(const f of FURNITURE) {
    const spot=value.layout?.[f.id];
    if(!e.inventory.includes(f.id)||!spot||!Number.isFinite(spot.x)||!Number.isFinite(spot.y))continue;
    const c=clampSpot(f.slot,spot.x,spot.y);e.layout[f.id]={x:round3(c.x),y:round3(c.y)};
  }
  e.affection=Number.isFinite(value.affection)?Math.max(0,Math.min(100,value.affection)):50;
  // When the stored satisfaction was last set (it falls with time after that), and the days the pet was well looked after.
  e.affectionAt=typeof value.affectionAt==='string'&&Number.isFinite(Date.parse(value.affectionAt))?new Date(value.affectionAt).toISOString():null;
  e.careDays=[...new Set((Array.isArray(value.careDays)?value.careDays:[]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(-1500);
  return e;
}
export const balance = e => e.credits.length*20+(e.bonusCredits||[]).reduce((n,c)=>n+c.amount,0)-e.transactions.reduce((n,t)=>n+t.cost,0);
// Growth: an on-time night is worth 4 points and a well-cared-for day 2; every 16 points is a level.
// (Four on-time nights per level, exactly as before, when nothing else is counted.)
export const SLEEP_POINTS=4, CARE_POINTS=2, POINTS_PER_LEVEL=16;
export const growth = e => e.credits.length*SLEEP_POINTS+(e.careDays?.length||0)*CARE_POINTS;
export const level = e => 1+Math.floor(growth(e)/POINTS_PER_LEVEL);

// Satisfaction falls while the player is awake (never during their usual sleeping hours) and is raised by feeding.
export const RENAME_COST=20;
export const AFFECTION_FLOOR=20, CARE_LEVEL=70, FEED_GAIN=15, FEED_COST=5, DEFAULT_SLEEP={wake:'07:00',bed:'23:00'};
export const decayPerHour = lv => Math.min(2.5,2+0.1*(lv-1));
// Hours between two moments that fall in the awake part of the day. offset: minutes east of UTC of the player's clock.
export function awakeHours(fromMs,toMs,sleep={},offset=0) {
  const wake=min(timeOK(sleep.wake)?sleep.wake:DEFAULT_SLEEP.wake),bed=min(timeOK(sleep.bed)?sleep.bed:DEFAULT_SLEEP.bed);
  const awake=m=>wake===bed||(bed>wake?m>=wake&&m<bed:m>=wake||m<bed);
  const STEP=300000;let total=0;
  for(let t=fromMs;t<toMs;t+=STEP)if(awake((((Math.floor(t/60000)+offset)%1440)+1440)%1440))total+=Math.min(STEP,toMs-t);
  return total/3600000;
}
// The satisfaction shown right now: the stored value minus what the awake hours since then took away (never below the floor).
export function affectionNow(economy,now=Date.now(),sleep,offset=0) {
  const base=economy.affection,from=Date.parse(economy.affectionAt);
  if(!Number.isFinite(from)||now<=from)return base;
  const lost=awakeHours(Math.max(from,now-7*86400000),now,sleep,offset)*decayPerHour(level(economy));
  return Math.max(Math.min(base,AFFECTION_FLOOR),base-lost);
}
// Feeding: costs 5 coins (unless free), adds 15, and a day that reaches 70 counts as a day of good care.
export function careForPet(economy,{now=Date.now(),sleep,offset=0,day,free=false}={}) {
  const e=normaliseEconomy(economy);
  if(!e.pet)throw new Error('先選一位小夥伴吧。');
  const current=affectionNow(e,now,sleep,offset);
  if(current>=100)throw new Error('小夥伴已經很滿足了，先把金幣留起來吧。');
  if(!free&&balance(e)<FEED_COST)throw new Error('餵食需要 5 枚金幣，先完成一晚的睡前約定。');
  if(!free)e.transactions.push({type:'feed',cost:FEED_COST,at:new Date(now).toISOString()});
  e.affection=Math.min(100,Math.round(current+FEED_GAIN));e.affectionAt=new Date(now).toISOString();
  if(e.affection>=CARE_LEVEL&&/^\d{4}-\d{2}-\d{2}$/.test(day||'')&&!e.careDays.includes(day))e.careDays.push(day);
  return e;
}
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
  if(event.type==='rename') {
    const name=String(event.name||'').trim();
    if(!name||name.length>16)throw new Error('名字請填 1 到 16 個字。');
    if(name===e.pet.name)throw new Error('這已經是牠現在的名字了。');
    if(balance(e)<RENAME_COST)throw new Error(`更改名字需要 ${RENAME_COST} 枚金幣。`);
    e.transactions.push({type:'rename',cost:RENAME_COST,at:new Date(now).toISOString()});
    e.pet={...e.pet,name};return e;
  }
  const f=FURNITURE.find(f=>f.id===event.id);if(!f)throw new Error('找不到這件家具。');
  if(event.type==='buy') {
    if(e.inventory.includes(f.id))throw new Error('這件家具已經在你的收藏裡了。');
    if(balance(e)<f.cost)throw new Error('金幣還不夠，可以先慢慢存。');
    e.transactions.push({type:'furniture',id:f.id,cost:f.cost,at:new Date(now).toISOString()});e.inventory.push(f.id);e.placed.push(f.id);return e;
  }
  if(event.type==='equip') {
    if(!e.inventory.includes(f.id))throw new Error('先把這件家具帶回家。');
    if(e.placed.includes(f.id))e.placed=e.placed.filter(id=>id!==f.id);else e.placed.push(f.id);return e;
  }
  throw new Error('無法完成這個操作。');
}
