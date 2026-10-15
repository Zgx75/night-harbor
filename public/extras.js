import { PETS,FURNITURE,balance,level,normaliseEconomy,petTransaction,awardNight,assessNight,dailyReport,weeklyReport,formatClock,nightMinute,nightInstant,addDays,demoProfile,snapshotTargets } from './progress.js';

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
    const result=awardNight(state.economy,record,state.targets);state.economy=result.economy;state.reportAI=null;
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
    return `<section class="companion-strip"><a href="#pet" class="companion-peek"><span class="peek-emoji" aria-hidden="true">${p?.emoji||'🐾'}</span><span><strong>${pet?esc(pet.name)+'在這裡等你':'讓一位小夥伴陪你慢慢調整'}</strong><small>${pet?`Lv.${level(state.economy)} · ${balance(state.economy)} 枚金幣`:'選擇 emoji，按時上床就能養牠、布置房間。'}</small></span><span class="strip-arrow">${icon('arrow')}</span></a><a href="#reports" class="morning-peek"><span>${row?.bedAt?'☀':'☁'}</span><span><strong>${row?.bedAt?'看看今天的回報':'早晨，留一分鐘回顧昨晚'}</strong><small>${row?.bedAt?'今晚安排與每週變化，都在這裡。':'上床、睡眠評分與五個生活線索。'}</small></span></a></section>`;
  }
  function adoptionHTML() {
    const id=state.petDraft||state.economy.pet?.id||'cat';
    return `<form id="pet-form"><div class="pet-choices" role="group" aria-label="選擇你的寵物">${PETS.map(p=>`<button type="button" class="pet-choice ${id===p.id?'selected':''}" data-pet-choice="${p.id}" aria-pressed="${id===p.id}"><span aria-hidden="true">${p.emoji}</span><small>${p.name}</small></button>`).join('')}</div><label class="field" for="pet-name">給小夥伴取個名字<input id="pet-name" maxlength="16" required value="${esc(state.petNameDraft??state.economy.pet?.name??'') }" placeholder="例如：糯米"></label><div class="form-actions"><button class="button" type="submit">${state.economy.pet?'保存夥伴設定':'把夥伴帶回家'}${icon('check')}</button><span class="notice">更換 emoji 不會重設金幣或家具。</span></div></form>`;
  }
  function petHTML() {
    const e=state.economy,pet=e.pet,p=PETS.find(p=>p.id===pet?.id),pending=pendingRewards();
    const furniture=slot=>{const f=FURNITURE.find(f=>f.id===e.equipped[slot]);return f?`<span class="room-item room-${slot}" role="img" aria-label="${esc(f.name)}">${f.emoji}</span>`:'';};
    return `<div class="page-heading"><div><p class="eyebrow">GROW A LITTLE, REST A LITTLE</p><h1>我的小夥伴</h1><p>把每一個做得到的約定，變成牠生活裡的小美好。</p></div><span class="coin-wallet" aria-label="目前 ${balance(e)} 枚金幣">🪙 ${balance(e)}</span></div>${!pet?`<section class="panel"><h2>想和誰一起開始？</h2><p>選一個你喜歡的 emoji，小夥伴不會因為你晚睡就離開。</p>${adoptionHTML()}</section>`:`<section class="pet-room" aria-label="${esc(pet.name)}的房間"><div class="room-window" aria-hidden="true"><span>☾</span><i>✧</i></div><div class="room-caption"><span class="chip gold">Lv.${level(e)} · 一起完成 ${e.credits.length} 晚約定</span><h2>${esc(pet.name)}的小房間</h2><p>今天也一起，慢慢把日子過好。</p></div><div class="room-floor" aria-hidden="true"></div><div class="room-rug" aria-hidden="true"></div>${furniture('bed')}${furniture('plant')}${furniture('lamp')}${furniture('toy')}<span class="room-pet" role="img" aria-label="${esc(p.name)} ${esc(pet.name)}">${p.emoji}</span><span class="room-spark room-spark-one" aria-hidden="true">✧</span><span class="room-spark room-spark-two" aria-hidden="true">·</span></section><div class="pet-care"><div><span class="care-label">和你相處的滿足感</span><progress max="100" value="${e.affection}" aria-label="滿足感 ${e.affection} / 100"></progress><small>${e.affection} / 100 · 不會因為失眠扣分</small></div><button class="button gold-button" id="feed-pet" ${balance(e)<5||e.affection>=100?'disabled':''}>🥕 餵牠吃點心 · 5 枚</button></div>`}
    <section class="reward-note"><div><span class="reward-icon">🪙</span></div><div><h2>按時上床，一晚存下 20 枚金幣</h2><p>以前一晚事先保存的就寢目標為準，最晚可晚 15 分鐘。早晨填寫「上床準備睡覺」時間後自動領取；同一晚只領一次。</p><p class="notice">按時上床但睡不著，仍然有獎勵。不扣金幣、不讓寵物受罰。這版依自行回報，本機保存，未連接螢幕時間或穿戴裝置。</p>${pet?`<button class="button secondary small" id="claim-coins" ${pending.total?'':'disabled'}>${pending.total?`領取尚未入帳的 ${pending.total} 枚`:'目前沒有待領金幣'}</button>`:''}<a class="text-button reward-link" href="#plan">先設定今晚作息 →</a><a class="text-button reward-link" href="#logs">早晨回報昨晚 →</a></div></section>
    ${pet?`<div class="section-heading"><h2>替小房間添一點喜歡的東西</h2><small>購買後可擺放或收起</small></div><div class="shop-grid">${FURNITURE.map(f=>{const owned=e.inventory.includes(f.id),equipped=e.equipped[f.slot]===f.id;return `<article class="shop-card"><div class="furniture-emoji" aria-hidden="true">${f.emoji}</div><h3>${f.name}</h3><p>${owned?'已收藏':f.cost+' 枚金幣'}</p><button class="button ${owned?'secondary':''} small full-width" data-shop="${f.id}" data-shop-action="${owned?'equip':'buy'}" ${!owned&&balance(e)<f.cost?'disabled':''}>${owned?(equipped?'已擺放 · 收起':'擺進房間'):'帶回家'}</button></article>`;}).join('')}</div><section class="panel"><h2>存下的每一個小約定</h2>${e.credits.length?`<div class="table-wrap"><table><thead><tr><th>夜晚日期</th><th>原定目標</th><th>回報上床</th><th>入帳</th></tr></thead><tbody>${[...e.credits].reverse().slice(0,7).map(c=>`<tr><td>${when(c.night)}</td><td>${esc(c.target)}</td><td>${esc(c.bedAt)}</td><td class="gold-text">+20 枚</td></tr>`).join('')}</tbody></table></div>`:'<p>先替今晚設定目標，明早回報後就能存下第一筆金幣。</p>'}<details><summary>更換 emoji 或名字</summary>${adoptionHTML()}</details></section>`:''}`;
  }
  function sourceLinks(ids) {return ids.map(id=>state.knowledge.find(s=>s.id===id)).filter(Boolean).map(s=>`<a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.publisher)} ↗</a>`).join('');}
  function changeText(value,unit,positive='增加',negative='減少') {
    if(value==null)return '<span class="comparison-missing">兩段期間各需至少三筆可比較紀錄</span>';
    if(Math.abs(value)<0.05)return '<span class="comparison-neutral">與前七天相近</span>';
    return `<span class="${value>0?'comparison-good':'comparison-neutral'}">${value>0?positive:negative} ${Number.isInteger(value)?Math.abs(value):Math.abs(value).toFixed(1)}${unit}</span>`;
  }
  function dailyHTML(report) {
    const r=report.record,t=report.tonight;
    return `<div class="report-intro"><span class="chip gold">${when(report.night)} 晚間 → ${when(report.date)} 早晨</span><h2>${r?.bedAt?'昨晚的努力，我們有記下。':'早安，昨晚過得怎麼樣？'}</h2><p>${r?.bedAt?'回顧是為了替今天留一個做得到的方向。':'先回報上床、睡眠感受；還沒填的部分，就先留白。'}</p><a class="text-button" href="#logs">${r?'補充或修改昨晚紀錄':'填寫早晨回報'} →</a></div><div class="report-metrics"><article><small>依約上床</small><strong class="metric-text">${esc(report.adherence.label)}</strong><span>${report.adherence.target?'原定 '+esc(report.adherence.target):'需要睡前先設定目標'}</span></article><article><small>昨晚睡眠自評</small><strong>${report.quality==null?'—':report.quality+'<small> / 5</small>'}</strong><span>${report.quality==null?'尚未評分':'1 不好 · 5 很好'}</span></article><article><small>難入睡或夜醒</small><strong class="metric-text">${report.insomnia==='yes'?'有這種情況':report.insomnia==='no'?'沒有回報困擾':'尚未回報'}</strong><span>使用者的感受，非疾病診斷</span></article></div><section class="panel tonight-report"><p class="eyebrow">TONIGHT, ONE SMALL STEP</p><h2>今天可以怎麼安排？</h2>${t?`<div class="tonight-large"><span>${esc(t.bedtime)}</span><p>今晚建議上床<br><small>${esc(t.windDown)} 開始收心 · ${esc(t.dimLights)} 調暗燈光</small></p></div><p>${esc(state.plan.message)}</p>${state.planError?'<p class="notice">AI 分析未依最新資料更新，沿用本晚已保存目標。</p>':''}<a class="text-button" href="#plan">查看完整作息路徑 →</a>`:'<p>先在作息路徑填入通常就寢與起床時間，系統才能安排今晚。</p><a class="button secondary small" href="#plan">設定我的起點</a>'}</section><div class="section-heading"><h2>昨晚可以留意的五個線索</h2><small>相關線索，不是原因判定</small></div><div class="factor-grid">${report.factors.map(f=>`<article class="factor-card"><div><h3>${f.title}</h3><span class="factor-status ${f.flag?'observe':''}">${!f.known?'未知':f.flag?'可以觀察':'已有紀錄'}</span></div><p>${esc(f.evidence)}</p>${f.known?`<p class="factor-tip">${esc(f.tip)}</p>${sourceLinks(f.sourceIds)}`:'<p class="factor-tip">填寫後，才能和自己的睡眠感受一起看。</p>'}</article>`).join('')}</div><p class="notice">咖啡、運動、午睡對照起床前一天的行為；螢幕與情緒對照前一晚。沒有填寫不代表沒做，也不能由一晚的紀錄推論因果。</p>`;
  }
  function trendChart(trend) {
    let path='',previous=-2;
    trend.forEach((p,i)=>{if(p.quality==null)return;path+=`${previous===i-1?'L':'M'}${50+i*90},${160-(p.quality-1)*30} `;previous=i;});
    return `<svg class="recap-chart" viewBox="0 0 640 205" role="img" aria-label="最近七天睡眠自評趨勢，缺填不補零；詳細數字見下方表格">${[1,3,5].map(n=>`<line x1="45" x2="610" y1="${160-(n-1)*30}" y2="${160-(n-1)*30}" stroke="#343745"/><text x="15" y="${164-(n-1)*30}">${n}</text>`).join('')}<path d="${path}" fill="none" stroke="#c7b9e7" stroke-width="2"/>${trend.filter(p=>p.quality!=null).map(p=>`<circle cx="${50+trend.indexOf(p)*90}" cy="${160-(p.quality-1)*30}" r="5" fill="#e5ce9e"/>`).join('')}${trend.map((p,i)=>`<text x="${50+i*90}" y="190" text-anchor="middle">${when(p.date)}</text>`).join('')}</svg>`;
  }
  function weeklyHTML(report) {
    const c=report.current,p=report.previous,d=report.changes;
    return `<div class="report-intro"><span class="chip gold">${when(c.start)} — ${when(c.end)}</span><h2>一週的小改變，也值得被看見。</h2><p>最近七天 ${c.recordDays} 天紀錄，前七天 ${p.recordDays} 天。沒有填寫的晚上不算失敗。</p></div><div class="report-metrics"><article><small>按時上床</small><strong>${c.onTime}<small> / ${c.comparableDays} 晚</small></strong><span>${c.comparableDays?'只計有事前目標及上床回報的晚上':'尚無可核對的睡前目標'}</span></article><article><small>平均睡眠自評</small><strong>${n(c.quality)}<small> / 5</small></strong><span>${c.qualityCount} 晚有評分</span></article><article><small>平均上床時間</small><strong>${formatClock(c.bedtime)}</strong><span>${c.bedtimeCount} 晚自行回報 · 跨午夜計算</span></article></div><section class="panel"><div class="section-heading"><h2>七晚睡眠感受</h2><small>實際自評，缺填留白</small></div>${trendChart(report.trend)}${!c.qualityCount?'<p class="notice">還沒有睡眠評分，圖表不會預填示範資料。</p>':''}<div class="table-wrap"><table><thead><tr><th>起床日</th><th>上床</th><th>入睡</th><th>自評</th><th>依約</th><th>難入睡／夜醒</th></tr></thead><tbody>${report.trend.map(t=>`<tr><td>${when(t.date)}</td><td>${esc(t.bedAt||'—')}</td><td>${esc(t.sleepAt||'—')}</td><td>${t.quality==null?'—':t.quality+'/5'}</td><td>${t.adherence.status==='on-time'?'有':t.adherence.status==='late'?'較晚':'未知'}</td><td>${t.insomnia==='yes'?'有':t.insomnia==='no'?'無':'未知'}</td></tr>`).join('')}</tbody></table></div></section><section class="panel"><h2>和前七天比一比</h2><div class="table-wrap"><table class="comparison-table"><thead><tr><th>項目</th><th>前七天</th><th>最近七天</th><th>變化</th></tr></thead><tbody><tr><td>平均上床</td><td>${formatClock(p.bedtime)}</td><td>${formatClock(c.bedtime)}</td><td>${changeText(d.earlierBedtime==null?null:Math.round(d.earlierBedtime),' 分鐘','提早','延後')}</td></tr><tr><td>睡眠自評</td><td>${n(p.quality)}</td><td>${n(c.quality)}</td><td>${changeText(d.quality,' 分','提升','降低')}</td></tr><tr><td>按時上床比例</td><td>${p.onTimeRate==null?'—':Math.round(p.onTimeRate*100)+'%'}</td><td>${c.onTimeRate==null?'—':Math.round(c.onTimeRate*100)+'%'}</td><td>${changeText(d.onTimeRate==null?null:d.onTimeRate*100,' 個百分點','提升','降低')}</td></tr><tr><td>白天疲勞</td><td>${n(p.fatigue)}</td><td>${n(c.fatigue)}</td><td>${changeText(d.lessFatigue,' 分','減少','增加')}</td></tr><tr><td>自述難入睡／夜醒</td><td>${p.insomniaDays} / ${p.insomniaKnown} 晚</td><td>${c.insomniaDays} / ${c.insomniaKnown} 晚</td><td>只呈現已回報的晚數</td></tr></tbody></table></div><p class="notice">每項變化需兩段期間各至少三筆該項紀錄。變化可能有好有壞，不把單週差異當成 App 的療效。</p></section><section class="panel"><h2>哪些線索和困擾一起出現？</h2><div class="table-wrap"><table><thead><tr><th>線索</th><th>有填寫</th><th>可觀察情況</th><th>同晚也回報困擾</th></tr></thead><tbody>${report.factorSummary.map(f=>`<tr><td>${f.title}</td><td>${f.known} 晚</td><td>${f.flagged} 晚</td><td>${f.coReported} 晚</td></tr>`).join('')}</tbody></table></div><p class="notice">這是紀錄的同時出現次數，不是統計因果或風險分數。樣本少、缺填與不同情境都會影響觀察。</p></section>`;
  }
  function reportsHTML() {
    const mode=state.reportMode||'daily', date=localDate();
    const report=mode==='daily'?dailyReport(state.records,state.targets,date,state.plan):weeklyReport(state.records,state.targets,date);
    const key=JSON.stringify([mode,date,state.records,state.targets,state.settings]);
    const ai=state.reportAI?.key===key?state.reportAI.advice:null;
    const enough=mode==='daily'?Boolean(report.record?.bedAt||report.record?.sleepAt):report.current.recordDays>0;
    return `<div class="page-heading"><div><p class="eyebrow">LOOK BACK, MOVE GENTLY FORWARD</p><h1>睡眠回報</h1><p>每天一點回顧，每週看見有紀錄支持的變化。</p></div></div><div class="report-tabs" role="tablist" aria-label="回報週期"><button role="tab" aria-selected="${mode==='daily'}" data-report-mode="daily">每日回報</button><button role="tab" aria-selected="${mode==='weekly'}" data-report-mode="weekly">每週 recap</button></div>${mode==='daily'?dailyHTML(report):weeklyHTML(report)}<section class="panel ai-report"><p class="eyebrow">A FEW WORDS FOR YOUR NEXT STEP</p><h2>${mode==='daily'?'讓 AI 幫你整理今天':'讓 AI 幫你整理這一週'}</h2><p>結合紀錄與有來源的睡眠知識，整理可嘗試的下一步。</p><div class="form-actions"><button class="button" id="generate-report" ${state.reportBusy||!enough?'disabled':''}>${state.reportBusy?'正在整理回報…':mode==='daily'?'產生今日 AI 回報':'產生每週 AI recap'}${icon('sparkles')}</button><span class="notice">${enough?'點擊後，近期相關紀錄會交由 Gemini 分析。':'先填寫一筆睡眠回報，就能開始。'}</span></div>${state.reportError?`<div class="error-box" role="alert">${esc(state.reportError)}</div>`:''}${ai?`<div class="report-ai-result" aria-live="polite"><p class="answer-text">${esc(ai.answer)}</p>${ai.suggestions.map(s=>`<article class="advice-item"><h3>${esc(s.title)}</h3><p>${esc(s.detail)}</p>${s.sourceIds.map(id=>{const source=ai.sources.find(s=>s.id===id);return source?`<a class="source-link" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.publisher)} ↗</a>`:'';}).join('')}</article>`).join('')}<details><summary>查看此次檢索來源</summary>${ai.sources.map(s=>`<p><strong>${esc(s.id)} · ${esc(s.title)}</strong><br>${esc(s.text)}<br><a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">閱讀原始來源 ↗</a></p>`).join('')}</details></div>`:''}</section>`;
  }
  function bind(page) {
    $('#enter-demo')?.addEventListener('click',async()=>{
      if(state.demo){toast('目前已經在示範模式。');return;}
      if(state.session||state.busy||state.adviceBusy||state.reportBusy||state.planBusy){toast('先完成目前的對話或等待回覆，再切換示範。');return;}
      state.realBackup=structuredClone({records:state.records,targets:state.targets,economy:state.economy,settings:state.settings,closures:state.closures,aiPlan:state.aiPlan,plan:state.plan});
      Object.assign(state,demoProfile(localDate()),{demo:true,aiPlan:null,plan:null,advice:null,reportAI:null,reportError:'',flow:'home',selectedDate:'',petNameDraft:undefined,petDraft:undefined});
      const pending=ctx.updatePlan();location.hash='pet';render();await pending;render();toast('已進入虛構資料示範；原本資料不會被覆寫。');
    });
    $('#exit-demo')?.addEventListener('click',async()=>{
      if(state.busy||state.adviceBusy||state.reportBusy||state.planBusy){toast('等待這次回覆完成後，就能離開示範。');return;}
      if(state.session)api(`/api/sessions/${state.session}/close`,{}).catch(()=>{});
      const backup=state.realBackup;
      Object.assign(state,backup,{demo:false,realBackup:null,advice:null,reportAI:null,reportError:'',flow:'home',session:null,transcript:[],selectedDate:'',petNameDraft:undefined,petDraft:undefined});
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
      $$('[data-report-mode]').forEach(el=>el.addEventListener('click',()=>{state.reportMode=el.dataset.reportMode;state.reportError='';render();}));
      $('#generate-report')?.addEventListener('click',async()=>{
        if(state.reportBusy)return;
        const mode=state.reportMode||'daily',asOf=localDate(),key=JSON.stringify([mode,asOf,state.records,state.targets,state.settings]);
        const payload={mode,asOf,planNight:state.plan?.points?.[0]?.date,records:state.records,targets:state.targets,settings:state.settings};
        state.reportBusy=true;state.reportError='';render();
        try{const result=await api('/api/reports/advice',payload);state.reportAI={key,advice:result.advice};}
        catch(e){state.reportError=e.message;}
        finally{state.reportBusy=false;if(location.hash==='#reports')render();}
      });
    }
  }
  return {petHTML,reportsHTML,homeHTML,bind,rememberTarget,awardRecord};
}
