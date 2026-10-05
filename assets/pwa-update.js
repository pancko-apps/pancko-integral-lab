/* Pancko Gestión v0.12.18 · Recarga de archivos; el almacenamiento local permanece intacto. */
'use strict';
const PANCKO_INSTALLED_VERSION='Pancko Gestión v0.12.19 R9';
const PANCKO_UPDATE_MARKER='pk_pwa_refresh_pending_v1';
const PANCKO_REOPEN_MESSAGE='Actualización preparada. Cerrá todas las ventanas de Pancko y volvé a abrir.';
let pwaPublishedVersion='',pwaCheckedAt='',pwaUpdateBusy=false;

function pwaShowBanner(message,success=false){
 const box=document.getElementById('pwaUpdateBanner');if(!box)return;
 box.textContent=message;box.classList.toggle('pwa-update-success',success);box.hidden=!message;
}
function pwaReadMarker(){try{return JSON.parse(labSession.getItem(PANCKO_UPDATE_MARKER)||'null');}catch{return null;}}
function pwaWriteMarker(value){try{labSession.setItem(PANCKO_UPDATE_MARKER,JSON.stringify(value));}catch{}}
function pwaClearMarker(){try{labSession.removeItem(PANCKO_UPDATE_MARKER);}catch{}}
function pwaCheckAfterNavigation(){
 const pending=pwaReadMarker();if(!pending)return '';
 if(Date.now()-pending.at>15*60*1000){pwaClearMarker();return '';}
 if(pending.expected===PANCKO_INSTALLED_VERSION){pwaClearMarker();pwaShowBanner(PANCKO_INSTALLED_VERSION+' actualizada.',true);return 'Actualización completada.';}
 pwaShowBanner(PANCKO_REOPEN_MESSAGE);return PANCKO_REOPEN_MESSAGE;
}
async function pwaRegistration(){return 'serviceWorker' in navigator?navigator.serviceWorker.getRegistration('./'):null;}
async function pwaRenderUpdate(note=''){
 const box=document.getElementById('pwaUpdateInfo');if(!box)return;let status='No disponible';
 try{if('serviceWorker' in navigator){const r=await pwaRegistration();status=r?.waiting?'Actualización en espera':r?.active?'Activo'+(navigator.serviceWorker.controller?' · controlando esta ventana':' · activando'):'Sin registro activo';}}
 catch{status='No se pudo consultar el service worker';}
 box.textContent='Instalada: '+PANCKO_INSTALLED_VERSION+' · Publicada: '+(pwaPublishedVersion||'sin consultar')+' · Última comprobación: '+(pwaCheckedAt?new Date(pwaCheckedAt).toLocaleString('es-AR'):'—')+' · Service worker: '+status+(note?' · '+note:'');
}
async function pwaCheckUpdate(){if(pwaUpdateBusy)return false;pwaUpdateBusy=true;try{
 const url=new URL('./data/version.json',location.href);url.searchParams.set('pk_fresh',Date.now().toString());const res=await fetch(url.href,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});if(!res.ok)throw new Error('No se pudo leer version.json ('+res.status+').');
 const data=await res.json();if(typeof data.app!=='string'||!/^Pancko Gestión v\d+\.\d+\.\d+ R\d+$/.test(data.app))throw new Error('La versión publicada no tiene el formato esperado.');
 pwaPublishedVersion=data.app;pwaCheckedAt=new Date().toISOString();await pwaRenderUpdate(data.app===PANCKO_INSTALLED_VERSION?'La versión coincide. Podés recargar igual.':'Actualización disponible.');return true;
 }catch(e){await pwaRenderUpdate('Comprobación demorada: '+e.message);return false;}finally{pwaUpdateBusy=false;}}
async function pwaWaitForWaiting(reg){
 if(reg?.waiting)return reg.waiting;
 const worker=reg?.installing;if(!worker?.addEventListener)return null;
 if(worker.state==='installed')return reg.waiting||worker;
 await new Promise(resolve=>{
  const done=()=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);resolve();};
  const changed=()=>{if(['installed','activated','redundant'].includes(worker.state))done();};
  const timer=setTimeout(done,4500);worker.addEventListener('statechange',changed);changed();
 });
 return reg.waiting||(worker.state==='installed'?worker:null);
}
async function pwaActivateWaiting(worker){
 if(!worker?.postMessage)return false;
 const service=navigator.serviceWorker,previous=service.controller;
 const changed=new Promise(resolve=>{
  const done=()=>{clearTimeout(timer);service.removeEventListener?.('controllerchange',onChange);resolve(service.controller!==previous);};
  const onChange=()=>{if(service.controller!==previous)done();};
  const timer=setTimeout(done,4500);service.addEventListener?.('controllerchange',onChange);onChange();
 });
 worker.postMessage({type:'PANCKO_SKIP_WAITING'});
 return changed;
}
async function pwaForceUpdate(){
 if(pwaUpdateBusy)return;
 if(!navigator.onLine){const message='Necesitás conexión para renovar los archivos. Tus datos siguen disponibles.';pwaShowBanner(message);await pwaRenderUpdate(message);return;}
 if(!confirm('Se recargará Pancko. Sólo se limpian archivos cacheados de esta app; tus datos locales se conservan. ¿Continuar?'))return;
 if(!await pwaCheckUpdate()){pwaShowBanner('No se pudo comprobar la versión publicada. Reintentá con conexión.');return;}
 pwaUpdateBusy=true;
 try{
  if(!('caches' in window))throw new Error('Este navegador no permite limpiar Cache Storage desde Pancko.');
  await pwaRenderUpdate('Preparando recarga desde la red…');
  // Borrar antes del update impide que el worker anterior sirva index.html viejo en la siguiente navegación.
  const names=await caches.keys();await Promise.all(names.filter(n=>n.startsWith('pancko-lab-')).map(n=>caches.delete(n)));
  const reg=await pwaRegistration();
  if(reg){
   try{await reg.update();}catch{} // La navegación con URL nueva todavía puede traer los archivos actuales.
   const waiting=await pwaWaitForWaiting(reg);
   if(waiting)await pwaActivateWaiting(waiting);
   else if(reg.active)try{await reg.unregister();}catch{} // Al reabrir se instala la versión publicada.
  }
  pwaWriteMarker({expected:pwaPublishedVersion,at:Date.now()});
  pwaShowBanner(PANCKO_REOPEN_MESSAGE);
  await pwaRenderUpdate('Recargando desde la red. Si la versión no cambia, cerrá todas las ventanas y volvé a abrir.');
  const url=new URL(location.href);url.searchParams.set('pk_refresh',Date.now().toString());url.searchParams.set('pk_fresh',Date.now().toString());
  location.replace(url.href);
  setTimeout(()=>pwaShowBanner(PANCKO_REOPEN_MESSAGE),3500);
 }catch(e){pwaShowBanner(PANCKO_REOPEN_MESSAGE);await pwaRenderUpdate('No se completó la recarga: '+e.message+' · '+PANCKO_REOPEN_MESSAGE);}
 finally{pwaUpdateBusy=false;}
}
pwaRenderUpdate(pwaCheckAfterNavigation());
