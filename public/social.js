import { PETS } from './progress.js';

const statusNames={awake:'尚未收尾',sleeping:'準備睡了',up:'已起床',unknown:'尚未更新'};
const sortNames={name:'名字',onTime:'近七天達標晚數',improvement:'比前七天提早分鐘',streak:'連續達標'};
const sortFields={onTime:'onTime',improvement:'improvement',streak:'currentStreak'};
const DAY=86400000;
const BOARD='/api/social/leaderboard?scope=friends&metric=onTime';

export function createSocial({state,api,flush,render,toast,esc,user}) {
  const ui={data:null,board:null,sort:'name',adding:false,open:{group:false},query:'',results:null,error:'',busy:false,loading:false,dirty:false,reading:false,run:0};
  const $=s=>document.querySelector(s);
  const onPage=()=>location.hash==='#social';
  const button=(label,op,attributes='')=>`<button class="button secondary small" type="button" data-social-op="${op}" ${attributes}>${label}</button>`;
  const empty=message=>`<p class="social-empty">${message}</p>`;
  const person=p=>`<strong>${esc(p.displayName)}</strong><small>@${esc(p.username)}</small>`;
  const status=p=>!p.shared?'狀態未分享':statusNames[p.status]||'尚未更新';
  const notice=message=>`<p class="notice">${message}</p>`;
  const post=(path,body)=>api('/api/social/'+path,body);
  // Search results must follow friend changes made elsewhere (for example the other person accepting).
  const syncResults=d=>{if(ui.results)ui.results=ui.results.map(p=>({...p,relationship:d.friends.some(f=>f.id===p.id)?'accepted':d.requests.some(f=>f.id===p.id)?'pending':'none'}));};
  function memberRow(p,actions='') {return `<div class="social-person"><div>${person(p)}${p.shared!==undefined?`<span class="social-status">${status(p)}</span>`:''}</div><div class="social-actions">${actions}</div></div>`;}

  // Goodnight notes are shown on the sender's card, so opening the page counts as reading them.
  function markRead() {
    if(ui.reading||!onPage()||document.visibilityState!=='visible'||!ui.data?.notifications.some(n=>!n.readAt))return;
    ui.reading=true;
    post('notifications/read',{}).then(result=>{if(ui.data&&result?.notifications)ui.data={...ui.data,notifications:result.notifications};}).catch(()=>{}).finally(()=>{ui.reading=false;});
  }
  async function refresh({quiet=false}={}) {
    if(ui.busy||ui.loading)return;
    if(quiet&&(ui.dirty||document.activeElement?.matches('input,textarea,select')))return;
    const run=++ui.run;ui.loading=true;
    if(!quiet){ui.error='';if(onPage())render();}
    try {
      await flush();
      const [data,board]=await Promise.all([api('/api/social'),api(BOARD)]);
      if(run!==ui.run)return;
      ui.data=data;ui.board=board;ui.error='';syncResults(data);markRead();
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
        ui.data=result;syncResults(result);
      }
      ui.board=await api(BOARD);
      if(message)toast(message);
    }catch(error){ui.error=error.message;}
    finally{ui.busy=false;if(onPage())render();}
  }

  function scoreLine(score) {
    if(!score)return '未分享成績';
    const parts=[`近七天達標 ${score.onTime} 晚`,`連續 ${score.currentStreak} 晚`];
    if(score.improvement>0)parts.push(`比前七天提早 ${score.improvement} 分鐘`);
    else if(score.improvement<0)parts.push(`比前七天延後 ${-score.improvement} 分鐘`);
    return parts.join(' · ');
  }
  function sortedFriends(d) {
    const scores=new Map((ui.board?.rows||[]).filter(row=>row.id!==user.id).map(row=>[row.id,row]));
    const field=sortFields[ui.sort];
    return d.friends.map(friend=>({friend,score:scores.get(friend.id)||null})).sort((a,b)=>{
      if(field){
        const x=a.score?.[field]??null,y=b.score?.[field]??null;
        if(x!==y){if(x===null)return 1;if(y===null)return -1;return y-x;}
      }
      return a.friend.displayName.localeCompare(b.friend.displayName,'zh-Hant');
    });
  }

  function requestsHTML(d) {
    if(!d.requests.length)return '';
    return `<section class="panel"><h2>好友邀請 · ${d.requests.length}</h2>${d.requests.map(p=>memberRow(p,p.direction==='incoming'?button('接受','accept',`data-user="${p.id}"`)+button('婉拒','decline',`data-user="${p.id}"`):`<span class="notice">等待對方接受</span>${button('取消','remove',`data-user="${p.id}"`)}`)).join('')}</section>`;
  }
  function addHTML() {
    return `<div class="social-add"><form id="social-search-form" class="social-inline"><label class="field">好友帳號<input name="query" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" required value="${esc(ui.query)}" placeholder="輸入至少 3 個帳號字元" autocapitalize="none" autocomplete="off"></label><button class="button" type="submit">搜尋</button></form>${ui.results?`<div class="social-list">${ui.results.length?ui.results.map(p=>memberRow(p,p.relationship==='none'?button('邀請好友','request',`data-username="${esc(p.username)}"`):`<span class="chip">${p.relationship==='accepted'?'已是好友':'邀請待處理'}</span>`)).join(''):empty('找不到符合的帳號。')}</div>`:''}</div>`;
  }
  function cardHTML(d,{friend:p,score}) {
    const nudge=d.notifications.find(n=>n.username===p.username&&Date.now()-n.createdAt<DAY);
    return `<article class="friend-card"><div class="friend-head"><div>${person(p)}</div><span class="social-status">${status(p)}</span></div><p class="friend-score">${scoreLine(score)}</p>${nudge?'<p class="friend-nudge">✦ 送來一句晚安：今天辛苦了，記得留點時間休息。</p>':''}<div class="social-actions">${button('送晚安','nudge',`data-user="${p.id}"`)}<details class="friend-menu"><summary aria-label="更多選項">⋯</summary>${button('移除好友','remove',`data-user="${p.id}"`)}</details></div></article>`;
  }
  function listHTML(d) {
    const rows=sortedFriends(d);
    return `<section class="panel"><div class="section-heading"><h2>好友 · ${d.friends.length}</h2><div class="social-actions"><label class="social-sort">排序<select id="social-sort" aria-label="好友排序">${Object.entries(sortNames).map(([key,label])=>`<option value="${key}" ${ui.sort===key?'selected':''}>${label}</option>`).join('')}</select></label>${button(ui.adding?'收起':'＋加好友','add')}</div></div>${ui.adding?addHTML():''}${rows.length?rows.map(row=>cardHTML(d,row)).join(''):empty('搜尋朋友的帳號，送出第一張邀請。')}${notice('成績只顯示有分享成績的好友。每位好友每晚最多一則晚安，在夜泊內收取，不會背景推播。')}</section>`;
  }
  function groupHTML(d) {
    const g=d.group;
    const body=g?`<div class="social-invite"><span>邀請碼 <code>${esc(g.inviteCode)}</code></span>${button('複製','copy')}${g.ownerId===user.id?button('更新邀請碼','rotate'):''}</div>${g.members.map(p=>memberRow(p,`${p.id===g.ownerId?'<span class="chip">組長</span>':''}${g.ownerId===user.id&&p.id!==user.id?button('移出小組','kick',`data-user="${p.id}"`):''}`)).join('')}<div class="form-actions">${button('離開小組','leave')}</div>${notice('小組的寵物、家具與金幣目前不在這一頁顯示。組長離開後由最早加入的成員接任，最後一人離開後小組結束。')}`
      :`<div class="social-grid"><form id="social-create-group"><h3>建立小組</h3><label class="field">小組名稱<input name="name" required maxlength="24" placeholder="例如：月亮小隊"></label><label class="field">共養寵物<select name="petId">${PETS.map(p=>`<option value="${p.id}">${p.emoji} ${p.name}</option>`).join('')}</select></label><label class="field">寵物名字<input name="petName" required maxlength="16" placeholder="例如：麻糬"></label><button class="button small" type="submit">建立小組</button></form><form id="social-join-group"><h3>加入朋友的小組</h3><label class="field">邀請碼<input name="code" required maxlength="20" autocapitalize="characters" placeholder="輸入朋友提供的邀請碼"></label><button class="button small" type="submit">加入小組</button></form></div>${notice('每人同時參加一組，最多五人。個人寵物和金幣會保留。')}`;
    return `<section class="panel social-group"><details data-open="group" ${ui.open.group?'open':''}><summary><strong>共養小組</strong>：${g?`${esc(g.name)} · ${g.members.length} / 5 人`:'尚未加入'}</summary>${body}</details></section>`;
  }
  function html() {
    return `<div id="social-page"><div class="page-heading"><div><h1>我的好友清單</h1></div><button class="text-button" type="button" data-social-op="refresh" ${ui.loading?'disabled':''}>${ui.loading?'更新中…':'↻ 重新整理'}</button></div>${ui.error?`<div class="error-box" role="alert">${esc(ui.error)}</div>`:''}${ui.data?`${requestsHTML(ui.data)}${listHTML(ui.data)}${groupHTML(ui.data)}`:empty(ui.loading?'正在讀取好友與小組…':'尚未讀取資料，請按重新整理。')}</div>`;
  }
  function bind() {
    if(!onPage())return;
    document.querySelectorAll('#social-page form').forEach(el=>el.addEventListener('input',()=>{ui.dirty=true;}));
    document.querySelectorAll('#social-page details[data-open]').forEach(el=>el.addEventListener('toggle',()=>{ui.open[el.dataset.open]=el.open;}));
    $('#social-sort')?.addEventListener('change',event=>{ui.sort=sortNames[event.target.value]?event.target.value:'name';render();});
    const form=(selector,fn)=>$(selector)?.addEventListener('submit',event=>{event.preventDefault();ui.dirty=false;const values=Object.fromEntries(new FormData(event.currentTarget));action(()=>fn(values));});
    form('#social-search-form',async values=>{ui.query=values.query;const result=await api('/api/social/search?q='+encodeURIComponent(ui.query));ui.results=result.users;});
    form('#social-create-group',values=>post('groups/create',values));
    form('#social-join-group',values=>post('groups/join',values));
    document.querySelectorAll('[data-social-op]').forEach(el=>el.addEventListener('click',async()=>{
      const {socialOp:op,user:uid}=el.dataset;
      if(op==='refresh'){refresh();return;}
      if(op==='add'){ui.adding=!ui.adding;render();if(ui.adding)$('#social-search-form input')?.focus();return;}
      if(op==='copy'){try{await navigator.clipboard.writeText(ui.data.group.inviteCode);toast('已複製小組邀請碼。');}catch{toast('邀請碼：'+ui.data.group.inviteCode);}return;}
      if(['leave','kick','rotate','remove'].includes(op)&&!window.confirm({leave:'確定離開目前小組？個人寵物不受影響。',kick:'確定將這位成員移出共養小組？',rotate:'更新後舊邀請碼將無法使用，確定更新？',remove:'確定移除好友或取消邀請？'}[op]))return;
      action(()=>{
        if(op==='request')return post('friends/request',{username:el.dataset.username});
        if(op==='accept'||op==='decline')return post('friends/respond',{userId:uid,action:op});
        if(op==='remove')return post('friends/remove',{userId:uid});
        if(op==='nudge')return post('nudges',{userId:uid});
        if(op==='leave'||op==='rotate')return post('groups/'+op,{});
        if(op==='kick')return post('groups/kick',{userId:uid});
      },op==='nudge'?'晚安已送出；同一位好友每晚只保留一則。':undefined);
    }));
  }
  return {html,bind,refresh,canUpdate:()=>!ui.busy&&(!onPage()||!ui.dirty)};
}
