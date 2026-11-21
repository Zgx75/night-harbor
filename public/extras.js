import { lineText, weeklySummary, weeklySuggestion, weeklyRecapDue, monthlySummary, monthlySuggestion, monthlyRecapDue } from './responses.js';
import { weekFactors, hoursText, LEGACY_BAND_LABELS } from './factor-survey.js';
import { PETS,FURNITURE,careForPet,RENAME_COST,affectionNow,growth as growthPoints,POINTS_PER_LEVEL,SLEEP_POINTS,CARE_POINTS,CARE_LEVEL,itemSpot,clampSpot,iconSize,FLOOR_RATIO,balance,level,normaliseEconomy,petTransaction,awardNight,assessNight,formatClock,nightMinute,nightInstant,addDays,snapshotTargets } from './progress.js';

export function createExtras(ctx) {
  const {state,api,persist,render,toast,esc,icon,localDate,userId,confirmAction,groupRoom}=ctx;
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const when=s=>new Date(s+'T12:00:00').toLocaleDateString('zh-TW',{month:'numeric',day:'numeric'});
  const n=value=>value==null?'—':Number(value).toFixed(1);
  // TEMP, for trying out the shop: coins are unlimited, so buying and feeding cost nothing.
  // Set this to false to bring the real coin economy back. It only affects this browser's pet and shop;
  // the server's coin ledger and the group coins are untouched.
  const UNLIMITED_COINS=true;
  const canAfford=(e,cost)=>UNLIMITED_COINS||balance(e)>=cost;
  const coinText=e=>UNLIMITED_COINS?'∞':balance(e);
  // With unlimited coins the purchase runs against a stand-in balance and leaves no charge behind.
  function spend(economy,event) {
    if(!UNLIMITED_COINS)return petTransaction(economy,event);
    const next=petTransaction({...economy,bonusCredits:[...economy.bonusCredits,{id:'test-funds',type:'group',amount:1000000}]},event);
    return {...next,bonusCredits:economy.bonusCredits,transactions:economy.transactions};
  }
  // The room pages show either my own pet or the pet I raise with my group; these helpers pick the right data.
  // The group's coins are the team's real balance from the server (the test switch above only affects my own).
  let roomKind='me';
  const inGroup=()=>roomKind==='group';
  const groupData=()=>groupRoom?.data()||null;
  const roomEconomy=()=>inGroup()?(groupData()?.economy||null):state.economy;
  const roomBalance=()=>inGroup()?(groupData()?.balance??0):balance(state.economy);
  const roomUnlimited=()=>inGroup()?Boolean(groupData()?.unlimited):UNLIMITED_COINS;
  const roomCoinText=()=>inGroup()?(groupData()?.unlimited?'∞':String(roomBalance())):coinText(state.economy);
  const roomCoinWords=()=>roomUnlimited()?'無限':String(roomBalance());
  const roomAfford=cost=>inGroup()?(Boolean(groupData()?.unlimited)||roomBalance()>=cost):canAfford(state.economy,cost);
  const roomDay=()=>inGroup()?new Date(Date.now()+8*3600000).toISOString().slice(0,10):localDate();
  const stageKey=()=>inGroup()?`night-harbor-pet-stage-group-${groupData()?.id}`:`night-harbor-pet-stage-${userId}`;
  const shopHash=()=>inGroup()?'#groupshop':'#shop';
  const canRename=()=>!inGroup()||groupData()?.ownerId===userId;
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
  function applyPet(event,message) {
    try{
      const old=state.economy;state.economy=spend(old,event);
      if(!persist()){state.economy=old;return;}
      render();toast(message);
    }catch(e){toast(e.message);}
  }
  function adoptionHTML() {
    const id=state.petDraft||state.economy.pet?.id||'cat';
    return `<form id="pet-form"><div class="pet-choices" role="group" aria-label="選擇你的寵物">${PETS.map(p=>`<button type="button" class="pet-choice ${id===p.id?'selected':''}" data-pet-choice="${p.id}" aria-pressed="${id===p.id}"><span aria-hidden="true">${p.emoji}</span><small>${p.name}</small></button>`).join('')}</div><label class="field" for="pet-name">給小夥伴取個名字<input id="pet-name" maxlength="16" required value="${esc(state.petNameDraft??state.economy.pet?.name??'') }" placeholder="例如：糯米"></label><div class="form-actions"><button class="button" type="submit">把夥伴帶回家${icon('check')}</button><span class="notice">領養後不能更換種類，但之後可以花金幣改名字。</span></div></form>`;
  }
  // The pet grows in three stages: Lv.1-3 small, Lv.4-7 medium, Lv.8 and up large (sizes live in layout.css).
  // The last stage this device showed is remembered per account, so reaching a new one is celebrated once.
  const stageOf=lv=>lv>=8?3:lv>=4?2:1;
  let growth=null;
  function currentStage(pet) {
    const stage=stageOf(level(roomEconomy()));
    const key=stageKey();
    let seen=0;
    try{seen=Number(localStorage.getItem(key))||0;}catch{/* Remembering is optional. */}
    if(seen&&stage>seen)growth={name:pet.name};
    if(seen!==stage){try{localStorage.setItem(key,String(stage));}catch{/* Remembering is optional. */}}
    return stage;
  }
  // Placing furniture: drag a piece, or focus it and use the arrow keys. Nothing is saved until "完成".
  // "我的倉庫": every piece the player owns. Pieces in the room show "收起"; the others are faded and show "放入".
  function warehouseHTML() {
    const owned=FURNITURE.filter(f=>roomEconomy().inventory.includes(f.id));
    const inRoom=owned.filter(f=>state.placedDraft.includes(f.id)).length;
    const cards=owned.map(f=>{
      const here=state.placedDraft.includes(f.id);
      return `<article class="warehouse-item ${here?'is-in':'is-out'}"><span class="warehouse-emoji" data-icon="${iconSize(f)}" aria-hidden="true">${f.emoji}</span><h3>${f.name}</h3><small>${here?'在房間裡':'在倉庫裡'}</small><button class="button ${here?'secondary':''} small full-width" type="button" data-warehouse="${f.id}">${here?'收起':'放入'}</button></article>`;
    }).join('');
    return `<section class="panel warehouse"><div class="section-heading"><h2>${inGroup()?'共養倉庫':'我的倉庫'}</h2><small>房間裡 ${inRoom} 件 · 共 ${owned.length} 件</small></div>${owned.length?`<div class="warehouse-grid">${cards}</div>`:'<p>倉庫還是空的。<a class="text-button" href="${shopHash()}">去商店逛逛 →</a></p>'}</section>`;
  }
  function roomTools() {
    if(state.decorating)return `<div class="room-tools"><p>拖曳物品來擺放，也可以點選物品後用方向鍵微調（加按 Shift 移動較遠）。地面的家具只能放在地板上。</p><button class="button small" type="button" id="decorate-save">完成</button><button class="button secondary small" type="button" id="decorate-reset">還原預設位置</button><button class="text-button" type="button" id="decorate-cancel">取消</button></div>${warehouseHTML()}`;
    return roomEconomy().inventory.length?'':`<div class="room-tools"><p>先到${inGroup()?'共養':''}商店帶一件家具回家，就能開始佈置。</p></div>`;
  }
  // The page's security policy forbids inline style attributes, so positions are applied from script.
  function placeItems() {
    const room=$('.pet-room');if(!room)return;
    room.style.setProperty('--floor',FLOOR_RATIO*100+'%');
    for(const el of $$('.room-item[data-x]')){el.style.left=(el.dataset.x*100)+'%';el.style.top=(el.dataset.y*100)+'%';el.style.setProperty('--s',el.dataset.size);}
    sizeIcons();
  }
  // Shop and warehouse pictures keep the pieces' relative sizes (applied from script: the page forbids inline styles).
  function sizeIcons() {for(const el of $$('[data-icon]'))el.style.fontSize=el.dataset.icon+'px';}
  // The pet's name is a button: clicking it opens a small form that renames the pet for a few coins.
  const nameButton=name=>`<button type="button" class="pet-name" id="rename-pet" title="點一下更改名字（${RENAME_COST} 枚金幣）" aria-label="${esc(name)}，點一下更改名字，需要 ${RENAME_COST} 枚金幣">${esc(name)}<span class="pet-name-edit" aria-hidden="true">✎</span></button>`;
  // The pet's (or the group pet's) name is paid for with that pet's coins; only the group's owner renames the group pet.
  async function renamePet(name) {
    if(inGroup()){await groupRoom.act({type:'rename',name});return;}
    const old=state.economy;
    state.economy=spend(old,{type:'rename',name});
    if(!persist()){state.economy=old;throw new Error('名字還沒有保存，請稍後再試。');}
  }
  function bindRename() {
    const open=$('#rename-pet');if(!open)return;
    const heading=open.closest('h2');
    const close=()=>{heading.innerHTML=nameButton(roomEconomy().pet.name);bindRename();};
    open.addEventListener('click',()=>{
      const affordable=roomAfford(RENAME_COST);
      heading.innerHTML=`<form class="rename-form" id="rename-form"><input id="rename-input" maxlength="16" required value="${esc(roomEconomy().pet.name)}" aria-label="新的名字"><button class="button small" type="submit" ${affordable?'':'disabled'}>更改名字 · ${RENAME_COST} 🪙</button><button class="text-button" type="button" id="rename-cancel">取消</button>${affordable?'':'<span class="rename-note">金幣不足</span>'}</form>`;
      const input=$('#rename-input');input.focus();input.select();
      $('#rename-cancel').addEventListener('click',close);
      input.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
      $('#rename-form').addEventListener('submit',async event=>{
        event.preventDefault();
        const name=input.value.trim();
        if(!name||name.length>16){toast('名字請填 1 到 16 個字。');return;}
        if(name===roomEconomy().pet.name){close();return;}
        if(!await confirmAction('確定要改名嗎？',`要把「${roomEconomy().pet.name}」改成「${name}」，會花費 ${RENAME_COST} 🪙${inGroup()?'（共養金幣）':''}。`,'確定改名','再想想'))return;
        try{await renamePet(name);}catch(error){toast(error.message);return;}
        // Updated in place so the pet keeps walking where it is.
        close();
        const species=PETS.find(item=>item.id===roomEconomy().pet.id);
        $('.pet-room')?.setAttribute('aria-label',`${name}的房間`);
        if(!inGroup()){const subtitle=$('.page-heading p');if(subtitle)subtitle.textContent=`我和${name}的專屬房間`;}
        $('.room-pet')?.setAttribute('aria-label',`${species.name} ${name}，點一下會抖一抖`);
        refreshCare();
        toast(`已把名字改成「${name}」。`);
      });
    });
  }
  function bindDecorate() {
    const room=$('.pet-room');if(!room||!state.decorating)return;
    const draft=state.layoutDraft;
    for(const el of $$('[data-furniture]')) {
      const f=FURNITURE.find(x=>x.id===el.dataset.furniture);
      const put=(x,y)=>{
        const box=room.getBoundingClientRect(),c=clampSpot(f.slot,x,y,el.offsetWidth/2/box.width,el.offsetHeight/2/box.height);
        draft[f.id]={x:Math.round(c.x*1000)/1000,y:Math.round(c.y*1000)/1000};
        el.style.left=(c.x*100)+'%';el.style.top=(c.y*100)+'%';
      };
      let grab=null;
      el.addEventListener('pointerdown',event=>{
        if(event.button>0)return;
        event.preventDefault();el.setPointerCapture(event.pointerId);el.focus({preventScroll:true});
        const b=el.getBoundingClientRect();grab={dx:event.clientX-(b.left+b.width/2),dy:event.clientY-(b.top+b.height/2)};
        el.classList.add('is-dragging');
      });
      el.addEventListener('pointermove',event=>{
        if(!grab)return;
        const box=room.getBoundingClientRect();put((event.clientX-grab.dx-box.left)/box.width,(event.clientY-grab.dy-box.top)/box.height);
      });
      const release=()=>{grab=null;el.classList.remove('is-dragging');};
      el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);
      el.addEventListener('keydown',event=>{
        const step=event.shiftKey?0.06:0.02,move={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[event.key];
        if(!move)return;
        event.preventDefault();const now=itemSpot(f,draft);put(now.x+move[0],now.y+move[1]);
      });
    }
  }
  // Satisfaction falls with the awake hours since it was last set, so it is always worked out from the clock.
  // My pet follows my own waking hours; the group's pet follows Taiwan's clock with the default waking hours.
  const sleepOf=()=>({wake:state.settings.wakeTime,bed:state.settings.currentBedtime});
  const clockOffset=()=>-new Date().getTimezoneOffset();
  const moodNow=()=>{const e=roomEconomy();return e?Math.round(affectionNow(e,Date.now(),inGroup()?undefined:sleepOf(),inGroup()?480:clockOffset())):0;};
  const moodNote=mood=>{
    const done=roomEconomy().careDays.includes(roomDay());
    return `${mood} / 100 · ${inGroup()?'白天（07:00–23:00）會慢慢下降':'清醒時會慢慢下降，睡覺時不扣'}${done?' · 今天的照顧完成 ✓':mood<40?' · 有點想你了':''}`;
  };
  // Brings the care area, level and stage up to date without drawing the page again (which would restart the pet's walk).
  function refreshCare() {
    const e=roomEconomy(),bar=$('#mood-bar');
    if(!e?.pet||!bar)return;
    const mood=moodNow(),lv=level(e);
    bar.value=mood;bar.setAttribute('aria-label',`滿足感 ${mood} / 100`);
    $('#mood-note').textContent=moodNote(mood);
    const into=growthPoints(e)%POINTS_PER_LEVEL,levelBar=$('#growth-bar');
    if(levelBar){levelBar.value=into;levelBar.setAttribute('aria-label',`距離下一級的成長進度 ${into} / ${POINTS_PER_LEVEL}`);}
    const button=$('#feed-pet');if(button)button.disabled=!roomAfford(5)||mood>=100;
    const levelText=$('#level-text');if(levelText)levelText.textContent=`Lv.${lv} · 一起完成 ${e.credits.length} 晚約定`;
    const wallet=$('.coin-wallet');if(wallet){wallet.textContent=`🪙 ${roomCoinText()}`;wallet.setAttribute('aria-label',`目前 ${roomCoinWords()} 枚金幣`);}
    const pet=$('.room-pet'),stage=stageOf(lv);
    if(pet&&Number(pet.dataset.stage)!==stage){
      pet.dataset.stage=stage;
      try{localStorage.setItem(stageKey(),String(stage));}catch{/* Remembering is optional. */}
    }
  }
  setInterval(refreshCare,60000);
  // A group page needs the group first: say so while it loads, or when there is no group.
  function groupMissingHTML() {
    return `<div class="page-heading"><div><h1>共養夥伴</h1></div></div>${groupRoom?.ready()?'<section class="panel"><p>你目前沒有共養小組。</p><div class="form-actions"><a class="button secondary small" href="#social">到好友頁建立或加入</a></div></section>':'<p class="notice">正在讀取共養夥伴…</p>'}`;
  }
  // The button under my own room that leads to the group's room.
  function groupEntryHTML() {
    const g=groupData();
    if(!g?.economy?.pet||state.decorating)return '';
    return `<a class="button secondary group-entry" href="#group">${esc(g.economy.pet.name)}的房間 →</a>`;
  }
  function syncGroupEntry() {const slot=$('#group-entry');if(slot)slot.innerHTML=groupEntryHTML();}
  function petHTML(kind='me') {
    roomKind=kind;
    if(inGroup()&&!groupData())return groupMissingHTML();
    const e=roomEconomy(),pet=e.pet,p=PETS.find(p=>p.id===pet?.id),stage=pet?currentStage(pet):1,mood=moodNow(),g=groupData();
    const layout=state.decorating?state.layoutDraft:e.layout,placed=state.decorating?state.placedDraft:e.placed;
    const furniture=()=>FURNITURE.filter(f=>placed.includes(f.id)).map(f=>{
      const spot=itemSpot(f,layout),place=`data-x="${spot.x}" data-y="${spot.y}" data-size="${f.size}"`;
      return state.decorating
        ?`<span class="room-item room-${f.slot} is-decorating" role="button" tabindex="0" data-furniture="${f.id}" ${place} aria-label="${esc(f.name)}，拖曳或用方向鍵移動">${f.emoji}</span>`
        :`<span class="room-item room-${f.slot}" role="img" ${place} aria-label="${esc(f.name)}">${f.emoji}</span>`;
    }).join('');
    const others=inGroup()?g.members.filter(m=>m.id!==userId).map(m=>`@${esc(m.username)}`):[];
    const heading=`<div class="page-heading"><div><h1>${inGroup()?esc(g.name):'我的小夥伴'}</h1>${inGroup()?`<p>${others.length?`我和${others.join('、')}的專屬房間`:'目前只有我的專屬房間，到好友頁邀請朋友一起照顧吧'}</p>`:pet?`<p>我和${esc(pet.name)}的專屬房間</p>`:''}</div><span class="coin-wallet" aria-label="目前 ${roomCoinWords()} 枚金幣">🪙 ${roomCoinText()}</span></div>`;
    if(!pet)return `${heading}<section class="panel"><h2>想和誰一起開始？</h2><p>選一個你喜歡的 emoji，小夥伴不會因為你晚睡就離開。</p>${adoptionHTML()}</section>`;
    const actions=state.decorating?'':`<span class="nameplate-actions"><a class="button small shop-entry" href="${shopHash()}">${icon('shop')}商店</a><button class="button secondary small decorate-open" type="button" id="decorate-start">佈置房間</button></span>`;
    const nameplate=`<div class="pet-nameplate"><h2>${canRename()?nameButton(pet.name):esc(pet.name)}</h2><span class="chip gold"><span id="level-text">Lv.${level(e)} · 一起完成 ${e.credits.length} 晚約定</span><progress id="growth-bar" class="growth-bar" max="${POINTS_PER_LEVEL}" value="${growthPoints(e)%POINTS_PER_LEVEL}" aria-label="距離下一級的成長進度 ${growthPoints(e)%POINTS_PER_LEVEL} / ${POINTS_PER_LEVEL}"></progress></span>${actions}</div>`;
    const bubble=!inGroup()&&todayLine()?`<p class="pet-bubble" role="status"><span class="visually-hidden">${esc(pet.name)}說：</span>${esc(todayLine())}</p>`:'';
    const room=`<section class="pet-room${state.decorating?' is-decorating':''}" aria-label="${esc(pet.name)}的房間"><div class="room-window" aria-hidden="true"><span>☾</span><i>✧</i></div><div class="room-floor" aria-hidden="true"></div><div class="room-rug" aria-hidden="true"></div>${furniture()}${state.decorating?'':`${bubble}<button type="button" class="room-pet" data-stage="${stage}" aria-label="${esc(p.name)} ${esc(pet.name)}，點一下會抖一抖"><span class="pet-body">${p.emoji}</span></button>`}<span class="room-spark room-spark-one" aria-hidden="true">✧</span><span class="room-spark room-spark-two" aria-hidden="true">·</span></section>`;
    // Under the room: my room has the way to the group's room, and the group's room has the way back.
    const entry=inGroup()?(state.decorating?'':'<div class="group-entry-slot"><a class="button secondary group-entry" href="#pet">← 我的房間</a></div>'):`<div id="group-entry" class="group-entry-slot">${groupEntryHTML()}</div>`;
    const care=`<div class="pet-care"><div><span class="care-label">${inGroup()?'和大家相處的滿足感':'和你相處的滿足感'}</span><progress id="mood-bar" max="100" value="${mood}" aria-label="滿足感 ${mood} / 100"></progress><small id="mood-note">${moodNote(mood)}</small></div><button class="button gold-button" id="feed-pet" ${!roomAfford(5)||mood>=100?'disabled':''}>🥕 餵牠吃點心 · 5 🪙</button></div>`;
    return `${heading}${nameplate}${room}${entry}${roomTools()}${care}`;
  }
  function shopHTML(kind='me') {
    roomKind=kind;
    if(inGroup()&&!groupData())return groupMissingHTML();
    const e=roomEconomy(),pet=e.pet;
    const heading=`<div class="page-heading"><div><h1>${inGroup()?'共養商店':'商店'}</h1>${pet?`<p>專屬${esc(pet.name)}房間的商店</p>`:''}</div><span class="coin-wallet" aria-label="目前 ${roomCoinWords()} 枚金幣">🪙 ${roomCoinText()}</span></div>`;
    if(!pet)return `${heading}<section class="panel"><h2>先領養一位小夥伴</h2><p>有了小夥伴，才能替牠布置房間。</p><div class="form-actions"><a class="button secondary small" href="#pet">去選一位夥伴</a></div></section>`;
    const cards=FURNITURE.map(f=>{
      const owned=e.inventory.includes(f.id),equipped=e.placed.includes(f.id);
      return `<article class="shop-card"><div class="furniture-emoji" data-icon="${iconSize(f)}" aria-hidden="true">${f.emoji}</div><h3>${f.name}</h3><p>${owned?'已收藏':f.cost+' 枚金幣'}</p><button class="button ${owned?(equipped?'placed':'gold-button'):''} small full-width" data-shop="${f.id}" data-shop-action="${owned?'equip':'buy'}" ${!owned&&!roomAfford(f.cost)?'disabled':''}>${owned?(equipped?'已擺放 · 收起':'擺進房間'):'帶回家'}</button></article>`;
    }).join('');
    return `${heading}<div class="section-heading"><h2>${'替小房間添一點喜歡的東西'}</h2><small>購買後可擺放或收起</small></div><div class="shop-grid">${cards}</div>`;
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
    weekly:{word:'這一週',whole:'整週',next:'下週',every:'每週更新一次',key:'weeklyRecap',summary:weeklySummary,fixed:weeklySuggestion,due:weeklyRecapDue,api:'/api/reports/weekly'},
    monthly:{word:'這個月',whole:'整個月',next:'下個月',every:'每 28 天更新一次',key:'monthlyRecap',summary:monthlySummary,fixed:monthlySuggestion,due:monthlyRecapDue,api:'/api/reports/monthly'}
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
    else if(r)body=`<p class="notice">${when(r.start)} — ${when(r.end)} 的回顧 · ${P.every}</p><p class="answer-text">${esc(r.answer)}</p>${r.suggestion?`<article class="advice-item"><h3>${P.next}可以試試：${esc(r.suggestion.title)}</h3><p>${esc(r.suggestion.detail)}</p>${r.sources.map(sourceLink).join('')}</article>`:''}<p class="notice">由 AI 根據上面的統計與追問整理，不是醫療建議；數字以程式計算為準。</p>`;
    else if(!summary.complete)body=fixed;
    else body=`${fixed}${state[kind+'Error']?`<p class="notice">AI 回顧暫時無法產生（${esc(state[kind+'Error'])}），先顯示固定建議，下次開啟會再試。</p>`:''}`;
    return `<section class="panel ai-report"><h2>${P.word}的回顧</h2>${body}</section>`;
  }
  // Generates the reply once per period (7 or 28 days) when the period has enough data.
  async function maybeRecap(kind) {
    const P=PERIODS[kind], date=localDate();
    if(state[kind+'Busy']||state[kind+'Tried']===date||!navigator.onLine||!P.due(state[P.key],date))return;
    if(!P.summary(state.records,state.targets,date).complete)return;
    state[kind+'Busy']=true;state[kind+'Error']='';state[kind+'Tried']=date;render();
    try{
      const body={asOf:date,records:state.records,targets:state.targets,factorSurveys:state.factorSurveys||[],...(kind==='monthly'?{previousRecap:state.monthlyRecap}:{})};
      const recap=await api(P.api,body);
      state[P.key]=recap;persist();
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
    return `<div class="page-heading"><div><h1>睡眠回報</h1><p>每天的回報交給小夥伴；這裡看每週、每月有紀錄支持的變化。</p></div></div><div class="report-tabs" role="tablist" aria-label="回報週期"><button role="tab" aria-selected="${mode==='weekly'}" data-report-mode="weekly">每週回顧</button><button role="tab" aria-selected="${mode==='monthly'}" data-report-mode="monthly">每月回顧</button></div>${mode==='monthly'?monthlyHTML():weeklyHTML()}`;
  }
  // The pet strolls around the floor of its room and shakes a few times when it is touched.
  // Its motion is the point of this page, so it keeps moving even when the system asks for reduced motion.
  let wanderTimer=0,spot=null,reactUntil=0,petReact=null;
  const SHAKE_MS=700,HEART_MS=1800,LEAVE_MS=250;
  const rand=(a,b)=>a+Math.random()*(b-a);
  function stopWander() {clearTimeout(wanderTimer);wanderTimer=0;petReact=null;}
  function startWander() {
    stopWander();
    const room=$('.pet-room'),pet=room?.querySelector('.room-pet');
    if(!room||!pet)return;
    // Keep the whole (clickable) pet inside the room, whatever stage it is in.
    const limits=()=>{const half=pet.offsetWidth/2;return {minX:half,maxX:Math.max(half*2,room.clientWidth-half),minY:-4,maxY:Math.max(24,(room.querySelector('.room-floor')?.offsetHeight||110)-34)};};
    const place=(x,y,seconds)=>{
      pet.style.setProperty('--walk',seconds+'s');pet.style.setProperty('--pet-x',x+'px');pet.style.setProperty('--pet-y',y+'px');
      spot={x,y};
    };
    // A re-render brings a fresh element: put it back where the pet was instead of snapping to the middle.
    const first=limits();
    place(Math.min(first.maxX,Math.max(first.minX,spot?.x??room.clientWidth/2)),Math.min(first.maxY,Math.max(first.minY,spot?.y??(first.minY+first.maxY)/2)),0);
    const rest=()=>{
      if(!pet.isConnected)return;
      pet.classList.remove('is-walking');
      wanderTimer=setTimeout(walk,rand(500,3200));
    };
    const walk=()=>{
      if(!pet.isConnected)return;
      if(document.hidden||Date.now()<reactUntil){wanderTimer=setTimeout(walk,700);return;}
      const l=limits();
      // Sometimes a short step, sometimes a long stroll; sometimes slow, sometimes quick.
      const reach=Math.random()<0.45?rand(30,110):rand(110,Math.max(160,room.clientWidth*0.7)),angle=rand(0,Math.PI*2);
      const x=Math.min(l.maxX,Math.max(l.minX,spot.x+Math.cos(angle)*reach)),y=Math.min(l.maxY,Math.max(l.minY,spot.y+Math.sin(angle)*reach*0.5));
      const distance=Math.hypot(x-spot.x,y-spot.y);
      // Facing a wall: choose another direction soon.
      if(distance<12){wanderTimer=setTimeout(walk,300);return;}
      const speed=rand(22,120),seconds=Math.min(7,Math.max(0.5,distance/speed));
      pet.style.setProperty('--hop',(0.7-0.45*((speed-22)/98)).toFixed(2)+'s');
      pet.classList.add('is-walking');place(x,y,seconds);
      wanderTimer=setTimeout(rest,seconds*1000);
    };
    // Touch, feeding and growing up all react the same way: shake, a heart bubble, the bubble fades, then the pet walks on.
    const react=()=>{
      if(!pet.isConnected||Date.now()<reactUntil)return;
      reactUntil=Date.now()+SHAKE_MS+HEART_MS;
      // Stop where it is, then shake on the spot.
      const r=pet.getBoundingClientRect(),box=room.getBoundingClientRect();
      place(r.left+r.width/2-box.left,box.bottom-r.bottom,0);
      pet.classList.remove('is-walking','is-shaking');void pet.offsetWidth;pet.classList.add('is-shaking');
      clearTimeout(wanderTimer);
      wanderTimer=setTimeout(()=>{
        pet.classList.remove('is-shaking');
        const heart=document.createElement('span');
        heart.className='pet-heart';heart.setAttribute('role','status');
        heart.innerHTML='<span class="visually-hidden">牠很開心</span><span aria-hidden="true">❤️</span>';
        pet.append(heart);
        wanderTimer=setTimeout(()=>{
          heart.classList.add('is-leaving');
          wanderTimer=setTimeout(()=>{heart.remove();rest();},LEAVE_MS);
        },HEART_MS-LEAVE_MS);
      },SHAKE_MS);
    };
    petReact=react;
    pet.addEventListener('click',react);
    pet.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')react();});
    wanderTimer=setTimeout(walk,700);
    if(growth){
      const grown=growth;growth=null;
      setTimeout(()=>{if(pet.isConnected){react();toast(`${grown.name} 長大了！`);}},600);
    }
  }
  // Feeding updates the page in place: a full re-render would drop the pet at its walking destination.
  async function feedPet() {
    if(inGroup()) {
      const before=level(roomEconomy());
      try{await groupRoom.act({type:'feed'});}catch(error){toast(error.message);return;}
      refreshCare();
      if(petReact)petReact();
      if(level(roomEconomy())>before)toast(`共養夥伴升到 Lv.${level(roomEconomy())}！`);
      return;
    }
    const old=state.economy,before=level(old);
    try{state.economy=careForPet(old,{sleep:sleepOf(),offset:clockOffset(),day:localDate(),free:UNLIMITED_COINS});}catch(error){toast(error.message);return;}
    if(!persist()){state.economy=old;return;}
    refreshCare();
    if(petReact)petReact();
    if(level(state.economy)>before)toast(`小夥伴升到 Lv.${level(state.economy)}！`);
  }
  let lastRoomPage='';
  function bind(page) {
    const roomPage=page==='pet'||page==='group';
    if(!roomPage){stopWander();state.decorating=false;lastRoomPage='';}
    else if(page!==lastRoomPage){state.decorating=false;lastRoomPage=page;}
    if(roomPage) {
      roomKind=page==='group'?'group':'me';
      if(inGroup()&&!groupData())return;
      if(!inGroup()&&state.economy.pet&&!state.economy.affectionAt){state.economy={...state.economy,affectionAt:new Date().toISOString()};persist();}
      placeItems();
      bindRename();
      if(state.decorating){stopWander();bindDecorate();}else startWander();
      $('#decorate-start')?.addEventListener('click',()=>{
        const e=roomEconomy();
        if(!e.inventory.length){toast(`先到${inGroup()?'共養':''}商店帶一件家具回家，就能開始佈置。`);return;}
        state.decorating=true;state.layoutDraft={...e.layout};state.placedDraft=[...e.placed];render();
      });
      $('#decorate-cancel')?.addEventListener('click',()=>{state.decorating=false;state.layoutDraft=null;state.placedDraft=null;render();});
      $('#decorate-reset')?.addEventListener('click',()=>{state.layoutDraft={};render();});
      // Putting a piece in or taking it out only changes the draft; "完成" keeps it.
      $$('[data-warehouse]').forEach(el=>el.addEventListener('click',()=>{
        const id=el.dataset.warehouse,list=state.placedDraft,top=window.scrollY;
        state.placedDraft=list.includes(id)?list.filter(x=>x!==id):[...list,id];
        render();window.scrollTo(0,top);
      }));
      $('#decorate-save')?.addEventListener('click',async()=>{
        if(inGroup()) {
          try{await groupRoom.act({type:'layout',placed:state.placedDraft,layout:state.layoutDraft});}catch(error){toast(error.message);return;}
        } else {
          const old=state.economy;state.economy=normaliseEconomy({...old,placed:state.placedDraft,layout:state.layoutDraft});
          if(!persist()){state.economy=old;return;}
        }
        state.decorating=false;state.layoutDraft=null;state.placedDraft=null;render();toast('房間的佈置已保存。');
      });
      $$('[data-pet-choice]').forEach(el=>el.addEventListener('click',()=>{state.petNameDraft=$('#pet-name')?.value||'';state.petDraft=el.dataset.petChoice;render();}));
      $('#pet-form')?.addEventListener('submit',e=>{e.preventDefault();state.petNameDraft=$('#pet-name').value;applyPet({type:'adopt',id:state.petDraft||state.economy.pet?.id||'cat',name:state.petNameDraft},'小夥伴準備好陪你一起開始了。');});
      $('#feed-pet')?.addEventListener('click',feedPet);
    }
    if(page==='shop'||page==='groupshop') {
      roomKind=page==='groupshop'?'group':'me';
      sizeIcons();
      $$('[data-shop]').forEach(el=>el.addEventListener('click',async()=>{
        const event={type:el.dataset.shopAction,id:el.dataset.shop},message=el.dataset.shopAction==='buy'?'新家具已經帶回家。':'房間布置已更新。';
        if(!inGroup()){applyPet(event,message);return;}
        try{await groupRoom.act(event);}catch(error){toast(error.message);return;}
        render();toast(message);
      }));
    }
    if(page==='reports') {
      setTimeout(()=>maybeRecap(state.reportMode==='monthly'?'monthly':'weekly'));
      $$('[data-report-mode]').forEach(el=>el.addEventListener('click',()=>{state.reportMode=el.dataset.reportMode;render();}));
    }
  }
  return {petHTML,shopHTML,reportsHTML,bind,rememberTarget,awardRecord,syncGroupEntry};
}
