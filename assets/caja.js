/* Pancko Gestión v0.12.7 — Libro local de efectivo y cola de sincronización. */
'use strict';
const CASH_KEY='pk_cash_daily_v1';
const CASH_GROUPS=[['large','20.000 y 10.000 juntos'],['medium','2.000, 1.000 y 500 juntos'],['small','200 y 100 juntos'],['change','50 y 10 juntos'],['coins','Otros / monedas']];
let cashBook={schema_version:1,revision:0,days:[]},cashRaw=null,cashStorageError='',cashMessage='',cashSaving=false;
let cashSelectedDate=cashToday(),cashEditingId=null,cashRenderedDate=null;
const cashCloseInputs=new Map();
let cashDraftPending=false,cashDraftWriteError=false;
function cashToday(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');}
function cashValidDate(date){return /^\d{4}-\d{2}-\d{2}$/.test(String(date))&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;}
function cashDateLabel(date){return date.split('-').reverse().join('/');}
function cashStamp(value,short=false){if(!value)return 'Sin registrar';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hourCycle:'h23',...(short?{hour:'2-digit',minute:'2-digit'}:{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}):'Sin registrar';}
function cashMoney(cents){return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:0,maximumFractionDigits:2}).format(cents/100);}
function cashInputMoney(cents){return (cents/100).toLocaleString('es-AR',{useGrouping:false,minimumFractionDigits:0,maximumFractionDigits:2});}
function cashInteger(n){if(!Number.isSafeInteger(n))throw new Error('Importe fuera del rango admitido.');return n;}
function cashParseMoney(value,{blankZero=false,nonnegative=false}={}){
  let s=String(value??'').trim().replace(/^\$\s*/,'').replace(/\s/g,'');
  if(!s){if(blankZero)return 0;throw new Error('Ingresá un importe.');}
  if(!/^-?\d[\d.,]*$/.test(s))throw new Error('Importe inválido. Usá, por ejemplo, 4.750 o 4.750,50.');
  const negative=s[0]==='-';if(negative)s=s.slice(1);let whole,decimal='';
  if(s.includes(',')){
    const parts=s.split(',');if(parts.length!==2||!/^\d{1,2}$/.test(parts[1]))throw new Error('Usá hasta dos decimales después de la coma.');
    whole=parts[0];decimal=parts[1];if(whole.includes('.')&&!/^\d{1,3}(?:\.\d{3})+$/.test(whole))throw new Error('Separadores de miles inválidos.');whole=whole.replace(/\./g,'');
  }else if(s.includes('.')){
    if(/^\d{1,3}(?:\.\d{3})+$/.test(s))whole=s.replace(/\./g,'');
    else if(/^\d+\.\d{1,2}$/.test(s))[whole,decimal]=s.split('.');
    else throw new Error('Importe inválido. Usá punto de miles y coma decimal.');
  }else whole=s;
  const cents=cashInteger((Number(whole)*100+Number(decimal.padEnd(2,'0')))*(negative?-1:1));
  if(nonnegative&&cents<0)throw new Error('Ese importe no puede ser negativo.');return cents;
}
function cashSum(values){return values.reduce((sum,n)=>cashInteger(sum+cashInteger(n)),0);}
function cashTotals(day){const active=day.movements.filter(m=>!m.voided_at);const income=cashSum(active.filter(m=>m.amount_cents>=0).map(m=>m.amount_cents)),expenses=cashSum(active.filter(m=>m.amount_cents<0).map(m=>-m.amount_cents));return {income_cents:income,expenses_cents:expenses,theoretical_cents:cashInteger(day.opening_cents+income-expenses)};}
function cashValidateClose(c){
  if(!c||typeof c.has_count!=='boolean'||!c.counts)throw new Error('Datos de conteo inválidos.');
  CASH_GROUPS.forEach(([id])=>{if(cashInteger(c.counts[id])<0)throw new Error('Conteo negativo.');});
  if(cashInteger(c.withdrawal_cents)<0||c.remaining_override_cents!==null&&cashInteger(c.remaining_override_cents)<0)throw new Error('Retiro o saldo dejado inválido.');
  const total=cashSum(CASH_GROUPS.map(([id])=>c.counts[id]));if(c.has_count&&c.withdrawal_cents>total)throw new Error('El retiro no puede superar el efectivo contado.');
  return total;
}
function cashValidateBook(book){
  if(!book||book.schema_version!==1||!Number.isSafeInteger(book.revision)||book.revision<0||!Array.isArray(book.days))throw new Error('Formato de libro de caja no reconocido.');
  const dates=new Set();
  for(const d of book.days){
    if(!cashValidDate(d.date)||d.id!=='cash_'+d.date||dates.has(d.date)||!['open','closed'].includes(d.state)||!Array.isArray(d.movements)||!Array.isArray(d.audit)||!Array.isArray(d.closing_history)||!Number.isFinite(Date.parse(d.created_at))||!Number.isFinite(Date.parse(d.updated_at)))throw new Error('Hay una jornada inválida o duplicada.');
    dates.add(d.date);if(cashInteger(d.opening_cents)<0)throw new Error('Saldo inicial negativo.');
    const movementIds=new Set();
    for(const m of d.movements){if(typeof m.id!=='string'||!/^mov_[\w-]+$/.test(m.id)||movementIds.has(m.id)||typeof m.detail!=='string'||!m.detail.trim()||m.detail.length>300||!Number.isFinite(Date.parse(m.created_at))||!Number.isFinite(Date.parse(m.updated_at)))throw new Error('Movimiento inválido.');cashInteger(m.amount_cents);movementIds.add(m.id);}
    if(d.deleted_ids!==undefined&&(!Array.isArray(d.deleted_ids)||d.deleted_ids.some(id=>typeof id!=='string'||movementIds.has(id))||new Set(d.deleted_ids).size!==d.deleted_ids.length))throw new Error('IDs eliminados inválidos.');
    cashValidateClose(d.close_draft);d.totals=cashTotals(d);
    for(const c of [...d.closing_history,...(d.closing?[d.closing]:[])]){
      const total=cashValidateClose(c);if(!c.has_count||!Number.isFinite(Date.parse(c.closed_at))||!Array.isArray(c.movement_snapshot))throw new Error('Cierre histórico inválido.');
      const t=cashTotals({opening_cents:cashInteger(c.opening_cents),movements:c.movement_snapshot});
      if(c.total_counted_cents!==total||c.theoretical_cents!==t.theoretical_cents||c.income_cents!==t.income_cents||c.expenses_cents!==t.expenses_cents||c.difference_cents!==total-t.theoretical_cents||c.remaining_cents!==(c.remaining_override_cents??total-c.withdrawal_cents))throw new Error('El cierre contiene importes inconsistentes.');
      if(Object.hasOwn(c,'remaining_counts')){
        const derived=cashRemainingBreakdown(c);
        if((c.remaining_counts===null)!==(derived.counts===null)||c.remaining_counts!==null&&CASH_GROUPS.some(([id])=>c.remaining_counts?.[id]!==derived.counts[id])||c.remaining_counts!==null&&cashSum(CASH_GROUPS.map(([id])=>c.remaining_counts[id]))!==c.remaining_cents)throw new Error('El desglose para mañana no coincide con el cierre.');
      }
    }
    if(d.opening_count_source){const source=d.opening_count_source;if(typeof source.day_id!=='string'||!Number.isFinite(Date.parse(source.closed_at))||!source.counts||CASH_GROUPS.some(([id])=>!Number.isSafeInteger(source.counts[id])||source.counts[id]<0)||cashSum(CASH_GROUPS.map(([id])=>source.counts[id]))!==d.opening_source?.suggested_cents)throw new Error('Desglose inicial inválido.');}
    if(d.state==='closed'&&(!d.closing||d.closing.theoretical_cents!==d.totals.theoretical_cents||d.closing.opening_cents!==d.opening_cents||JSON.stringify(d.closing.movement_snapshot)!==JSON.stringify(d.movements)))throw new Error('Caja cerrada sin cierre coherente.');
    if(d.state==='open'&&d.closing)throw new Error('Caja abierta con cierre activo.');
  }return book;
}
function cashReadBook(raw){return raw===null?{schema_version:1,revision:0,days:[]}:cashValidateBook(JSON.parse(raw));}
function cashLoad(){try{const raw=labStorage.getItem(CASH_KEY);cashBook=cashReadBook(raw);cashRaw=raw;cashStorageError='';return true;}catch(e){cashStorageError='No se pudo leer el libro de caja. No se sobrescribieron sus datos. '+e.message;return false;}}
function cashDay(date=cashSelectedDate){return cashBook.days.find(d=>d.date===date);}
function cashBlankClose(){return {counts:Object.fromEntries(CASH_GROUPS.map(([id])=>[id,0])),has_count:false,withdrawal_cents:0,remaining_override_cents:null};}
function cashRemainingBreakdown(c){
  const total=cashValidateClose(c),expected=total-c.withdrawal_cents;
  if(c.remaining_override_cents!==null&&c.remaining_override_cents!==expected)return {counts:null,warning:'El saldo declarado para mañana no coincide con contado menos retiro. Ajustá el desglose manualmente al día siguiente.'};
  if(c.withdrawal_cents>c.counts.large)return {counts:null,warning:'El retiro supera el grupo de 20.000 y 10.000. No se puede determinar qué billetes quedan: ajustá el desglose manualmente al día siguiente.'};
  return {counts:{...c.counts,large:cashInteger(c.counts.large-c.withdrawal_cents)},warning:null};
}
function cashPreviousClose(date){return cashBook.days.filter(d=>d.date<date&&d.state==='closed').sort((a,b)=>b.date.localeCompare(a.date))[0]||null;}
function cashAudit(day,action,subject,before=null,after=null){day.audit.push({at:new Date().toISOString(),action,subject_id:subject,before,after,updated_by:null});day.updated_at=new Date().toISOString();day.updated_by=null;}
async function cashCommit(mutator,success){
  if(cashSaving)return false;cashSaving=true;let ok=false;
  const expectedRaw=cashRaw,operationDate=cashSelectedDate;
  const movementInput=document.getElementById('cashDetail')?{detail:document.getElementById('cashDetail').value,amount:document.getElementById('cashAmount').value}:null;
  cashRememberCloseInputs();
  const write=()=>{
    const current=labStorage.getItem(CASH_KEY);
    if(current!==expectedRaw){cashLoad();throw new Error('El libro cambió en otra pestaña. Se recargaron los datos; revisá la caja y reintentá.');}
    const next=cashReadBook(current),previous=JSON.parse(JSON.stringify(next));mutator(next,operationDate);cashRecordMutation(next,previous,operationDate);next.revision=cashInteger(next.revision+1);cashValidateBook(next);
    const serialized=JSON.stringify(next);
    if(labStorage.getItem(CASH_KEY)!==current)throw new Error('Otra pestaña cambió el libro. Reabrí la caja antes de guardar.');
    try{labStorage.setItem(CASH_KEY,serialized);}catch{throw new Error('No se pudo guardar la caja: almacenamiento lleno o no disponible. Descargá un respaldo antes de liberar espacio.');}
    cashBook=next;cashRaw=serialized;cashStorageError='';ok=true;cashMessage=success;
  };
  try{if(cashStorageError)throw new Error(cashStorageError);if(navigator.locks?.request)await navigator.locks.request('pancko_cash_daily_v1',write);else write();}
  catch(e){cashMessage=e.message;showToast(e.message);}
  finally{cashSaving=false;renderCashModule();if(movementInput&&document.getElementById('cashDetail')&&cashSelectedDate===operationDate){document.getElementById('cashDetail').value=movementInput.detail;document.getElementById('cashAmount').value=movementInput.amount;}if(cashDraftPending){cashDraftPending=false;cashPersistDraft();}renderCashHome();if(ok)cashScheduleSync(operationDate);cashRenderSyncStatus();}
  return ok;
}
function cashRequireOpen(book,date=cashSelectedDate){const day=book.days.find(d=>d.date===date);if(!day)throw new Error('Primero abrí la caja de esa fecha.');if(day.state!=='open')throw new Error('La caja está cerrada. Reabrila con confirmación para modificarla.');return day;}
async function cashCreateDay(){
  try{const opening=cashParseMoney(document.getElementById('cashOpeningInput').value,{nonnegative:true}),date=cashSelectedDate,previous=cashPreviousClose(date);
    const source=previous&&opening===previous.closing.remaining_cents&&previous.closing.remaining_counts?{day_id:previous.id,closed_at:previous.closing.closed_at,counts:{...previous.closing.remaining_counts}}:null;
    await cashCommit(book=>{if(book.days.some(d=>d.date===date))throw new Error('Ya existe una caja para esta fecha.');const now=new Date().toISOString();book.days.push({id:'cash_'+date,date,state:'open',opening_cents:opening,opening_source:previous?{day_id:previous.id,closed_at:previous.closing.closed_at,suggested_cents:previous.closing.remaining_cents}:null,opening_count_source:source,movements:[],totals:{income_cents:0,expenses_cents:0,theoretical_cents:opening},close_draft:source?{counts:{...source.counts},has_count:true,withdrawal_cents:0,remaining_override_cents:null}:cashBlankClose(),closing:null,closing_history:[],audit:[{at:now,action:'Apertura',subject_id:'cash_'+date,after:{opening_cents:opening,opening_count_source:source?.day_id||null}}],created_at:now,updated_at:now,closed_at:null,created_by:null,updated_by:null,closed_by:null,edited:false});},source?'Caja abierta con desglose inicial sugerido. Actualizá el conteo según el efectivo real.':'Caja abierta. Podés anotar movimientos.');
  }catch(e){cashMessage=e.message;showToast(e.message);renderCashNotice();}
}
async function cashChangeOpening(){try{const cents=cashParseMoney(document.getElementById('cashOpeningEdit').value,{nonnegative:true});await cashCommit((book,date)=>{const d=cashRequireOpen(book,date);const before=d.opening_cents;d.opening_cents=cents;if(d.opening_count_source&&cents!==d.opening_source.suggested_cents)d.opening_count_source=null;d.edited=true;cashAudit(d,'Cambio de saldo inicial',d.id,{opening_cents:before},{opening_cents:cents});},'Saldo inicial guardado. Si cambiaste el efectivo inicial, revisá también el conteo.');}catch(e){cashMessage=e.message;renderCashNotice();}}
async function cashSaveMovement(kind='signed'){
  try{const detail=document.getElementById('cashDetail').value.trim();if(!detail||detail.length>300)throw new Error('Ingresá un detalle de hasta 300 caracteres.');let amount=cashParseMoney(document.getElementById('cashAmount').value);if(kind==='expense')amount=-Math.abs(amount);const editing=cashEditingId;
    const ok=await cashCommit((book,date)=>{const d=cashRequireOpen(book,date),now=new Date().toISOString();if(editing){const m=d.movements.find(x=>x.id===editing);if(!m||m.voided_at)throw new Error('No se puede editar ese movimiento.');const before={detail:m.detail,amount_cents:m.amount_cents};m.detail=detail;m.amount_cents=amount;m.updated_at=now;m.updated_by=null;m.edited=true;cashAudit(d,'Movimiento editado',m.id,before,{detail,amount_cents:amount});d.edited=true;}else{const m={id:'mov_'+crypto.randomUUID(),detail,amount_cents:amount,created_at:now,updated_at:now,created_by:null,updated_by:null,edited:false,voided_at:null};d.movements.push(m);cashAudit(d,'Movimiento agregado',m.id,null,{detail,amount_cents:amount});}},editing?'Movimiento editado. Hora original conservada.':'Movimiento guardado.');
    if(ok){cashEditingId=null;renderCashModule(false);document.getElementById('cashDetail')?.focus();}
  }catch(e){cashMessage=e.message;showToast(e.message);renderCashNotice();}
}
function cashEditMovement(id){const d=cashDay(),m=d?.movements.find(x=>x.id===id);if(!d||d.state!=='open'||!m||m.voided_at)return;cashEditingId=id;document.getElementById('cashDetail').value=m.detail;document.getElementById('cashAmount').value=cashInputMoney(m.amount_cents);document.getElementById('cashMovementHeading').textContent='Editar movimiento';document.getElementById('cashExpenseSubmit').textContent='Egreso';document.getElementById('cashMovementSubmit').textContent='Guardar';document.getElementById('cashMovementCancel').hidden=false;document.getElementById('cashDetail').focus();}
function cashCancelEdit(){cashEditingId=null;document.getElementById('cashDetail').value='';document.getElementById('cashAmount').value='';document.getElementById('cashMovementHeading').textContent='Anotar movimiento';document.getElementById('cashExpenseSubmit').textContent='Egreso';document.getElementById('cashMovementSubmit').textContent='Ingreso';document.getElementById('cashMovementCancel').hidden=true;}
async function cashVoidMovement(id){const d=cashDay(),m=d?.movements.find(x=>x.id===id);if(!d||d.state!=='open'||!m||m.voided_at)return;if(!confirm('¿Anular “'+m.detail+'” por '+cashMoney(m.amount_cents)+'? Quedará visible en el historial y dejará de sumar.'))return;
  const ok=await cashCommit((book,date)=>{const day=cashRequireOpen(book,date),move=day.movements.find(x=>x.id===id);if(!move||move.voided_at)throw new Error('El movimiento ya no está disponible.');move.voided_at=new Date().toISOString();move.updated_at=move.voided_at;move.updated_by=null;day.edited=true;cashAudit(day,'Movimiento anulado',id,{detail:move.detail,amount_cents:move.amount_cents},null);},'Movimiento anulado.');if(ok&&cashEditingId===id){cashEditingId=null;renderCashModule(false);}
}
async function cashDeleteMovement(id){
 const day=cashDay(),m=day?.movements.find(x=>x.id===id);if(!day||day.state!=='open'||!m)return;
 if(prompt('Eliminar definitivamente “'+m.detail+'”. No aparecerá en la lista ni en la impresión. Escribí ELIMINAR para continuar:')!=='ELIMINAR')return;
 if(!confirm('Confirmación final: ¿eliminar definitivamente este movimiento? Quedará sólo un evento técnico de auditoría.'))return;
 const ok=await cashCommit((book,date)=>{const d=cashRequireOpen(book,date),index=d.movements.findIndex(x=>x.id===id);if(index<0)throw new Error('Ese movimiento ya no existe.');const removed=d.movements.splice(index,1)[0];d.deleted_ids=d.deleted_ids||[];d.deleted_ids.push(id);d.edited=true;cashAudit(d,'Movimiento eliminado definitivamente',id,{detail:removed.detail,amount_cents:removed.amount_cents},null);},'Movimiento eliminado de la vista y el resumen. Quedó evento técnico de auditoría.');
 if(ok&&cashEditingId===id){cashEditingId=null;renderCashModule(false);}
}
// Entrada de conteo: suma/resta de importes, sin evaluar ni ejecutar código.
// Devuelve centavos enteros; el modelo guardado sigue siendo el de v0.11.3.
function cashParseCount(value,{blankZero=false}={}){
  const text=String(value??'').trim();
  if(!text){if(blankZero)return 0;throw new Error('Ingresá un importe o una suma.');}
  if(text.length>2000)throw new Error('La suma es demasiado larga.');
  if(!/[+-]/.test(text))return cashParseMoney(text,{nonnegative:true});
  let pos=0,total=0,first=true;
  while(pos<text.length){
    while(/\s/.test(text[pos]||'')&&pos<text.length)pos++;
    let sign=1;
    if(text[pos]==='+'||text[pos]==='-'){sign=text[pos++]==='-'?-1:1;}
    else if(!first)throw new Error('Usá sólo importes separados por + o -.');
    while(/\s/.test(text[pos]||'')&&pos<text.length)pos++;
    const term=/^\d[\d.,]*/.exec(text.slice(pos));
    if(!term)throw new Error('Suma inválida: falta un importe después del signo.');
    total=cashInteger(total+sign*cashParseMoney(term[0]));pos+=term[0].length;first=false;
    while(/\s/.test(text[pos]||'')&&pos<text.length)pos++;
    if(pos<text.length&&text[pos]!=='+'&&text[pos]!=='-')throw new Error('Usá sólo números, puntos de miles, coma decimal y signos + o -.');
  }
  if(total<0)throw new Error('El total del grupo no puede ser negativo.');
  return total;
}
function cashReadCountField(id){
  const input=document.getElementById('cashCount_'+id),output=document.getElementById('cashCountResult_'+id);
  try{const cents=cashParseCount(input.value,{blankZero:true});input.removeAttribute('aria-invalid');
    if(output){const expression=/[+-]/.test(input.value.trim());output.textContent=expression?'= '+cashMoney(cents):'';output.className='cash-count-result';output.hidden=!expression;}
    return cents;
  }catch(e){input.setAttribute('aria-invalid','true');if(output){output.textContent=e.message;output.className='cash-count-result cash-count-error';output.hidden=false;}throw new Error(CASH_GROUPS.find(g=>g[0]===id)[1]+': '+e.message);}
}
function cashCountKeydown(event,id){
  if(event.key!=='Enter'||event.isComposing)return;
  event.preventDefault();const input=document.getElementById(id);
  try{
    const countId=id.startsWith('cashCount_')?id.slice(10):null;
    const cents=countId?cashReadCountField(countId):cashParseMoney(input.value,{blankZero:id==='cashWithdrawal',nonnegative:true});
    if(input.value.trim())input.value=cashInputMoney(cents);
    cashPreviewClose();
    const order=[...CASH_GROUPS.map(g=>'cashCount_'+g[0]),'cashWithdrawal'];
    if(document.getElementById('cashRemainingManual').checked&&!document.getElementById('cashRemaining').disabled)order.push('cashRemaining');
    const next=order[order.indexOf(id)+1];if(next)document.getElementById(next)?.focus();
  }catch(e){cashPreviewClose();cashMessage=e.message;renderCashNotice();input.focus();}
}

function cashCloseFromInputs(){
  const counts={},raws=[];for(const[id]of CASH_GROUPS){const raw=document.getElementById('cashCount_'+id).value;raws.push(raw);counts[id]=cashReadCountField(id);}
  const withdrawal=cashParseMoney(document.getElementById('cashWithdrawal').value,{blankZero:true,nonnegative:true}),manual=document.getElementById('cashRemainingManual').checked;
  const c={counts,has_count:raws.some(r=>String(r).trim()!==''),withdrawal_cents:withdrawal,remaining_override_cents:manual?cashParseMoney(document.getElementById('cashRemaining').value,{nonnegative:true}):null};cashValidateClose(c);return c;
}
function cashRememberCloseInputs(){if(!document.getElementById('cashWithdrawal'))return;cashCloseInputs.set(cashSelectedDate,{counts:Object.fromEntries(CASH_GROUPS.map(([id])=>[id,document.getElementById('cashCount_'+id).value])),withdrawal:document.getElementById('cashWithdrawal').value,manual:document.getElementById('cashRemainingManual').checked,remaining:document.getElementById('cashRemaining').value});}
function cashDraftStatus(message,warning=false){const el=document.getElementById('cashDraftStatus');if(el){el.textContent=message;el.classList.toggle('cash-count-error',warning);}}
function cashDraftSaved(){if(cashDraftWriteError){cashDraftWriteError=false;cashMessage='';renderCashNotice();}cashDraftStatus('Conteo guardado en este dispositivo.');}
// Guarda inmediatamente el conteo válido, aun si el usuario cierra la PWA enseguida.
function cashPersistDraft(){
  const day=cashDay();
  if(cashStorageError||!day||day.state!=='open'||!document.getElementById('cashWithdrawal'))return false;
  let draft;
  try{draft=cashCloseFromInputs();}catch(e){cashDraftStatus('Revisá el conteo; el último valor válido sigue guardado.',true);return false;}
  if(JSON.stringify(draft)===JSON.stringify(day.close_draft)){cashDraftSaved();return true;}
  if(cashSaving){cashDraftPending=true;cashDraftStatus('Guardando el conteo…');return false;}
  try{
    const current=labStorage.getItem(CASH_KEY);
    if(current!==cashRaw){
      cashLoad();cashCloseInputs.clear();renderCashModule(false);
      throw new Error('Otra pestaña cambió la caja. Se recargaron los datos; revisá el conteo antes de seguir.');
    }
    const next=cashReadBook(current),target=cashRequireOpen(next,cashSelectedDate);
    target.close_draft=draft;target.updated_at=new Date().toISOString();target.updated_by=null;
    cashRecordMutation(next,cashBook,cashSelectedDate);
    next.revision=cashInteger(next.revision+1);cashValidateBook(next);
    const serialized=JSON.stringify(next);
    if(labStorage.getItem(CASH_KEY)!==current)throw new Error('Otra pestaña cambió la caja antes de guardar. Revisá el conteo.');
    try{labStorage.setItem(CASH_KEY,serialized);}catch{throw new Error('No se pudo guardar el conteo: almacenamiento lleno o no disponible. Descargá un respaldo.');}
    cashBook=next;cashRaw=serialized;
    cashDraftSaved();cashScheduleSync(cashSelectedDate,true);cashRenderSyncStatus();return true;
  }catch(e){cashDraftWriteError=true;cashMessage=e.message;renderCashNotice();cashDraftStatus('El conteo aún no se guardó.',true);return false;}
}
function cashDifference(cents){return cents===0?'Caja OK':cents>0?'Sobra efectivo':'Falta efectivo';}
function cashPreviewClose(){
  cashRememberCloseInputs();const output=document.getElementById('cashClosePreview');if(!output)return;
  document.getElementById('cashRemaining').disabled=!document.getElementById('cashRemainingManual').checked;
  try{const c=cashCloseFromInputs(),total=cashValidateClose(c),theoretical=cashTotals(cashDay()).theoretical_cents,expected=total-c.withdrawal_cents,remaining=c.remaining_override_cents??expected;
    const remainingInput=document.getElementById('cashRemaining');remainingInput.disabled=c.remaining_override_cents===null;if(c.remaining_override_cents===null)remainingInput.value=cashInputMoney(expected);
    if(!c.has_count){output.innerHTML='<p class="gestion-help">Ingresá el efectivo contado por grupo. Si la caja está vacía, ingresá 0 en un grupo.</p>';cashPersistDraft();return;}
    const diff=total-theoretical;output.innerHTML=`<dl class="cash-summary cash-preview-totals"><div><dt>Total contado</dt><dd>${cashMoney(total)}</dd></div><div><dt>Saldo teórico</dt><dd>${cashMoney(theoretical)}</dd></div></dl><div class="cash-diff ${diff===0?'ok':diff<0?'short':'extra'}">${cashDifference(diff)} · ${cashMoney(diff)}</div>${remaining!==expected?`<p class="cash-warning">Declaraste ${cashMoney(remaining)} para mañana; contado menos retiro da ${cashMoney(expected)}. Diferencia del saldo declarado: ${cashMoney(remaining-expected)}.</p>`:''}${cashRemainingBreakdown(c).warning?`<p class="cash-warning">${esc(cashRemainingBreakdown(c).warning)}</p>`:''}`;cashPersistDraft();
  }catch(e){output.innerHTML=`<p class="cash-warning cash-error">${esc(e.message)}</p>`;cashDraftStatus('Revisá el conteo; el último valor válido sigue guardado.',true);}
}
async function cashSavePartial(){try{const c=cashCloseFromInputs();const ok=await cashCommit((book,date)=>{const d=cashRequireOpen(book,date);const before=d.close_draft;d.close_draft=c;cashAudit(d,'Conteo parcial guardado',d.id,before,c);},'Conteo guardado. La caja sigue abierta.');if(ok){cashCloseInputs.delete(cashSelectedDate);renderCashModule();}}catch(e){cashMessage=e.message;renderCashNotice();}}
async function cashCloseDay(){
  try{if(!(await cashBeforeSensitive('cerrar')))return;const c=cashCloseFromInputs();if(!c.has_count)throw new Error('Ingresá el efectivo contado antes de cerrar; usá 0 si no hay efectivo.');const total=cashValidateClose(c),d=cashDay(),theoretical=cashTotals(d).theoretical_cents,remaining=c.remaining_override_cents??total-c.withdrawal_cents;
    const breakdown=cashRemainingBreakdown(c),warning=breakdown.warning?'\nATENCIÓN: '+breakdown.warning:'';
    if(!confirm(`¿Cerrar caja del ${cashDateLabel(cashSelectedDate)}?\nContado: ${cashMoney(total)}\nDiferencia: ${cashMoney(total-theoretical)} (${cashDifference(total-theoretical)})\nQueda para mañana: ${cashMoney(remaining)}${warning}`))return;
    const ok=await cashCommit((book,date)=>{const day=cashRequireOpen(book,date),totals=cashTotals(day),now=new Date().toISOString();day.close_draft=c;day.closing={...JSON.parse(JSON.stringify(c)),opening_cents:day.opening_cents,...totals,total_counted_cents:total,difference_cents:cashInteger(total-totals.theoretical_cents),remaining_cents:remaining,remaining_counts:breakdown.counts,remaining_counts_warning:breakdown.warning,closed_at:now,closed_by:null,movement_snapshot:JSON.parse(JSON.stringify(day.movements))};day.state='closed';day.closed_at=now;day.closed_by=null;cashAudit(day,'Cierre de caja',day.id,null,{total_counted_cents:total,difference_cents:day.closing.difference_cents,withdrawal_cents:c.withdrawal_cents,remaining_cents:remaining,remaining_counts:breakdown.counts});},'Caja cerrada. Quedó bloqueada contra ediciones accidentales.');
    if(ok){cashCloseInputs.delete(cashSelectedDate);cashEditingId=null;renderCashModule();}
  }catch(e){cashMessage=e.message;showToast(e.message);renderCashNotice();}
}
async function cashReopenDay(){const d=cashDay();if(!d||d.state!=='closed')return;if(!(await cashBeforeSensitive('reabrir')))return;if(!confirm('¿Reabrir la caja del '+cashDateLabel(d.date)+'? Se conservará el cierre anterior. Las cajas posteriores ya creadas no cambiarán su saldo inicial.'))return;
  const ok=await cashCommit((book,date)=>{const day=book.days.find(x=>x.date===date);if(!day||day.state!=='closed')throw new Error('La caja ya no está cerrada.');day.closing_history.push(day.closing);day.closing=null;day.state='open';day.closed_at=null;day.closed_by=null;day.edited=true;cashAudit(day,'Reapertura',day.id);},'Caja reabierta. Cierre anterior conservado.');if(ok){cashCloseInputs.delete(cashSelectedDate);renderCashModule();}
}
function renderCashNotice(){const el=document.getElementById('cashNotice');if(el)el.innerHTML=(cashStorageError||cashMessage)?`<p class="cash-warning ${cashStorageError?'cash-error':''}">${esc(cashStorageError||cashMessage)}</p>`:'';}
function cashCloseDetails(c,theoretical=c.theoretical_cents){const total=cashValidateClose(c),remaining=c.remaining_override_cents??total-c.withdrawal_cents,diff=total-theoretical;return `<dl class="cash-summary">${CASH_GROUPS.map(([id,label])=>`<div><dt>${esc(label)}</dt><dd>${cashMoney(c.counts[id])}</dd></div>`).join('')}<div><dt>Efectivo contado</dt><dd>${cashMoney(total)}</dd></div><div><dt>Retiro</dt><dd>${cashMoney(c.withdrawal_cents)}</dd></div><div><dt>Queda para mañana</dt><dd>${cashMoney(remaining)}</dd></div></dl><div class="cash-diff ${diff===0?'ok':diff<0?'short':'extra'}">${cashDifference(diff)} · ${cashMoney(diff)}</div>${remaining!==total-c.withdrawal_cents?'<p class="cash-warning">El saldo declarado para mañana no coincide con contado menos retiro.</p>':''}${c.remaining_counts?`<h3>Desglose que queda para mañana</h3><dl class="cash-summary">${CASH_GROUPS.map(([id,label])=>`<div><dt>${esc(label)}</dt><dd>${cashMoney(c.remaining_counts[id])}</dd></div>`).join('')}</dl>`:c.remaining_counts===null&&c.remaining_counts_warning?`<p class="cash-warning">${esc(c.remaining_counts_warning)}</p>`:''}`;}
function renderCashModule(preserveInput=true){
  const oldInput=preserveInput&&cashRenderedDate===cashSelectedDate&&document.getElementById('cashDetail')?{detail:document.getElementById('cashDetail').value,amount:document.getElementById('cashAmount').value}:null;
  const oldOpening=preserveInput&&cashRenderedDate===cashSelectedDate?document.getElementById('cashOpeningInput')?.value:null;cashRenderedDate=cashSelectedDate;
  document.getElementById('cashDate').value=cashSelectedDate;renderCashNotice();
  const workspace=document.getElementById('cashWorkspace'),bar=document.getElementById('cashBalanceBar');
  if(cashStorageError){bar.innerHTML='<strong>Libro no disponible</strong>';workspace.innerHTML='<div class="card"><p>Los datos no se sobrescribirán. Descargá el respaldo de los datos almacenados para revisarlos.</p><button class="btn btn-back" onclick="cashExportBackup()">Descargar datos almacenados</button></div>';document.getElementById('cashHistory').innerHTML='';document.getElementById('cashSearchResults').textContent='No se puede buscar: revisá el libro local.';return;}
  const d=cashDay(),previous=cashPreviousClose(cashSelectedDate);
  if(!d){bar.innerHTML='<div><small>'+cashDateLabel(cashSelectedDate)+'</small><strong>Sin abrir</strong></div>';workspace.innerHTML=`<div class="card"><h2>Abrir caja del ${cashDateLabel(cashSelectedDate)}</h2><p class="gestion-help">${previous?'Saldo sugerido desde el cierre del '+cashDateLabel(previous.date)+'. Podés modificarlo.':'No hay un cierre anterior. Ingresá el efectivo inicial.'}</p>${previous?.closing.remaining_counts?`<p class="gestion-help">Desglose sugerido: ${CASH_GROUPS.map(([id,label])=>esc(label)+': '+cashMoney(previous.closing.remaining_counts[id])).join(' · ')}. Se cargará si conservás el saldo sugerido.</p>`:previous?`<p class="cash-warning">${esc(previous.closing.remaining_counts_warning||'El cierre anterior no tiene un desglose guardado. Cargá el conteo de hoy manualmente.')}</p>`:''}<div class="field"><label for="cashOpeningInput">Saldo inicial</label><input id="cashOpeningInput" type="text" inputmode="decimal" value="${cashInputMoney(previous?.closing.remaining_cents||0)}"></div><button class="btn btn-primary" onclick="cashCreateDay()">Abrir caja</button>${cashBook.days.some(x=>x.date<cashSelectedDate&&x.state==='open')?'<p class="cash-warning">Hay jornadas anteriores abiertas. El saldo sugerido usa el último cierre anterior disponible.</p>':''}</div>`;
  }else{
    const t=cashTotals(d),open=d.state==='open';bar.innerHTML=`<div><small>Saldo teórico · ${cashDateLabel(d.date)}</small><strong>${cashMoney(t.theoretical_cents)}</strong></div><div><span class="cash-state ${open?'open':'closed'}">${open?'ABIERTA':'CERRADA'}</span><small class="cash-tag">${d.edited?'Con modificaciones registradas':'Efectivo de mostrador'}</small></div>`;
    const rows=d.movements.map(m=>`<tr class="${m.voided_at?'cash-voided':''}"><td>${cashStamp(m.created_at,true)}${m.edited?'<span class="cash-tag">Editado</span>':''}${m.voided_at?'<span class="cash-tag">Anulado</span>':''}</td><td><span class="cash-movement-detail">${esc(m.detail)}</span>${m.created_by?`<small class="cash-tag">${esc(m.created_by)}</small>`:''}</td><td>${cashMoney(m.amount_cents)}</td><td>${open?`<div class="cash-row-actions">${!m.voided_at?`<button class="btn btn-back" data-movement="${esc(m.id)}" onclick="cashEditMovement(this.dataset.movement)">Editar</button><button class="btn btn-back" data-movement="${esc(m.id)}" onclick="cashVoidMovement(this.dataset.movement)">Anular</button>`:''}<button class="btn btn-back" data-movement="${esc(m.id)}" onclick="cashDeleteMovement(this.dataset.movement)">Eliminar definitivamente</button></div>`:'—'}</td></tr>`).join('');
    const movementForm=open?`<h3 id="cashMovementHeading">${cashEditingId?'Editar movimiento':'Anotar movimiento'}</h3><div class="cash-entry-row"><div class="cash-field-row"><div class="field"><label for="cashDetail">Detalle libre</label><input id="cashDetail" type="text" maxlength="300" placeholder="Pincel + aguarrás" onkeydown="if(event.key==='Enter'){event.preventDefault();cashSaveMovement('signed');}"></div><div class="field"><label for="cashAmount">Importe</label><input id="cashAmount" type="text" inputmode="text" placeholder="4.750 / -32.000" onkeydown="if(event.key==='Enter'){event.preventDefault();cashSaveMovement('signed');}"></div></div><div class="gestion-actions"><button id="cashMovementSubmit" class="btn btn-primary" onclick="cashSaveMovement('signed')">${cashEditingId?'Guardar':'Ingreso'}</button><button id="cashExpenseSubmit" class="btn btn-amber" onclick="cashSaveMovement('expense')">${cashEditingId?'Egreso':'Egreso'}</button><button id="cashMovementCancel" class="btn btn-back" ${cashEditingId?'':'hidden'} onclick="cashCancelEdit()">Cancelar edición</button></div></div><p class="gestion-help cash-entry-help">Positivo suma; negativo resta. Egreso fuerza el signo negativo.</p>`:'';
    let closeContent;
    if(open){const ui=cashCloseInputs.get(d.date),draft=d.close_draft;const countValue=id=>ui?ui.counts[id]:(draft.has_count?cashInputMoney(draft.counts[id]):'');closeContent=`<h2>Conteo y cierre</h2>${d.opening_count_source?`<p class="gestion-help">Desglose inicial sugerido desde ${cashDateLabel(d.opening_count_source.day_id.slice(5))}. Actualizá estos importes según el efectivo real de hoy.</p>`:''}<p class="gestion-help">Importes antes del retiro. Sumá con + o -; Enter avanza.</p><div class="cash-count-grid">${CASH_GROUPS.map(([id,label])=>`<div class="field cash-count-field"><label for="cashCount_${id}">${esc(label)}</label><input id="cashCount_${id}" type="text" inputmode="text" value="${esc(countValue(id))}" placeholder="0 o 30.000+20.000" aria-describedby="cashCountResult_${id}" oninput="cashPreviewClose()" onblur="cashPersistDraft()" onkeydown="cashCountKeydown(event,this.id)"><output id="cashCountResult_${id}" class="cash-count-result" hidden></output></div>`).join('')}</div><div class="field cash-count-field"><label for="cashWithdrawal">Retiro del día</label><input id="cashWithdrawal" type="text" inputmode="decimal" onkeydown="cashCountKeydown(event,this.id)" value="${esc(ui?ui.withdrawal:cashInputMoney(draft.withdrawal_cents))}" oninput="cashPreviewClose()" onblur="cashPersistDraft()"></div><div class="cash-manual-row"><input id="cashRemainingManual" type="checkbox" ${ui?ui.manual?'checked':'':draft.remaining_override_cents!==null?'checked':''} onchange="cashPreviewClose()"><label for="cashRemainingManual">Declarar manualmente el saldo para mañana</label></div><div class="field cash-count-field"><label for="cashRemaining">Queda para mañana</label><input id="cashRemaining" type="text" inputmode="decimal" onkeydown="cashCountKeydown(event,this.id)" value="${esc(ui?ui.remaining:cashInputMoney(draft.remaining_override_cents??cashValidateClose(draft)-draft.withdrawal_cents))}" oninput="cashPreviewClose()" onblur="cashPersistDraft()"></div><div id="cashClosePreview" aria-live="polite"></div><p id="cashDraftStatus" class="cash-draft-status" role="status" aria-live="polite"></p><div class="gestion-actions cash-close-actions"><button class="btn btn-back" onclick="cashSavePartial()">Guardar sin cerrar</button><button class="btn btn-green" onclick="cashCloseDay()">Cerrar caja</button></div>`;}
    else closeContent=`<h2>Cierre guardado</h2><p class="gestion-help">Cerrada el ${cashStamp(d.closing.closed_at)}.</p>${cashCloseDetails(d.closing)}<button class="btn btn-back" onclick="cashReopenDay()">Reabrir con confirmación</button>`;
    workspace.innerHTML=`<div class="cash-layout"><div class="card cash-movements-card"><h2>Movimientos del día</h2><dl class="cash-totals"><div><dt>Saldo inicial</dt><dd>${cashMoney(d.opening_cents)}</dd></div><div><dt>Ingresos</dt><dd>${cashMoney(t.income_cents)}</dd></div><div><dt>Egresos</dt><dd>${cashMoney(t.expenses_cents)}</dd></div><div><dt>Saldo teórico</dt><dd>${cashMoney(t.theoretical_cents)}</dd></div></dl>${open?`<details><summary>Modificar saldo inicial</summary><div class="gestion-actions"><input id="cashOpeningEdit" type="text" inputmode="decimal" value="${cashInputMoney(d.opening_cents)}"><button class="btn btn-back" onclick="cashChangeOpening()">Guardar inicial</button></div></details>`:''}${movementForm}<div class="gestion-table-wrap cash-movement-scroll" tabindex="0" role="region" aria-label="Movimientos del día, lista desplazable"><table class="gestion-table cash-movement-table"><thead><tr><th>Hora</th><th>Detalle</th><th>Importe</th><th>Acciones</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Todavía no hay movimientos.</td></tr>'}</tbody></table></div><div class="gestion-actions cash-output-actions"><button class="btn btn-back" onclick="cashPrintDay()">Imprimir caja</button><button class="btn btn-back" onclick="cashExportDay()">Exportar resumen TXT</button><button class="btn btn-back" onclick="cashCopyDay()">Copiar resumen</button></div><details class="cash-audit"><summary>Registro de cambios · ${d.audit.length}</summary>${d.audit.map(a=>`<p>${cashStamp(a.at)} · ${esc(a.action)}${a.before?' · Antes: '+esc(JSON.stringify(a.before)):''}${a.after?' · Después: '+esc(JSON.stringify(a.after)):''}</p>`).join('')}</details></div><div class="card cash-close-card">${closeContent}${d.closing_history.length?`<details class="cash-audit"><summary>Cierres anteriores conservados · ${d.closing_history.length}</summary>${d.closing_history.map(c=>`<h3>${cashStamp(c.closed_at)}</h3>${cashCloseDetails(c)}`).join('')}</details>`:''}<p class="gestion-help cash-opening-note">Apertura: ${cashStamp(d.created_at)}. ${d.opening_source?'Saldo sugerido desde '+cashDateLabel(d.opening_source.day_id.slice(5))+'.':''}</p></div></div>`;
    if(open){cashPreviewClose();if(cashEditingId){const m=d.movements.find(x=>x.id===cashEditingId&&!x.voided_at);if(m){document.getElementById('cashDetail').value=m.detail;document.getElementById('cashAmount').value=cashInputMoney(m.amount_cents);}else cashEditingId=null;}}
  }
  if(oldInput&&document.getElementById('cashDetail')){document.getElementById('cashDetail').value=oldInput.detail;document.getElementById('cashAmount').value=oldInput.amount;}
  if(oldOpening!==null&&oldOpening!==undefined&&document.getElementById('cashOpeningInput'))document.getElementById('cashOpeningInput').value=oldOpening;
  const days=[...cashBook.days].sort((a,b)=>b.date.localeCompare(a.date));document.getElementById('cashHistory').innerHTML=days.length?`<div class="gestion-table-wrap"><table class="gestion-table"><thead><tr><th>Fecha</th><th>Estado</th><th>Inicial</th><th>Ingresos</th><th>Egresos</th><th>Contado</th><th>Diferencia</th><th>Ver</th></tr></thead><tbody>${days.map(day=>{const t=cashTotals(day);return `<tr><td>${cashDateLabel(day.date)}</td><td>${day.state==='open'?'Abierta':'Cerrada'}</td><td>${cashMoney(day.opening_cents)}</td><td>${cashMoney(t.income_cents)}</td><td>${cashMoney(t.expenses_cents)}</td><td>${day.closing?cashMoney(day.closing.total_counted_cents):'—'}</td><td>${day.closing?cashMoney(day.closing.difference_cents):'—'}</td><td><button class="btn btn-back" data-date="${day.date}" onclick="cashSelectDate(this.dataset.date)">Abrir</button></td></tr>`;}).join('')}</tbody></table></div>`:'<p class="gestion-help">Las cajas guardadas van a aparecer acá.</p>';
  cashRenderSearchResults();
}
function cashSearchNormalize(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-AR');}
function cashSearchMatches(query){
  const terms=cashSearchNormalize(query).trim().split(/\s+/).filter(Boolean);
  if(!terms.length||cashStorageError)return [];
  const found=[];
  for(const day of cashBook.days){for(const movement of day.movements){
    const searchable=cashSearchNormalize([day.date,cashDateLabel(day.date),cashStamp(movement.created_at),movement.detail,cashInputMoney(movement.amount_cents),cashMoney(movement.amount_cents),movement.amount_cents/100,movement.created_by||'',movement.updated_by||'',movement.voided_at?'anulado':'activo',day.state==='closed'?'cerrada':'abierta'].join(' '));
    if(terms.every(term=>searchable.includes(term)))found.push({day,movement});
  }}
  return found.sort((a,b)=>b.day.date.localeCompare(a.day.date)||b.movement.created_at.localeCompare(a.movement.created_at));
}
function cashRenderSearchResults(){
  const input=document.getElementById('cashSearchInput'),box=document.getElementById('cashSearchResults');if(!input||!box)return;
  const query=input.value.trim();if(!query){box.innerHTML='';return;}
  if(cashStorageError){box.textContent='No se puede buscar: revisá el libro local.';return;}
  const matches=cashSearchMatches(query);
  box.innerHTML=`<p class="cash-search-count">${matches.length?matches.length+' movimiento'+(matches.length===1?'':'s')+' encontrado'+(matches.length===1?'':'s'):'No hay movimientos que coincidan.'}</p>${matches.length?`<div class="cash-search-list">${matches.map(({day,movement})=>`<button type="button" class="cash-search-result" data-date="${day.date}" onclick="cashOpenSearchResult(this.dataset.date)"><span class="cash-search-date">${cashDateLabel(day.date)} · ${cashStamp(movement.created_at,true)}</span><strong>${esc(movement.detail)}</strong><span class="cash-search-amount">${cashMoney(movement.amount_cents)}</span><small>${esc(movement.created_by||'Sin dispositivo')}${movement.voided_at?' · Anulado':''}</small></button>`).join('')}</div>`:''}`;
}
function cashOpenSearchResult(date){cashSelectDate(date);if(cashSelectedDate===date)document.getElementById('cashWorkspace')?.scrollIntoView?.({behavior:'smooth',block:'start'});}
function cashSelectDate(date){if(cashSaving){cashMessage='Esperá a que termine el guardado.';renderCashNotice();return;}if(!cashValidDate(date)){cashMessage='Fecha inválida.';renderCashNotice();return;}cashSelectedDate=date;cashEditingId=null;cashMessage='';cashLoad();renderCashModule(false);}
function cashGoToday(){cashSelectDate(cashToday());}
function renderCashHome(){
  const d=cashDay(cashToday());let text='Sin abrir hoy',detail='Libro local de efectivo, con historial por fecha.';
  if(cashStorageError){text='Revisar datos de caja';detail='El libro almacenado no se pudo leer.';}else if(d){text=(d.state==='open'?'Abierta':'Cerrada')+' · '+cashMoney(cashTotals(d).theoretical_cents);detail=d.closing?cashDifference(d.closing.difference_cents)+' · '+cashMoney(d.closing.difference_cents):'Conteo y cierre pendientes.';}
  for(const id of ['desktopCashState','mobileCashState']){const e=document.getElementById(id);if(e)e.textContent=text;}const e=document.getElementById('desktopCashDetail');if(e)e.textContent=detail;
}
function cashDayText(day){
  const t=cashTotals(day),c=day.closing||day.close_draft;const counted=c.has_count?cashValidateClose(c):null,remaining=c.has_count?(c.remaining_override_cents??counted-c.withdrawal_cents):null;
  return [`Caja diaria ${cashDateLabel(day.date)} — ${day.state==='closed'?'Cerrada':'Abierta'}`,'Efectivo de mostrador · libro local',`Apertura: ${cashStamp(day.created_at)}`,`Cierre: ${day.closing?cashStamp(day.closing.closed_at):'Sin cerrar'}`,'',`Saldo inicial: ${cashMoney(day.opening_cents)}`,`Ingresos: ${cashMoney(t.income_cents)}`,`Egresos: ${cashMoney(t.expenses_cents)}`,`Saldo teórico: ${cashMoney(t.theoretical_cents)}`,`Efectivo contado${day.closing?'':' (parcial guardado)'}: ${counted===null?'Sin conteo guardado':cashMoney(counted)}`,`Diferencia: ${counted===null?'Sin conteo guardado':cashMoney(counted-t.theoretical_cents)+' — '+cashDifference(counted-t.theoretical_cents)}`,`Retiro: ${cashMoney(c.withdrawal_cents)}`,`Queda para mañana: ${remaining===null?'Sin definir':cashMoney(remaining)}`,...(remaining!==null&&remaining!==counted-c.withdrawal_cents?['Advertencia: el saldo declarado no coincide con contado menos retiro.']:[]),'','Conteo por grupos:',...CASH_GROUPS.map(([id,label])=>label+': '+(counted===null?'Sin guardar':cashMoney(c.counts[id]))),'','Movimientos:',...day.movements.map(m=>`${cashStamp(m.created_at,true)} — ${m.detail} — ${m.amount_cents>=0?'+':''}${cashMoney(m.amount_cents)}${m.edited?' [editado]':''}${m.voided_at?' [ANULADO: no suma]':''}`),'',`Cierres anteriores conservados: ${day.closing_history.length}`,`Cambios registrados: ${day.audit.length}`].join('\n');
}
function cashBuildPrintHTML(day){const text=cashDayText(day);return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Caja diaria ${cashDateLabel(day.date)}</title><style>body{font:14px system-ui;color:#172b45;margin:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.7}button{padding:12px 18px;font:inherit}@page{size:A4;margin:15mm}@media print{button{display:none}body{margin:0}}</style></head><body><button onclick="window.print()">Imprimir</button><pre>${esc(text)}</pre></body></html>`;}
function cashDownload(name,text,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function cashExportDay(){const d=cashDay();if(d)cashDownload('Caja_diaria_'+d.date+'.txt',cashDayText(d));}
function cashPrintDay(){const d=cashDay();if(!d)return;const url=URL.createObjectURL(new Blob([cashBuildPrintHTML(d)],{type:'text/html;charset=utf-8'}));const opened=window.open(url,'_blank');if(!opened){cashDownload('Caja_diaria_'+d.date+'.html',cashBuildPrintHTML(d),'text/html;charset=utf-8');showToast('La ventana de impresión fue bloqueada. Se descargó el HTML para abrir e imprimir.');}setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function cashCopyDay(){const d=cashDay();if(!d)return;try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(cashDayText(d));showToast('Resumen copiado.');}catch{cashExportDay();showToast('No se pudo copiar. Se descargó el resumen TXT.');}}
function cashExportBackup(){const raw=labStorage.getItem(CASH_KEY);cashDownload('Pancko_Cajas_'+cashToday()+'.json',raw||JSON.stringify(cashBook,null,2),'application/json;charset=utf-8');}
async function cashImportBackup(event){const input=event.target,file=input.files?.[0];if(!file)return;try{
  if(file.size>20000000)throw new Error('Respaldo demasiado grande para esta importación.');const incoming=cashValidateBook(JSON.parse(await file.text()));
  const existing=new Map(cashBook.days.map(d=>[d.date,d])),conflicts=incoming.days.filter(d=>existing.has(d.date)&&JSON.stringify(existing.get(d.date))!==JSON.stringify(d));
  if(conflicts.length)throw new Error('El respaldo tiene cajas diferentes para fechas existentes: '+conflicts.slice(0,5).map(d=>cashDateLabel(d.date)).join(', ')+'. No se reemplazó ninguna.');
  const added=incoming.days.filter(d=>!existing.has(d.date));if(!added.length){cashMessage='El respaldo no agrega fechas nuevas.';renderCashNotice();return;}
  if(!confirm('¿Restaurar '+added.length+' cajas nuevas? Las fechas existentes se conservan.'))return;
  await cashCommit(book=>{const dates=new Set(book.days.map(d=>d.date));for(const d of added){if(dates.has(d.date))throw new Error('Una fecha del respaldo ya existe. Reintentá la revisión.');book.days.push(d);}},'Respaldo restaurado: '+added.length+' cajas.');
}catch(e){cashMessage=e.message;showToast(e.message);renderCashNotice();}finally{input.value='';}}
const cashPreviousScreen=showScreen;
showScreen=function(id,options={}){if(id==='cashScreen'){if(cashSaving)return;cashSelectedDate=cashToday();cashEditingId=null;cashLoad();renderCashModule(false);}cashPreviousScreen(id,options);renderCashHome();};
window.addEventListener('storage',event=>{if(labStorage.eventKey(event.key)===CASH_KEY){cashLoad();cashMessage='Libro actualizado desde otra pestaña.';cashEditingId=null;cashCloseInputs.clear();if(document.getElementById('cashScreen').classList.contains('active'))renderCashModule(false);renderCashHome();}});
window.addEventListener('pageshow',()=>{cashLoad();renderCashHome();if(document.getElementById('cashScreen').classList.contains('active'))renderCashModule();});
cashLoad();renderCashHome();if(document.getElementById('cashScreen').classList.contains('active'))renderCashModule();
