import { canNudge, calendarText } from './timing.js';
import { cleanRecords } from './records.js';
import { createEconomy, normaliseEconomy, assessNight } from './progress.js';
import { createExtras } from './extras.js';
import {planInputKey,cachedPlan,lockedTarget,targetPlan} from './plan-state.js';
import { openAccount, createProfileSync } from './account.js';
import { createSocial } from './social.js';
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
  download: '<path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/>'
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
  flow: 'home', closureId: null,
  action: '', note: '', plan: null, aiPlan:initial.aiPlan||null, planBusy:false, planError:'', planRun:0, lastPlanDate:'',
  advice: null, adviceBusy: false, adviceError: '', question: '', knowledge: [], health: null,
  selectedDate: '', lastActivity: Date.now(), nudgeDate: '', snoozedUntil: 0
};
const actions = [{ id: 'phone', title: '把手機放遠一點', detail: '讓今天的訊息，先停在這裡。', icon: 'phone' }, { id: 'light', title: '把房間的燈調暗', detail: '替自己留一段安靜的過渡。', icon: 'light' }, { id: 'note', title: '寫下明天的第一件小事', detail: '先放下，明天再接著做。', icon: 'note' }];
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
function view() { const name = location.hash.slice(1); return ['tonight','pet','reports','logs','knowledge','plan','settings','social'].includes(name) ? name : 'pet'; }
function heading(kicker, title, subtitle, extra='') { return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${subtitle}</p></div>${extra}</div>`; }
const moonArt = `<svg class="moon-art" viewBox="0 0 380 330" fill="none" aria-hidden="true"><circle cx="204" cy="157" r="105" stroke="#c7b9e7" stroke-opacity=".09"/><circle cx="204" cy="157" r="134" stroke="#c7b9e7" stroke-opacity=".06" stroke-dasharray="2 9"/><path d="M232 82a75 75 0 1 0 43 124 77 77 0 0 1-43-124Z" fill="#e5ce9e"/><path d="M245 93a69 69 0 0 0 24 100" stroke="#151721" stroke-opacity=".1" stroke-width="3"/><circle cx="164" cy="162" r="7" fill="#151721" fill-opacity=".035"/><circle cx="180" cy="194" r="11" fill="#151721" fill-opacity=".035"/><path d="m108 71 2 7 7 2-7 2-2 7-2-7-7-2 7-2Zm193 57 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" fill="#c7b9e7"/><circle cx="264" cy="52" r="2" fill="#e5ce9e"/><circle cx="78" cy="160" r="2" fill="#c7b9e7"/><circle cx="301" cy="221" r="2" fill="#e5ce9e"/><circle cx="119" cy="247" r="1.5" fill="#c7b9e7"/><path d="M85 265c42-12 74 12 111 0s66-5 93 2M106 279c34-6 53 7 85 0s47-4 66 1" stroke="#c7b9e7" stroke-opacity=".19" stroke-linecap="round"/><path d="M178 62v5m-2.5-2.5h5" stroke="#e5ce9e" stroke-opacity=".5"/></svg>`;
const extras = createExtras({state,api,persist,render,toast,esc,icon,localDate,updatePlan});
const social = createSocial({state,api,flush:()=>profileSync.flush(),render,toast,esc,user:account.user});
window.nightHarborUpdates={
  canUpdate:()=>!state.demo&&!state.adviceBusy&&!state.reportBusy&&!state.planBusy&&state.flow!=='ritual'&&social.canUpdate(),
  prepare:()=>profileSync.flush()
};
window.dispatchEvent(new Event('night-harbor:update-ready'));
function homeHTML() {
  const hour=new Date().getHours();
  const greeting=hour<6?'夜深了，慢慢來。':hour<12?'早安，今天慢慢來。':hour<18?'午安，留點時間給自己。':'晚上好，慢慢來。';
  const greetingNote=hour>=6&&hour<12?'花一點時間回顧昨晚，再替今天留一個小方向。':'白天已經很努力了，現在把時間留給自己。';
  const today = state.records.find(r => r.date === localDate());
  const p = state.plan?.points?.[0];
  return `${heading('YOUR EVENING, AT YOUR PACE', greeting, greetingNote, '<span class="chip gold">☾ 給還捨不得睡的你</span>')}
  ${extras.homeHTML()}<section class="hero"><div class="hero-copy"><div class="tiny-label">✧ &nbsp; 用一個小動作，替今天收尾</div><h2>把今天，<br>輕輕放下。</h2><p>不急著要求自己立刻睡著。<br>放遠手機、調暗燈光，或留一句話給明天。</p><button class="button" id="choose-action">選一個睡前小動作${icon('arrow')}</button><p class="hero-footnote">${icon('moon')} 依照自己的步調，準備休息。</p></div>${moonArt}</section>
  <div class="feature-grid"><a class="feature-card" href="#logs"><span class="feature-icon">${icon('journal')}</span><h3>先記下一點今天</h3><p>${today ? '今天的紀錄已保存，隨時可以補上。':'咖啡、運動與疲勞，留下幾個小線索。'}</p><span class="feature-bottom">${today ? '補充紀錄':'新增紀錄'}${icon('arrow')}</span></a><a class="feature-card" href="#knowledge"><span class="feature-icon">${icon('sparkles')}</span><h3>找到適合自己的線索</h3><p>結合你的紀錄與有來源的睡眠知識。</p><span class="feature-bottom">看看知識建議${icon('arrow')}</span></a><a class="feature-card" href="#plan"><span class="feature-icon">${icon('route')}</span><h3>不用一口氣變成早睡的人</h3><p>${p ? `今晚建議 ${esc(p.bedtime)} 就寢，從小幅調整開始。`:'一次調整一小步，安排自己的作息路徑。'}</p><span class="feature-bottom">設定作息路徑${icon('arrow')}</span></a></div>
  <div class="section-heading"><h2>今晚的節奏</h2><a class="text-button" href="#plan">調整安排</a></div>${p ? `<div class="timeline"><div class="timeline-item"><span class="time">${esc(p.windDown)}</span><span class="label">開始收心</span></div><span class="timeline-arrow">→</span><div class="timeline-item"><span class="time">${esc(p.dimLights)}</span><span class="label">調暗燈光</span></div><span class="timeline-arrow">→</span><div class="timeline-item"><span class="time">${esc(p.bedtime)}</span><span class="label">準備就寢</span></div></div>` : '<p class="notice">先填入通常就寢與目標時間，這裡就會出現今晚的安排。</p>'}<p class="notice">${state.settings.reminders ? '已開啟頁面內提醒。':'尚未開啟提醒，可在偏好設定中啟用。'} 提醒在頁面開啟且仍有操作時生效。${state.planError?' 今晚 AI 分析未更新，請到作息路徑查看。':''}</p>`;
}
function ritualHTML() {
  return `<div class="center-page"><p class="eyebrow">ONE SMALL THING IS ENOUGH</p><div class="center-moon" aria-hidden="true">☾</div><h1>今天，不必再多做一點。</h1><p class="subtext">選一個做得到的小動作，就已經很好了。</p><div class="action-list" role="group" aria-label="選擇一個收尾動作">${actions.map(a => `<button class="action-option ${state.action===a.id?'active':''}" data-action="${a.id}" aria-pressed="${state.action===a.id}"><span class="action-icon">${icon(a.icon)}</span><span><strong>${a.title}</strong><small>${a.detail}</small></span><span class="radio"></span></button>`).join('')}</div>${state.action==='note'?`<label class="field">留給明天的一句話（選填，保存在你的帳號）<textarea id="tomorrow-note" maxlength="140" placeholder="例如：起床後先把報告大綱列出來">${esc(state.note)}</textarea></label>`:''}<button class="button full-width" id="finish-night" ${state.action?'':'disabled'}>我準備好，今天先到這裡${icon('check')}</button><p class="notice">${state.settings.saveClosures?'收尾時間與動作會保存至你的帳號。':'目前不保存收尾紀錄。'}</p></div>`;
}
function doneHTML() {
  const a = actions.find(a => a.id === state.action);
  return `<div class="center-page"><p class="eyebrow">LET TODAY BE ENOUGH</p><div class="center-moon" aria-hidden="true">☾</div><h1>今晚，已經夠了。</h1><p class="subtext">接下來，${esc(a?.title || '慢慢收尾')}。<br>現在可以關掉這個頁面，把剩下的時間留給休息。</p>${state.action==='note'&&state.note?`<div class="panel"><p>留給明天的第一步</p><p class="answer-text">${esc(state.note)}</p></div>`:''}<p class="closing-quote">晚安。明天再慢慢來。</p><button class="text-button" id="return-home">回到首頁</button><p class="notice">收尾時間不代表實際入睡時間。</p></div>`;
}
function logsHTML() {
  const date=state.selectedDate||localDate(),row=state.records.find(r=>r.date===date)||{};
  const time=(name,label)=>`<label class="field">${label}<input type="time" name="${name}" value="${esc(row[name]||'')}"></label>`;
  const scale=(name,label,left,right)=>`<label class="field">${label}<select name="${name}" aria-label="${label}"><option value="">未填寫</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(row[name])===n?'selected':''}>${n}${n===1?' · '+left:n===5?' · '+right:''}</option>`).join('')}</select></label>`;
  const number=(name,label,max)=>`<label class="field">${label}<input name="${name}" type="number" min="0" max="${max}" step="1" inputmode="numeric" value="${esc(row[name]??'')}" placeholder="未知可留白；沒有則填 0"></label>`;
  return `${heading('A MINUTE FOR LAST NIGHT','生活與睡眠紀錄','早晨回顧昨晚，也替今天留下幾個簡單的生活線索。')}<section class="panel"><h2>${row.date?'補充':'新增'}一天的紀錄</h2><form id="record-form"><label class="field record-date-field">紀錄日期（起床日）<input type="date" id="record-date" name="date" required max="${localDate()}" value="${esc(date)}"></label><div class="form-section"><h3>☀ 昨晚睡得怎麼樣？</h3><p>上床和睡著分開填；獎勵看上床時間，睡不著也不會扣金幣。</p></div><div class="form-grid">${time('bedAt','前一晚上床準備睡覺時間')}${time('sleepAt','前一晚大約真正入睡時間')}${time('wakeAt','當日起床時間')}${scale('sleepQuality','前一晚睡眠自評','不好','很好')}<label class="field">前一晚有難入睡或夜醒嗎？<select name="insomnia" aria-label="前一晚有難入睡或夜醒嗎？"><option value="unknown">尚未回報</option><option value="no" ${row.insomnia==='no'?'selected':''}>沒有這種情況</option><option value="yes" ${row.insomnia==='yes'?'selected':''}>有難入睡或夜醒</option></select></label>${scale('mood','前一晚睡前緊繃程度','平靜','緊繃')}${number('screenMinutes','前一晚睡前一小時螢幕使用（分鐘）',60)}${scale('fatigue','當日白天疲勞度','精神好','很疲累')}</div><div class="form-section"><h3>✧ 這一天的白天線索</h3><p>以下記實際發生的日期，系統會用來對照下一晚的睡眠。最多追蹤五項因素：咖啡因、運動、螢幕、情緒、午睡。</p></div><div class="form-grid">${time('caffeineAt','當日最後一次咖啡因時間')}${time('exerciseAt','當日運動結束時間')}<label class="field">運動強度<select name="exerciseIntensity" aria-label="運動強度"><option value="">未填寫</option>${[['light','輕度 · 散步等'],['moderate','中等 · 呼吸變快'],['vigorous','較高 · 劇烈運動或重訓']].map(([id,label])=>`<option value="${id}" ${row.exerciseIntensity===id?'selected':''}>${label}</option>`).join('')}</select></label>${number('napMinutes','當日午睡總時長（分鐘）',180)}</div><div class="form-actions"><button class="button" type="submit">保存早晨回報${icon('check')}</button><span class="notice">達成睡前約定，金幣會自動入帳。空白表示未知。</span></div><p class="form-message" id="record-message" role="status"></p></form></section><div class="section-heading"><h2>最近的睡眠紀錄</h2><small>${state.records.length} 天紀錄</small></div>${state.records.length?`<div class="table-wrap"><table><thead><tr><th>起床日</th><th>上床 → 入睡</th><th>起床</th><th>自評</th><th>依約／金幣</th><th>操作</th></tr></thead><tbody>${[...state.records].reverse().map(r=>{const a=assessNight(r,state.targets),credited=state.economy.credits.some(c=>c.night===a.night);return `<tr><td>${esc(dateLabel(r.date))}</td><td>${esc(r.bedAt||'—')} → ${esc(r.sleepAt||'—')}</td><td>${esc(r.wakeAt||'—')}</td><td>${r.sleepQuality==null?'—':r.sleepQuality+'/5'}</td><td>${credited?'🪙 已入帳':a.status==='on-time'?'依約上床':a.status==='late'?'較晚收尾':'未知'}</td><td><button class="text-button" data-edit="${esc(r.date)}">編輯</button> &nbsp; <button class="text-button danger" data-delete="${esc(r.date)}">刪除</button></td></tr>`;}).join('')}</tbody></table></div>`:'<div class="empty"><span class="empty-icon">☀</span><p>先設定今晚的目標，明早就能回報第一晚。</p><a href="#plan" class="button secondary small">設定今晚作息</a></div>'}<p class="notice">自行回報的時間不是系統偵測。刪除紀錄不會重設已發放金幣；同一晚無法重新領取。</p><div class="section-heading"><h2>替今天畫下的句點</h2><small>收尾紀錄不等於已經入睡</small></div>${state.closures.length?`<div class="table-wrap"><table><thead><tr><th>收尾時間</th><th>選擇的動作</th><th>留給明天</th></tr></thead><tbody>${[...state.closures].reverse().slice(0,14).map(c=>`<tr><td>${esc(new Date(c.at).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}))}</td><td>${esc(actions.find(a=>a.id===c.action)?.title||c.action)}</td><td>${esc(c.note||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="notice">完成收心對話後，這裡會留下你選的收尾動作。</p>'}`;
}

function sourcesHTML(sources,prefix='source') { return sources.map(s=>`<div class="source-card" id="${prefix}-${esc(s.id)}"><h3>${esc(s.id)} · ${esc(s.title)}</h3><div class="source-meta">${esc(s.publisher)} · 查閱 ${esc(s.reviewedAt)}</div><p>${esc(s.text)}</p><a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">閱讀原始來源 ↗</a></div>`).join(''); }
function knowledgeHTML() {
  const questions = ['今天喝咖啡的時間，可能影響今晚嗎？','晚上重訓後，作息可以怎麼安排？','睡前一直想報告，怎麼替今天收尾？','週末睡太晚，怎麼讓作息穩定一點？'];
  return `${heading('SMALL CLUES, GROUNDED IN EVIDENCE','睡眠知識','把你的生活線索，和有來源的知識放在一起看。')}<section class="panel"><h2>今晚，你想了解什麼？</h2><div class="suggested-questions">${questions.map(q=>`<button data-question="${esc(q)}">${q}</button>`).join('')}</div><form id="advice-form"><label class="field" for="advice-input">你的睡眠問題</label><textarea id="advice-input" maxlength="800" placeholder="例如：我今天下午喝咖啡、晚上又運動，想知道可以注意什麼。" required ${state.adviceBusy?'disabled':''}>${esc(state.question)}</textarea><div class="form-actions"><button class="button" type="submit" ${state.adviceBusy?'disabled':''}>${state.adviceBusy?'正在查閱來源並整理…':'結合紀錄，取得建議'}${icon('sparkles')}</button><span class="notice">會將最近七天相關紀錄與問題交由 Gemini 分析。</span></div></form>${state.adviceError?`<div class="error-box" role="alert">${esc(state.adviceError)}</div>`:''}</section>${state.advice?`<section class="panel" aria-live="polite"><p class="eyebrow">${state.advice.recordCount?'結合 '+state.advice.recordCount+' 天紀錄':'尚無近期紀錄 · 以下為一般資訊'}</p><h2>給今晚的幾個線索</h2><p class="answer-text">${esc(state.advice.answer)}</p>${state.advice.suggestions.map(s=>`<article class="advice-item"><h3>${esc(s.title)}</h3><p>${esc(s.detail)}</p>${s.sourceIds.map(id=>`<a class="source-link" href="#source-${esc(id)}" data-source-anchor="${esc(id)}">依據 ${esc(id)} ↓</a>`).join('')}</article>`).join('')}<p class="notice">建議用來了解生活習慣，不能據此確定失眠原因或取代醫療評估。</p><details open><summary>這次檢索到的來源（${state.advice.sources.length}）</summary>${sourcesHTML(state.advice.sources)}</details></section>`:''}<section class="panel"><h2>知識庫裡有哪些內容？</h2><p>收錄經整理的公開衛教與研究摘要，回答前先檢索，再交由 AI 整理。</p><details><summary>查看全部 ${state.knowledge.length} 則知識來源</summary>${sourcesHTML(state.knowledge,'library')}</details></section>`;
}
function planHTML() {
  const s=state.settings,p=state.plan,t=p?.points?.[0],ai=p?.source==='gemini';
  const history=Object.entries(state.targets).filter(([date])=>date<nightDate()).sort(([a],[b])=>b.localeCompare(a)).slice(0,7);
  return `${heading('ONE NIGHT, ONE REALISTIC STEP','AI 每日作息目標','你設定想靠近的時間，AI 根據每天的紀錄，決定今晚做得到的一步。')}<section class="panel"><h2>先設定最終方向</h2><form id="plan-form"><div class="form-grid"><label class="field">目前通常幾點上床<input type="time" name="currentBedtime" value="${esc(s.currentBedtime)}"><span class="field-hint">初次使用的起點；近期滿三筆上床紀錄後，改由紀錄估計。</span></label><label class="field">最終希望幾點上床<input type="time" name="targetBedtime" required value="${esc(s.targetBedtime)}"><span class="field-hint">這是長期方向，不是今晚必須達成的時間。</span></label><label class="field">通常需要幾點起床<input type="time" name="wakeTime" required value="${esc(s.wakeTime)}"></label></div><div class="form-actions"><button class="button" type="submit" ${state.planBusy?'disabled':''}>${state.planBusy?'AI 正在分析紀錄…':'儲存方向並產生今晚目標'}${icon('sparkles')}</button><span class="notice">會將近期作息與生活紀錄交由 Gemini 分析。</span></div><p class="form-message" id="plan-message" role="status"></p></form></section>${state.planError?'<div class="error-box" role="alert">'+esc(state.planError)+(t?' 目前沿用本晚已保存的目標；尚未依最新資料更新。':' 尚未產生今晚的 AI 目標。')+'</div>':''}${t?`<div class="plan-summary"><div class="metric"><small>最終希望上床</small><strong>${esc(s.targetBedtime)}</strong></div><div class="metric"><small>${ai?'今晚 AI 建議上床':'今晚原先保存的目標'}</small><strong>${esc(t.bedtime)}</strong></div><div class="metric"><small>今晚開始收心</small><strong>${esc(t.windDown)}</strong></div></div><section class="panel"><div class="section-heading"><h2>今晚，先做到這一步</h2><span class="chip">${p.locked?'本晚約定已固定':ai?'AI 個人化分析':'先前保存的安排'}</span></div><p class="answer-text">${esc(p.message)}</p>${p.observations?.length?'<ul>'+p.observations.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':''}${p.nextStep?'<p><strong>今天先試一件事：</strong>'+esc(p.nextStep)+'</p>':''}<p class="notice">參考起點：${esc(p.baseline||'—')} · ${esc(p.baselineSource||'這晚原先保存的約定')}</p><div class="timeline"><div class="timeline-item"><span class="time">${esc(t.windDown)}</span><span class="label">開始收心</span></div><span class="timeline-arrow">→</span><div class="timeline-item"><span class="time">${esc(t.dimLights)}</span><span class="label">調暗燈光</span></div><span class="timeline-arrow">→</span><div class="timeline-item"><span class="time">${esc(t.bedtime)}</span><span class="label">上床準備睡覺</span></div></div>${p.shortOpportunity?'<p class="notice">目前過渡期的上床到起床區間仍少於七小時，可檢視是否能留出更多睡眠空間；這個區間不代表真正睡著的時數。</p>':''}<p class="notice">${esc(p.note||'只依這晚事先保存的目標核對獎勵。')} 早晨填寫紀錄後，AI 會再分析當晚的目標；時間已到的約定不事後更改。</p><div class="form-actions"><button class="button secondary small" id="export-calendar">${icon('download')}下載今晚行事曆提醒</button>${(p.sources||[]).map(x=>'<a class="source-link" href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">'+esc(x.publisher)+' ↗</a>').join('')}</div></section>`:'<div class="empty"><span class="empty-icon">⌁</span><p>'+esc(state.planBusy?'AI 正在根據你的資料安排今晚…':p?.message||'填入通常上床時間與最終目標，就能開始。')+'</p></div>'}<section class="panel"><h2>每晚的目標，都有自己的紀錄</h2><p>每天依新資料重新分析，逐步靠近最終方向。金幣比對當晚已保存的目標。</p>${history.length?'<div class="table-wrap"><table><thead><tr><th>夜晚日期</th><th>當晚上床目標</th><th>建議來源</th></tr></thead><tbody>'+history.map(([date,x])=>'<tr><td>'+esc(dateLabel(date))+'</td><td>'+esc(x.bedtime)+'</td><td>'+(x.source==='gemini'?'AI 分析':'先前保存')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="notice">第一晚完成後，這裡會開始累積歷史目標。</p>'}</section>`;
}
function settingsHTML() {
  return `${heading('MAKE IT YOUR OWN','偏好設定','讓提醒與紀錄，用你舒服的方式運作。')}<div class="settings-stack"><div class="more-links"><a class="feature-card" href="#plan"><span class="feature-icon">${icon('route')}</span><h3>作息路徑</h3><p>設定目標與今晚的睡前約定。</p></a><a class="feature-card" href="#knowledge"><span class="feature-icon">${icon('sparkles')}</span><h3>睡眠知識</h3><p>查看有文獻來源的個人化建議。</p></a></div><section class="panel"><h2>溫和介入提醒</h2><p>到了作息路徑中的「開始收心」時間，如果這個頁面仍在開啟且近期有操作，就會主動問候一次。</p><label class="check-row"><input type="checkbox" id="reminders-toggle" ${state.settings.reminders?'checked':''}>開啟頁面內收心提醒</label><div class="form-actions"><button class="button secondary small" id="preview-nudge">體驗一次關心提醒</button><button class="text-button" id="enable-notifications">允許瀏覽器通知</button></div><p class="notice">手機網頁無法偵測其他 App 的使用情況，頁面關閉或被系統暫停後也不保證提醒。需要背景提醒時，可在作息路徑下載並匯入行事曆；行事曆通知仍依裝置設定。</p></section><section class="panel"><h2>你的資料，由你決定</h2><p>生活、寵物、金幣與偏好會儲存至你的帳號，並在此裝置暫存尚未同步的變更。產生每日作息目標、查詢睡眠知識或產生 AI 回報時，近期相關紀錄與回報統計會送到後端與 Google Gemini。</p><p>手機與電腦登入同一帳號，重新開啟頁面即可讀取最新資料。Google 的資料處理仍依其服務政策。</p><label class="check-row"><input type="checkbox" id="save-closures-toggle" ${state.settings.saveClosures?'checked':''}>保留收尾時間、動作與選填的小紙條</label><div class="form-actions"><button class="button secondary small" id="export-data">${icon('download')}匯出我的資料</button><button class="text-button danger" id="clear-data">清除帳號資料</button></div></section><section class="panel"><h2>專題展示</h2><p>用獨立的虛構兩週資料，體驗領金幣、買家具和每週 recap。離開後回到原本資料。</p><div class="form-actions"><button class="button secondary small" id="enter-demo">進入示範模式</button></div></section><section class="panel"><h2>關於夜泊</h2><p>給白天被事情塞滿、晚上捨不得睡的大學生。先理解，再慢慢調整。</p><p class="notice">目前是專題展示原型，提供一般生活與睡眠知識，不診斷或治療睡眠疾病。沒有自動睡眠偵測；睡眠時間由使用者自行填寫。</p><details><summary>查看 AI 連線狀態</summary><p>${state.health?.configured?'已找到 Gemini 金鑰設定；實際服務狀態以每次請求為準。':'尚未找到 Gemini 金鑰，請參考專案 README 完成設定。'}</p><p class="notice">模型：${esc(state.health?.model || '等待連線')}<br>知識檢索：本機關鍵詞與中文雙字比對，再由模型根據取回內容生成；沒有使用向量資料庫。</p><a class="source-link" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">Google Gemini API 服務條款 ↗</a></details></section></div>`;
}
function render() {
  const page = view();
  document.body.dataset.page = page;
  $$('.nav-link').forEach(a => { a.classList.toggle('active',a.dataset.nav===page); if(a.dataset.nav===page) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  let html;
  if (page==='tonight') html = state.flow==='ritual'?ritualHTML():state.flow==='done'?doneHTML():homeHTML();
  else html = ({ pet:extras.petHTML, reports:extras.reportsHTML, logs:logsHTML, knowledge:knowledgeHTML, plan:planHTML, settings:settingsHTML, social:social.html })[page]();
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
function chooseAction() { state.flow='ritual'; state.action=''; state.note=''; state.closureId=crypto.randomUUID?.()||`local-${Date.now()}-${Math.random().toString(36).slice(2)}`; $('#nudge').hidden=true; location.hash='tonight'; render(); window.scrollTo({top:0}); }
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
  if(page==='tonight') {
    listen('#choose-action','click',chooseAction);
    $$('[data-action]').forEach(el=>el.addEventListener('click',()=>{state.action=el.dataset.action;render();}));
    listen('#tomorrow-note','input',e=>state.note=e.target.value);
    listen('#finish-night','click',()=>{
      if(!state.action)return;
      const closureId=state.closureId;
      if(state.settings.saveClosures && !state.closures.some(c=>c.id===closureId)) {
        state.closures.push({id:closureId,at:new Date().toISOString(),action:state.action,note:state.action==='note'?state.note:''});
        state.closures=state.closures.slice(-60);persist();
      }
      state.flow='done'; state.nudgeDate=nightDate(); render(); window.scrollTo({top:0});
    });
    listen('#return-home','click',()=>{state.flow='home';state.action='';state.note='';render();});
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
        state.records=cleanRecords(rows);state.advice=null;const reward=extras.awardRecord(state.records.find(r=>r.date===row.date));
        const saved=persist();await updatePlan();render();
        if(saved)toast(reward||(state.planError?'紀錄已保存；恢復後端連線後可更新 AI 目標。':'早晨回報已保存，作息路徑也已更新。'));checkNudge();
      } catch(err) { $('#record-message').textContent=err.message;button.disabled=false; }
    });
    $$('[data-edit]').forEach(el=>el.addEventListener('click',()=>{state.selectedDate=el.dataset.edit;render();$('#record-date').focus();}));
    $$('[data-delete]').forEach(el=>el.addEventListener('click',async()=>{
      if(!await confirmAction('刪除這天的紀錄？','這筆生活紀錄會從目前帳號移除並同步到其他裝置。'))return;
      state.records=state.records.filter(r=>r.date!==el.dataset.delete);state.advice=null;state.reportAI=null;persist();await updatePlan().catch(()=>{});render();toast('已刪除這天的紀錄。');
    }));
  }
  if(page==='knowledge') {
    listen('#advice-input','input',e=>state.question=e.target.value);
    $$('[data-question]').forEach(el=>el.addEventListener('click',()=>{state.question=el.dataset.question;$('#advice-input').value=state.question;$('#advice-input').focus();}));
    listen('#advice-form','submit',async e=>{
      e.preventDefault();if(state.adviceBusy)return;
      state.question=$('#advice-input').value;state.adviceBusy=true;state.adviceError='';render();
      try{state.advice=await api('/api/advice',{question:state.question,records:state.records,asOf:localDate()});}
      catch(err){state.adviceError=err.message;}
      finally{state.adviceBusy=false;if(view()==='knowledge')render();}
    });
    $$('[data-source-anchor]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();const target=$('#source-'+el.dataset.sourceAnchor);if(target){target.closest('details').open=true;target.scrollIntoView({behavior:'smooth',block:'center'});}}));
  }
  if(page==='plan') {
    listen('#plan-form','submit',async e=>{
      e.preventDefault();const button=$('button[type=submit]',e.target);button.disabled=true;
      const next={...state.settings,...Object.fromEntries(new FormData(e.target))};
      try { state.settings=next;persist();state.reportAI=null;const pending=updatePlan({force:true});render();await pending;render();toast(state.planError?'最終方向已保存，AI 分析可稍後重試。':'今晚的作息目標已更新。');checkNudge(); }
      catch(err){$('#plan-message').textContent=err.message;button.disabled=false;}
    });
    listen('#export-calendar','click',exportCalendar);
  }
  if(page==='settings') {
    listen('#reminders-toggle','change',e=>{state.settings.reminders=e.target.checked;persist();if(e.target.checked&&!state.plan?.points?.length)toast('先在作息路徑填入通常就寢時間，提醒就會依此安排。');checkNudge();});
    listen('#save-closures-toggle','change',e=>{state.settings.saveClosures=e.target.checked;persist();toast(e.target.checked?'已開啟後續收尾紀錄。':'後續不保存收尾紀錄；既有資料可匯出或清除。');});
    listen('#preview-nudge','click',()=>showNudge(true));
    listen('#enable-notifications','click',async()=>{
      if(!('Notification'in window)){toast('此瀏覽器不支援通知，仍可使用頁面內提醒或行事曆。');return;}
      try { const permission=await Notification.requestPermission();toast(permission==='granted'?'已允許通知；頁面開啟時可接收收心提醒。':'仍可使用頁面內提醒，不影響其他功能。'); } catch {toast('目前無法開啟通知，仍可使用頁面內提醒。');}
    });
    listen('#export-data','click',()=>download(`夜泊-帳號紀錄-${localDate()}.json`,JSON.stringify({version:3,demo:Boolean(state.demo),exportedAt:new Date().toISOString(),settings:state.settings,records:state.records,closures:state.closures,economy:state.economy,targets:state.targets,aiPlan:state.aiPlan},null,2),'application/json;charset=utf-8'));
    listen('#clear-data','click',async()=>{
      if(!await confirmAction(state.demo?'清除示範資料？':'清除這個帳號的全部資料？',state.demo?'只會清除這次示範資料。':'將移除帳號中的生活紀錄、寵物、金幣、家具與偏好設定，並同步到其他裝置。你可以先匯出備份。'))return;
      Object.assign(state,{settings:{...defaults},records:[],closures:[],economy:createEconomy(),targets:{},reportAI:null,plan:null,aiPlan:null,planError:'',advice:null,flow:'home',closureId:null,action:'',note:'',nudgeDate:'',snoozedUntil:0});
      const saved=persist();$('#nudge').hidden=true;render();if(saved)toast(state.demo?'已清除這次示範資料。':'已清除帳號資料，正在同步。');
    });
  }
}

function showNudge(preview=false) {
  const el=$('#nudge');
  el.innerHTML=`<span class="chip gold">${preview?'提醒預覽':'到了約定的收心時間'}</span><h2>還醒著嗎？留一點時間給你。</h2><p>到了約定的收心時間，可以把手機放遠、調暗燈光，或留一句話給明天。</p><div class="nudge-actions"><button class="button small" id="nudge-start">選一個睡前小動作${icon('arrow')}</button><button class="text-button" id="nudge-dismiss">十分鐘後再說</button></div>`;
  el.hidden=false;
  $('#nudge-start').addEventListener('click',chooseAction);
  $('#nudge-dismiss').addEventListener('click',()=>{el.hidden=true;state.snoozedUntil=Date.now()+10*60000;if(!preview)state.nudgeDate='';});
  if(!preview && 'Notification'in window && Notification.permission==='granted')try{new Notification('夜泊 · 還醒著嗎？',{body:'到了約定的收心時間，留一點時間替今天收尾。',icon:'/icon.svg'});}catch{}
}
function checkNudge() {
  const point=state.plan?.points?.[0];
  if(canNudge({enabled:state.settings.reminders,visible:document.visibilityState==='visible',flow:state.flow,handled:state.nudgeDate===nightDate(),snoozedUntil:state.snoozedUntil,lastActivity:state.lastActivity,point,now:Date.now()})){state.nudgeDate=nightDate();showNudge();}
}
$('#today-label').textContent=new Date().toLocaleDateString('zh-TW',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
window.addEventListener('hashchange',()=>{render();if(view()==='social')social.refresh();window.scrollTo({top:0});});
for(const type of ['pointerdown','keydown','touchstart'])document.addEventListener(type,()=>state.lastActivity=Date.now(),{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){state.lastActivity=Date.now();checkNudge();}});
setInterval(()=>{if(state.lastPlanDate!==nightDate()){updatePlan().then(()=>{if(view()==='plan'||(view()==='tonight'&&state.flow==='home'))render();checkNudge();}).catch(()=>{});}else checkNudge();},30000);
for(const [date,t] of Object.entries(state.targets))if(date>nightDate()&&t.source!=='gemini')delete state.targets[date];
persist();
render();
if(view()==='social')social.refresh();
setInterval(()=>{if(view()==='social'&&document.visibilityState==='visible')social.refresh({quiet:true});},30000);
Promise.allSettled([api('/api/health'),api('/api/knowledge'),updatePlan()]).then(results=>{
  if(results[0].status==='fulfilled')state.health=results[0].value;
  if(results[1].status==='fulfilled')state.knowledge=results[1].value.sources;
  $('#connection-label').textContent=state.health?(state.health.configured?'AI 金鑰已設定':'AI 尚未設定'):'後端未連線';
  $('#status-dot').classList.toggle('connected',Boolean(state.health?.configured));
  // Do not replace a form somebody has started typing into while initialization ran.
  if(!document.activeElement?.matches('input,textarea,select'))render();checkNudge();
});
