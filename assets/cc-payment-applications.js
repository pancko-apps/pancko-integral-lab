/* Pancko Gestión v0.12.6 · Imputación explícita de pagos a cargos. */
'use strict';
let ccPaymentSelected=[],ccPaymentSuggested='',ccPaymentSave=null;
function ccAppliedCents(chargeId,excludingPaymentId=''){return ccBook.movements.reduce((sum,m)=>sum+(m.type==='payment'&&!m.voided_at&&m.id!==excludingPaymentId?(m.applications||[]).filter(a=>a.charge_id===chargeId).reduce((n,a)=>n+a.amount_cents,0):0),0);}
function ccPendingCharge(charge,excludingPaymentId=''){return charge.voided_at?0:Math.max(0,charge.amount_cents-ccAppliedCents(charge.id,excludingPaymentId));}
function ccAvailableCharges(){return ccMoves(ccSelectedId).filter(m=>m.type==='charge'&&!m.voided_at&&ccPendingCharge(m,ccEditingId)>0);}
function ccPaymentValidate(apps,m){if(apps===undefined)return;if(m.type!=='payment'||!Array.isArray(apps)||!apps.length||apps.length>30)throw new Error('Imputaciones de pago inválidas.');const ids=new Set();let total=0;
 for(const a of apps){if(!a||typeof a.charge_id!=='string'||!/^cc_[\w-]+$/.test(a.charge_id)||ids.has(a.charge_id)||typeof a.client_id!=='string'||a.client_id!==m.client_id||!Number.isSafeInteger(a.amount_cents)||a.amount_cents<=0||!Number.isSafeInteger(a.before_cents)||a.before_cents<a.amount_cents||!Number.isSafeInteger(a.after_cents)||a.after_cents!==a.before_cents-a.amount_cents)throw new Error('Imputación inválida.');ids.add(a.charge_id);total+=a.amount_cents;}
 if(!Number.isSafeInteger(total)||total>m.amount_cents)throw new Error('Las imputaciones superan el pago.');
}
const cc126ValidBook=ccValidBook;
ccValidBook=function(book){cc126ValidBook(book);for(const m of book.movements)ccPaymentValidate(m.applications,m);return book;};
function ccPaymentAttach(){const form=document.getElementById('ccMovementForm'),grid=form?.querySelector('.cc-entry-grid');if(!grid)return;
 grid.insertAdjacentHTML('afterend',`<section id="ccPaymentPanel" class="cc-payment-panel" hidden><h4>Aplicar pago a cargos pendientes</h4><p class="gestion-help">Elegí cargos. Si el importe no alcanza, se aplica por fecha, del más antiguo al más nuevo. Sin selección queda como pago general.</p><div id="ccPaymentCharges"></div><p id="ccPaymentSummary" role="status" aria-live="polite"></p></section>`);
 document.getElementById('ccAmount').addEventListener('input',ccPaymentPreview);ccPaymentVisible();}
function ccPaymentVisible(){const panel=document.getElementById('ccPaymentPanel');if(!panel)return;panel.hidden=document.getElementById('ccKind')?.value!=='payment';if(!panel.hidden)ccPaymentRender();}
const cc126OpenForm=ccOpenForm;
ccOpenForm=function(kind){ccPaymentSelected=[];ccPaymentSuggested='';cc126OpenForm(kind);ccPaymentAttach();};
const cc126SwitchKind=ccSwitchKind;
ccSwitchKind=function(){cc126SwitchKind();ccPaymentVisible();};
const cc126EditMovement=ccEditMovement;
ccEditMovement=function(id){cc126EditMovement(id);const m=ccBook.movements.find(x=>x.id===id);if(m?.type==='payment'&&!m.voided_at){ccPaymentSelected=(m.applications||[]).map(a=>a.charge_id);ccPaymentRender();}};
const cc126CancelForm=ccCancelForm;
ccCancelForm=function(){ccPaymentSelected=[];ccPaymentSave=null;cc126CancelForm();};
function ccPaymentRender(){const box=document.getElementById('ccPaymentCharges');if(!box)return;box.replaceChildren();const charges=ccAvailableCharges();ccPaymentSelected=ccPaymentSelected.filter(id=>charges.some(c=>c.id===id));
 for(const charge of charges){const row=document.createElement('label');row.className='cc-payment-charge';const check=document.createElement('input');check.type='checkbox';check.checked=ccPaymentSelected.includes(charge.id);check.onchange=()=>ccPaymentToggle(charge.id,check.checked);row.appendChild(check);
  const label=document.createElement('span');const title=[cashDateLabel(charge.date),charge.document_number,charge.detail].filter(Boolean).join(' · ');label.textContent=title+' — '+ccMoney(ccPendingCharge(charge,ccEditingId))+' pendiente';row.appendChild(label);box.appendChild(row);}
 if(!charges.length)box.textContent='No hay cargos con saldo pendiente para imputar.';ccPaymentPreview();}
function ccPaymentToggle(id,checked){if(checked&&!ccPaymentSelected.includes(id)){if(ccPaymentSelected.length>=30){ccNotice('Máximo 30 cargos por pago.');ccPaymentRender();return;}ccPaymentSelected.push(id);}if(!checked)ccPaymentSelected=ccPaymentSelected.filter(x=>x!==id);const total=ccAvailableCharges().filter(c=>ccPaymentSelected.includes(c.id)).reduce((n,c)=>n+ccPendingCharge(c,ccEditingId),0);
 const field=document.getElementById('ccAmount');if(total&&(!field.value.trim()||field.value===ccPaymentSuggested)){field.value=cashInputMoney(total);ccPreviewAmount();}ccPaymentSuggested=total?cashInputMoney(total):'';ccPaymentPreview();}
function ccPaymentPrepare(){if(document.getElementById('ccKind')?.value!=='payment'||!ccPaymentSelected.length)return undefined;const amount=cashParseMoney(document.getElementById('ccAmount').value,{nonnegative:true});if(amount<=0)throw new Error('Ingresá el importe del pago.');
 let left=amount;const apps=[];for(const charge of ccAvailableCharges()){if(!ccPaymentSelected.includes(charge.id)||left<=0)continue;const before=ccPendingCharge(charge,ccEditingId),applied=Math.min(before,left);apps.push({charge_id:charge.id,client_id:String(ccSelectedId),amount_cents:applied,before_cents:before,after_cents:before-applied});left-=applied;}
 if(!apps.length)throw new Error('Los cargos seleccionados ya no tienen saldo pendiente. Actualizá la ficha.');const movement={type:'payment',client_id:String(ccSelectedId),amount_cents:amount};ccPaymentValidate(apps,movement);return apps;
}
function ccPaymentPreview(){const out=document.getElementById('ccPaymentSummary');if(!out)return;
 if(!ccPaymentSelected.length){out.textContent='Pago general sin aplicar a cargos específicos.';return;}
 try{const apps=ccPaymentPrepare(),amount=cashParseMoney(document.getElementById('ccAmount').value,{nonnegative:true}),used=apps.reduce((n,a)=>n+a.amount_cents,0);let note='Aplicado: '+ccMoney(used)+' a '+apps.length+' cargo'+(apps.length===1?'':'s')+'.';
  if(ccPaymentSelected.length>apps.length||apps.some(a=>a.after_cents>0))note+=' Pago parcial: los cargos restantes conservarán saldo pendiente.';
  if(amount>used)note+=' El excedente '+ccMoney(amount-used)+' quedará como pago general sin imputar.';
  out.textContent=note;
 }catch(e){out.textContent=e.message;}
}
const cc126SaveMovement=ccSaveMovement;
ccSaveMovement=function(){try{ccPaymentSave=ccPaymentPrepare();const prior=ccEditingId?ccBook.movements.find(x=>x.id===ccEditingId):null;
  if(prior?.type==='charge'){const n=cashParseMoney(document.getElementById('ccAmount').value,{nonnegative:true});if(n<ccAppliedCents(prior.id))throw new Error('El nuevo importe sería menor que los pagos ya aplicados. Revisá esos pagos primero.');}
 }catch(e){ccNotice(e.message);return;}
 const beforeRevision=ccBook.revision,editing=ccEditingId;
 try{cc126SaveMovement();if(ccBook.revision!==beforeRevision&&ccSyncConflict?.allocation_conflict&&ccSyncConflict.id===editing){ccSyncConflict=null;ccSyncError='';ccRenderSync();ccScheduleSync();}}finally{ccPaymentSave=null;}
};
const cc126Void=ccVoid;
ccVoid=function(id){const m=ccBook.movements.find(x=>x.id===id);if(m?.type==='charge'&&ccAppliedCents(id)>0){ccNotice('Este cargo tiene pagos aplicados. Revisá o anulá esos pagos antes de anular el cargo.');return;}cc126Void(id);};
const cc126RenderLedger=ccRenderLedger;
ccRenderLedger=function(){cc126RenderLedger();const c=ccClient(),tbody=document.querySelector('#ccLedger tbody');if(!c||!tbody)return;const from=document.getElementById('ccFrom').value,to=document.getElementById('ccTo').value,moves=ccMoves(c.id).filter(m=>(!from||m.date>=from)&&(!to||m.date<=to));
 moves.forEach((m,i)=>{const cell=tbody.querySelectorAll('tr')[i]?.querySelectorAll('td')[3];if(!cell)return;
  if(m.type==='charge'){const pending=ccPendingCharge(m),tag=document.createElement('small');tag.className='cc-payment-state';tag.textContent=m.voided_at?'Anulado':pending===0?'Pagado':pending===m.amount_cents?'Pendiente · '+ccMoney(pending):'Parcial · pendiente '+ccMoney(pending);cell.appendChild(tag);}
  if(m.type==='payment'){const tag=document.createElement('small');tag.className='cc-payment-state';const applications=m.applications||[];tag.textContent=applications.length?'Aplicado a '+applications.map(a=>{const charge=ccBook.movements.find(x=>x.id===a.charge_id);return (charge?.detail||charge?.document_number||a.charge_id)+' ('+ccMoney(a.amount_cents)+')';}).join(' · ')+(m.amount_cents>applications.reduce((n,a)=>n+a.amount_cents,0)?' · excedente general':''):'Pago general sin imputar';cell.appendChild(tag);}
 });
};
