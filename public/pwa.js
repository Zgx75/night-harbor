const $ = selector => document.querySelector(selector);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const dialog = $('#install-dialog');
let registration;
let updating = false;
let needsReload = false;
let seenController = Boolean(navigator.serviceWorker?.controller);
let applying = false;
let checking;
let lastCheck = 0;
const dirtyForms = new Set();

// A form remains protected until a successful action replaces it or the user leaves it.
for (const type of ['input','change']) document.addEventListener(type,event=>{
  const form=event.target.closest?.('form');
  if(form)dirtyForms.add(form);
},true);
document.addEventListener('reset',event=>dirtyForms.delete(event.target),true);
function canUpdate() {
  if(document.visibilityState!=='visible'||!navigator.onLine||document.querySelector('dialog[open]'))return false;
  if(document.activeElement?.matches('textarea,select,[contenteditable="true"],input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])'))return false;
  for(const form of dirtyForms){if(form.isConnected&&!form.closest('[hidden]'))return false;dirtyForms.delete(form);}
  const guard=window.nightHarborUpdates;
  return guard?guard.canUpdate():document.body.dataset.auth==='signed-out';
}
async function applyUpdate() {
  if(applying||(!registration?.waiting&&!needsReload)||!canUpdate())return;
  applying=true;
  let activated=false;
  try {
    if(window.nightHarborUpdates&&!await window.nightHarborUpdates.prepare())return;
    // User input may have changed while a pending account save was in flight.
    if(!canUpdate())return;
    if(needsReload){needsReload=false;location.reload();return;}
    if(registration.waiting){updating=true;activated=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});}
  } catch { showUpdate(); }
  finally { applying=false;if(activated&&needsReload)applyUpdate(); }
}
function checkUpdates() {
  if(!registration||!navigator.onLine||document.visibilityState!=='visible')return Promise.resolve();
  if(checking)return checking;
  if(Date.now()-lastCheck<1000)return applyUpdate();
  lastCheck=Date.now();
  checking=registration.update().then(()=>{
    if(registration.waiting)showUpdate();
    return applyUpdate();
  }).catch(()=>{}).finally(()=>{checking=null;});
  return checking;
}

function updateInstallBanner() {
  let dismissed = false;
  try { dismissed = sessionStorage.getItem('night-harbor-install-dismissed') === 'yes'; } catch { /* Storage may be unavailable. */ }
  $('#install-banner').hidden = standalone() || dismissed;
}
function updateConnection() {
  $('#offline-banner').hidden = navigator.onLine;
}
function showInstall() {
  $('#install-description').textContent = standalone()
    ? '夜泊已從主畫面開啟。你可以隨時回來查看安裝與離線狀態。'
    : '用 iPhone 的 Safari 開啟夜泊，依照以下步驟安裝。';
  if (!dialog.open) dialog.showModal();
}
document.addEventListener('click', event => {
  if (event.target.closest('[data-install-app]')) showInstall();
});
$('#close-install').addEventListener('click', () => dialog.close());
$('#finish-install').addEventListener('click', () => dialog.close());
$('#dismiss-install').addEventListener('click', () => {
  try { sessionStorage.setItem('night-harbor-install-dismissed', 'yes'); } catch { /* Hide for this page anyway. */ }
  $('#install-banner').hidden = true;
});
window.addEventListener('online', () => { updateConnection(); checkUpdates(); });
window.addEventListener('offline', updateConnection);
window.addEventListener('appinstalled', updateInstallBanner);
matchMedia('(display-mode: standalone)').addEventListener('change', updateInstallBanner);
updateInstallBanner();
updateConnection();

function showUpdate() { $('#update-banner').hidden = false; applyUpdate(); }
$('#update-app').addEventListener('click',applyUpdate);
window.addEventListener('pageshow',checkUpdates);
window.addEventListener('night-harbor:update-ready',applyUpdate);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkUpdates();});
setInterval(()=>{if(registration?.waiting||needsReload)applyUpdate();},1500);
setInterval(checkUpdates,60000);
async function registerOffline() {
  const status = $('#pwa-storage-status');
  if (!window.isSecureContext) {
    status.textContent = '這個連線可先加入主畫面並連線使用。離線啟動需要 HTTPS 網址；使用目前的區網網址時，請讓電腦與啟動視窗保持開啟。';
    return;
  }
  if (!('serviceWorker' in navigator)) {
    status.textContent = '目前瀏覽器無法準備離線啟動，仍可在連線時使用夜泊。';
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(seenController||updating){needsReload=true;showUpdate();}
    seenController=true;
  });
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    if (registration.waiting) showUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        if (worker.state === 'redundant' && !registration.active) status.textContent = '離線準備未完成，恢復連線後請重新開啟夜泊。';
      });
    });
    await navigator.serviceWorker.ready;
    status.textContent = '介面已可離線載入。登入需要後端連線；已登入頁面的變更可先暫存在此裝置，連線後再同步。';
    checkUpdates();
  } catch {
    status.textContent = '目前無法準備離線啟動，仍可連線使用。請確認有足夠的儲存空間，再重新開啟夜泊。';
  }
}
registerOffline();
