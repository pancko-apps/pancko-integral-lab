
/* Pancko Gestión v0.12.18 — sincronización de Caja, sin alterar los demás módulos. */
'use strict';
const CASH_IDENTITY_KEY='pk_cash_identity_v1';
const CASH_SYNC_TIME_KEY='pk_cash_sync_time_v1';
let cashSyncTimer=null,cashSyncBusy=false,cashSyncInFlightId=null,cashSyncConflict='',cashSyncError='',cashLastSync=null;
function cashIdentity(){
 try{let x=JSON.parse(labStorage.getItem(CASH_IDENTITY_KEY)||'null');if(!x||typeof x!=='object')x={};
  if(!x.id){x.id='dev_'+crypto.randomUUID();labStorage.setItem(CASH_IDENTITY_KEY,JSON.stringify(x));}
  return {id:x.id,name:String(x.name||''),token:panckoAppToken()};
 }catch{return {id:'unknown',name:'',token:''};}
}
function cashSyncEnabled(){const x=cashIdentity();return !!(x.name.trim()&&x.token.trim());}
function cashSaveSettings(){
 const name=document.getElementById('cashDeviceName').value.trim();
 if(!name||name.length>80){cashSyncError='Ingresá un nombre de dispositivo de hasta 80 caracteres.';cashRenderSyncStatus();return;}
 const current=cashIdentity();try{labStorage.setItem(CASH_IDENTITY_KEY,JSON.stringify({id:current.id,name}));cashSyncError='';cashSyncConflict='';cashRenderSyncStatus();cashScheduleSync(cashSelectedDate);}catch{cashSyncError='No se pudo guardar la configuración en este dispositivo.';cashRenderSyncStatus();}
}
function cashSame(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function cashOp(date,kind,data){return {op_id:'op_'+crypto.randomUUID(),date,kind,data,created_at:new Date().toISOString()};}
function cashPushOp(book,op){
 book.sync_pending=book.sync_pending||[];
 const tail=book.sync_pending.at(-1);
 if(op.kind==='draft'&&tail?.kind==='draft'&&tail.date===op.date&&tail.op_id!==cashSyncInFlightId){
  tail.data.after=op.data.after;
  if(cashSame(tail.data.before,tail.data.after))book.sync_pending.pop();
 }else book.sync_pending.push(op);
}
function cashRemoteDayCopy(day){const out=JSON.parse(JSON.stringify(day));out.deleted_ids=out.deleted_ids||[];out.applied_ops=out.applied_ops||[];return out;}
// Se invoca ANTES del único setItem que guarda la mutación, de modo que día y cola quedan juntos.
function cashRecordMutation(next,previous,selected){
 next.sync_pending=next.sync_pending||[];next.sync_versions=next.sync_versions||{};
 const before=new Map(previous.days.map(d=>[d.date,d]));
 for(const after of next.days){
  const prior=before.get(after.date),date=after.date;
  if(!prior){cashPushOp(next,cashOp(date,'create',{day:cashRemoteDayCopy(after)}));continue;}
  const sameCore=cashSame({opening:prior.opening_cents,movements:prior.movements,draft:prior.close_draft,state:prior.state},{opening:after.opening_cents,movements:after.movements,draft:after.close_draft,state:after.state});
  if(sameCore)continue;
  if(!next.sync_versions[date]&&!next.sync_pending.some(o=>o.date===date&&o.kind==='create'))cashPushOp(next,cashOp(date,'create',{day:cashRemoteDayCopy(prior)}));
  const label=cashIdentity().name||'Sin identificar',stamp=new Date().toISOString();
  after.updated_by=label;
  if(prior.state==='open'&&after.state==='closed'){
   after.closed_by=label;after.closing.closed_by=label;
   cashPushOp(next,cashOp(date,'close',{closing:after.closing,closing_draft:after.close_draft,before_draft:prior.close_draft}));continue;
  }
  if(prior.state==='closed'&&after.state==='open'){cashPushOp(next,cashOp(date,'reopen',{closed_at:prior.closing.closed_at}));continue;}
  if(prior.opening_cents!==after.opening_cents)cashPushOp(next,cashOp(date,'opening',{before:prior.opening_cents,after:after.opening_cents,opening_count_source:after.opening_count_source||null}));
  const oldMoves=new Map(prior.movements.map(m=>[m.id,m]));
  for(const m of after.movements){const old=oldMoves.get(m.id);
   if(!old){m.created_by=label;m.updated_by=label;cashPushOp(next,cashOp(date,'add',{movement:{...m}}));}
   else if(!cashSame(old,m)){m.updated_by=label;cashPushOp(next,cashOp(date,m.voided_at&&!old.voided_at?'void':'edit',{id:m.id,before:old,after:{...m}}));}
  }
  for(const old of prior.movements)if(!after.movements.some(m=>m.id===old.id))cashPushOp(next,cashOp(date,'delete',{id:old.id,before:old}));
  if(!cashSame(prior.close_draft,after.close_draft))cashPushOp(next,cashOp(date,'draft',{before:prior.close_draft,after:after.close_draft}));
 }
 if(next.sync_pending.length>3000)throw new Error('Demasiadas operaciones pendientes. Sincronizá o exportá un respaldo antes de seguir.');
}
function cashSyncWrite(change){
 const raw=labStorage.getItem(CASH_KEY);if(raw!==cashRaw){cashLoad();return false;}
 const book=cashReadBook(raw);change(book);book.revision=cashInteger(book.revision+1);cashValidateBook(book);
 const serialized=JSON.stringify(book);if(labStorage.getItem(CASH_KEY)!==raw){cashLoad();return false;}
 labStorage.setItem(CASH_KEY,serialized);cashBook=book;cashRaw=serialized;return true;
}
function cashRenderSyncStatus(){
 const el=document.getElementById('cashSyncStatus');if(!el)return;
 const pending=(cashBook.sync_pending||[]).filter(o=>o.date===cashSelectedDate).length;
 const state=cashSyncConflict?'Conflicto / revisar':cashSyncBusy?'Sincronizando…':pending?'Pendiente de enviar · '+pending:cashSyncEnabled()&&cashBook.sync_versions?.[cashSelectedDate]?'Sincronizada':'Guardada localmente';
 const last=cashLastSync||labStorage.getItem(CASH_SYNC_TIME_KEY);
 el.textContent=state+(last?' · Última sincronización: '+cashStamp(last):'')+(cashSyncConflict?' · '+cashSyncConflict:cashSyncError?' · Sincronización demorada. Los cambios siguen guardados localmente. '+cashSyncError:pending&&!cashSyncBusy?' · Los cambios siguen guardados localmente.':'');
 el.classList.toggle('cash-sync-warning',!!(pending||cashSyncConflict||cashSyncError));
}
function cashScheduleSync(date,slow=false){
 cashRenderSyncStatus();if(!cashSyncEnabled()||navigator.onLine===false)return;
 clearTimeout(cashSyncTimer);cashSyncTimer=setTimeout(()=>cashSyncDate(date),slow?950:280);
}
async function cashApi(path,body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{const response=await panckoFetch(PANCKO_API_URL+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:controller.signal});
 const data=await response.json();if(!data.ok&&!data.conflict)throw new Error(data.error||'El backend de Caja no respondió correctamente.');return data;
 }finally{clearTimeout(timer);}
}
function cashConflictNotice(msg){cashSyncConflict=msg;cashSyncError='';cashRenderSyncStatus();}
async function cashSyncDate(date=cashSelectedDate,{refreshOnly=false}={}){
 if(cashSyncBusy||!cashSyncEnabled())return false;
 if(navigator.onLine===false){cashSyncError='Sin conexión; el libro sigue local.';cashRenderSyncStatus();return false;}
 cashSyncBusy=true;cashSyncError='';cashRenderSyncStatus();let changed=false;
 try{
  for(let i=0;i<150;i++){
   const op=(cashBook.sync_pending||[]).find(x=>x.date===date);
   if(op){if(refreshOnly){cashConflictNotice('Hay cambios locales pendientes; enviá o resolvé antes de actualizar.');return false;}
    cashSyncInFlightId=op.op_id;
    const result=await cashApi('/cash/apply',{...op,device:cashIdentity().name+' · '+cashIdentity().id.slice(-6)});cashSyncInFlightId=null;
    if(result.conflict){cashConflictNotice(result.error);return false;}
    const ack=cashSyncWrite(book=>{const ix=(book.sync_pending||[]).findIndex(x=>x.op_id===op.op_id);
     if(ix<0)return;book.sync_pending.splice(ix,1);book.sync_versions=book.sync_versions||{};book.sync_versions[date]=result.revision;
     if(!book.sync_pending.some(x=>x.date===date)){const at=book.days.findIndex(x=>x.date===date);if(at>=0)book.days[at]=result.day;else book.days.push(result.day);}
    });
    if(!ack){cashConflictNotice('Otra pestaña cambió el libro mientras se enviaba. Reintentá la sincronización.');return false;}
    changed=true;continue;
   }
   const result=await cashApi('/cash/get',{date,include_previous:true}),local=cashBook.days.find(d=>d.date===date),remote=result.day;
   if(!remote&&result.previous){
    const prior=result.previous,known=cashBook.days.find(d=>d.date===prior.date);
    if(known&&!cashBook.sync_versions?.[prior.date]){cashConflictNotice('Hay un cierre anterior local sin conciliar. Revisá la fecha '+cashDateLabel(prior.date)+' antes de abrir una caja nueva.');return false;}
    if(!(cashBook.sync_pending||[]).some(x=>x.date===prior.date)&&(!known||known.central_revision!==prior.central_revision)){
     if(!cashSyncWrite(book=>{const at=book.days.findIndex(d=>d.date===prior.date);if(at<0)book.days.push(prior);else book.days[at]=prior;book.sync_versions=book.sync_versions||{};book.sync_versions[prior.date]=prior.central_revision;})){cashConflictNotice('El libro cambió mientras se recibía el cierre anterior. Reintentá.');return false;}
     changed=true;
    }
   }
   if(!remote&&local){
    if(cashBook.sync_versions?.[date]){cashConflictNotice('La caja central ya no existe. No se sobrescribió el respaldo local.');return false;}
    if(!cashSyncWrite(book=>{book.sync_pending=book.sync_pending||[];book.sync_pending.push(cashOp(date,'create',{day:cashRemoteDayCopy(book.days.find(d=>d.date===date))}));})){cashConflictNotice('El libro cambió mientras preparábamos la caja. Reintentá.');return false;}continue;
   }
   if(remote){
    if(local&&!cashBook.sync_versions?.[date]){cashConflictNotice('Este dispositivo tiene una caja local anterior y ya existe otra central para la misma fecha. Guardá respaldo y revisá antes de recibirla.');return false;}
    if((cashBook.sync_pending||[]).some(x=>x.date===date))continue;
    if(!local||result.revision!==cashBook.sync_versions?.[date]){
     if(!cashSyncWrite(book=>{const at=book.days.findIndex(d=>d.date===date);if(at<0)book.days.push(remote);else book.days[at]=remote;book.sync_versions=book.sync_versions||{};book.sync_versions[date]=result.revision;})){cashConflictNotice('El libro cambió mientras se recibía. Reintentá.');return false;}
     changed=true;
    }
   }
   cashSyncConflict='';cashLastSync=new Date().toISOString();try{labStorage.setItem(CASH_SYNC_TIME_KEY,cashLastSync);}catch{}
   if(changed&&cashSelectedDate===date){cashCloseInputs.delete(date);renderCashModule(false);renderCashHome();}
   return true;
  }
  throw new Error('Demasiadas operaciones en cola. Reintentá.');
 }catch(e){cashSyncError=e?.name==='AbortError'?'Tiempo de espera agotado. Los cambios siguen locales.':String(e.message||e);return false;}
 finally{cashSyncInFlightId=null;cashSyncBusy=false;cashRenderSyncStatus();}
}
async function cashSyncNow(){if(!cashSyncEnabled()){cashSyncError='Configurá nombre y Clave operativa Pancko en este dispositivo.';cashRenderSyncStatus();return;}await cashSyncDate(cashSelectedDate);}
async function cashRefreshFromCentral(){if(!cashSyncEnabled()){cashSyncError='Configurá nombre y Clave operativa Pancko en este dispositivo.';cashRenderSyncStatus();return;}await cashSyncDate(cashSelectedDate,{refreshOnly:true});}
async function cashSyncAllPending(){
 const dates=[...new Set((cashBook.sync_pending||[]).map(o=>o.date))];
 for(const date of dates){if(date===cashSelectedDate)continue;await cashSyncDate(date);}
 await cashSyncDate(cashSelectedDate);
}
async function cashReplaceFromCentral(){
 const date=cashSelectedDate;if(!cashSyncEnabled()){cashSyncError='Configurá nombre y clave antes de recibir.';cashRenderSyncStatus();return;}
 if(!confirm('Esta acción reemplazará la caja local de '+cashDateLabel(date)+' y sus pendientes por la versión central. Se guardará una copia íntegra del libro local en este dispositivo. ¿Continuar?'))return;
 const word=prompt('Para confirmar, escribí RECIBIR:');if(word!=='RECIBIR')return;
 try{const result=await cashApi('/cash/get',{date});if(!result.day)throw new Error('No existe caja central para esta fecha.');
  const backup=labStorage.getItem(CASH_KEY);labStorage.setItem('pk_cash_daily_backup_'+Date.now(),backup||'{}');cashDownload('Pancko_Caja_antes_de_recibir_'+date+'.json',backup||'{}','application/json;charset=utf-8');
  if(!cashSyncWrite(book=>{book.sync_pending=(book.sync_pending||[]).filter(x=>x.date!==date);book.sync_versions=book.sync_versions||{};book.sync_versions[date]=result.revision;const at=book.days.findIndex(d=>d.date===date);if(at<0)book.days.push(result.day);else book.days[at]=result.day;}))throw new Error('El libro local cambió. Reintentá.');
  cashSyncConflict='';cashSyncError='';cashLastSync=new Date().toISOString();cashCloseInputs.delete(date);renderCashModule(false);renderCashHome();cashRenderSyncStatus();
 }catch(e){cashSyncError=String(e.message||e);cashRenderSyncStatus();}
}
async function cashBeforeSensitive(action){
 if(!cashSyncEnabled())return true;
 if(cashSyncConflict){cashMessage='Hay conflicto de sincronización. Actualizá y revisá antes de '+action+' la caja.';renderCashNotice();return false;}
 if(navigator.onLine===false)return confirm('Sin conexión. ¿'+(action==='cerrar'?'Cerrar':'Reabrir')+' sólo en este dispositivo y dejar la operación pendiente de sincronizar?');
 const before=cashDay(),fingerprint=JSON.stringify(before&&{state:before.state,opening:before.opening_cents,movements:before.movements,draft:before.close_draft,closing:before.closing?.closed_at});
 if(!(await cashSyncDate(cashSelectedDate))){
  if(cashSyncConflict){cashMessage='Hay conflicto central. Actualizá y revisá antes de '+action+' la caja.';renderCashNotice();return false;}
  return confirm('No se pudo consultar la caja central ('+(cashSyncError||'sin respuesta')+'). ¿'+(action==='cerrar'?'Cerrar':'Reabrir')+' sólo localmente y dejar la operación pendiente?');
 }
 const now=cashDay(),after=JSON.stringify(now&&{state:now.state,opening:now.opening_cents,movements:now.movements,draft:now.close_draft,closing:now.closing?.closed_at});
 if(before&&fingerprint!==after){cashMessage='La caja cambió al recibir datos centrales. Revisá movimientos y conteo, y volvé a intentar.';renderCashNotice();return false;}
 return true;
}
// Reacciona a la apertura, el cambio de fecha y la reconexión sin polling permanente.
const cashShowScreenSync=showScreen;
showScreen=function(id,options={}){const prior=cashSelectedDate;cashShowScreenSync(id,options);if(id==='cashScreen'){if(prior!==cashSelectedDate)cashSyncConflict='';cashRenderSyncStatus();cashScheduleSync(cashSelectedDate);}};
const cashSelectDateSync=cashSelectDate;
cashSelectDate=function(date){const prior=cashSelectedDate;cashSelectDateSync(date);if(prior!==cashSelectedDate)cashSyncConflict='';cashRenderSyncStatus();cashScheduleSync(cashSelectedDate);};
window.addEventListener('online',()=>{setTimeout(()=>cashSyncAllPending(),300);});
window.addEventListener('storage',e=>{if(labStorage.eventKey(e.key)===CASH_KEY||labStorage.eventKey(e.key)===CASH_IDENTITY_KEY)cashRenderSyncStatus();});
const cashStoredIdentity=cashIdentity();
document.getElementById('cashDeviceName').value=cashStoredIdentity.name;

cashRenderSyncStatus();

