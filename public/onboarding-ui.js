import { ONBOARDING_VERSION, FREQUENCY, TRAITS, WELLBEING, CAFFEINE, ALCOHOL, EXERCISE_TIME, INTENSITY, LATE_REASONS, CHRONOTYPES, validateStep, cleanAnswers, cleanOnboarding, clockOf, hours } from './onboarding.js';
import { PETS, petTransaction } from './progress.js';

const STEPS = ['平常的作息', '睡眠與生活感受', '咖啡因、酒精與運動', '目標與夥伴'];

export function createOnboarding(ctx) {
  const { state, persist, render, toast, esc, icon, updatePlan } = ctx;
  const $ = s => document.querySelector(s);
  let draft = null, requested = false;
  const start = () => {
    const previous = state.onboarding?.status === 'completed' ? structuredClone(state.onboarding.answers) : {};
    draft = { step: 0, error: '', answers: { workDays: 5, targetBedtime: state.settings.targetBedtime, ...previous }, petId: state.economy.pet?.id || 'cat', petName: state.economy.pet?.name || '' };
  };
  const needsPet = () => !state.economy.pet;
  // First-login users are sent here automatically; existing data is never forced through it.
  const shouldStart = () => !state.demo && !state.onboarding && !state.economy.pet && !state.records.length;

  const radios = (name, options, value) => `<div class="choice-row" role="radiogroup">${options.map(([id, label]) => `<label class="choice-pill"><input type="radio" name="${name}" value="${id}" ${value === id ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>`;
  const question = (title, body, hint = '') => `<fieldset class="survey-question"><legend>${title}</legend>${hint ? `<p class="field-hint">${hint}</p>` : ''}${body}</fieldset>`;
  const timeField = (name, label, value) => `<label class="field">${label}<input type="time" name="${name}" value="${esc(value || '')}" required></label>`;
  function windowFields(prefix, title, w = {}) {
    return `<section class="survey-block"><h3>${title}</h3><div class="form-grid">${timeField(prefix + '.bedAt', '上床準備睡覺', w.bedAt)}${timeField(prefix + '.sleepAt', '大約真正睡著', w.sleepAt)}${timeField(prefix + '.wakeAt', '起床', w.wakeAt)}</div></section>`;
  }

  function stepHTML(step, a) {
    if (step === 0) {
      const days = Number.isInteger(Number(a.workDays)) ? Number(a.workDays) : 5;
      return `${question('每週大約有幾天要上課或上班？', `<select name="workDays" data-rerender>${[0, 1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${days === n ? 'selected' : ''}>${n} 天</option>`).join('')}</select>`, '其餘的日子算「非上課日」，例如週末或沒有排課的日子。')}
        ${days > 0 ? windowFields('work', '☀ 上課日，通常…', a.work) : ''}
        ${days < 7 ? `${windowFields('free', '☾ 非上課日，通常…', a.free)}${question('非上課日起床時，會用鬧鐘嗎？', radios('free.alarm', [['no', '不用，自然醒'], ['yes', '會用鬧鐘']], a.free?.alarm === true ? 'yes' : a.free?.alarm === false ? 'no' : ''), '用鬧鐘起床時，假日作息較難反映自然的生理時鐘，結果會標示僅供參考。')}` : ''}`;
    }
    if (step === 1) return `<p class="notice">依最近一個月的狀況，選最接近的頻率。</p>${[...TRAITS, ...WELLBEING].map(([key, text]) => question(esc(text), radios(key, FREQUENCY, a[key]))).join('')}`;
    if (step === 2) return `${question('通常幾點喝最後一杯含咖啡因的飲品？', radios('caffeine', CAFFEINE, a.caffeine), '咖啡、茶、能量飲料與部分可樂都含咖啡因。')}
      ${question('每週飲酒的頻率？', radios('alcohol', ALCOHOL, a.alcohol).replace('<div class="choice-row"', '<div class="choice-row" data-rerender'))}
      ${a.alcohol && a.alcohol !== 'never' ? question('有喝酒的日子，會在睡前三小時內喝嗎？', radios('alcoholBeforeBed', FREQUENCY, a.alcoholBeforeBed)) : ''}
      ${question('通常在什麼時段運動？', radios('exerciseTime', EXERCISE_TIME, a.exerciseTime).replace('<div class="choice-row"', '<div class="choice-row" data-rerender'))}
      ${a.exerciseTime && a.exerciseTime !== 'none' ? `${question('每週大約運動幾天？', `<select name="exerciseDays">${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${Number(a.exerciseDays) === n ? 'selected' : ''}>${n} 天</option>`).join('')}</select>`)}${question('通常的運動強度？', radios('exerciseIntensity', INTENSITY, a.exerciseIntensity))}` : ''}`;
    const reasons = a.lateReasons || [];
    return `${question('常見的晚睡原因（最多選 3 項）', `<div class="choice-row">${LATE_REASONS.map(([id, label]) => `<label class="choice-pill"><input type="checkbox" name="lateReasons" value="${id}" ${reasons.includes(id) ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>`)}
      ${question('最終希望幾點上床準備睡覺？', `<input type="time" name="targetBedtime" value="${esc(a.targetBedtime || '')}" required>`, '這是長期方向。每晚的目標由 AI 依紀錄小幅調整；以上床時間核對，可晚 15 分鐘。睡不著不會扣金幣。')}
      ${needsPet() ? question('選一位陪你的小夥伴', `<div class="pet-choices">${PETS.map(p => `<label class="pet-choice ${draft.petId === p.id ? 'selected' : ''}"><input class="visually-hidden" type="radio" name="petId" value="${p.id}" ${draft.petId === p.id ? 'checked' : ''} data-rerender><span aria-hidden="true">${p.emoji}</span><small>${p.name}</small></label>`).join('')}</div><label class="field">給小夥伴取個名字<input name="petName" maxlength="16" required value="${esc(draft.petName)}" placeholder="例如：糯米"></label>`) : ''}`;
  }

  function resultHTML() {
    const o = state.onboarding, d = o.derived, a = o.answers;
    const h = m => m == null ? '—' : `${hours(m)} 小時`;
    const metric = (label, value, note) => `<article><small>${label}</small><strong class="metric-text">${value}</strong><span>${note}</span></article>`;
    return `<section class="panel"><p class="eyebrow">YOUR STARTING POINT</p><h2>你的作息起點</h2><div class="report-metrics">
      ${metric('時型傾向', CHRONOTYPES[d.chronotype], d.msfsc == null ? '需要非上課日的作息' : `修正後假日睡眠中點 ${clockOf(d.msfsc)}${d.msfscReliable ? '' : ' · 假日用鬧鐘，僅供參考'}`)}
      ${metric('社交時差', d.socialJetlag == null ? '—' : `${hours(d.socialJetlag)} 小時`, d.socialJetlag == null ? '需要上課日與非上課日' : '上課日與非上課日睡眠中點的差距')}
      ${metric('每週平均睡眠', h(d.weeklyDuration), `上課日 ${h(d.workDuration)} · 非上課日 ${h(d.freeDuration)}`)}
      </div><p class="notice">依 MCTQ（Munich ChronoType Questionnaire）的睡眠中點計算。偏早、中間、偏晚的分界（03:30、05:30）是本產品自訂，用來描述傾向，不是醫學分型或診斷。睡眠時長以入睡到起床估算，不等於實際睡著的時數。</p>
      <p>已把最終方向設為 <strong>${esc(a.targetBedtime)}</strong> 上床，目前起點為 <strong>${esc(state.settings.currentBedtime)}</strong>。AI 會參考這份問卷與之後的每日紀錄，安排今晚的一小步。</p>
      <div class="form-actions"><a class="button" href="#pet">開始使用夜泊${icon('arrow')}</a><a class="text-button" href="#plan">查看今晚作息</a></div></section>`;
  }

  function html() {
    if (state.demo) return `<div class="page-heading"><div><h1>初次問卷</h1><p>示範模式不會保存問卷，回到自己的資料後就能填寫。</p></div></div>`;
    // A completed or skipped questionnaire only opens again when the user asks for it,
    // never because #onboarding is still in the address bar after a reload.
    if (!draft && !requested && state.onboarding) { setTimeout(() => { if (location.hash === '#onboarding') location.replace('#pet'); }); return ''; }
    if (!draft) start();
    requested = false;
    if (draft.step === 4 && state.onboarding?.status === 'completed') return `${heading()}${resultHTML()}`;
    const step = draft.step;
    return `${heading()}<progress class="survey-progress" max="${STEPS.length}" value="${step + 1}" aria-label="第 ${step + 1} 步，共 ${STEPS.length} 步"></progress><p class="survey-step">第 ${step + 1} / ${STEPS.length} 步 · ${STEPS[step]}</p>
      <form id="onboarding-form" class="panel survey-form" novalidate>${stepHTML(step, draft.answers)}
      ${draft.error ? `<div class="error-box" role="alert">${esc(draft.error)}</div>` : ''}
      <div class="form-actions">${step > 0 ? '<button class="button secondary" type="button" id="survey-back">上一步</button>' : ''}<button class="button" type="submit">${step === STEPS.length - 1 ? '完成問卷' : '下一步'}${icon('arrow')}</button>${state.onboarding ? '' : '<button class="text-button" type="button" id="survey-skip">稍後再填</button>'}</div></form>
      <p class="notice">答案保存在你的帳號；產生作息目標時，只把整理後的摘要交給 AI 參考。之後可以在偏好設定重新填寫。</p>`;
  }
  const heading = () => `<div class="page-heading"><div><p class="eyebrow">BEFORE WE BEGIN</p><h1>先認識一下你的作息</h1><p>大約兩分鐘。沒有標準答案，照平常的樣子填就好。</p></div></div>`;

  function collect(form) {
    const data = new FormData(form), a = draft.answers;
    for (const [name, value] of data) {
      if (name === 'lateReasons' || name === 'petId' || name === 'petName') continue;
      const [group, key] = name.split('.');
      if (key) { a[group] = { ...(a[group] || {}) }; a[group][key] = key === 'alarm' ? value === 'yes' : value; }
      else a[name] = ['workDays', 'exerciseDays'].includes(name) ? Number(value) : value;
    }
    if (draft.step === 3) a.lateReasons = data.getAll('lateReasons');
    if (data.has('petId')) draft.petId = data.get('petId');
    if (data.has('petName')) draft.petName = data.get('petName');
  }

  async function finish() {
    const answers = cleanAnswers(draft.answers);
    let economy = state.economy;
    if (needsPet()) economy = petTransaction(economy, { type: 'adopt', id: draft.petId, name: draft.petName });
    const onboarding = cleanOnboarding({ version: ONBOARDING_VERSION, status: 'completed', completedAt: new Date().toISOString(), answers });
    const before = { onboarding: state.onboarding, economy: state.economy, settings: state.settings };
    const usual = answers.work || answers.free;
    Object.assign(state, { onboarding, economy, settings: { ...state.settings, currentBedtime: usual.bedAt, wakeTime: usual.wakeAt, targetBedtime: answers.targetBedtime } });
    if (!persist()) { Object.assign(state, before); throw new Error('問卷尚未保存，請檢查裝置儲存空間後再試。'); }
    draft.step = 4;
    updatePlan({ force: true }).catch(() => {}).finally(() => { if (location.hash === '#onboarding') render(); });
  }

  function bind(page) {
    if (page !== 'onboarding' || state.demo) return;
    const form = $('#onboarding-form');
    if (!form) return;
    form.querySelectorAll('[data-rerender], [data-rerender] input').forEach(el => el.addEventListener('change', () => { collect(form); draft.error = ''; render(); }));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      collect(form);
      try {
        validateStep(draft.step, draft.answers);
        if (draft.step === 3 && needsPet() && !String(draft.petName).trim()) throw new Error('給小夥伴取個名字吧。');
        draft.error = '';
        if (draft.step < 3) draft.step++;
        else await finish();
      } catch (error) { draft.error = error.message; }
      render(); window.scrollTo({ top: 0 });
    });
    $('#survey-back')?.addEventListener('click', () => { collect(form); draft.error = ''; draft.step--; render(); window.scrollTo({ top: 0 }); });
    $('#survey-skip')?.addEventListener('click', () => {
      state.onboarding = { version: ONBOARDING_VERSION, status: 'skipped', skippedAt: new Date().toISOString() };
      persist(); draft = null; location.hash = 'pet'; toast('之後可以在偏好設定填寫初次問卷。');
    });
  }

  function promptHTML() {
    // Only accounts that have never answered or skipped see the invitation; skipping hides it.
    if (state.demo || state.onboarding) return '';
    return `<section class="panel survey-prompt"><div><h2>花兩分鐘，讓夜泊更認識你</h2><p>回答平常的作息與生活習慣，AI 安排目標時會一起參考。</p></div><a class="button secondary small" href="#onboarding" data-start-survey>填寫初次問卷</a></section>`;
  }
  function settingsHTML() {
    const o = state.onboarding;
    const summary = o?.status === 'completed' ? `<p>上次填寫：${esc(new Date(o.completedAt).toLocaleDateString('zh-TW'))} · 時型傾向 ${CHRONOTYPES[o.derived.chronotype]}${o.derived.socialJetlag == null ? '' : ` · 社交時差 ${hours(o.derived.socialJetlag)} 小時`}</p>` : '<p>尚未填寫。回答平常的作息與生活習慣，AI 安排目標時會一起參考。</p>';
    return `<section class="panel"><h2>初次問卷</h2>${summary}<div class="form-actions"><a class="button secondary small" href="#onboarding" data-start-survey>${o?.status === 'completed' ? '重新填寫問卷' : '填寫初次問卷'}</a></div><p class="notice">重新填寫會更新作息起點、起床時間與最終方向，已保存的每晚目標與金幣不會改變。</p></section>`;
  }
  // Starting from a link always begins at step one with the latest saved answers.
  document.addEventListener('click', event => { if (event.target.closest?.('[data-start-survey]')) { draft = null; requested = true; } });

  return { html, bind, shouldStart, promptHTML, settingsHTML, busy: () => Boolean(draft && draft.step < 4 && location.hash === '#onboarding') };
}
