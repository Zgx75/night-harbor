import { canNudge } from './timing.js';
import { cleanRecords } from './records.js';
import { createEconomy, normaliseEconomy, assessNight, addDays } from './progress.js';
import { createExtras } from './extras.js';
import {planInputKey,cachedPlan,lockedTarget,targetPlan} from './plan-state.js';
import { openAccount, createProfileSync } from './account.js';
import { createSocial } from './social.js';
import { createMe } from './me.js';
import { createOnboarding } from './onboarding-ui.js';
import { dailyKind, nextFeedback, lineText } from './responses.js';
import { surveyDue, openSurvey, pendingSurvey } from './factor-survey.js';
import { createFactorSurvey } from './factor-survey-ui.js';
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
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.moon}</svg>`;
$$('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
const account = await openAccount();
const profileSync = createProfileSync(account,{onSaved:profile=>{
  // The server normally echoes back exactly what this page already shows. Drawing the page again then would
  // only restart the pet (it would jump to its walking destination and lose a reaction in progress).
  const next=normaliseEconomy(profile.economy),changed=JSON.stringify(next)!==JSON.stringify(state.economy);
  state.economy=next;
  if(changed&&view()==='pet'&&!document.activeElement?.matches('input,textarea,select'))render();
}});
const defaults = { currentBedtime: '', targetBedtime: '00:30', wakeTime: '08:30', reminders: false, saveClosures: true };
const initial = account.profile || {};
const state = {
  settings: { ...defaults, ...(initial.settings || {}) },
  records: Array.isArray(initial.records) ? initial.records.filter(r=>r && /^\d{4}-\d{2}-\d{2}$/.test(r.date)).slice(-60) : [],
  closures: Array.isArray(initial.closures) ? initial.closures.filter(r=>r && typeof r.at==='string').slice(-60) : [],
  economy: normaliseEconomy(initial.economy), targets: initial.targets && typeof initial.targets==='object' && !Array.isArray(initial.targets) ? initial.targets : {}, reportMode:'weekly',
  onboarding: initial.onboarding || null, petFeedback: initial.petFeedback || null, factorSurveys: Array.isArray(initial.factorSurveys) ? initial.factorSurveys : [], weeklyRecap: initial.weeklyRecap || null, weeklyBusy:false, weeklyError:'', weeklyTried:'', monthlyRecap: initial.monthlyRecap || null, monthlyBusy:false, monthlyError:'', monthlyTried:'', reportMode:'weekly', targets: initial.targets && typeof initial.targets==='object' && !Array.isArray(initial.targets) ? initial.targets : {},
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
  const saved = profileSync.save({ settings:state.settings, records:state.records, closures:state.closures, economy:state.economy, targets:state.targets, aiPlan:state.aiPlan, onboarding:state.onboarding, petFeedback:state.petFeedback, factorSurveys:state.factorSurveys, weeklyRecap:state.weeklyRecap, monthlyRecap:state.monthlyRecap });
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
function view() { const name = location.hash.slice(1); return ['pet','shop','reports','logs','settings','social','user','onboarding','factors'].includes(name) ? name : 'pet'; }
function heading(title, extra='') { return `<div class="page-heading"><div><h1>${title}</h1></div>${extra}</div>`; }
const extras = createExtras({state,api,persist,render,toast,esc,icon,localDate,updatePlan,userId:account.user.id,confirmAction});
const social = createSocial({state,api,flush:()=>profileSync.flush(),render,toast,esc,user:account.user});
const me = createMe({state,api,flush:()=>profileSync.flush(),render,toast,esc});
const onboarding = createOnboarding({state,persist,render,toast,esc,icon,updatePlan});
const factorSurvey = createFactorSurvey({state,persist,render,toast,esc,icon,localDate});
window.nightHarborUpdates={
  canUpdate:()=>!state.planBusy&&!state.weeklyBusy&&!state.monthlyBusy&&social.canUpdate()&&me.canUpdate()&&!onboarding.busy()&&!factorSurvey.busy(),
  prepare:()=>profileSync.flush()
};
window.dispatchEvent(new Event('night-harbor:update-ready'));
// How the night felt, from worst to best (a tap picks one; tapping it again clears it).
const QUALITY = [[1, '😣', '很差'], [2, '😕', '不太好'], [3, '😐', '普通'], [4, '🙂', '不錯'], [5, '😄', '很好']];
const RECENT_RECORDS = 7;
const dayLabel = date => `${dateLabel(date)}（${'日一二三四五六'[new Date(date + 'T12:00:00').getDay()]}）`;
// What a record says about the target for its night: planned time, real time and the difference.
function timeComparison(record, assessment, target) {
  if (!record.bedAt) return '上床時間還沒填';
  if (!target) return `實際 ${record.bedAt}（沒有事先保存的目標）`;
  const d = assessment.difference;
  const gap = d == null ? '' : d === 0 ? '準時' : d < 0 ? `提早 ${-d} 分` : d <= 15 ? `晚 ${d} 分，仍在 15 分鐘內` : `晚 ${d} 分`;
  return `原定 ${target} → 實際 ${record.bedAt}${gap ? `（${gap}）` : ''}`;
}
function recordCard(r) {
  const a = assessNight(r, state.targets), target = state.targets[addDays(r.date, -1)]?.bedtime;
  const credited = state.economy.credits.some(c => c.night === a.night);
  const [chip, tone] = a.status === 'on-time' ? ['達標', 'is-on-time'] : a.status === 'late' ? ['晚於目標', 'is-late'] : ['無法比對', 'is-unknown'];
  const quality = QUALITY.find(q => q[0] === Number(r.sleepQuality));
  const note = a.status === 'unknown' && r.bedAt ? `<p class="record-note">${esc(a.label)}</p>` : '';
  return `<article class="record-card ${tone}"><div class="record-head"><strong>${esc(dayLabel(r.date))}</strong><span class="record-chip">${chip}</span>${credited ? '<span class="record-coin">🪙 +20</span>' : ''}</div><p class="record-line">${esc(timeComparison(r, a, target))}</p><p class="record-quality">${quality ? `睡眠品質 ${quality[1]} ${quality[2]}` : '睡眠品質沒有填'}</p>${note}<div class="record-actions"><button class="text-button" type="button" data-edit="${esc(r.date)}">編輯</button><button class="text-button danger" type="button" data-delete="${esc(r.date)}">刪除</button></div></article>`;
}
// Shown on the page after saving, so the coins and the pet's reply do not vanish like a toast.
function savedPanel() {
  const s = state.logSaved;
  if (!s) return '';
  const pet = state.economy.pet, lines = [s.reward, s.petLine].filter(Boolean);
  return `<section class="panel record-saved" role="status"><h2>已保存 ${esc(dayLabel(s.date))}的紀錄 ✓</h2><ul class="record-saved-list">${lines.map(l => `<li>${esc(l)}</li>`).join('')}<li id="saved-plan-note">${esc(s.planNote)}</li></ul><div class="form-actions">${pet ? `<a class="button small" href="#pet">去看看${esc(pet.name)}${icon('arrow')}</a>` : ''}<button class="text-button" type="button" id="dismiss-saved">知道了</button></div></section>`;
}
function logsHTML() {
  const date = state.selectedDate || localDate(), row = state.records.find(r => r.date === date) || {};
  const night = addDays(date, -1), target = state.targets[night];
  const recent = [...state.records].reverse(), shown = state.showAllRecords ? recent : recent.slice(0, RECENT_RECORDS);
  const targetLine = target
    ? `<div class="target-line"><span>昨晚的目標：<strong>${esc(target.bedtime)}</strong></span><button type="button" class="button secondary small" id="fill-target" data-target="${esc(target.bedtime)}">準時上床</button></div>`
    : '';
  const qualityField = `<fieldset class="quality-field"><legend>前一晚睡眠品質（再點一次可以取消）</legend><div class="quality-row" role="radiogroup">${QUALITY.map(([n, face, text]) => `<label class="quality-option"><input type="radio" name="sleepQuality" value="${n}" ${Number(row.sleepQuality) === n ? 'checked' : ''}><span class="quality-face" aria-hidden="true">${face}</span><span>${text}</span></label>`).join('')}</div></fieldset>`;
  const more = recent.length > RECENT_RECORDS ? `<button class="button secondary small record-more" type="button" id="toggle-records">${state.showAllRecords ? `只看最近 ${RECENT_RECORDS} 筆` : `顯示更早的紀錄（還有 ${recent.length - RECENT_RECORDS} 筆）`}</button>` : '';
  return `${heading('睡眠紀錄')}${savedPanel()}<section class="panel"><h2>${row.date ? '補充' : '新增'}一天的紀錄</h2><form id="record-form"><label class="field record-date-field"><input type="date" id="record-date" name="date" required max="${localDate()}" value="${esc(date)}" aria-label="哪一天早上起床"></label><div class="form-section"><h3>☀ 昨晚睡得怎麼樣？</h3></div>${targetLine}<label class="field">前一晚上床準備睡覺時間<input type="time" name="bedAt" value="${esc(row.bedAt || '')}"></label>${qualityField}<div class="form-actions"><button class="button" type="submit">保存早晨回報${icon('check')}</button></div><p class="form-message" id="record-message" role="status"></p></form></section><div class="section-heading"><h2>最近的睡眠紀錄</h2><small>${state.records.length} 天紀錄</small></div>${state.records.length ? `<div class="record-list">${shown.map(recordCard).join('')}</div>${more}` : '<div class="empty"><span class="empty-icon">☀</span><p>先設定今晚的目標，明早就能回報第一晚。</p><a href="#settings" class="button secondary small">到設定填寫作息</a></div>'}<p class="notice">自行回報的時間不是系統偵測。刪除紀錄不會重設已發放金幣；同一晚無法重新領取。</p>`;
}

function planSection() {
  const s=state.settings,p=state.plan,t=p?.points?.[0],ai=p?.source==='gemini';
  return `<div class="section-heading"><h2>作息設定</h2><small>AI 每日作息目標</small></div><section class="panel"><h2>先設定最終方向</h2><p>你設定想靠近的時間，AI 根據每天的紀錄，決定今晚做得到的一步。</p><form id="plan-form"><div class="form-grid"><label class="field">目前通常幾點上床<input type="time" name="currentBedtime" value="${esc(s.currentBedtime)}"><span class="field-hint">初次使用的起點；近期滿三筆上床紀錄後，改由紀錄估計。</span></label><label class="field">最終希望幾點上床<input type="time" name="targetBedtime" required value="${esc(s.targetBedtime)}"><span class="field-hint">這是長期方向，不是今晚必須達成的時間。</span></label><label class="field">通常需要幾點起床<input type="time" name="wakeTime" required value="${esc(s.wakeTime)}"></label></div><div class="form-actions"><button class="button" type="submit" ${state.planBusy?'disabled':''}>${state.planBusy?'AI 正在分析紀錄…':'儲存方向並產生今晚目標'}${icon('sparkles')}</button><span class="notice">會將近期作息與生活紀錄交由 Gemini 分析。</span></div><p class="form-message" id="plan-message" role="status"></p></form></section>${state.planError?'<div class="error-box" role="alert">'+esc(state.planError)+(t?' 目前沿用本晚已保存的目標；尚未依最新資料更新。':' 尚未產生今晚的 AI 目標。')+'</div>':''}${t?`<div class="plan-summary"><div class="metric"><small>最終希望上床</small><strong>${esc(s.targetBedtime)}</strong></div><div class="metric"><small>${ai?'今晚 AI 建議上床':'今晚原先保存的目標'}</small><strong>${esc(t.bedtime)}</strong></div><div class="metric"><small>今晚開始收心</small><strong>${esc(t.windDown)}</strong></div></div><section class="panel"><div class="section-heading"><h2>今晚，先做到這一步</h2><span class="chip">${p.locked?'本晚約定已固定':ai?'AI 個人化分析':'先前保存的安排'}</span></div><p class="answer-text">${esc(p.message)}</p>${p.observations?.length?'<ul>'+p.observations.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':''}${p.nextStep?'<p><strong>今天先試一件事：</strong>'+esc(p.nextStep)+'</p>':''}<p class="notice">參考起點：${esc(p.baseline||'—')} · ${esc(p.baselineSource||'這晚原先保存的約定')}</p><div class="timeline"><div class="timeline-item"><span class="time">${esc(t.windDown)}</span><span class="label">開始收心</span></div><span class="timeline-arrow">→</span><div class="timeline-item"><span class="time">${esc(t.dimLights)}</span><span class="label">調暗燈光</span></div><span class="timeline-arrow">→</span><div class="timeline-item"><span class="time">${esc(t.bedtime)}</span><span class="label">上床準備睡覺</span></div></div>${p.shortOpportunity?'<p class="notice">目前過渡期的上床到起床區間仍少於七小時，可檢視是否能留出更多睡眠空間；這個區間不代表真正睡著的時數。</p>':''}<p class="notice">${esc(p.note||'只依這晚事先保存的目標核對獎勵。')} 早晨填寫紀錄後，AI 會再分析當晚的目標；時間已到的約定不事後更改。</p></section>`:'<div class="empty"><span class="empty-icon">⌁</span><p>'+esc(state.planBusy?'AI 正在根據你的資料安排今晚…':p?.message||'填入通常上床時間與最終目標，就能開始。')+'</p></div>'}`;
}
function settingsHTML() {
  return `${heading('偏好設定')}<div class="settings-stack">${planSection()}<section class="panel"><h2>溫和介入提醒</h2><p>到了作息設定中的「開始收心」時間，如果這個頁面仍在開啟且近期有操作，就會主動問候一次。</p><label class="check-row"><input type="checkbox" id="reminders-toggle" ${state.settings.reminders?'checked':''}>開啟頁面內收心提醒</label><div class="form-actions"><button class="button secondary small" id="preview-nudge">體驗一次關心提醒</button><button class="text-button" id="enable-notifications">允許瀏覽器通知</button></div><p class="notice">手機網頁無法偵測其他 App 的使用情況，頁面關閉或被系統暫停後也不保證提醒。</p></section>${onboarding.settingsHTML()}</div>`;
}
function userHTML() {
  const u=account.user;
  return `${heading('使用者')}<section class="panel"><div class="user-identity"><strong>${esc(u.displayName)}</strong><small>@${esc(u.username)}</small></div><div class="form-actions"><button class="button secondary" type="button" id="logout-account">登出</button></div></section>${me.html()}<section class="panel"><h2>你的資料，由你決定</h2><p>生活、寵物、金幣與偏好會儲存至你的帳號，並在此裝置暫存尚未同步的變更。產生每日作息目標或 AI 回報時，近期相關紀錄與回報統計會送到後端與 Google Gemini。</p><p>手機與電腦登入同一帳號，重新開啟頁面即可讀取最新資料。Google 的資料處理仍依其服務政策。</p><div class="form-actions"><button class="button secondary small" id="export-data">${icon('download')}匯出我的資料</button><button class="text-button danger" id="clear-data">清除帳號資料</button></div></section>`;
}
function render() {
  // A triggered follow-up must be answered first; every other page returns to it.
  if(factorSurvey.required()&&view()!=='factors'){location.replace('#factors');return;}
  const page = view();
  if(page!=='logs')state.logSaved=null;
  document.body.dataset.page = page;
  const accountButton=$('#account-button');
  if(accountButton){if(page==='user')accountButton.setAttribute('aria-current','page');else accountButton.removeAttribute('aria-current');}
  // The home page (夥伴) has nowhere to go back to; every other page offers a way back.
  const backButton=$('#back-button');
  if(backButton)backButton.hidden=page==='pet';
  $$('.nav-link').forEach(a => { a.classList.toggle('active',a.dataset.nav===page); if(a.dataset.nav===page) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  const html = ({ pet:extras.petHTML, shop:extras.shopHTML, reports:extras.reportsHTML, logs:logsHTML, settings:settingsHTML, social:social.html, user:userHTML, onboarding:onboarding.html, factors:factorSurvey.html })[page]();
  const pageHTML=page==='pet'?onboarding.promptHTML()+html:html;
  $('#main').innerHTML = pageHTML;
  bind(page);
  extras.bind(page);
  social.bind();
  onboarding.bind(page);
  factorSurvey.bind(page);
}

function listen(selector, type, fn) { $(selector)?.addEventListener(type,fn); }
async function updatePlan({force=false}={}) {
  const date=nightDate(),key=planInputKey(state.settings,state.records,date,state.onboarding),run=++state.planRun;
  const previous=state.aiPlan?.plan?.points?.[0]?.date===date?state.aiPlan.plan:state.targets[date]?{...targetPlan(state.targets[date],date,state.settings.wakeTime),locked:false}:null;
  state.lastPlanDate=date;state.planError='';state.planBusy=false;
  if(lockedTarget(state.targets[date],date)) {
    state.plan={...(previous||targetPlan(state.targets[date],date,state.settings.wakeTime)),locked:true};return;
  }
  const cached=cachedPlan(state.aiPlan,key,date);
  if(cached&&!force){state.plan=cached;extras.rememberTarget();return;}
  state.plan=previous;state.planBusy=true;
  try {
    const result=await api('/api/plan',{...state.settings,records:state.records,asOf:date,targets:state.targets,onboarding:state.onboarding?.status==='completed'?state.onboarding:null});
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
async function confirmAction(title,description,confirmLabel='確定清除',cancelLabel='先保留') {
  const dialog=$('#confirm-dialog'); $('#dialog-title').textContent=title; $('#dialog-description').textContent=description;
  $('button[value=confirm]',dialog).textContent=confirmLabel; $('button[value=cancel]',dialog).textContent=cancelLabel;
  dialog.returnValue=''; dialog.showModal();
  return await new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));
}
function download(name,content,type) {
  const url=URL.createObjectURL(new Blob([content],{type})), link=document.createElement('a');
  link.href=url; link.download=name; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bind(page) {
  if(page==='user') {
    listen('#logout-account','click',()=>profileSync.logout($('#logout-account')));
    me.bind();
    listen('#export-data','click',()=>download(`夜泊-帳號紀錄-${localDate()}.json`,JSON.stringify({version:3,exportedAt:new Date().toISOString(),settings:state.settings,records:state.records,closures:state.closures,economy:state.economy,targets:state.targets,aiPlan:state.aiPlan},null,2),'application/json;charset=utf-8'));
    listen('#clear-data','click',async()=>{
      if(!await confirmAction('清除這個帳號的全部資料？','將移除帳號中的生活紀錄、寵物、金幣、家具與偏好設定，並同步到其他裝置。你可以先匯出備份。'))return;
      Object.assign(state,{settings:{...defaults},records:[],closures:[],economy:createEconomy(),targets:{},onboarding:null,petFeedback:null,factorSurveys:[],weeklyRecap:null,weeklyError:'',weeklyTried:'',monthlyRecap:null,monthlyError:'',monthlyTried:'',plan:null,aiPlan:null,planError:'',flow:'home',nudgeDate:'',snoozedUntil:0});
      const saved=persist();$('#nudge').hidden=true;render();if(saved)toast('已清除帳號資料，正在同步。');
    });
  }
  if(page==='logs') {
    listen('#record-date','change',e=>{state.selectedDate=e.target.value;render();});
    // One tap fills the bedtime that was planned for last night.
    listen('#fill-target','click',e=>{$('input[name=bedAt]').value=e.currentTarget.dataset.target;});
    // Quality buttons are radios; tapping the chosen one again clears it.
    const faces=$$('input[name=sleepQuality]');
    faces.forEach(radio=>{
      radio.dataset.was=radio.checked?'1':'';
      radio.addEventListener('click',()=>{
        if(radio.dataset.was==='1'){radio.checked=false;radio.dataset.was='';}
        else{faces.forEach(other=>other.dataset.was='');radio.dataset.was='1';}
      });
    });
    listen('#toggle-records','click',()=>{state.showAllRecords=!state.showAllRecords;render();});
    listen('#dismiss-saved','click',()=>{state.logSaved=null;render();});
    listen('#record-form','submit',async e=>{
      e.preventDefault(); const button=$('button[type=submit]',e.target);button.disabled=true;
      try {
        const form=Object.fromEntries(new FormData(e.target));
        if(form.sleepQuality==null)form.sleepQuality='';
        // Older days may hold fields the form no longer shows; keep them instead of erasing them.
        const row={...(state.records.find(r=>r.date===form.date)||{}),...form};
        if(row.date>localDate())throw new Error('未來的實際紀錄請等當天再填寫。');
        if(!['bedAt','sleepQuality'].some(k=>form[k]!==''&&form[k]!=null))throw new Error('至少填寫上床時間或睡眠品質其中一項。');
        const rows=[...state.records.filter(r=>r.date!==row.date),row].sort((a,b)=>a.date.localeCompare(b.date)).slice(-60);
        state.records=cleanRecords(rows);const saved_row=state.records.find(r=>r.date===row.date),reward=extras.awardRecord(saved_row);
        // The pet answers only today's morning report (last night), never back-filled days.
        let petLine='';
        if(row.date===localDate()&&state.economy.pet){
          let kind=dailyKind(state.records,state.targets,row.date);
          // Three late nights in seven days open one follow-up round, unless one is waiting or cooling down.
          if(kind==='reminder'&&surveyDue(state.factorSurveys,state.records,state.targets,row.date))state.factorSurveys=openSurvey(state.factorSurveys,state.records,state.targets,row.date);
          if(kind==='reminder'&&pendingSurvey(state.factorSurveys)?.triggeredOn===row.date)kind='survey';
          state.petFeedback=nextFeedback(state.petFeedback,row.date,kind);
          if(kind==='survey')location.hash='factors';if(state.petFeedback?.date===row.date)petLine=`${state.economy.pet.name}：「${lineText(state.petFeedback.id)}」`;}
        const saved=persist();
        const a=assessNight(saved_row,state.targets);
        const coinNote=reward||(a.status==='on-time'?'這晚的金幣先前已經入帳。':a.status==='late'?'這晚比目標晚超過 15 分鐘，沒有金幣，明天再試試。':saved_row.bedAt?`這晚沒有金幣：${a.label}`:'');
        const note={date:row.date,reward:coinNote,petLine,planNote:'正在更新今晚的作息目標…'};
        state.logSaved=note;render();
        // A follow-up survey takes over the page, so say it in a toast too.
        if(saved&&location.hash==='#factors')toast([reward,petLine].filter(Boolean).join(' ')||'紀錄已保存。');
        else window.scrollTo({top:0});
        await updatePlan();
        note.planNote=state.planError?`今晚的 AI 作息目標暫時無法更新：${state.planError}`:'今晚的作息目標也已更新。';
        const planLine=$('#saved-plan-note');if(state.logSaved===note&&planLine)planLine.textContent=note.planNote;
        checkNudge();
      } catch(err) { $('#record-message').textContent=err.message;button.disabled=false; }
    });
    $$('[data-edit]').forEach(el=>el.addEventListener('click',()=>{state.selectedDate=el.dataset.edit;render();$('#record-form').scrollIntoView({block:'center'});$('#record-date').focus({preventScroll:true});}));
    $$('[data-delete]').forEach(el=>el.addEventListener('click',async()=>{
      if(!await confirmAction('刪除這天的紀錄？','這筆生活紀錄會從目前帳號移除並同步到其他裝置。'))return;
      state.records=state.records.filter(r=>r.date!==el.dataset.delete);persist();await updatePlan().catch(()=>{});render();toast('已刪除這天的紀錄。');
    }));
  }
  if(page==='settings') {
    listen('#plan-form','submit',async e=>{
      e.preventDefault();const button=$('button[type=submit]',e.target);button.disabled=true;
      const next={...state.settings,...Object.fromEntries(new FormData(e.target))};
      try { state.settings=next;persist();const pending=updatePlan({force:true});render();await pending;render();toast(state.planError?'最終方向已保存，AI 分析可稍後重試。':'今晚的作息目標已更新。');checkNudge(); }
      catch(err){$('#plan-message').textContent=err.message;button.disabled=false;}
    });
  }
  if(page==='settings') {
    listen('#reminders-toggle','change',e=>{state.settings.reminders=e.target.checked;persist();if(e.target.checked&&!state.plan?.points?.length)toast('先在上方作息設定填入通常就寢時間，提醒就會依此安排。');checkNudge();});
    listen('#preview-nudge','click',()=>showNudge(true));
    listen('#enable-notifications','click',async()=>{
      if(!('Notification'in window)){toast('此瀏覽器不支援通知，仍可使用頁面內提醒。');return;}
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
// How many steps into the app this page is, so "back" can never take someone out of the app.
let stepIndex=Number.isInteger(history.state?.appStep)?history.state.appStep:0;
if(!Number.isInteger(history.state?.appStep))history.replaceState({appStep:0},'');
function trackStep() {
  if(Number.isInteger(history.state?.appStep)){stepIndex=history.state.appStep;return;}
  stepIndex+=1;history.replaceState({appStep:stepIndex},'');
}
$('#back-button').addEventListener('click',()=>{if(stepIndex>0)history.back();else location.hash='#pet';});
window.addEventListener('hashchange',()=>{trackStep();render();if(view()==='social')social.refresh();if(view()==='user')me.refresh();window.scrollTo({top:0});});
for(const type of ['pointerdown','keydown','touchstart'])document.addEventListener(type,()=>state.lastActivity=Date.now(),{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){state.lastActivity=Date.now();checkNudge();}});
setInterval(()=>{if(state.lastPlanDate!==nightDate()){updatePlan().then(()=>{if((view()==='settings'||view()==='reports')&&!document.activeElement?.matches('input,textarea,select'))render();checkNudge();}).catch(()=>{});}else checkNudge();},30000);
for(const [date,t] of Object.entries(state.targets))if(date>nightDate()&&t.source!=='gemini')delete state.targets[date];
persist();
if(onboarding.shouldStart())location.hash='onboarding';
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
