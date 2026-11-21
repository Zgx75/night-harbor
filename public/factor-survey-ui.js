import { FACTORS, FOLLOW_UPS, pendingSurvey, cleanFactors, cleanAnswers, needsCareNote } from './factor-survey.js';
import { DAILY_LINES, nextFeedback } from './responses.js';
import { PETS } from './progress.js';

export function createFactorSurvey(ctx) {
  const { state, persist, render, toast, esc, icon, localDate } = ctx;
  const $ = s => document.querySelector(s);
  let draft = null, thanks = null;
  const pending = () => pendingSurvey(state.factorSurveys);
  const start = () => { draft = { step: 0, error: '', answers: { factors: [] } }; };
  const when = d => new Date(d + 'T12:00:00').toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
  const careNote = '<p class="notice care-note">如果睡不著的情況持續發生，而且已經影響白天的生活，建議找醫師或學校的健康中心聊聊，由專業人員協助評估。夜泊不做診斷。</p>';

  function question(factor, q, values) {
    if (q.when && Object.entries(q.when).some(([k, want]) => values[k] !== want)) return '';
    const name = `${factor}.${q.key}`;
    const rerender = Object.values(FOLLOW_UPS[factor]).some(other => other.when && q.key in other.when) ? ' data-rerender' : '';
    let body;
    if (q.type === 'time') body = `<input type="time" name="${name}" value="${esc(values[q.key] || '')}">`;
    else body = `<div class="choice-list">${q.options.map(([id, label]) => `<label class="choice-dot"><input type="${q.type}" name="${name}" value="${id}" ${(q.type === 'checkbox' ? (values[q.key] || []).includes(id) : values[q.key] === id) ? 'checked' : ''}${rerender}><span>${esc(label)}</span></label>`).join('')}</div>`;
    return `<fieldset class="survey-question"><legend>${esc(q.label)}</legend>${body}</fieldset>`;
  }

  function html() {
    const heading = `<div class="page-heading"><div><h1>最近，有什麼不一樣嗎？</h1><p>大約一分鐘。只問你選的項目，沒有標準答案。</p></div></div>`;
    if (thanks) return `${heading}<section class="panel"><h2>謝謝你告訴我</h2><p>我們會把這些和之後的紀錄放在一起看。回答只代表這幾天的狀況，不會被當成晚睡的原因。</p>${thanks.care ? careNote : ''}<div class="form-actions"><a class="button" href="#pet">回到小夥伴身邊${icon('arrow')}</a></div></section>`;
    const round = pending();
    if (!round) return `${heading}<section class="panel"><p>目前沒有需要填寫的問卷。最近七天有三晚比目標晚超過 15 分鐘時，小夥伴才會來問你。</p><a class="button secondary small" href="#pet">回到寵物首頁</a></section>`;
    if (!draft) start();
    const a = draft.answers;
    const pet = PETS.find(p => p.id === state.economy.pet?.id), lines = DAILY_LINES.survey;
    const invite = pet ? `<div class="pet-says"><span aria-hidden="true">${pet.emoji}</span><p><strong>${esc(state.economy.pet.name)}</strong>${esc(lines[Number(round.triggeredOn.slice(-2)) % lines.length])}</p></div>` : '';
    const intro = `<p class="notice">這次是因為 ${round.lateDates.map(when).join('、')} 這幾天比目標晚超過 15 分鐘。</p>`;
    let body;
    if (draft.step === 0) {
      body = `<fieldset class="survey-question"><legend>最近幾天，有什麼事情和平常不一樣？（最多選 3 項）</legend><div class="choice-list">${FACTORS.map(([id, label]) => `<label class="choice-dot"><input type="checkbox" name="factors" value="${id}" ${a.factors.includes(id) ? 'checked' : ''} data-rerender><span>${esc(label)}</span></label>`).join('')}</div></fieldset>
        ${a.factors.includes('other') ? `<label class="field">想補充的話（選填，40 字以內）<input name="otherText" maxlength="40" value="${esc(a.otherText || '')}"></label>` : ''}`;
    } else {
      body = a.factors.filter(f => FOLLOW_UPS[f]).map(f => `<section class="survey-block"><h3>${esc(FACTORS.find(([id]) => id === f)[1])}</h3>${FOLLOW_UPS[f].map(q => question(f, q, a[f] || {})).join('')}</section>`).join('');
    }
    const last = draft.step === 1 || !a.factors.some(f => FOLLOW_UPS[f]);
    return `${heading}<progress class="survey-progress" max="2" value="${draft.step + 1}" aria-label="第 ${draft.step + 1} 步，共 2 步"></progress><p class="survey-step">第 ${draft.step + 1} / 2 步 · ${draft.step === 0 ? '選擇可能的影響' : '幾個小問題'}</p>
      ${draft.step === 0 ? invite : ''}<form id="factor-form" class="panel survey-form" novalidate>${intro}${body}${draft.error ? `<div class="error-box" role="alert">${esc(draft.error)}</div>` : ''}
      <div class="form-actions">${draft.step > 0 ? '<button class="button secondary" type="button" id="factor-back">上一步</button>' : ''}<button class="button" type="submit">${last ? '送出' : '下一步'}${icon('arrow')}</button></div></form>
      <p class="notice">完成這份問卷後，就能繼續使用其他功能。回答保存在你的帳號，只用來和之後的作息紀錄一起觀察，不會用來扣金幣。</p>`;
  }

  function collect(form) {
    const data = new FormData(form), a = draft.answers;
    if (draft.step === 0) {
      a.factors = data.getAll('factors');
      if (data.has('otherText')) a.otherText = data.get('otherText');
      return;
    }
    for (const f of a.factors.filter(f => FOLLOW_UPS[f])) {
      const values = {};
      for (const q of FOLLOW_UPS[f]) {
        const name = `${f}.${q.key}`;
        if (q.type === 'checkbox') { if (data.has(name)) values[q.key] = data.getAll(name); }
        else if (data.has(name) && data.get(name) !== '') values[q.key] = data.get(name);
      }
      a[f] = values;
    }
  }
  function close(update) {
    const round = pending();
    state.factorSurveys = state.factorSurveys.map(s => s === round ? { ...s, ...update } : s);
    return persist();
  }

  function bind(page) {
    if (page !== 'factors') return;
    const form = $('#factor-form');
    if (!form) return;
    form.querySelectorAll('[data-rerender]').forEach(el => el.addEventListener('change', () => { collect(form); draft.error = ''; render(); }));
    form.addEventListener('submit', event => {
      event.preventDefault(); collect(form);
      try {
        if (draft.step === 0) {
          cleanFactors(draft.answers.factors);
          if (draft.answers.factors.some(f => FOLLOW_UPS[f])) { draft.step = 1; draft.error = ''; render(); window.scrollTo({ top: 0 }); return; }
        }
        const answers = cleanAnswers(draft.answers);
        // Today's pet line stops inviting once the round is answered.
        if (state.petFeedback?.kind === 'survey') state.petFeedback = nextFeedback(state.petFeedback, state.petFeedback.date, 'reminder');
        if (!close({ status: 'completed', completedOn: localDate(), answers })) throw new Error('問卷尚未保存，請檢查裝置儲存空間後再試。');
        thanks = { care: needsCareNote(answers) }; draft = null;
      } catch (error) { draft.error = error.message; }
      render(); window.scrollTo({ top: 0 });
    });
    $('#factor-back')?.addEventListener('click', () => { collect(form); draft.step = 0; draft.error = ''; render(); });
  }

  // A waiting round must be answered before the rest of the app is available.
  const required = () => Boolean(pending());
  return { html, bind, required, busy: () => Boolean(draft) && location.hash === '#factors' };
}
