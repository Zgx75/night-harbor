import { lineText, weeklySummary, weeklySuggestion, weeklyRecapDue, monthlySummary, monthlySuggestion, monthlyRecapDue } from './responses.js';
import { weekFactors, hoursText, LEGACY_BAND_LABELS } from './factor-survey.js';
import { PETS,FURNITURE,balance,level,normaliseEconomy,petTransaction,awardNight,assessNight,formatClock,nightMinute,nightInstant,addDays,demoProfile,snapshotTargets } from './progress.js';

export function createExtras(ctx) {
  const {state,api,persist,render,toast,esc,icon,localDate}=ctx;
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const when=s=>new Date(s+'T12:00:00').toLocaleDateString('zh-TW',{month:'numeric',day:'numeric'});
  const n=value=>value==null?'—':Number(value).toFixed(1);
  function rememberTarget() {
    if(state.plan?.source!=='gemini')return;
    const next=snapshotTargets(state.targets,(state.plan?.points||[]).slice(0,1).map(p=>({...p,source:'gemini',reason:state.plan.message})));
    if(JSON.stringify(next)===JSON.stringify(state.targets))return;
    state.targets=next;persist();
  }
  function awardRecord(record) {
    const result=awardNight(state.economy,record,state.targets);state.economy=result.economy;
    return result.awarded?result.reason:'';
  }
  function pendingRewards() {
    let economy=state.economy,total=0;
    for(const row of state.records){const r=awardNight(economy,row,state.targets);economy=r.economy;total+=r.awarded;}
    return {economy,total};
  }
  function applyPet(event,message) {
    try{
      const old=state.economy;state.economy=petTransaction(old,event);
      if(!persist()){state.economy=old;return;}
      render();toast(message);
    }catch(e){toast(e.message);}
  }
  function homeHTML() {
    const pet=state.economy.pet,p=PETS.find(p=>p.id===pet?.id),row=state.records.find(r=>r.date===localDate());
    return `<section class="companion-strip"><a href="#pet" class="companion-peek"><span class="peek-emoji" aria-hidden="true">${p?.emoji||'🐾'}</span><span><strong>${pet?esc(pet.name)+'在這裡等你':'讓一位小夥伴陪你慢慢調整'}</strong><small>${pet?`Lv.${level(state.economy)} · ${balance(state.economy)} 枚金幣`:'選擇 emoji，按時上床就能養牠、布置房間。'}</small></span><span class="strip-arrow">${icon('arrow')}</span></a><a href="${row?.bedAt?'#pet':'#logs'}" class="morning-peek"><span>${row?.bedAt?'☀':'☁'}</span><span><strong>${row?.bedAt?'看看夥伴想對你說什麼':'早晨，留幾秒回報昨晚'}</strong><small>${row?.bedAt?'今天的回應在寵物房間裡。':'只要上床時間與睡眠品質。'}</small></span></a></section>`;
  }
  function adoptionHTML() {
    const id=state.petDraft||state.economy.pet?.id||'cat';
    return `<form id="pet-form"><div class="pet-choices" role="group" aria-label="選擇你的寵物">${PETS.map(p=>`<button type="button" class="pet-choice ${id===p.id?'selected':''}" data-pet-choice="${p.id}" aria-pressed="${id===p.id}"><span aria-hidden="true">${p.emoji}</span><small>${p.name}</small></button>`).join('')}</div><label class="field" for="pet-name">給小夥伴取個名字<input id="pet-name" maxlength="16" required value="${esc(state.petNameDraft??state.economy.pet?.name??'') }" placeholder="例如：糯米"></label><div class="form-actions"><button class="button" type="submit">${state.economy.pet?'保存夥伴設定':'把夥伴帶回家'}${icon('check')}</button><span class="notice">更換 emoji 不會重設金幣或家具。</span></div></form>`;
  }
  function petHTML() {
    const e=state.economy,pet=e.pet,p=PETS.find(p=>p.id===pet?.id),pending=pendingRewards();
    const furniture=slot=>{const f=FURNITURE.find(f=>f.id===e.equipped[slot]);return f?`<span class="room-item room-${slot}" role="img" aria-label="${esc(f.name)}">${f.emoji}</span>`:'';};
    return `<div class="page-heading"><div><p class="eyebrow">GROW A LITTLE, REST A LITTLE</p><h1>我的小夥伴</h1><p>把每一個做得到的約定，變成牠生活裡的小美好。</p></div><span class="coin-wallet" aria-label="目前 ${balance(e)} 枚金幣">🪙 ${balance(e)}</span></div>${!pet?`<section class="panel"><h2>想和誰一起開始？</h2><p>選一個你喜歡的 emoji，小夥伴不會因為你晚睡就離開。</p>${adoptionHTML()}</section>`:`<section class="pet-room" aria-label="${esc(pet.name)}的房間"><div class="room-window" aria-hidden="true"><span>☾</span><i>✧</i></div><div class="room-caption"><span class="chip gold">Lv.${level(e)} · 一起完成 ${e.credits.length} 晚約定</span><h2>${esc(pet.name)}的小房間</h2><p>今天也一起，慢慢把日子過好。</p></div><div class="room-floor" aria-hidden="true"></div><div class="room-rug" aria-hidden="true"></div>${furniture('bed')}${furniture('plant')}${furniture('lamp')}${furniture('toy')}${todayLine()?`<p class="pet-bubble" role="status"><span class="visually-hidden">${esc(pet.name)}說：</span>${esc(todayLine())}</p>`:''}<span class="room-pet" role="img" aria-label="${esc(p.name)} ${esc(pet.name)}">${p.emoji}</span><span class="room-spark room-spark-one" aria-hidden="true">✧</span><span class="room-spark room-spark-two" aria-hidden="true">·</span></section><div class="pet-care"><div><span class="care-label">和你相處的滿足感</span><progress max="100" value="${e.affection}" aria-label="滿足感 ${e.affection} / 100"></progress><small>${e.affection} / 100 · 不會因為失眠扣分</small></div><button class="button gold-button" id="feed-pet" ${balance(e)<5||e.affection>=100?'disabled':''}>🥕 餵牠吃點心 · 5 枚</button></div>`}
    <section class="reward-note"><div><span class="reward-icon">🪙</span></div><div><h2>按時上床，一晚存下 20 枚金幣</h2><p>以前一晚事先保存的就寢目標為準，最晚可晚 15 分鐘。早晨填寫「上床準備睡覺」時間後自動領取；同一晚只領一次。</p><p class="notice">按時上床但睡不著，仍然有獎勵。不扣金幣、不讓寵物受罰。依自行回報並保存至帳號，未連接螢幕時間或穿戴裝置。</p>${pet?`<button class="button secondary small" id="claim-coins" ${pending.total?'':'disabled'}>${pending.total?`領取尚未入帳的 ${pending.total} 枚`:'目前沒有待領金幣'}</button>`:''}<a class="text-button reward-link" href="#plan">先設定今晚作息 →</a><a class="text-button reward-link" href="#logs">早晨回報昨晚 →</a></div></section>
    ${pet?`<div class="section-heading"><h2>替小房間添一點喜歡的東西</h2><small>購買後可擺放或收起</small></div><div class="shop-grid">${FURNITURE.map(f=>{const owned=e.inventory.includes(f.id),equipped=e.equipped[f.slot]===f.id;return `<article class="shop-card"><div class="furniture-emoji" aria-hidden="true">${f.emoji}</div><h3>${f.name}</h3><p>${owned?'已收藏':f.cost+' 枚金幣'}</p><button class="button ${owned?'secondary':''} small full-width" data-shop="${f.id}" data-shop-action="${owned?'equip':'buy'}" ${!owned&&balance(e)<f.cost?'disabled':''}>${owned?(equipped?'已擺放 · 收起':'擺進房間'):'帶回家'}</button></article>`;}).join('')}</div><section class="panel"><h2>存下的每一個小約定</h2>${e.credits.length?`<div class="table-wrap"><table><thead><tr><th>夜晚日期</th><th>原定目標</th><th>回報上床</th><th>入帳</th></tr></thead><tbody>${[...e.credits].reverse().slice(0,7).map(c=>`<tr><td>${when(c.night)}</td><td>${esc(c.target)}</td><td>${esc(c.bedAt)}</td><td class="gold-text">+20 枚</td></tr>`).join('')}</tbody></table></div>`:'<p>先替今晚設定目標，明早回報後就能存下第一筆金幣。</p>'}<details><summary>更換 emoji 或名字</summary>${adoptionHTML()}</details></section>`:''}`;
  }
  const todayLine=()=>state.petFeedback?.date===localDate()&&state.economy.pet?lineText(state.petFeedback.id):'';
  function sourceLinks(ids) {return ids.map(id=>state.knowledge.find(s=>s.id===id)).filter(Boolean).map(s=>`<a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.publisher)} ↗</a>`).join('');}
  function changeText(value,unit,positive='增加',negative='減少') {
    if(value==null)return '<span class="comparison-missing">兩段期間各需至少三筆可比較紀錄</span>';
    if(Math.abs(value)<0.05)return '<span class="comparison-neutral">與前七天相近</span>';
    return `<span class="${value>0?'comparison-good':'comparison-neutral'}">${value>0?positive:negative} ${Number.isInteger(value)?Math.abs(value):Math.abs(value).toFixed(1)}${unit}</span>`;
  }
  function trendChart(trend) {
    let path='',previous=-2;
    trend.forEach((p,i)=>{if(p.quality==null)return;path+=`${previous===i-1?'L':'M'}${50+i*90},${160-(p.quality-1)*30} `;previous=i;});
    return `<svg class="recap-chart" viewBox="0 0 640 205" role="img" aria-label="最近七天睡眠自評趨勢，缺填不補零；詳細數字見下方表格">${[1,3,5].map(n=>`<line x1="45" x2="610" y1="${160-(n-1)*30}" y2="${160-(n-1)*30}" stroke="#343745"/><text x="15" y="${164-(n-1)*30}">${n}</text>`).join('')}<path d="${path}" fill="none" stroke="#c7b9e7" stroke-width="2"/>${trend.filter(p=>p.quality!=null).map(p=>`<circle cx="${50+trend.indexOf(p)*90}" cy="${160-(p.quality-1)*30}" r="5" fill="#e5ce9e"/>`).join('')}${trend.map((p,i)=>`<text x="${50+i*90}" y="190" text-anchor="middle">${when(p.date)}</text>`).join('')}</svg>`;
  }
  const PERIODS={
    weekly:{word:'這一週',whole:'整週',next:'下週',eyebrow:'A FEW WORDS FOR YOUR NEXT WEEK',every:'每週更新一次',key:'weeklyRecap',summary:weeklySummary,fixed:weeklySuggestion,due:weeklyRecapDue,api:'/api/reports/weekly'},
    monthly:{word:'這個月',whole:'整個月',next:'下個月',eyebrow:'A FEW WORDS FOR THE NEXT STAGE',every:'每 28 天更新一次',key:'monthlyRecap',summary:monthlySummary,fixed:monthlySuggestion,due:monthlyRecapDue,api:'/api/reports/monthly'}
  };
  // Factors come only from follow-ups after late nights, so they are labelled that way.
  function factorsHTML(f,kind) {
    if(!f.rounds)return '';
    return `<section class="panel"><h2>偏離日曾回報的因素</h2>${f.factors.length?`<ul class="factor-list">${f.factors.map(x=>`<li><span>${esc(x.label)}</span><small>${x.times} 次</small></li>`).join('')}</ul>`:'<p>比較晚的那幾天，你回答「沒有特別不一樣」。</p>'}${gapsHTML(f)}<p class="notice">只在比目標晚的日子詢問，代表那幾天曾出現，不是晚睡的原因，也不代表${PERIODS[kind].whole}的狀況。</p></section>`;
  }
  // Reported times converted to hours before the average bedtime on those late nights.
  function gapsHTML(f) {
    const rows=[...f.caffeine.map(c=>`咖啡因：最後一杯約 ${esc(c.lastAt)}，距離那幾晚上床${hoursText(c.hoursBeforeBed)}`),...f.exercise.map(e=>`運動：${e.endAt?`約 ${esc(e.endAt)} 結束`:`${LEGACY_BAND_LABELS[e.endBand]}結束`}，距離那幾晚上床${hoursText(e.hoursBeforeBed)}`)];
    return rows.length?`<ul class="gap-list">${rows.map(r=>`<li>${r}</li>`).join('')}</ul><p class="notice">用回報的時間對照那幾個偏離日的平均上床時間換算，只描述那幾晚；每個人受影響的程度不同，這裡不判斷多久才算夠。</p>`:'';
  }
  function recapHTML(kind,summary) {
    const P=PERIODS[kind], r=state[P.key], fixed=`<p class="answer-text">${esc(P.fixed(summary))}</p>`;
    const sourceLink=s=>`<a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.publisher)} ↗</a>`;
    let body;
    if(state[kind+'Busy'])body=`<p class="notice" role="status">正在整理${P.word}的回顧…</p>`;
    else if(r&&!state.demo)body=`<p class="notice">${when(r.start)} — ${when(r.end)} 的回顧 · ${P.every}</p><p class="answer-text">${esc(r.answer)}</p>${r.suggestion?`<article class="advice-item"><h3>${P.next}可以試試：${esc(r.suggestion.title)}</h3><p>${esc(r.suggestion.detail)}</p>${r.sources.map(sourceLink).join('')}</article>`:''}<p class="notice">由 AI 根據上面的統計與追問整理，不是醫療建議；數字以程式計算為準。</p>`;
    else if(!summary.complete)body=fixed;
    else body=`${fixed}${state[kind+'Error']?`<p class="notice">AI 回顧暫時無法產生（${esc(state[kind+'Error'])}），先顯示固定建議，下次開啟會再試。</p>`:state.demo?'<p class="notice">示範模式不產生 AI 回顧。</p>':''}`;
    return `<section class="panel ai-report"><p class="eyebrow">${P.eyebrow}</p><h2>${P.word}的回顧</h2>${body}</section>`;
  }
  // Generates the reply once per period (7 or 28 days) when the period has enough data.
  async function maybeRecap(kind) {
    const P=PERIODS[kind], date=localDate();
    if(state.demo||state[kind+'Busy']||state[kind+'Tried']===date||!navigator.onLine||!P.due(state[P.key],date))return;
    if(!P.summary(state.records,state.targets,date).complete)return;
    state[kind+'Busy']=true;state[kind+'Error']='';state[kind+'Tried']=date;render();
    try{
      const body={asOf:date,records:state.records,targets:state.targets,factorSurveys:state.factorSurveys||[],...(kind==='monthly'?{previousRecap:state.monthlyRecap}:{})};
      const recap=await api(P.api,body);
      if(!state.demo){state[P.key]=recap;persist();}
    }catch(e){state[kind+'Error']=e.message;}
    finally{state[kind+'Busy']=false;if(location.hash==='#reports')render();}
  }
  function monthlyHTML() {
    const m=monthlySummary(state.records,state.targets,localDate());
    const change=v=>v==null?'兩週各需至少三筆':Math.abs(v)<1?'差不多':v>0?`提早 ${Math.round(v)} 分鐘`:`延後 ${Math.round(-v)} 分鐘`;
    return `<div class="report-intro"><span class="chip gold">${when(m.start)} — ${when(m.end)}</span><h2>二十八天，慢慢看見自己的節奏。</h2><p>這二十八天有 ${m.validDays} 天回報上床時間。沒有填寫的晚上不算失敗，也不補值。</p></div>${m.complete?'':`<p class="notice period-missing">完整月報需要最近二十八天至少 ${m.minDays} 天有上床紀錄，目前 ${m.validDays} 天。目前資料還不夠，我們會繼續觀察你的作息。</p>`}
    <div class="report-metrics period-metrics"><article><small>目標達標率</small><strong>${m.onTimeRate==null?'—':Math.round(m.onTimeRate*100)+'%'}</strong><span>${m.onTime} 晚達標 · ${m.late} 晚偏離</span></article><article><small>作息變化</small><strong class="metric-text">${change(m.earlierBedtime)}</strong><span>第一週到第四週的平均上床時間</span></article><article><small>上床時間穩定度</small><strong class="metric-text">${m.bedtimeSpread==null?'需至少七筆':`約 ±${Math.round(m.bedtimeSpread)} 分鐘`}</strong><span>越小越規律</span></article><article><small>平均睡眠品質</small><strong>${n(m.quality)}<small> / 5</small></strong><span>${m.qualityCount} 晚有評分</span></article></div>
    <section class="panel"><h2>每週平均上床時間</h2><div class="table-wrap"><table><thead><tr><th>週次</th><th>日期</th><th>上床紀錄</th><th>平均上床</th><th>達標／偏離</th></tr></thead><tbody>${m.weeks.map((w,i)=>`<tr><td>第 ${i+1} 週</td><td>${when(w.start)}–${when(w.end)}</td><td>${w.validDays} 天</td><td>${w.bedtime==null?'資料不足':formatClock(w.bedtime)}</td><td>${w.onTime} / ${w.late}</td></tr>`).join('')}</tbody></table></div><p class="notice">每週平均需至少三筆紀錄；時間跨午夜計算。</p></section>
    ${factorsHTML(weekFactors(state.factorSurveys||[],m.start,m.end,state.records),'monthly')}${recapHTML('monthly',m)}`;
  }
  function weeklyHTML() {
    const w=weeklySummary(state.records,state.targets,localDate());
    const minutes=(v,early,later)=>v==null?'與上週比較需各至少三筆':Math.abs(v)<1?'與上週差不多':v>0?`${early} ${Math.round(v)} 分鐘`:`${later} ${Math.round(-v)} 分鐘`;
    const points=v=>v==null?'與上週比較需各至少三筆':Math.abs(v)<0.05?'與上週差不多':`比上週${v>0?'提升':'降低'} ${Math.abs(v).toFixed(1)} 分`;
    const status=x=>x==='on-time'?'達標':x==='late'?'偏離':'—';
    const chart=trendChart(w.days.map(d=>({date:d.date,quality:d.quality})));
    return `<div class="report-intro"><span class="chip gold">${when(w.start)} — ${when(w.end)}</span><h2>一週的小改變，也值得被看見。</h2><p>最近七天有 ${w.validDays} 天回報上床時間。沒有填寫的晚上不算失敗，也不補值。</p></div>${w.complete?'':`<p class="notice period-missing">完整週報需要最近七天至少 ${w.minDays} 天有上床紀錄，目前 ${w.validDays} 天。以下先列出已有的紀錄，不做結論。</p>`}
    <div class="report-metrics period-metrics"><article><small>達標／偏離</small><strong>${w.onTime}<small> 晚達標</small> · ${w.late}<small> 晚偏離</small></strong><span>${w.comparable?'偏離指比當晚目標晚超過 15 分鐘':'尚無可核對的睡前目標'}</span></article><article><small>平均上床時間</small><strong>${formatClock(w.bedtime)}</strong><span>${minutes(w.changes.earlierBedtime,'比上週早','比上週晚')}</span></article><article><small>上床時間穩定度</small><strong class="metric-text">${w.bedtimeSpread==null?'需至少三筆':`約 ±${Math.round(w.bedtimeSpread)} 分鐘`}</strong><span>每晚上床時間的差異，越小越規律</span></article><article><small>平均睡眠品質</small><strong>${n(w.quality)}<small> / 5</small></strong><span>${w.qualityCount} 晚有評分 · ${points(w.changes.quality)}</span></article></div>
    <section class="panel"><div class="section-heading"><h2>這七晚</h2><small>自行回報，缺填留白</small></div>${chart}<div class="table-wrap"><table><thead><tr><th>起床日</th><th>上床時間</th><th>睡眠品質</th><th>依約</th></tr></thead><tbody>${w.days.map(d=>`<tr><td>${when(d.date)}</td><td>${esc(d.bedAt||'—')}</td><td>${d.quality==null?'—':d.quality+'/5'}</td><td>${status(d.status)}</td></tr>`).join('')}</tbody></table></div></section>
    ${factorsHTML(weekFactors(state.factorSurveys||[],w.start,w.end,state.records),'weekly')}${recapHTML('weekly',w)}`;
  }
  function reportsHTML() {
    const mode=state.reportMode==='monthly'?'monthly':'weekly';
    return `<div class="page-heading"><div><p class="eyebrow">LOOK BACK, MOVE GENTLY FORWARD</p><h1>睡眠回報</h1><p>每天的回報交給小夥伴；這裡看每週、每月有紀錄支持的變化。</p></div></div><div class="report-tabs" role="tablist" aria-label="回報週期"><button role="tab" aria-selected="${mode==='weekly'}" data-report-mode="weekly">每週回顧</button><button role="tab" aria-selected="${mode==='monthly'}" data-report-mode="monthly">每月回顧</button></div>${mode==='monthly'?monthlyHTML():weeklyHTML()}`;
  }
  function bind(page) {
    $('#enter-demo')?.addEventListener('click',async()=>{
      if(state.demo){toast('目前已經在示範模式。');return;}
      if(state.adviceBusy||state.planBusy||state.weeklyBusy||state.monthlyBusy){toast('先等待目前的分析完成，再切換示範。');return;}
      state.realBackup=structuredClone({records:state.records,targets:state.targets,economy:state.economy,settings:state.settings,closures:state.closures,aiPlan:state.aiPlan,plan:state.plan,onboarding:state.onboarding,petFeedback:state.petFeedback,factorSurveys:state.factorSurveys,weeklyRecap:state.weeklyRecap,monthlyRecap:state.monthlyRecap});
      Object.assign(state,demoProfile(localDate()),{demo:true,aiPlan:null,plan:null,advice:null,flow:'home',selectedDate:'',petNameDraft:undefined,petDraft:undefined});
      const pending=ctx.updatePlan();location.hash='pet';render();await pending;render();toast('已進入虛構資料示範；原本資料不會被覆寫。');
    });
    $('#exit-demo')?.addEventListener('click',async()=>{
      if(state.adviceBusy||state.planBusy||state.weeklyBusy||state.monthlyBusy){toast('等待這次回覆完成後，就能離開示範。');return;}
      const backup=state.realBackup;
      Object.assign(state,backup,{demo:false,realBackup:null,advice:null,flow:'home',closureId:null,action:'',note:'',selectedDate:'',petNameDraft:undefined,petDraft:undefined});
      await ctx.updatePlan();render();toast('已回到原本的資料。');
    });
    if(page==='pet') {
      $$('[data-pet-choice]').forEach(el=>el.addEventListener('click',()=>{state.petNameDraft=$('#pet-name')?.value||'';state.petDraft=el.dataset.petChoice;render();}));
      $('#pet-form')?.addEventListener('submit',e=>{e.preventDefault();state.petNameDraft=$('#pet-name').value;applyPet({type:'adopt',id:state.petDraft||state.economy.pet?.id||'cat',name:state.petNameDraft},'小夥伴準備好陪你一起開始了。');});
      $('#feed-pet')?.addEventListener('click',()=>applyPet({type:'feed'},'小夥伴開心地吃了點心。'));
      $$('[data-shop]').forEach(el=>el.addEventListener('click',()=>applyPet({type:el.dataset.shopAction,id:el.dataset.shop},el.dataset.shopAction==='buy'?'新家具已經帶回家。':'房間布置已更新。')));
      $('#claim-coins')?.addEventListener('click',()=>{const result=pendingRewards(),old=state.economy;state.economy=result.economy;if(!persist()){state.economy=old;return;}render();toast(result.total?`已入帳 ${result.total} 枚金幣。`:'這些晚上的金幣已經領過了。');});
    }
    if(page==='reports') {
      setTimeout(()=>maybeRecap(state.reportMode==='monthly'?'monthly':'weekly'));
      $$('[data-report-mode]').forEach(el=>el.addEventListener('click',()=>{state.reportMode=el.dataset.reportMode;render();}));
    }
  }
  return {petHTML,reportsHTML,homeHTML,bind,rememberTarget,awardRecord};
}
