import { PETS, FURNITURE } from './progress.js';

const statusNames={awake:'尚未收尾',sleeping:'準備睡了',up:'已起床',unknown:'尚未更新'};
export function createSocial({state,api,flush,render,toast,esc,user}) {
  const ui={tab:'friends',data:null,board:null,scope:'friends',metric:'onTime',query:'',results:null,error:'',busy:false,loading:false,dirty:false,run:0};
  const $=s=>document.querySelector(s);
  const onPage=()=>location.hash==='#social';
  const button=(label,op,attributes='')=>`<button class="button secondary small" type="button" data-social-op="${op}" ${attributes}>${label}</button>`;
  const empty=message=>`<p class="social-empty">${message}</p>`;
  const person=p=>`<strong>${esc(p.displayName)}</strong><small>@${esc(p.username)}</small>`;
  const status=p=>!p.shared?'狀態未分享':statusNames[p.status]||'尚未更新';
  const notice=message=>`<p class="notice">${message}</p>`;
  function memberRow(p,actions='') {return `<div class="social-person"><div>${person(p)}${p.shared!==undefined?`<span class="social-status">${status(p)}</span>`:''}</div><div class="social-actions">${actions}</div></div>`;}
  async function refresh({quiet=false}={}) {
    if(state.demo||ui.busy||ui.loading)return;
    if(quiet&&(ui.dirty||document.activeElement?.matches('input,textarea,select')))return;
    const run=++ui.run;ui.loading=true;
    if(!quiet){ui.error='';if(onPage())render();}
    try {
      await flush();
      const [data,board]=await Promise.all([api('/api/social'),api(`/api/social/leaderboard?scope=${ui.scope}&metric=${ui.metric}`)]);
      if(run!==ui.run)return;
      ui.data=data;ui.board=board;ui.error='';
    }catch(error){if(run===ui.run)ui.error=error.message;}
    finally{if(run===ui.run){ui.loading=false;if(onPage()&&(!quiet||!document.activeElement?.matches('input,textarea,select')))render();}}
  }
  async function action(work, message) {
    if(ui.busy)return;
    ui.run++;ui.loading=false;ui.busy=true;ui.error='';
    $('#social-page')?.querySelectorAll('button').forEach(b=>b.disabled=true);
    try {
      const result=await work();
      if(result?.friends){
        ui.data=result;
        if(ui.results)ui.results=ui.results.map(p=>({...p,relationship:result.friends.some(f=>f.id===p.id)?'accepted':result.requests.some(f=>f.id===p.id)?'pending':'none'}));
      }
      ui.board=await api(`/api/social/leaderboard?scope=${ui.scope}&metric=${ui.metric}`);
      if(message)toast(message);
    }catch(error){ui.error=error.message;}
    finally{ui.busy=false;if(onPage())render();}
  }
  const post=(path,body)=>api('/api/social/'+path,body);
  function friendsHTML(d) {
    return `<section class="panel"><h2>我的分享設定</h2>${notice('狀態由自己標記，18 小時後顯示尚未更新；不代表系統偵測到實際入睡。')}<label class="check-row"><input type="checkbox" id="share-status" ${d.preferences.shareStatus?'checked':''}>向好友與小組分享我的狀態</label><label class="check-row"><input type="checkbox" id="share-leaderboard" ${d.preferences.shareLeaderboard?'checked':''}>參加好友與小組排行榜</label><div class="social-actions">${Object.entries(statusNames).filter(([key])=>key!=='unknown').map(([key,label])=>button(label,'status',`data-status="${key}" aria-pressed="${d.status.status===key}"`)).join('')}</div>${notice('完整生活紀錄、睡眠時間與私人小紙條只有你自己能查看。排行榜只分享統計分數。')}</section>
      <section class="panel"><h2>找一位朋友，一起慢慢調整</h2><form id="social-search-form" class="social-inline"><label class="field">好友帳號<input name="query" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" required value="${esc(ui.query)}" placeholder="輸入至少 3 個帳號字元" autocapitalize="none" autocomplete="off"></label><button class="button" type="submit">搜尋</button></form>${ui.results?`<div class="social-list">${ui.results.length?ui.results.map(p=>memberRow(p,p.relationship==='none'?button('邀請好友','request',`data-username="${esc(p.username)}"`):`<span class="chip">${p.relationship==='accepted'?'已是好友':'邀請待處理'}</span>`)).join(''):empty('找不到符合的帳號。')}</div>`:''}</section>
      <div class="social-grid"><section class="panel"><h2>好友邀請</h2>${d.requests.length?d.requests.map(p=>memberRow(p,p.direction==='incoming'?button('接受','accept',`data-user="${p.id}"`)+button('婉拒','decline',`data-user="${p.id}"`):`<span class="notice">等待對方接受</span>${button('取消','remove',`data-user="${p.id}"`)} `)).join(''):empty('目前沒有待處理邀請。')}</section><section class="panel"><h2>我的好友 · ${d.friends.length}</h2>${d.friends.length?d.friends.map(p=>memberRow(p,button('送晚安','nudge',`data-user="${p.id}"`)+button('移除','remove',`data-user="${p.id}"`))).join(''):empty('搜尋朋友的帳號，送出第一張邀請。')}</section></div>
      <section class="panel"><div class="section-heading"><h2>收到的晚安</h2>${button('全部標為已讀','read')}</div>${d.notifications.length?d.notifications.map(n=>`<div class="social-person"><div><strong>${esc(n.displayName)}</strong><p>${n.readAt?'':'✦ '}送來一句晚安：今天辛苦了，記得留點時間休息。</p><small>${esc(new Date(n.createdAt).toLocaleString('zh-TW'))}</small></div></div>`).join(''):empty('好友送來的晚安會出現在這裡。')}${notice('每位好友每晚最多送一次；在夜泊內收取，關閉 App 後不會背景推播。')}</section>`;
  }
  function groupHTML(d) {
    const g=d.group;
    if(!g)return `<div class="social-grid"><section class="panel"><h2>建立共養小組</h2><form id="social-create-group"><label class="field">小組名稱<input name="name" required maxlength="24" placeholder="例如：月亮小隊"></label><label class="field">共養寵物<select name="petId">${PETS.map(p=>`<option value="${p.id}">${p.emoji} ${p.name}</option>`).join('')}</select></label><label class="field">寵物名字<input name="petName" required maxlength="16" placeholder="例如：麻糬"></label><button class="button" type="submit">建立小組</button></form></section><section class="panel"><h2>加入朋友的小組</h2><form id="social-join-group"><label class="field">邀請碼<input name="code" required maxlength="20" autocapitalize="characters" placeholder="輸入朋友提供的邀請碼"></label><button class="button" type="submit">加入小組</button></form>${notice('每人同時參加一組，最多五人。個人寵物和金幣會保留，小組另外共養一隻寵物。')}</section></div>`;
    const pet=PETS.find(p=>p.id===g.economy.pet?.id),e=g.economy;
    return `<section class="panel"><div class="section-heading"><div><h2>${esc(g.name)}</h2><p>${g.members.length} / 5 位夥伴</p></div><span class="coin-wallet">🪙 ${g.balance} 小組金幣</span></div><div class="social-invite"><span>邀請碼 <code>${esc(g.inviteCode)}</code></span>${button('複製邀請碼','copy')}${g.ownerId===user.id?button('更新邀請碼','rotate'):''}</div><div class="pet-room social-pet-room"><div class="room-caption"><h2>${esc(e.pet?.name||'小夥伴')}</h2><span class="chip">大家一起照顧的房間</span></div><div class="room-floor"></div><div class="room-rug"></div><div class="room-pet" role="img" aria-label="${esc(pet?.name||'寵物')}">${pet?.emoji||'🐾'}</div>${Object.values(e.equipped).map(id=>FURNITURE.find(f=>f.id===id)).filter(Boolean).map(f=>`<span class="room-item room-${f.slot}" aria-label="${f.name}">${f.emoji}</span>`).join('')}</div><div class="social-actions">${button('餵食 · 5 金幣','feed',e.affection>=100||g.balance<5?'disabled':'')}<span class="notice">滿足感 ${e.affection} / 100</span></div><div class="social-shop">${FURNITURE.map(f=>{const owned=e.inventory.includes(f.id),equipped=e.equipped[f.slot]===f.id;return `<article><span class="social-furniture">${f.emoji}</span><strong>${f.name}</strong>${button(owned?(equipped?'收起':'擺放'):`購買 · ${f.cost}`,'furniture',`data-id="${f.id}" data-type="${owned?'equip':'buy'}" ${!owned&&g.balance<f.cost?'disabled':''}`)}</article>`;}).join('')}</div></section>
      <section class="panel"><h2>小組成員</h2>${g.members.map(p=>memberRow(p,`${p.id===g.ownerId?'<span class="chip">組長</span>':''}${g.ownerId===user.id&&p.id!==user.id?button('移出小組','kick',`data-user="${p.id}"`):''}`)).join('')}<div class="form-actions">${button('離開小組','leave')}</div>${notice('組長離開後由最早加入的成員接任；最後一人離開後小組結束。')}</section>
      <section class="panel"><h2>一起累積的小美好</h2>${notice('個人達標 20 金幣照常保留，小組另得 10；個人進步獎對應小組 5 金幣。當晚至少兩位成員且全員達標，小組再得 20 金幣。只計當晚 18:00 前已加入的成員，加入前的紀錄不補發小組獎勵。')}<div class="social-list">${g.rewards.length?g.rewards.map(r=>`<div class="social-person"><span>${esc(r.night)} · ${r.event_key.startsWith('all:')?'全員達標加成':'成員睡眠回報'}</span><strong>＋${r.amount}</strong></div>`).join(''):empty('明早回報後，符合條件的小組金幣會自動入帳。')}</div></section>`;
  }
  function wallHTML(d) {
    return `<section class="panel"><h2>早安，替自己留一句話</h2><form id="social-checkin"><label class="field">今天的小句點<textarea name="note" maxlength="140" placeholder="例如：今天有留一點時間照顧自己。"></textarea></label><button class="button" type="submit">發布／更新今天的打卡</button></form>${notice('先在生活紀錄保存今天的早晨回報，再自願發布打卡。好友與目前的小組成員能看見短句；不會附上完整紀錄或睡眠時間。每天一則，修改不會重複發獎。')}</section><section class="panel"><h2>打卡牆</h2>${d.wall.length?d.wall.map(p=>`<article class="social-post"><div>${person(p)}<span class="notice">${esc(p.day)}</span></div><p>${esc(p.note||'今天也有好好照顧自己。')}</p><div class="social-actions">${button(`✦ 鼓勵 ${p.encouragements}`,'encourage',`data-id="${p.id}" data-active="${!p.encouraged}" aria-pressed="${p.encouraged}"`)}${p.userId===user.id?button('刪除打卡','delete-post',`data-id="${p.id}"`):''}</div></article>`).join(''):empty('還沒有打卡。先留下今天的一句話吧。')}</section>`;
  }
  function boardHTML() {
    const b=ui.board,key=ui.metric==='streak'?'currentStreak':ui.metric,unit=ui.metric==='improvement'?' 分鐘':' 晚';
    return `<section class="panel"><h2>看見彼此的小進步</h2><form id="social-board-form" class="social-filters"><label class="field">比較範圍<select name="scope"><option value="friends" ${ui.scope==='friends'?'selected':''}>我與好友</option><option value="group" ${ui.scope==='group'?'selected':''}>共養小組</option></select></label><label class="field">排行項目<select name="metric"><option value="onTime" ${ui.metric==='onTime'?'selected':''}>近七天達標晚數</option><option value="improvement" ${ui.metric==='improvement'?'selected':''}>比前七天提早幾分鐘</option><option value="streak" ${ui.metric==='streak'?'selected':''}>目前連續達標</option></select></label><button class="button" type="submit">查看排行</button></form>${notice('只有開啟「參加排行榜」的好友或組員會列入。分數相同並列；進步分鐘需最近與前七天各至少三筆上床紀錄，正數代表提早，負數代表延後。')} ${b?`<p class="notice">${esc(b.start)} ～ ${esc(b.end)} · 連續達標計算截至今天或昨晚的連續回報。</p><div class="table-wrap"><table><thead><tr><th>名次</th><th>夥伴</th><th>成績</th></tr></thead><tbody>${b.rows.map(p=>`<tr><td>${p.rank??'—'}</td><td>${esc(p.displayName)}${p.id===user.id?'（我）':''}<small class="social-handle">@${esc(p.username)}</small></td><td>${p[key]===null?'資料不足':p[key]+unit}</td></tr>`).join('')}</tbody></table></div>${!b.rows.length?empty('還沒有可列入的小組成員。'):''}`:''}</section>`;
  }
  function rewardsHTML(d) {
    const r=d.rewards;
    return `<div class="social-stats"><article class="panel"><small>目前連續達標</small><strong>${r.currentStreak} 晚</strong></article><article class="panel"><small>最長連續達標</small><strong>${r.longestStreak} 晚</strong></article><article class="panel"><small>最近七天達標</small><strong>${r.onTime} 晚</strong></article></div><section class="panel"><h2>每一步，都留下紀念</h2><div class="social-grid">${r.milestones.map(m=>{const earned=r.bonuses.some(b=>b.id===`streak:${m.days}`);return `<article class="social-milestone"><span>${earned?'🌟':'☾'}</span><h3>${m.days} 晚 · ${m.badge}</h3><p>額外 ${m.amount} 金幣</p><small>${earned?'已獲得紀念徽章':'尚未達成'}</small></article>`;}).join('')}</div>${notice('連續達標依實際日期判定；缺填或未達標會中斷連續天數，每個 3／7／21 晚里程碑首次達成可領一次。徽章保留，失眠或夜醒本身不扣金幣。')}</section><section class="panel"><h2>進步獎勵</h2><p>還沒達標，但比之前早一點，也值得鼓勵。</p>${notice('有事前目標且未達標時，若比該筆回報前七天的平均上床時間提早至少 15 分鐘，給 10 金幣；比較期至少三筆。已達標給 20 金幣，同晚不另外領進步獎；從進步改為達標只補差額。')}<div class="social-list">${r.bonuses.length?[...r.bonuses].reverse().slice(0,30).map(b=>`<div class="social-person"><span>${b.type==='streak'?esc(b.badge||'連續達標獎勵'):esc(b.night)+' · 進步獎勵'}</span><strong>＋${b.amount} 金幣</strong></div>`).join(''):empty('符合條件的進步與連續達標獎勵，會在紀錄同步後自動入帳。')}</div></section>`;
  }
  function html() {
    if(state.demo)return `<div class="page-heading"><div><h1>好友與共養</h1><p>離開示範模式後，就能和真實帳號的朋友互動。</p></div></div>`;
    const tabs={friends:'好友',group:'小組共養',wall:'打卡牆',board:'排行榜',rewards:'進步獎勵'};
    return `<div id="social-page"><div class="page-heading"><div><p class="eyebrow">A LITTLE BETTER, TOGETHER</p><h1>一起，慢慢變好</h1><p>陪伴彼此的作息，也照顧共同的小夥伴。</p></div>${button(ui.loading?'更新中…':'重新整理','refresh',ui.loading?'disabled':'')}</div><div class="social-tabs" role="tablist" aria-label="好友社群功能">${Object.entries(tabs).map(([key,label])=>`<button class="button secondary small" type="button" role="tab" data-social-tab="${key}" aria-selected="${ui.tab===key}" aria-controls="social-tab-content" id="social-tab-${key}">${label}</button>`).join('')}</div>${ui.error?`<div class="error-box" role="alert">${esc(ui.error)}</div>`:''}<div id="social-tab-content" role="tabpanel" aria-labelledby="social-tab-${ui.tab}">${ui.data?({friends:friendsHTML,group:groupHTML,wall:wallHTML,board:boardHTML,rewards:rewardsHTML})[ui.tab](ui.data):empty(ui.loading?'正在讀取好友與小組…':'尚未讀取資料，請按重新整理。')}</div></div>`;
  }
  function bind() {
    if(!onPage()||state.demo)return;
    document.querySelectorAll('[data-social-tab]').forEach(el=>el.addEventListener('click',()=>{ui.tab=el.dataset.socialTab;ui.dirty=false;ui.error='';render();}));
    document.querySelectorAll('#social-page form').forEach(el=>el.addEventListener('input',()=>{ui.dirty=true;}));
    const form=(selector,fn)=>$(selector)?.addEventListener('submit',event=>{event.preventDefault();ui.dirty=false;const values=Object.fromEntries(new FormData(event.currentTarget));action(()=>fn(values));});
    form('#social-search-form',async values=>{ui.query=values.query;const result=await api('/api/social/search?q='+encodeURIComponent(ui.query));ui.results=result.users;});
    form('#social-create-group',values=>post('groups/create',values));
    form('#social-join-group',values=>post('groups/join',values));
    form('#social-checkin',async values=>{if(!await flush())throw new Error('請先完成帳號同步，再發布打卡。');return post('checkins',values);});
    form('#social-board-form',async values=>{ui.scope=values.scope;ui.metric=values.metric;});
    const updatePrefs=()=>action(()=>post('preferences',{shareStatus:$('#share-status').checked,shareLeaderboard:$('#share-leaderboard').checked}));
    $('#share-status')?.addEventListener('change',updatePrefs);$('#share-leaderboard')?.addEventListener('change',updatePrefs);
    document.querySelectorAll('[data-social-op]').forEach(el=>el.addEventListener('click',async()=>{
      const {socialOp:op,user:uid,id:target}=el.dataset;
      if(op==='refresh'){refresh();return;}
      if(op==='copy'){try{await navigator.clipboard.writeText(ui.data.group.inviteCode);toast('已複製小組邀請碼。');}catch{toast('邀請碼：'+ui.data.group.inviteCode);}return;}
      if(['leave','kick','rotate','delete-post','remove'].includes(op)&&!window.confirm({leave:'確定離開目前小組？個人寵物不受影響。',kick:'確定將這位成員移出共養小組？',rotate:'更新後舊邀請碼將無法使用，確定更新？','delete-post':'確定刪除自己的這則打卡？',remove:'確定移除好友或取消邀請？'}[op]))return;
      action(()=>{
        if(op==='request')return post('friends/request',{username:el.dataset.username});
        if(op==='accept'||op==='decline')return post('friends/respond',{userId:uid,action:op});
        if(op==='remove')return post('friends/remove',{userId:uid});
        if(op==='status')return post('status',{status:el.dataset.status});
        if(op==='nudge')return post('nudges',{userId:uid});
        if(op==='read')return post('notifications/read',{});
        if(op==='leave'||op==='rotate')return post('groups/'+op,{});
        if(op==='kick')return post('groups/kick',{userId:uid});
        if(op==='feed')return post('groups/pet',{type:'feed'});
        if(op==='furniture')return post('groups/pet',{type:el.dataset.type,id:target});
        if(op==='delete-post')return post('checkins/delete',{id:target});
        if(op==='encourage')return post('checkins/encourage',{id:target,active:el.dataset.active==='true'});
      },op==='nudge'?'晚安已送出；同一位好友每晚只保留一則。':undefined);
    }));
  }
  return {html,bind,refresh,canUpdate:()=>!ui.busy&&(!onPage()||!ui.dirty)};
}
