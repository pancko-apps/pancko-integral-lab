/* Pancko Gestión v0.12.18 · Recarga de navegación con cache busting; datos locales intactos. */
const CACHE_NAME='pancko-lab-v0.12.19-r9';
const APP_ASSETS=['./','./index.html','./manifest.webmanifest','./assets/lab-storage.js','./assets/operational-sync.js','./assets/icon-192.png','./assets/icon-512.png','./assets/cc-product-detail.js','./assets/cc-payment-applications.js','./assets/pwa-update.js','./assets/budget-workbench.js','./assets/budget-workbench.css','./assets/tinto-online-experimental.js','./assets/tinto-online-experimental.css','./data/version.json','./data/articulos.csv','./data/clientes.csv','./data/recetas.csv'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_ASSETS.map(path=>new Request(path,{cache:'reload'}))))); // espera cierre de ventanas: no mezcla una página vieja con código nuevo.
});
self.addEventListener('message',event=>{if(event.data?.type==='PANCKO_SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('pancko-lab-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 // Worker/Apps Script nunca se guardan ni se responden desde Cache Storage.
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 const scope=new URL('./',self.location.href).pathname;
 if(!url.pathname.startsWith(scope))return;
 if(request.mode==='navigate'){
  if(url.searchParams.has('pk_refresh')){event.respondWith(fetch(request,{cache:'no-store'}));return;}
  event.respondWith(caches.open(CACHE_NAME).then(async cache=>(await cache.match('./index.html'))||fetch(request)));
  return;
 }
 if(url.searchParams.has('pk_fresh')){event.respondWith(fetch(request,{cache:'no-store'}));return;}
 const asset=APP_ASSETS.find(a=>new URL(a,self.location.href).pathname===url.pathname);
 if(!asset)return;
 event.respondWith(caches.open(CACHE_NAME).then(async cache=>(await cache.match(asset))||fetch(request)));
});
