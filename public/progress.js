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
const avg = a => a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
export function formatClock(m) { if(m==null)return '—';m=Math.round(m);return `${String(Math.floor((m%1440)/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
export function createEconomy() {return {pet:null,credits:[],transactions:[],inventory:[],equipped:{},affection:50};}
export function normaliseEconomy(value) {
  const e=createEconomy();if(!value||typeof value!=='object')return e;
  if(value.pet&&PETS.some(p=>p.id===value.pet.id))e.pet={id:value.pet.id,name:String(value.pet.name||'小夥伴').slice(0,16)};
  const seen=new Set();
  e.credits=(Array.isArray(value.credits)?value.credits:[]).filter(c=>c&&/^\d{4}-\d{2}-\d{2}$/.test(c.night)&&!seen.has(c.night)&&seen.add(c.night)).map(c=>({...c,amount:20}));
  e.transactions=(Array.isArray(value.transactions)?value.transactions:[]).filter(t=>t&&Number.isInteger(t.cost)&&t.cost>0);
  e.inventory=[...new Set((Array.isArray(value.inventory)?value.inventory:[]).filter(id=>FURNITURE.some(f=>f.id===id)))];
  for(const f of FURNITURE)if(value.equipped?.[f.slot]===f.id&&e.inventory.includes(f.id))e.equipped[f.slot]=f.id;
  e.affection=Number.isFinite(value.affection)?Math.max(0,Math.min(100,value.affection)):50;
  return e;
}
export const balance = e => e.credits.length*20-e.transactions.reduce((n,t)=>n+t.cost,0);
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
export function factorClues(records,date) {
  const row=records.find(r=>r.date===date)||{}, prior=records.find(r=>r.date===addDays(date,-1))||{};
  const night=addDays(date,-1),bed=timeOK(row.bedAt)?nightInstant(night,nightMinute(row.bedAt)):null;
  const gap=t=>bed==null||!timeOK(t)?null:(bed-nightInstant(night,min(t)))/3600000;
  const caffeineGap=gap(prior.caffeineAt),exerciseGap=gap(prior.exerciseAt);
  return [
    {id:'caffeine',title:'咖啡因',known:Boolean(prior.caffeineAt),flag:caffeineGap!=null&&caffeineGap>=0&&caffeineGap<=8,evidence:prior.caffeineAt?`前一天最後記錄 ${prior.caffeineAt}`:'前一天的咖啡因時間未填',tip:'可觀察下午、晚間飲用與自己的睡眠感受。',sourceIds:['K1']},
    {id:'exercise',title:'運動',known:Boolean(prior.exerciseAt),flag:prior.exerciseIntensity==='vigorous'&&exerciseGap!=null&&exerciseGap>=0&&exerciseGap<=1,evidence:prior.exerciseAt?`前一天運動結束 ${prior.exerciseAt}${prior.exerciseIntensity==='vigorous'?' · 較高強度':''}`:'前一天的運動時間未填',tip:'留意強度及距離就寢的間隔，並非所有晚間運動都會妨礙睡眠。',sourceIds:['K3','K7']},
    {id:'screen',title:'睡前螢幕',known:row.screenMinutes!=null,flag:row.screenMinutes>0,evidence:row.screenMinutes!=null?`睡前一小時使用 ${row.screenMinutes} 分鐘`:'睡前螢幕時間未填',tip:'可以先試著把睡前最後一段螢幕時間換成安靜活動。',sourceIds:['K8']},
    {id:'mood',title:'睡前情緒',known:row.mood!=null,flag:row.mood>=4,evidence:row.mood!=null?`緊繃程度 ${row.mood} / 5`:'睡前情緒未填',tip:'把還掛心的事寫成明天的一個小步驟。',sourceIds:['K4']},
    {id:'nap',title:'白天午睡',known:prior.napMinutes!=null,flag:prior.napMinutes>20,evidence:prior.napMinutes!=null?`前一天午睡 ${prior.napMinutes} 分鐘`:'前一天午睡時長未填',tip:'如果夜間難入睡，可以觀察較短、較早的午睡是否更適合自己。',sourceIds:['K9']}
  ];
}
export function dailyReport(records,targets,date,plan,now=Date.now()) {
  const row=records.find(r=>r.date===date)||null;
  return {date,night:addDays(date,-1),record:row,adherence:assessNight(row,targets,now),factors:factorClues(records,date),tonight:plan?.points?.[0]||null,insomnia:row?.insomnia||'unknown',quality:row?.sleepQuality??null};
}
function windowStats(records,targets,start,end,now) {
  const rows=records.filter(r=>r.date>=start&&r.date<=end),assessments=rows.map(r=>assessNight(r,targets,now));
  const comparable=assessments.filter(r=>['on-time','late'].includes(r.status));
  const quality=rows.filter(r=>r.sleepQuality!=null).map(r=>r.sleepQuality);
  const fatigue=rows.filter(r=>r.fatigue!=null).map(r=>r.fatigue);
  const bedtimes=rows.filter(r=>timeOK(r.bedAt)&&nightMinute(r.bedAt)>=1080&&nightMinute(r.bedAt)<=1800).map(r=>nightMinute(r.bedAt));
  const sleep=rows.filter(r=>timeOK(r.sleepAt)&&nightMinute(r.sleepAt)>=1080&&nightMinute(r.sleepAt)<=1800).map(r=>nightMinute(r.sleepAt));
  const symptoms=rows.filter(r=>r.insomnia==='yes'||r.insomnia==='no');
  return {start,end,rows,recordDays:rows.length,quality:avg(quality),qualityCount:quality.length,fatigue:avg(fatigue),fatigueCount:fatigue.length,bedtime:avg(bedtimes),bedtimeCount:bedtimes.length,sleepAt:avg(sleep),sleepAtCount:sleep.length,onTime:comparable.filter(r=>r.status==='on-time').length,comparableDays:comparable.length,onTimeRate:comparable.length?comparable.filter(r=>r.status==='on-time').length/comparable.length:null,insomniaDays:symptoms.filter(r=>r.insomnia==='yes').length,insomniaKnown:symptoms.length};
}
export function weeklyReport(records,targets,end,now=Date.now()) {
  const current=windowStats(records,targets,addDays(end,-6),end,now), previous=windowStats(records,targets,addDays(end,-13),addDays(end,-7),now);
  const compare=(key,count,invert=false)=>current[count]>=3&&previous[count]>=3?(invert?previous[key]-current[key]:current[key]-previous[key]):null;
  const trend=Array.from({length:7},(_,i)=>{const date=addDays(end,i-6),r=current.rows.find(r=>r.date===date);return {date,bedAt:r?.bedAt||'',sleepAt:r?.sleepAt||'',quality:r?.sleepQuality??null,insomnia:r?.insomnia||'unknown',adherence:assessNight(r,targets,now)};});
  const factorSummary=['caffeine','exercise','screen','mood','nap'].map(id=>{
    const all=current.rows.map(r=>({r,f:factorClues(records,r.date).find(f=>f.id===id)}));
    return {id,title:all[0]?.f.title||({caffeine:'咖啡因',exercise:'運動',screen:'睡前螢幕',mood:'睡前情緒',nap:'白天午睡'}[id]),known:all.filter(x=>x.f.known).length,flagged:all.filter(x=>x.f.flag).length,coReported:all.filter(x=>x.f.flag&&x.r.insomnia==='yes').length};
  });
  return {current,previous,trend,factorSummary,changes:{earlierBedtime:compare('bedtime','bedtimeCount',true),quality:compare('quality','qualityCount'),lessFatigue:compare('fatigue','fatigueCount',true),onTimeRate:compare('onTimeRate','comparableDays')}};
}

export function demoProfile(today) {
  const records=[],targets={};
  for(let i=0;i<14;i++) {
    const date=addDays(today,i-13),night=addDays(date,-1),recent=i>=7;
    const bed=recent?1465+(i%3)*10:1535+(i%3)*10,target=recent?'00:45':'01:30';
    records.push({date,bedAt:formatClock(bed),sleepAt:formatClock(bed+20+(i%3)*10),wakeAt:'08:30',sleepQuality:recent?[3,4,4,3,4,5,4][i-7]:[2,2,3,2,3,2,3][i],insomnia:recent?(i===8||i===11?'yes':'no'):(i%2===0?'yes':'no'),mood:recent?2:4,fatigue:recent?2:4,screenMinutes:recent?15:50,caffeineAt:recent?'12:00':'18:00',exerciseAt:'19:00',exerciseIntensity:'moderate',napMinutes:recent?15:45});
    targets[night]={bedtime:target,createdAt:new Date(nightInstant(night,1080)).toISOString()};
  }
  let economy=petTransaction(createEconomy(),{type:'adopt',id:'fox',name:'栗子（示範）'});
  for(const row of records)economy=awardNight(economy,row,targets,nightInstant(today,1440)).economy;
  return {records,targets,economy,settings:{currentBedtime:'01:30',targetBedtime:'23:30',wakeTime:'08:30',reminders:false,saveClosures:true},closures:[]};
}
