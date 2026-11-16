import { canNudge, calendarText } from './timing.js';
import { cleanRecords } from './records.js';
import { createEconomy, normaliseEconomy, assessNight } from './progress.js';
import { createExtras } from './extras.js';
import {planInputKey,cachedPlan,lockedTarget,targetPlan} from './plan-state.js';
import { openAccount, createProfileSync } from './account.js';
import { createSocial } from './social.js';
import { createMe } from './me.js';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const icons = {
  friends: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5"/>',
  pet: '<path d="M8 14c-3 4 0 7 4 4 4 3 7 0 4-4l-2-2a3 3 0 0 0-4 0Z"/><ellipse cx="5" cy="9" rx="2" ry="3"/><ellipse cx="10" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="5" rx="2" ry="3"/><ellipse cx="21" cy="10" rx="2" ry="3"/>',
  recap: '<path d="M4 20V4m0 16h17M8 16v-5m5 5V7m5 9V3"/>',
  moon: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
  journal: '<rect x="5" y="3" width="15" height="18" rx="3"/><path d="M9 3v18M12 8h4M12 12h4M3 7h4M3 12h4M3 17h4"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4"/>',
  route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9"/>',
  sliders: '<path d="M4 7h6M14 7h6M4 17h10M18 17h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M11 18h2"/>',
  light: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
  note: '<path d="M14 3H5v18h14V8Z"/><path d="M14 3v5h5M8 12h8M8 16h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/>',
  shop: '<path d="M5 8h14l-1 12H6Z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.moon}</svg>`;
$$('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
const account = await openAccount();
const profileSync = createProfileSync(account,{onSaved:profile=>{
  if(state.demo){if(state.realBackup)state.realBackup.economy=normaliseEconomy(profile.economy);return;}
  state.economy=normaliseEconomy(profile.economy);
  if(view()==='pet'&&!document.activeElement?.matches('input,textarea,select'))render();
}});
const defaults = { currentBedtime: '', targetBedtime: '00:30', wakeTime: '08:30', reminders: false, saveClosures: true };
const initial = account.profile || {};
const state = {
  settings: { ...defaults, ...(initial.settings || {}) },
  records: Array.isArray(initial.records) ? initial.records.filter(r=>r && /^\d{4}-\d{2}-\d{2}$/.test(r.date)).slice(-60) : [],
  closures: Array.isArray(initial.closures) ? initial.closures.filter(r=>r && typeof r.at==='string').slice(-60) : [],
  economy: normaliseEconomy(initial.economy), targets: initial.targets && typeof initial.targets==='object' && !Array.isArray(initial.targets) ? initial.targets : {}, reportMode:'daily', reportAI:null, reportBusy:false, reportError:'',
  flow: 'home',
  plan: null, aiPlan:initial.aiPlan||null, planBusy:false, planError:'', planRun:0, lastPlanDate:'',
  knowledge: [], health: null,
  selectedDate: '', lastActivity: Date.now(), nudgeDate: '', snoozedUntil: 0
};
function localDate(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function nightDate(d = new Date()) { const day = new Date(d); if (day.getHours() < 6) day.setDate(day.getDate()-1); return localDate(day); }
const dateLabel = date => new Date(date + 'T12:00:00').toLocaleDateString('zh-TW', { month:'numeric', day:'numeric' });
function toast(message) { const el = $('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.hidden = true, 3500); }
function persist() {
  if(state.demo)return true;
  const saved = profileSync.save({ settings:state.settings, records:state.records, closures:state.closures, economy:state.economy, targets:state.targets, aiPlan:state.aiPlan });
  if(!saved)toast('這次變更未保存，請檢查裝置儲存空間。');
  return saved;
}
async function api(path, body) {
  if (!navigator.onLine) throw new Error('目前離線，AI 與好友共養功能需要連線；生活紀錄仍可暫存在這台裝置。');
  let response;
  try { response = await fetch(path, { method: body === undefined ? 'GET':'POST', headers: body === undefined ? {} : { 'Content-Type':'application/json' }, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(38000) }); }
  catch { throw new Error('目前連線沒有回應，請確認程式仍在執行後再試。'); }
  const data = await response.json().catch(() => ({}));
  if(response.status===401)profileSync.sessionExpired();
  if (!response.ok) throw Object.assign(new Error(data.error || '剛剛有個小問題，請重試。'), { code:data.code });
  return data;
}
function view() { const name = location.hash.slice(1); return ['pet','shop','reports','logs','settings','social','user'].includes(name) ? name : 'pet'; }
function heading(title, extra='') { return `<div class="page-heading"><div><h1>${title}</h1></div>${extra}</div>`; }
const extras = createExtras({state,api,persist,render,toast,esc,icon,localDate,updatePlan,userId:account.user.id});
const social = createSocial({state,api,flush:()=>profileSync.flush(),render,toast,esc,user:account.user});
const me = createMe({state,api,flush:()=>profileSync.flush(),render,toast,esc});
window.nightHarborUpdates={
  canUpdate:()=>!state.demo&&!state.reportBusy&&!state.planBusy&&social.canUpdate()&&me.canUpdate(),
  prepare:()=>profileSync.flush()
};
window.dispatchEvent(new Event('night-harbor:update-ready'));
function logsHTML() {
  const date=state.selectedDate||localDate(),row=state.records.find(r=>r.date===date)||{};
  const time=(name,label)=>`<label class="field">${label}<input type="time" name="${name}" value="${esc(row[name]||'')}"></label>`;
  const scale=(name,label,left,right)=>`<label class="field">${label}<select name="${name}" aria-label="${label}"><option value="">未填寫</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(row[name])===n?'selected':''}>${n}${n===1?' · '+left:n===5?' · '+right:''}</option>`).join('')}</select></label>`;
  const number=(name,label,max)=>`<label class="field">${label}<input name="${name}" type="number" min="0" max="${max}" step="1" inputmode="numeric" value="${esc(row[name]??'')}" placeholder="未知可留白；沒有則填 0"></label>`;
  return `${heading('生活與睡眠紀錄')}<section class="panel"><h2>${row.date?'補充':'新增'}一天的紀錄</h2><form id="record-form"><label class="field record-date-field">紀錄日期（起床日）<input type="date" id="record-date" name="date" required max="${localDate()}" value="${esc(date)}"></label><div class="form-section"><h3>☀ 昨晚睡得怎麼樣？</h3><p>上床和睡著分開填；獎勵看上床時間，睡不著也不會扣金幣。</p></div><div class="form-grid">${time('bedAt','前一晚上床準備睡覺時間')}${time('sleepAt','前一晚大約真正入睡時間')}${time('wakeAt','當日起床時間')}${scale('sleepQuality','前一晚睡眠自評','不好','很好')}<label class="field">前一晚有難入睡或夜醒嗎？<select name="insomnia" aria-label="前一晚有難入睡或夜醒嗎？"><option value="unknown">尚未回報</option><option value="no" ${row.insomnia==='no'?'selected':''}>沒有這種情況</option><option value="yes" ${row.insomnia==='yes'?'selected':''}>有難入睡或夜醒</option></select></label>${scale('mood','前一晚睡前緊繃程度','平靜','緊繃')}${number('screenMinutes','前一晚睡前一小時螢幕使用（分鐘）',60)}${scale('fatigue','當日白天疲勞度','精神好','很疲累')}</div><div class="form-section"><h3>✧ 這一天的白天線索</h3><p>以下記實際發生的日期，系統會用來對照下一晚的睡眠。最多追蹤五項因素：咖啡因、運動、螢幕、情緒、午睡。</p></div><div class="form-grid">${time('caffeineAt','當日最後一次咖啡因時間')}${time('exerciseAt','當日運動結束時間')}<label class="field">運動強度<select name="exerciseIntensity" aria-label="運動強度"><option value="">未填寫</option>${[['light','輕度 · 散步等'],['moderate','中等 · 呼吸變快'],['vigorous','較高 · 劇烈運動或重訓']].map(([id,label])=>`<option value="${id}" ${row.exerciseIntensity===id?'selected':''}>${label}</option>`).join('')}</select></label>${number('napMinutes','當日午睡總時長（分鐘）',180)}</div><div class="form-actions"><button class="button" type="submit">保存早晨回報${icon('check')}</button><span class="notice">達成睡前約定，金幣會自動入帳。空白表示未知。</span></div><p class="form-message" id="record-message" role="status"></p></form></section><div class="section-heading"><h2>最近的睡眠紀錄</h2><small>${state.records.length} 天紀錄</small></div>${state.records.length?`<div class="table-wrap"><table><thead><tr><th>起床日</th><th>上床 → 入睡</th><th>起床</th><th>自評</th><th>依約／金幣</th><th>操作</th></tr></thead><tbody>${[...state.records].reverse().map(r=>{const a=assessNight(r,state.targets),credited=state.economy.credits.some(c=>c.night===a.night);return `<tr><td>${esc(dateLabel(r.date))}</td><td>${esc(r.bedAt||'—')} → ${esc(r.sleepAt||'—')}</td><td>${esc(r.wakeAt||'—')}</td><td>${r.sleepQuality==null?'—':r.sleepQuality+'/5'}</td><td>${credited?'🪙 已入帳':a.status==='on-time'?'依約上床':a.status==='late'?'較晚收尾':'未知'}</td><td><button class="text-button" data-edit="${esc(r.date)}">編輯</button> &nbsp; <button class="text-button danger" data-delete="${esc(r.date)}">刪除</button></td></tr>`;}).join('')}</tbody></table></div>`:'<div class="empty"><span class="empty-icon">☀</span><p>先設定今晚的目標，明早就能回報第一晚。</p><a href="#settings" class="button secondary small">到設定填寫作息</a></div>'}<p class="notice">自行回報的時間不是系統偵測。刪除紀錄不會重設已發放金幣；同一晚無法重新領取。</p>`;
}

function planSection() {
  const s=state.settings,p=state.plan,t=p?.points?.[0],ai=p?.source==='gemini';
  const history=Object.entries(state.targets).filter(([date])=>date<nightDate()).sort(([a],[b])=>b.localeCompare(a)).slice(0,7);
  return `<div class="section-heading"><h2>作息設定</h2><small>AI 每日作息目標</small></div><section class="panel"><h2>先設定最終方向</h2><p>你設定想靠近的時間，AI 根據每天的紀錄，決定今晚做得到的一步。</p><form id="plan-form"><div class="form-grid"><label class="field">目前通常幾點上床<input type="time" name="currentBedtime" value="${esc(s.currentBedtime)}"><span class="field-hint">初次使用的起點；近期滿三筆上床紀錄後，改由紀錄估計。</span></label><label class="field">最終希望幾點上床<input type="time" name="targetBedtime" required value="${esc(s.targetBedtime)}"><span class="field-hint">這是長期方向，不是今晚必須達成的時間。</span></label><label class="field">通常需要幾點起床<input type="time" name="wakeTime" required value="${esc(s.wakeTime)}"></label></div><div class="form-actions"><button class="button" type="submit" ${state.planBusy?'disabled':''}>${state.planBusy?'AI 正在分析紀錄…':'儲存方向並產生今晚目標'}${icon('sparkles')}</button><span class="notice">會將近期作息與生活紀錄交由 Gemini 分析。</span></div><p class="form-message" id="plan-message" role="status"></p></form></section>${state.planError?'<div class="error-box" role="alert">'+esc(state.planError)+(t?' 目前沿用本晚已保存的目標；尚未依最新資料更新。':' 尚未產生今晚的 AI 目標。')+'</div>':''}${t?`<div class="plan-summary"><div class="metric"><small>最終希望上床</small><strong>${esc(s.targetBedtime)}</strong></div><div class="metric"><small>${ai?'今晚 AI 建議上床':'今晚原先保存的目標'}</small><strong>${esc(t.bedtime)}</strong></div><div class="metric"><small>今晚開始收心</small><strong>${esc(t.windDown)}</strong></div></div><section class="panel"><div class="section-heading"><h2>今晚，先做到這一步</h2><span class="chip">${p.locked?'本晚約定已固定':ai?'AI 個人化分析':'先前保存的安排'}</span></div><p class="answer-text">${esc(p.message)}</p>${p.observations?.length?'<ul>'+p.observations.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':''}${p.nextStep?'<p><strong>今天先試一件事：</strong>'+esc(p.nextStep)+'</p>':''}<p class="notice">參考起點：${esc(p.baseline||'—')} · ${esc(p.baselineSource||'這晚原先保存的約定')}</p><div class="timeline"><div class="timeline-item"><span class="time">${esc(t.windDown)}</span><span class="label">開始收心</span></div><span class="timeline-arrow">→</span><div class="timeline-item"><span class="time">${esc(t.dimLights)}</span><span class="label">調暗燈光</span></div><span class="timeline-arrow">→</span><div class="timeline-item"><span class="time">${esc(t.bedtime)}</span><span class="label">上床準備睡覺</span></div></div>${p.shortOpportunity?'<p class="notice">目前過渡期的上床到起床區間仍少於七小時，可檢視是否能留出更多睡眠空間；這個區間不代表真正睡著的時數。</p>':''}<p class="notice">${esc(p.note||'只依這晚事先保存的目標核對獎勵。')} 早晨填寫紀錄後，AI 會再分析當晚的目標；時間已到的約定不事後更改。</p><div class="form-actions"><button class="button secondary small" id="export-calendar">${icon('download')}下載今晚行事曆提醒</button>${(p.sources||[]).map(x=>'<a class="source-link" href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">'+esc(x.publisher)+' ↗</a>').join('')}</div></section>`:'<div class="empty"><span class="empty-icon">⌁</span><p>'+esc(state.planBusy?'AI 正在根據你的資料安排今晚…':p?.message||'填入通常上床時間與最終目標，就能開始。')+'</p></div>'}<section class="panel"><h2>每晚的目標，都有自己的紀錄</h2><p>每天依新資料重新分析，逐步靠近最終方向。金幣比對當晚已保存的目標。</p>${history.length?'<div class="table-wrap"><table><thead><tr><th>夜晚日期</th><th>當晚上床目標</th><th>建議來源</th></tr></thead><tbody>'+history.map(([date,x])=>'<tr><td>'+esc(dateLabel(date))+'</td><td>'+esc(x.bedtime)+'</td><td>'+(x.source==='gemini'?'AI 分析':'先前保存')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="notice">第一晚完成後，這裡會開始累積歷史目標。</p>'}</section>`;
}
function settingsHTML() {
  return `${heading('偏好設定')}<div class="settings-stack">${planSection()}<section class="panel"><h2>溫和介入提醒</h2><p>到了作息設定中的「開始收心」時間，如果這個頁面仍在開啟且近期有操作，就會主動問候一次。</p><label class="check-row"><input type="checkbox" id="reminders-toggle" ${state.settings.reminders?'checked':''}>開啟頁面內收心提醒</label><div class="form-actions"><button class="button secondary small" id="preview-nudge">體驗一次關心提醒</button><button class="text-button" id="enable-notifications">允許瀏覽器通知</button></div><p class="notice">手機網頁無法偵測其他 App 的使用情況，頁面關閉或被系統暫停後也不保證提醒。需要背景提醒時，可在上方作息設定下載並匯入行事曆；行事曆通知仍依裝置設定。</p></section><section class="panel"><h2>專題展示</h2><p>用獨立的虛構兩週資料，體驗領金幣、買家具和每週 recap。離開後回到原本資料。</p><div class="form-actions"><button class="button secondary small" id="enter-demo">進入示範模式</button></div></section><section class="panel"><h2>關於夜泊</h2><p>給白天被事情塞滿、晚上捨不得睡的大學生。先理解，再慢慢調整。</p><p class="notice">目前是專題展示原型，提供一般生活與睡眠知識，不診斷或治療睡眠疾病。沒有自動睡眠偵測；睡眠時間由使用者自行填寫。</p><details><summary>查看 AI 連線狀態</summary><p>${state.health?.configured?'已找到 Gemini 金鑰設定；實際服務狀態以每次請求為準。':'尚未找到 Gemini 金鑰，請參考專案 README 完成設定。'}</p><p class="notice">模型：${esc(state.health?.model || '等待連線')}<br>知識檢索：本機關鍵詞與中文雙字比對，再由模型根據取回內容生成；沒有使用向量資料庫。</p><a class="source-link" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">Google Gemini API 服務條款 ↗</a></details></section></div>`;
}
function userHTML() {
  const u=account.user;
  return `${heading('使用者')}<section class="panel"><div class="user-identity"><strong>${esc(u.displayName)}</strong><small>@${esc(u.username)}</small></div><div class="form-actions"><button class="button secondary" type="button" id="logout-account">登出</button></div></section>${me.html()}<section class="panel"><h2>你的資料，由你決定</h2><p>生活、寵物、金幣與偏好會儲存至你的帳號，並在此裝置暫存尚未同步的變更。產生每日作息目標或 AI 回報時，近期相關紀錄與回報統計會送到後端與 Google Gemini。</p><p>手機與電腦登入同一帳號，重新開啟頁面即可讀取最新資料。Google 的資料處理仍依其服務政策。</p><div class="form-actions"><button class="button secondary small" id="export-data">${icon('download')}匯出我的資料</button><button class="text-button danger" id="clear-data">清除帳號資料</button></div></section>`;
}
function render() {
  const page = view();
  document.body.dataset.page = page;
  const accountButton=$('#account-button');
  if(accountButton){if(page==='user')accountButton.setAttribute('aria-current','page');else accountButton.removeAttribute('aria-current');}
  $$('.nav-link').forEach(a => { a.classList.toggle('active',a.dataset.nav===page); if(a.dataset.nav===page) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  const html = ({ pet:extras.petHTML, shop:extras.shopHTML, reports:extras.reportsHTML, logs:logsHTML, settings:settingsHTML, social:social.html, user:userHTML })[page]();
  $('#main').innerHTML = (state.demo?'<section class="demo-banner"><span><strong>示範模式</strong> · 寵物、金幣與兩週紀錄皆為虛構，操作不會寫入原本資料。</span><button class="button secondary small" id="exit-demo">回到我的資料</button></section>':'') + html;
  bind(page);
  extras.bind(page);
  social.bind();
}

function listen(selector, type, fn) { $(selector)?.addEventListener(type,fn); }
async function updatePlan({force=false}={}) {
  const date=nightDate(),key=planInputKey(state.settings,state.records,date),run=++state.planRun;
  const previous=state.aiPlan?.plan?.points?.[0]?.date===date?state.aiPlan.plan:state.targets[date]?{...targetPlan(state.targets[date],date,state.settings.wakeTime),locked:false}:null;
  state.lastPlanDate=date;state.planError='';state.planBusy=false;
  if(lockedTarget(state.targets[date],date)) {
    state.plan={...(previous||targetPlan(state.targets[date],date,state.settings.wakeTime)),locked:true};return;
  }
  const cached=cachedPlan(state.aiPlan,key,date);
  if(cached&&!force){state.plan=cached;extras.rememberTarget();return;}
  state.plan=previous;state.planBusy=true;
  try {
    const result=await api('/api/plan',{...state.settings,records:state.records,asOf:date,targets:state.targets});
    if(run!==state.planRun)return;
    if(lockedTarget(state.targets[date],date)) {
      state.plan={...(previous||targetPlan(state.targets[date],date,state.settings.wakeTime)),locked:true};return;
    }
    if((result.blocked||result.needsBaseline)&&previous){state.plan=previous;state.planError=result.message;return;}
    state.plan=result;
    if(result.source==='gemini'){state.aiPlan={key,plan:result};extras.rememberTarget();persist();}
  } catch(e) {if(run===state.planRun){state.plan=previous;state.planError=e.message;}}
  finally {if(run===state.planRun)state.planBusy=false;}
}
async function confirmAction(title,description) {
  const dialog=$('#confirm-dialog'); $('#dialog-title').textContent=title; $('#dialog-description').textContent=description;
  dialog.returnValue=''; dialog.showModal();
  return await new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));
}
function download(name,content,type) {
  const url=URL.createObjectURL(new Blob([content],{type})), link=document.createElement('a');
  link.href=url; link.download=name; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportCalendar() {
  if(!state.plan?.points?.length)return;
  download('夜泊-今晚作息提醒.ics',calendarText(state.plan.points),'text/calendar;charset=utf-8');
  toast('已下載。匯入行事曆後，請確認通知已開啟。');
}
function bind(page) {
  if(page==='user') {
    listen('#logout-account','click',()=>profileSync.logout($('#logout-account')));
    me.bind();
    listen('#export-data','click',()=>download(`夜泊-帳號紀錄-${localDate()}.json`,JSON.stringify({version:3,demo:Boolean(state.demo),exportedAt:new Date().toISOString(),settings:state.settings,records:state.records,closures:state.closures,economy:state.economy,targets:state.targets,aiPlan:state.aiPlan},null,2),'application/json;charset=utf-8'));
    listen('#clear-data','click',async()=>{
      if(!await confirmAction(state.demo?'清除示範資料？':'清除這個帳號的全部資料？',state.demo?'只會清除這次示範資料。':'將移除帳號中的生活紀錄、寵物、金幣、家具與偏好設定，並同步到其他裝置。你可以先匯出備份。'))return;
      Object.assign(state,{settings:{...defaults},records:[],closures:[],economy:createEconomy(),targets:{},reportAI:null,plan:null,aiPlan:null,planError:'',flow:'home',nudgeDate:'',snoozedUntil:0});
      const saved=persist();$('#nudge').hidden=true;render();if(saved)toast(state.demo?'已清除這次示範資料。':'已清除帳號資料，正在同步。');
    });
  }
  if(page==='logs') {
    listen('#record-date','change',e=>{state.selectedDate=e.target.value;render();});
    listen('#record-form','submit',async e=>{
      e.preventDefault(); const button=$('button[type=submit]',e.target);button.disabled=true;
      try {
        const row=Object.fromEntries(new FormData(e.target));
        if(row.date>localDate())throw new Error('未來的實際紀錄請等當天再填寫。');
        if(!['bedAt','sleepAt','wakeAt','caffeineAt','exerciseAt','fatigue','mood','sleepQuality','screenMinutes','napMinutes'].some(k=>row[k]!==''&&row[k]!=null)&&!['yes','no'].includes(row.insomnia))throw new Error('至少留下一個時間、心情或疲勞線索。');
        const rows=[...state.records.filter(r=>r.date!==row.date),row].sort((a,b)=>a.date.localeCompare(b.date)).slice(-60);
        state.records=cleanRecords(rows);const reward=extras.awardRecord(state.records.find(r=>r.date===row.date));
        const saved=persist();await updatePlan();render();
        if(saved)toast(reward||(state.planError?'紀錄已保存；恢復後端連線後可更新 AI 目標。':'早晨回報已保存，今晚的作息目標也已更新。'));checkNudge();
      } catch(err) { $('#record-message').textContent=err.message;button.disabled=false; }
    });
    $$('[data-edit]').forEach(el=>el.addEventListener('click',()=>{state.selectedDate=el.dataset.edit;render();$('#record-date').focus();}));
    $$('[data-delete]').forEach(el=>el.addEventListener('click',async()=>{
      if(!await confirmAction('刪除這天的紀錄？','這筆生活紀錄會從目前帳號移除並同步到其他裝置。'))return;
      state.records=state.records.filter(r=>r.date!==el.dataset.delete);state.reportAI=null;persist();await updatePlan().catch(()=>{});render();toast('已刪除這天的紀錄。');
    }));
  }
  if(page==='settings') {
    listen('#plan-form','submit',async e=>{
      e.preventDefault();const button=$('button[type=submit]',e.target);button.disabled=true;
      const next={...state.settings,...Object.fromEntries(new FormData(e.target))};
      try { state.settings=next;persist();state.reportAI=null;const pending=updatePlan({force:true});render();await pending;render();toast(state.planError?'最終方向已保存，AI 分析可稍後重試。':'今晚的作息目標已更新。');checkNudge(); }
      catch(err){$('#plan-message').textContent=err.message;button.disabled=false;}
    });
    listen('#export-calendar','click',exportCalendar);
  }
  if(page==='settings') {
    listen('#reminders-toggle','change',e=>{state.settings.reminders=e.target.checked;persist();if(e.target.checked&&!state.plan?.points?.length)toast('先在上方作息設定填入通常就寢時間，提醒就會依此安排。');checkNudge();});
    listen('#preview-nudge','click',()=>showNudge(true));
    listen('#enable-notifications','click',async()=>{
      if(!('Notification'in window)){toast('此瀏覽器不支援通知，仍可使用頁面內提醒或行事曆。');return;}
      try { const permission=await Notification.requestPermission();toast(permission==='granted'?'已允許通知；頁面開啟時可接收收心提醒。':'仍可使用頁面內提醒，不影響其他功能。'); } catch {toast('目前無法開啟通知，仍可使用頁面內提醒。');}
    });
  }
}

function showNudge(preview=false) {
  const el=$('#nudge');
  el.innerHTML=`<span class="chip gold">${preview?'提醒預覽':'到了約定的收心時間'}</span><h2>還醒著嗎？留一點時間給你。</h2><p>到了約定的收心時間，可以把手機放遠、調暗燈光，慢慢準備休息。</p><div class="nudge-actions"><button class="button small" id="nudge-ok">知道了${icon('check')}</button><button class="text-button" id="nudge-dismiss">十分鐘後再說</button></div>`;
  el.hidden=false;
  $('#nudge-ok').addEventListener('click',()=>{el.hidden=true;});
  $('#nudge-dismiss').addEventListener('click',()=>{el.hidden=true;state.snoozedUntil=Date.now()+10*60000;if(!preview)state.nudgeDate='';});
  if(!preview && 'Notification'in window && Notification.permission==='granted')try{new Notification('夜泊 · 還醒著嗎？',{body:'到了約定的收心時間，留一點時間替今天收尾。',icon:'/icon.svg'});}catch{}
}
function checkNudge() {
  const point=state.plan?.points?.[0];
  if(canNudge({enabled:state.settings.reminders,visible:document.visibilityState==='visible',flow:state.flow,handled:state.nudgeDate===nightDate(),snoozedUntil:state.snoozedUntil,lastActivity:state.lastActivity,point,now:Date.now()})){state.nudgeDate=nightDate();showNudge();}
}
window.addEventListener('hashchange',()=>{render();if(view()==='social')social.refresh();if(view()==='user')me.refresh();window.scrollTo({top:0});});
for(const type of ['pointerdown','keydown','touchstart'])document.addEventListener(type,()=>state.lastActivity=Date.now(),{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){state.lastActivity=Date.now();checkNudge();}});
setInterval(()=>{if(state.lastPlanDate!==nightDate()){updatePlan().then(()=>{if((view()==='settings'||view()==='reports')&&!document.activeElement?.matches('input,textarea,select'))render();checkNudge();}).catch(()=>{});}else checkNudge();},30000);
for(const [date,t] of Object.entries(state.targets))if(date>nightDate()&&t.source!=='gemini')delete state.targets[date];
persist();
render();
if(view()==='social')social.refresh();
if(view()==='user')me.refresh();
setInterval(()=>{if(view()==='social'&&document.visibilityState==='visible')social.refresh({quiet:true});},30000);
Promise.allSettled([api('/api/health'),api('/api/knowledge'),updatePlan()]).then(results=>{
  if(results[0].status==='fulfilled')state.health=results[0].value;
  if(results[1].status==='fulfilled')state.knowledge=results[1].value.sources;
  $('#connection-label').textContent=state.health?(state.health.configured?'AI 金鑰已設定':'AI 尚未設定'):'後端未連線';
  $('#status-dot').classList.toggle('connected',Boolean(state.health?.configured));
  // Do not replace a form somebody has started typing into while initialization ran.
  if(!document.activeElement?.matches('input,textarea,select'))render();checkNudge();
});
