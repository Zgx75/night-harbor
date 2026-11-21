// "My status and sharing" and "my progress" on the user page. The data comes from the same
// social dashboard the friends page uses; nothing here is saved in the browser.
const statusNames={awake:'還醒著',sleeping:'準備睡了',up:'已起床'};

export function createMe({state,api,flush,render,toast,esc}) {
  const ui={data:null,error:'',busy:false,loading:false,open:false,run:0};
  const $=s=>document.querySelector(s);
  const onPage=()=>location.hash==='#user';
  const post=(path,body)=>api('/api/social/'+path,body);

  async function refresh() {
    if(ui.busy||ui.loading)return;
    const run=++ui.run;ui.loading=true;ui.error='';
    try {
      await flush();
      const data=await api('/api/social');
      if(run===ui.run)ui.data=data;
    } catch(error){if(run===ui.run)ui.error=error.message;}
    finally{if(run===ui.run){ui.loading=false;if(onPage()&&!document.activeElement?.matches('input,textarea,select'))render();}}
  }
  async function action(work,message) {
    if(ui.busy)return;
    ui.run++;ui.loading=false;ui.busy=true;ui.error='';
    $('#me-panels')?.querySelectorAll('button,input').forEach(el=>{el.disabled=true;});
    try {
      const result=await work();
      if(result?.preferences)ui.data=result;
      if(message)toast(message);
    } catch(error){ui.error=error.message;}
    finally{ui.busy=false;if(onPage())render();}
  }

  function html() {
    const d=ui.data;
    if(!d)return `<div id="me-panels">${ui.error?`<div class="error-box" role="alert">${esc(ui.error)}</div>`:`<p class="notice">${ui.loading?'正在讀取…':'尚未讀取。'}</p>`}</div>`;
    const sharing=d.preferences.shareStatus,r=d.rewards;
    return `<div id="me-panels">${ui.error?`<div class="error-box" role="alert">${esc(ui.error)}</div>`:''}
      <section class="panel"><h2>我的狀態與分享</h2>
        <label class="check-row"><input type="checkbox" id="share-status" ${sharing?'checked':''}>向好友分享我的狀態</label>
        <label class="check-row"><input type="checkbox" id="share-leaderboard" ${d.preferences.shareLeaderboard?'checked':''}>讓好友看到我的成績</label>
        <div class="social-actions me-status" role="group" aria-label="我的狀態">${Object.entries(statusNames).map(([key,label])=>`<button class="button secondary small" type="button" data-me-status="${key}" aria-pressed="${sharing&&d.status.status===key}" ${sharing?'':'disabled'}>${label}</button>`).join('')}</div>
        <p class="notice">${sharing?'狀態由你自己標記，18 小時後顯示尚未更新。好友看不到你的紀錄與睡眠時間。':'開啟「向好友分享我的狀態」後，才能標記狀態。'}</p>
      </section>
      <section class="panel"><h2>我的成績</h2>
        <div class="me-stats"><div><small>目前連續達標</small><strong>${r.currentStreak} 晚</strong></div><div><small>最長連續達標</small><strong>${r.longestStreak} 晚</strong></div><div><small>最近七天達標</small><strong>${r.onTime} 晚</strong></div></div>
        <div class="me-milestones">${r.milestones.map(m=>{const earned=r.bonuses.some(b=>b.id===`streak:${m.days}`);return `<article class="${earned?'earned':''}"><span aria-hidden="true">${earned?'🌟':'☾'}</span><h3>${m.days} 晚 · ${esc(m.badge)}</h3><p>額外 ${m.amount} 金幣</p><small>${earned?'已獲得':'尚未達成'}</small></article>`;}).join('')}</div>
        ${r.bonuses.length?`<details data-me-open ${ui.open?'open':''}><summary>獎勵紀錄 · ${r.bonuses.length}</summary><ul class="me-rewards">${[...r.bonuses].reverse().slice(0,30).map(b=>`<li><span>${b.type==='streak'?esc(b.badge||'連續達標獎勵'):esc(b.night)+' · 進步獎勵'}</span><strong>＋${b.amount} 金幣</strong></li>`).join('')}</ul></details>`:''}
      </section></div>`;
  }

  function bind() {
    if(!onPage())return;
    const savePrefs=()=>action(()=>post('preferences',{shareStatus:$('#share-status').checked,shareLeaderboard:$('#share-leaderboard').checked}));
    $('#share-status')?.addEventListener('change',savePrefs);
    $('#share-leaderboard')?.addEventListener('change',savePrefs);
    document.querySelectorAll('[data-me-status]').forEach(el=>el.addEventListener('click',()=>action(()=>post('status',{status:el.dataset.meStatus}),`已標記為「${statusNames[el.dataset.meStatus]}」`)));
    $('[data-me-open]')?.addEventListener('toggle',event=>{ui.open=event.target.open;});
  }
  return {html,bind,refresh,canUpdate:()=>!ui.busy};
}
