/* Pancko Gestión v0.12.18 — only transport/configuration, no economic logic. */
const PANCKO_APP_TOKEN_KEY='pk_app_token_v1';
const panckoModuleNames={budgets:'Presupuestos',colors:'Colores',cash:'Caja diaria',cc:'Cuenta corriente / clientes',catalog:'Lista central (consulta de versión)'};
const panckoModuleStates={},panckoModuleErrors={};let panckoSyncAllBusy=false;
function panckoAppToken(){return ''; /* LAB no credentials */}
function panckoSafeMessage(error){const token=panckoAppToken();return String(error?.message||error||'Error de sincronización').split(token||'\u0000').join('[clave oculta]');}
function panckoModuleFor(url){const path=String(url).split('?')[0];return /\/cash\//.test(path)?'cash':/\/cc\//.test(path)?'cc':/\/articles/.test(path)?'catalog':/\/colou?r/.test(path)?'colors':/\/budget/.test(path)?'budgets':null;}
function panckoStatus(module,text){if(module)panckoModuleStates[module]=text;panckoRenderStates();}
function panckoRenderStates(){const el=document.getElementById('panckoModuleStatus');if(!el)return;el.replaceChildren();for(const [key,name]of Object.entries(panckoModuleNames)){const row=document.createElement('p');const strong=document.createElement('strong');strong.textContent=name+': ';row.appendChild(strong);const span=document.createElement('span');span.textContent=panckoModuleStates[key]||(panckoAppToken()?'Listo para consultar':'Sin clave operativa configurada');row.appendChild(span);el.appendChild(row);}}
async function panckoFetch(url,options={}){
 throw new Error('LAB: sincronización central bloqueada. No hay Worker ni Sheet conectados.');
 const token=panckoAppToken(),module=panckoModuleFor(url);
 try{
  if(token.length<32)throw new Error('Configurá la Clave operativa Pancko en Sincronización (mínimo 32 caracteres).');
  const ctrl=options.signal?null:new AbortController(),timer=ctrl?setTimeout(()=>ctrl.abort(),55000):null;let response;try{response=await fetch(url,{...options,signal:options.signal||ctrl.signal,headers:{...options.headers,Authorization:'Bearer '+token},cache:'no-store'});}finally{if(timer)clearTimeout(timer);}
  const data=await response.clone().json();
  if(response.status===401||data.code==='AUTH_REQUIRED'||/AUTH_REQUIRED/.test(data.error||''))throw new Error('Clave operativa inválida. Revisá Sincronización. Los pendientes siguen guardados.');
  if(!response.ok||data.ok===false){const message=panckoSafeMessage(data.error||'Error de sincronización');if(module)(panckoModuleErrors[module]||=[]).push(message);panckoStatus(module,message);}
  else panckoStatus(module,'Última consulta correcta · '+new Date().toLocaleTimeString('es-AR')+(data.legacy?' · backend en transición':''));
  return response;
 }catch(e){const message=panckoSafeMessage(e);if(module)(panckoModuleErrors[module]||=[]).push(message);panckoStatus(module,message);throw new Error(message);}
}
function panckoSaveKey(){document.getElementById('panckoConnectionStatus').textContent='LAB: sincronización central bloqueada. No se guardan claves.';}
async function panckoTestConnection(){
 const status=document.getElementById('panckoConnectionStatus');status.textContent='Verificando Worker y Apps Script…';
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),55000);
 try{const res=await panckoFetch(PANCKO_API_URL+'/auth/check',{signal:ctrl.signal});const data=await res.json();if(!data.ok||data.authenticated!==true||!data.worker_version||!data.version)throw new Error(data.error||'Actualizá ambos backends antes de probar conexión.');status.textContent='Conexión validada · Worker '+data.worker_version+' · Apps Script '+data.version;}
 catch(e){status.textContent=panckoSafeMessage(e);}finally{clearTimeout(timer);}
}
async function panckoSyncAll(){
 if(panckoSyncAllBusy)return;panckoSyncAllBusy=true;const btn=document.getElementById('panckoSyncAllBtn');if(btn)btn.disabled=true;
 const jobs={
 budgets:async()=>{if(budgetCloudSyncRunning)throw new Error('Presupuestos ya está sincronizando.');await syncPendingBudgets();await syncBudgetsFromCloud();if(budgetHistory.some(x=>x._sync!=='synced')||JSON.parse(labStorage.getItem('pk_budget_delete_queue')||'[]').length)throw new Error('Hay presupuestos pendientes de enviar.');},
 colors:async()=>{if(labCloudSyncRunning)throw new Error('Colores ya está sincronizando.');await syncPendingLabRecords();await syncLabRecordsFromCloud();if(labRecords.some(x=>x._sync!=='synced'))throw new Error('Hay colores pendientes de enviar.');},
 cash:async()=>{if(cashSyncBusy)throw new Error('Caja está sincronizando; revisá al finalizar.');const dates=[...new Set([...(cashBook.sync_pending||[]).map(x=>x.date),cashSelectedDate])];let failure='';for(const date of dates){await cashSyncDate(date);if(cashSyncError||cashSyncConflict)failure=cashSyncError||cashSyncConflict;}if(failure||(cashBook.sync_pending||[]).length)throw new Error(failure||'Caja tiene cambios pendientes.');},
 cc:async()=>{if(ccSyncBusy||ccAutoReadBusy)throw new Error('CC está sincronizando; revisá al finalizar.');await ccSyncNow();if(ccSyncConflict||ccSyncError||ccPending().length)throw new Error(ccSyncConflict?'Conflicto: revisar':ccSyncError||'CC tiene pendientes.');},
 catalog:async()=>{const data=await catalogRequest('/articles/meta');rememberCatalogCentral(data);renderCatalogManagement();}
 };
 try{for(const [module,job]of Object.entries(jobs)){panckoModuleErrors[module]=[];panckoStatus(module,'Sincronizando…');try{if(!panckoAppToken())throw new Error('Sin clave operativa configurada.');if(navigator.onLine===false)throw new Error('Sin red · datos y pendientes conservados localmente.');await job();if(panckoModuleErrors[module].length)throw new Error(panckoModuleErrors[module][0]);if(/error|inválid|ausente|demorada|configur|conflicto/i.test(panckoModuleStates[module]||''))continue;panckoStatus(module,module==='catalog'?'Versión consultada. Sin aplicar ni publicar.':'Sincronización finalizada · '+new Date().toLocaleTimeString('es-AR'));}catch(e){panckoStatus(module,panckoSafeMessage(e));}}}finally{panckoSyncAllBusy=false;if(btn)btn.disabled=false;}
}
function panckoInitOperationalSync(){const field=document.getElementById('panckoAppTokenInput');if(!field)return;field.value=panckoAppToken();try{document.getElementById('panckoDeviceName').value=JSON.parse(labStorage.getItem('pk_cash_identity_v1')||'{}').name||'';}catch{}panckoRenderStates();}
