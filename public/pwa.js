const $ = selector => document.querySelector(selector);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const dialog = $('#install-dialog');
let registration;
let updating = false;

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
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
window.addEventListener('appinstalled', updateInstallBanner);
matchMedia('(display-mode: standalone)').addEventListener('change', updateInstallBanner);
updateInstallBanner();
updateConnection();

function showUpdate() { $('#update-banner').hidden = false; }
$('#update-app').addEventListener('click', () => {
  if (!registration?.waiting) return;
  updating = true;
  registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
});
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
    if (updating) location.reload();
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
  } catch {
    status.textContent = '目前無法準備離線啟動，仍可連線使用。請確認有足夠的儲存空間，再重新開啟夜泊。';
  }
}
registerOffline();
