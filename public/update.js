// This recovery entry deliberately bypasses the offline shell and never clears user data.
const status=document.querySelector('#update-status');
const retry=document.querySelector('#retry-update');
const open=document.querySelector('#open-app');
let running=false;
async function update() {
  if(running)return;
  running=true;retry.hidden=true;open.hidden=true;
  status.textContent='正在下載新版夜泊，請保持連線…';
  let timeout;
  try {
    if(!navigator.onLine)throw new Error('目前離線，請恢復連線後再更新。');
    if(!('serviceWorker' in navigator)||!window.isSecureContext){location.replace('/#social');return;}
    const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
    await registration.update();
    await new Promise((resolve,reject)=>{
      let watched,settled=false;
      function finish(){done();}
      function done(error){
        if(settled)return;
        settled=true;clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener('controllerchange',finish);
        registration.removeEventListener('updatefound',inspect);
        watched?.removeEventListener('statechange',inspect);
        if(error)reject(error);else resolve();
      }
      timeout=setTimeout(()=>done(new Error('更新尚未完成，請確認網路連線後重試。')),25000);
      function inspect(){
        if(registration.waiting){status.textContent='新版已下載，正在切換…';registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});return;}
        const worker=registration.installing;
        if(worker){
          if(worker!==watched){watched=worker;worker.addEventListener('statechange',inspect);}
          if(worker.state==='redundant')done(new Error('新版下載未完成，請保持連線再試一次。'));
          return;
        }
        if(registration.active)finish();
      }
      navigator.serviceWorker.addEventListener('controllerchange',finish);
      registration.addEventListener('updatefound',inspect);
      inspect();
    });
    status.textContent='更新完成，正在開啟好友功能…';open.hidden=false;
    location.replace('/#social');
  }catch(error){status.textContent=error.message||'目前無法更新，請恢復連線後重試。';retry.hidden=false;}
  finally{clearTimeout(timeout);running=false;}
}
retry.addEventListener('click',update);
update();
