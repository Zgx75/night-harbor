const $ = selector => document.querySelector(selector);
const LEGACY = 'night-harbor-v1';
const cacheKey = id => `night-harbor-account-${id}`;
function readCache(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }

export async function accountRequest(path, body) {
  let response;
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  } catch { throw new Error('目前無法連上夜泊，請確認電腦與啟動視窗仍在運作。'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || '目前無法完成操作，請稍後再試。'), { code: data.code, status: response.status });
  return data;
}

async function legacyProfile(user, result) {
  const legacy = readCache(LEGACY);
  const hasData = legacy && (legacy.economy?.pet || legacy.records?.length || legacy.closures?.length || Object.keys(legacy.targets || {}).length);
  if (result.revision !== 0 || !hasData || readCache(`night-harbor-migration-${user.id}`)) return result;
  const dialog = $('#legacy-dialog');
  dialog.returnValue = '';
  dialog.showModal();
  const choice = await new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true }));
  if (choice !== 'import' && choice !== 'skip') return result;
  if (choice === 'import') result = await accountRequest('/api/profile', { profile: legacy, revision: result.revision });
  try { localStorage.setItem(`night-harbor-migration-${user.id}`, JSON.stringify(choice)); } catch { /* The original data remains untouched. */ }
  return result;
}

export async function openAccount() {
  let mode = 'login', busy = false, complete;
  const ready = new Promise(resolve => { complete = resolve; });
  function setBusy(value) {
    busy = value;
    $('#auth-form').setAttribute('aria-busy', String(value));
    for (const element of $('#auth-form').elements) element.disabled = value;
    $('#auth-login').disabled = value;
    $('#auth-register').disabled = value;
    $('#auth-submit').textContent = value ? '請稍候…' : mode === 'register' ? '註冊並開始' : '登入夜泊';
  }
  function setMode(next) {
    if (busy) return;
    mode = next;
    const register = mode === 'register';
    $('#auth-login').setAttribute('aria-selected', String(!register));
    $('#auth-register').setAttribute('aria-selected', String(register));
    $('#auth-name-row').hidden = !register;
    $('#auth-confirm-row').hidden = !register;
    $('#auth-name').required = false;
    $('#auth-confirm').required = register;
    $('#auth-password').autocomplete = register ? 'new-password' : 'current-password';
    $('#auth-submit').textContent = register ? '註冊並開始' : '登入夜泊';
    $('#auth-error').textContent = '';
    $('#auth-confirm').value = '';
  }
  async function enter(user) {
    let result = await accountRequest('/api/profile');
    result = await legacyProfile(user, result);
    const cached = readCache(cacheKey(user.id));
    const pending = cached?.pending === true && cached.profile && Number.isSafeInteger(cached.revision);
    const account = { user, profile: pending ? cached.profile : result.profile, revision: pending ? cached.revision : result.revision, pending, conflict: pending && cached.revision !== result.revision };
    $('#auth-password').value = '';
    $('#auth-confirm').value = '';
    $('#account-name').textContent = user.displayName;
    $('#account-name').title = `帳號：${user.username}`;
    $('#account-tools').hidden = false;
    document.body.dataset.auth = 'ready';
    $('#app-shell').hidden = false;
    $('#auth-screen').hidden = true;
    complete(account);
  }
  $('#auth-login').addEventListener('click', () => setMode('login'));
  $('#auth-register').addEventListener('click', () => setMode('register'));
  $('#auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const username = $('#auth-username').value.trim();
    const password = $('#auth-password').value;
    if (mode === 'register' && password !== $('#auth-confirm').value) { $('#auth-error').textContent = '兩次輸入的密碼不一致。'; return; }
    const displayName = $('#auth-name').value.trim() || username;
    setBusy(true);
    $('#auth-error').textContent = '';
    try { const result = await accountRequest(`/api/auth/${mode}`, { username, password, displayName }); await enter(result.user); }
    catch (error) { $('#auth-error').textContent = error.message; }
    finally { setBusy(false); }
  });
  setBusy(true);
  try {
    const result = await accountRequest('/api/auth/session');
    if (result.user) await enter(result.user);
  } catch (error) {
    $('#auth-error').textContent = error.status === 404 ? '後端尚未更新，請重新啟動夜泊，再重新整理頁面。' : error.message;
  } finally {
    $('#auth-loading').hidden = true;
    document.body.dataset.auth = document.body.dataset.auth === 'ready' ? 'ready' : 'signed-out';
    setBusy(false);
  }
  return ready;
}

export function createProfileSync(account) {
  const key = cacheKey(account.user.id);
  let revision = account.revision, snapshot = account.profile, pending = account.pending;
  let conflict = account.conflict, expired = false, generation = 0, running, timer, closing = false;
  let lastSaved = JSON.stringify(account.profile);
  const status = $('#sync-label');
  function show(message, problem = false) {
    status.textContent = message;
    $('#account-sync').classList.toggle('sync-problem', problem);
    $('#sync-retry').hidden = !problem || conflict || expired;
    $('#sync-backup').hidden = !conflict && !expired;
    $('#sync-reload').hidden = !conflict && !expired;
    $('#sync-reload').textContent = expired ? '重新登入' : '讀取最新資料';
  }
  function cache() { localStorage.setItem(key, JSON.stringify({ profile: snapshot, revision, pending })); }
  function showConflict() { show('另一個裝置已更新資料。請先備份目前變更，再讀取帳號最新資料。', true); }
  async function performFlush() {
    if (conflict || expired || closing) return false;
    if (!pending) return true;
    if (!navigator.onLine) { show('變更已暫存在此裝置，連線後再同步。', true); return false; }
    while (pending) {
      const sent = snapshot, version = generation;
      show('正在儲存到帳號…');
      try {
        const result = await accountRequest('/api/profile', { profile: sent, revision });
        revision = result.revision;
        if (generation === version) { pending = false; lastSaved = JSON.stringify(sent); }
        try { cache(); } catch { /* Server save succeeded; keep the current in-memory revision. */ }
      } catch (error) {
        conflict = error.code === 'PROFILE_CONFLICT';
        expired = error.code === 'LOGIN_REQUIRED';
        if (conflict) showConflict();
        else show(expired ? '登入已到期。變更已保留在此裝置，請重新登入。' : `變更尚未同步：${error.message}`, true);
        return false;
      }
    }
    show('資料已同步');
    return true;
  }
  function flush() {
    clearTimeout(timer);
    if (running) return running;
    running = performFlush().finally(() => { running = null; });
    return running;
  }
  function save(value) {
    if (closing) return false;
    const json = JSON.stringify(value);
    if (!pending && json === lastSaved) return true;
    const previous = { snapshot, pending, generation };
    snapshot = JSON.parse(json); pending = true; generation++;
    try { cache(); }
    catch {
      ({ snapshot, pending, generation } = previous);
      show('此裝置無法暫存變更，請先匯出資料並檢查儲存空間。', true);
      return false;
    }
    if (conflict) { showConflict(); return true; }
    show(navigator.onLine ? '正在儲存到帳號…' : '變更已暫存在此裝置，連線後再同步。', !navigator.onLine);
    clearTimeout(timer); timer = setTimeout(flush, 350);
    return true;
  }
  function backup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 3, username: account.user.username, exportedAt: new Date().toISOString(), ...snapshot }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `night-harbor-${account.user.username}-backup.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('#sync-backup').addEventListener('click', backup);
  $('#sync-retry').addEventListener('click', flush);
  $('#sync-reload').addEventListener('click', () => {
    if (expired) { closing = true; location.reload(); return; }
    if (pending && !window.confirm('讀取帳號最新資料會放棄這台裝置尚未同步的變更。需要保留時，請先按「下載此裝置備份」。確定重新讀取？')) return;
    closing = true; localStorage.removeItem(key); location.reload();
  });
  $('#logout-account').addEventListener('click', async () => {
    const button = $('#logout-account'); button.disabled = true;
    try {
      const saved = await flush();
      if (!saved && pending && !window.confirm('還有尚未同步的資料，會暫存在這台裝置，下次登入同一帳號時再處理。仍要登出？')) return;
      closing = true;
      await accountRequest('/api/auth/logout', {});
      location.reload();
    } catch (error) { closing = false; show(error.message, true); }
    finally { button.disabled = false; }
  });
  window.addEventListener('online', flush);
  window.addEventListener('pagehide', () => { if (pending) { try { cache(); } catch { /* Already cached on each change. */ } } });
  window.addEventListener('beforeunload', event => { if (pending && !closing) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && pending) flush(); });
  $('#account-sync').hidden = false;
  if (conflict) showConflict();
  else if (pending) timer = setTimeout(flush, 0);
  else show('資料已同步');
  return { save, flush, sessionExpired() { expired = true; show('登入已到期，請重新登入。尚未同步的變更仍保留在此裝置。', true); } };
}
