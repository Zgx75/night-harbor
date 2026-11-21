import { PETS } from './progress.js';

const statusNames={awake:'還醒著',sleeping:'準備睡了',up:'已起床',unknown:'尚未更新'};
const sortNames={name:'名字',onTime:'近七天達標晚數',improvement:'比前七天提早分鐘',streak:'連續達標'};
const sortFields={onTime:'onTime',improvement:'improvement',streak:'currentStreak'};
const DAY=86400000;
const BOARD='/api/social/leaderboard?scope=friends&metric=onTime';

export function createSocial({state,api,flush,render,toast,esc,user,confirmAction,onBadge}) {
  const ui={data:null,board:null,sort:'name',open:{group:false},query:'',results:null,error:'',busy:false,loading:false,dirty:false,run:0};
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
  // Companion emoji as the friend's picture, a coloured dot for their status, and plain words for times.
  const avatar=p=>`<span class="friend-avatar" aria-hidden="true">${PETS.find(pet=>pet.id===p.pet?.id)?.emoji||'🐾'}</span>`;
  const dotTone=p=>!p.shared||p.status==='unknown'?'quiet':p.status;
  const ago=ms=>{const m=Math.round((Date.now()-ms)/60000);return m<2?'剛剛':m<60?`${m} 分鐘前`:m<1440?`${Math.floor(m/60)} 小時前`:'超過一天前';};
  // Number shown as a dot on the navigation: invitations waiting for an answer.
  const unseen=d=>d?d.requests.filter(r=>r.direction==='incoming').length:0;
  const badge=()=>{if(onBadge)onBadge(unseen(ui.data));};
  function memberRow(p,actions='') {return `<div class="social-person"><div>${person(p)}${p.shared!==undefined?`<span class="social-status">${status(p)}</span>`:''}</div><div class="social-actions">${actions}</div></div>`;}

  async function refresh({quiet=false}={}) {
    if(ui.busy||ui.loading)return;
    if(quiet&&(ui.dirty||document.activeElement?.matches('input,textarea,select')))return;
    const run=++ui.run;ui.loading=true;
    if(!quiet){ui.error='';if(onPage())render();}
    try {
      await flush();
      const [data,board]=await Promise.all([api('/api/social'),api(BOARD)]);
      if(run!==ui.run)return;
      ui.data=data;ui.board=board;ui.error='';syncResults(data);badge();
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
        ui.data=result;syncResults(result);badge();
      }
      ui.board=await api(BOARD);
      if(message)toast(message);
    }catch(error){ui.error=error.message;}
    finally{ui.busy=false;if(onPage())render();}
  }

  function scoreChips(score) {
    if(!score)return '<span class="score-chip quiet">未分享成績</span>';
    const chips=[`<span class="score-chip">近 7 天 ${score.onTime} 晚</span>`,`<span class="score-chip">連續 ${score.currentStreak} 晚</span>`];
    if(score.improvement>0)chips.push(`<span class="score-chip good">提早 ${score.improvement} 分</span>`);
    else if(score.improvement<0)chips.push(`<span class="score-chip">延後 ${-score.improvement} 分</span>`);
    return chips.join('');
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
    return `<section class="panel"><h2>好友邀請 · ${d.requests.length}</h2>${d.requests.map(p=>memberRow(p,p.direction==='incoming'?button('接受','accept',`data-user="${p.id}"`)+button('婉拒','decline',`data-user="${p.id}"`):`<span class="notice">等待對方接受</span>${button('取消邀請','cancel',`data-user="${p.id}"`)}`)).join('')}</section>`;
  }
  // Always on top: your own account name (what friends need to find you) next to the search.
  function addHTML() {
    return `<section class="panel social-add"><div class="social-account"><span>我的帳號</span><code>@${esc(user.username)}</code>${button('複製','copyAccount')}</div><form id="social-search-form" class="social-inline"><label class="field">好友帳號<input name="query" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" required value="${esc(ui.query)}" placeholder="輸入至少 3 個帳號字元" autocapitalize="none" autocomplete="off"></label><button class="button" type="submit">搜尋</button></form>${ui.results?`<div class="social-list">${ui.results.length?ui.results.map(p=>memberRow(p,p.relationship==='none'?button('邀請好友','request',`data-username="${esc(p.username)}"`):`<span class="chip">${p.relationship==='accepted'?'已是好友':'邀請待處理'}</span>`)).join(''):empty('找不到符合的帳號。')}</div>`:''}</section>`;
  }
  // One compact row: picture and name, then the score tags, then the remove button.
  function cardHTML(d,{friend:p,score}) {
    const when=p.shared&&p.status!=='unknown'&&p.updatedAt?` · ${ago(p.updatedAt)}`:'';
    return `<article class="friend-card"><div class="friend-head">${avatar(p)}<div class="friend-who">${person(p)}<span class="social-status"><i class="friend-dot ${dotTone(p)}" aria-hidden="true"></i>${status(p)}${when}</span></div></div><div class="friend-scores">${scoreChips(score)}</div>${button('移除好友','remove',`data-user="${p.id}" data-name="${esc(p.displayName)}"`)}</article>`;
  }
  function listHTML(d) {
    const rows=sortedFriends(d);
    // Sorting only matters once there are a few friends to sort.
    const sorter=d.friends.length>=3?`<div class="social-actions"><label class="social-sort">排序<select id="social-sort" aria-label="好友排序">${Object.entries(sortNames).map(([key,label])=>`<option value="${key}" ${ui.sort===key?'selected':''}>${label}</option>`).join('')}</select></label></div>`:'';
    return `<section class="panel"><div class="section-heading"><h2>好友 · ${d.friends.length}</h2>${sorter}</div>${rows.length?rows.map(row=>cardHTML(d,row)).join(''):empty('搜尋朋友的帳號，送出第一張邀請。')}${notice('成績只顯示有分享成績的好友。')}</section>`;
  }
  function groupHTML(d) {
    const g=d.group;
    const body=g?`<div class="social-invite"><span>邀請碼 <code>${esc(g.inviteCode)}</code></span>${button('複製','copy')}${g.ownerId===user.id?button('更新邀請碼','rotate'):''}</div>${g.members.map(p=>memberRow(p,`${p.id===g.ownerId?'<span class="chip">組長</span>':''}${g.ownerId===user.id&&p.id!==user.id?button('移出小組','kick',`data-user="${p.id}"`):''}`)).join('')}<div class="form-actions">${button('離開小組','leave')}</div>${notice('小組的寵物、家具與金幣目前不在這一頁顯示。組長離開後由最早加入的成員接任，最後一人離開後小組結束。')}`
      :`<div class="social-grid"><form id="social-create-group"><h3>建立小組</h3><label class="field">小組名稱<input name="name" required maxlength="24" placeholder="例如：月亮小隊"></label><label class="field">共養寵物<select name="petId">${PETS.map(p=>`<option value="${p.id}">${p.emoji} ${p.name}</option>`).join('')}</select></label><label class="field">寵物名字<input name="petName" required maxlength="16" placeholder="例如：麻糬"></label><button class="button small" type="submit">建立小組</button></form><form id="social-join-group"><h3>加入朋友的小組</h3><label class="field">邀請碼<input name="code" required maxlength="20" autocapitalize="characters" placeholder="輸入朋友提供的邀請碼"></label><button class="button small" type="submit">加入小組</button></form></div>${notice('每人同時參加一組，最多五人。個人寵物和金幣會保留。')}`;
    return `<section class="panel social-group"><details data-open="group" ${ui.open.group?'open':''}><summary><strong>共養小組</strong>：${g?`${esc(g.name)} · ${g.members.length} / 5 人`:'尚未加入'}</summary>${body}</details></section>`;
  }
  function html() {
    return `<div id="social-page"><div class="page-heading"><div><h1>我的好友清單</h1></div><button class="text-button" type="button" data-social-op="refresh" ${ui.loading?'disabled':''}>${ui.loading?'更新中…':'↻ 重新整理'}</button></div>${ui.error?`<div class="error-box" role="alert">${esc(ui.error)}</div>`:''}${ui.data?`${requestsHTML(ui.data)}${addHTML()}${listHTML(ui.data)}${groupHTML(ui.data)}`:empty(ui.loading?'正在讀取好友與小組…':'尚未讀取資料，請按重新整理。')}</div>`;
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
      if(op==='copyAccount'){try{await navigator.clipboard.writeText(user.username);toast('已複製我的帳號。');}catch{toast('我的帳號：'+user.username);}return;}
      if(op==='copy'){try{await navigator.clipboard.writeText(ui.data.group.inviteCode);toast('已複製小組邀請碼。');}catch{toast('邀請碼：'+ui.data.group.inviteCode);}return;}
      // Risky actions ask in the app's own dialog.
      const ask={leave:['離開小組？','確定離開目前小組？個人寵物不受影響。','確定離開'],kick:['移出成員？','確定將這位成員移出共養小組？','確定移出'],rotate:['更新邀請碼？','更新後舊邀請碼將無法使用，確定更新？','確定更新'],remove:['移除好友？',`確定要移除「${el.dataset.name||'這位好友'}」嗎？對方會從你的好友清單消失，之後要再加回來需要重新邀請。`,'確定移除']}[op];
      if(ask&&!await confirmAction(ask[0],ask[1],ask[2],'先保留'))return;
      action(()=>{
        if(op==='request')return post('friends/request',{username:el.dataset.username});
        if(op==='accept'||op==='decline')return post('friends/respond',{userId:uid,action:op});
        if(op==='remove'||op==='cancel')return post('friends/remove',{userId:uid});
        if(op==='leave'||op==='rotate')return post('groups/'+op,{});
        if(op==='kick')return post('groups/kick',{userId:uid});
      });
    }));
  }
  return {html,bind,refresh,canUpdate:()=>!ui.busy&&(!onPage()||!ui.dirty)};
}
