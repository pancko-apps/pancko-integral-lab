/* Pancko Gestión v0.11.7 · Presentación de datos locales, sin operaciones económicas. */
'use strict';

function shellBudgetDate(entry){
  const iso=entry.timestamp || entry.updatedAt;
  if(iso){const date=new Date(iso);if(Number.isFinite(date.getTime()))return date;}
  const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(entry.fecha || ''));
  return match ? new Date(Number(match[3]),Number(match[2])-1,Number(match[1])) : null;
}

function shellSetText(id,value){
  const element=document.getElementById(id);
  if(element)element.textContent=value;
}

function renderDesktopShell(){
  const now=new Date();
  shellSetText('desktopDate',now.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'}));
  const deleted=getDeletedBudgetIds();
  const budgets=budgetHistory.filter(h=>h && !deleted.has(String(h.id)));
  const today=budgets.filter(h=>{const d=shellBudgetDate(h);return d && d.toDateString()===now.toDateString();}).length;
  const count=value=>Number(value).toLocaleString('es-AR');
  shellSetText('desktopArticleCount',count(products.length));
  shellSetText('desktopClientCount',count(clients.length));
  shellSetText('desktopBudgetToday',count(today));
  shellSetText('desktopPendingCans',count(pendingCans.filter(c=>c.status==='available').length));
  shellSetText('desktopLabCount',count(labRecords.length)+' colores guardados en este dispositivo.');
  shellSetText('sidebarStore',(config.nombre || 'Pancko LAB').trim());
  const connected=navigator.onLine!==false;
  const connection=document.getElementById('shellConnection');
  if(connection)connection.classList.toggle('offline',!connected);
  shellSetText('shellConnectionLabel',connected?'Red disponible':'Modo sin conexión');

  const current=document.getElementById('clientName')?.value.trim() || 'Mostrador / Consumidor final';
  shellSetText('desktopDraftName',cart.length?current:'Listo para empezar');
  shellSetText('desktopDraftMeta',cart.length?`${cart.length} ${cart.length===1?'artículo':'artículos'} · presupuesto conservado en este dispositivo`:'Buscá un cliente y agregá los productos.');
  const total=document.getElementById('desktopDraftTotal');
  if(total){total.textContent=cart.length?$m(budgetFinalTotal(cart,getMode().percent)):'';total.hidden=!cart.length;}
  shellSetText('desktopDraftAction',cart.length?'Continuar presupuesto':'Crear presupuesto');
  shellSetText('desktopMainBudgetAction',cart.length?'Continuar presupuesto':'＋ Crear presupuesto');

  const list=document.getElementById('desktopRecentBudgets');
  if(!list)return;
  const recent=[...budgets].sort((a,b)=>(shellBudgetDate(b)?.getTime() || 0)-(shellBudgetDate(a)?.getTime() || 0)).slice(0,8);
  if(!recent.length){
    list.innerHTML='<div class="dashboard-empty"><svg class="shell-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-2-1-3 1-3-1-2 1V3Z M10 7h4 M10 11h4 M10 15h2"/></svg><strong>Tus presupuestos van a aparecer acá</strong><p>Guardá una propuesta y volvé a consultarla desde este panel.</p><button class="shell-link-button" onclick="showScreen(\'cartScreen\')">Crear presupuesto</button></div>';
    return;
  }
  list.replaceChildren();
  for(const budget of recent){
    const row=document.createElement('div');row.className='dashboard-budget-row';
    const copy=document.createElement('div');
    const name=document.createElement('strong');name.textContent=budget.cliente || 'Consumidor final';
    const meta=document.createElement('small');
    meta.textContent=[budget.fecha || '',`${budget.items ?? budget.cart?.length ?? 0} artículos`,budget._sync==='synced'?'En Sheets':'Guardado local'].filter(Boolean).join(' · ');
    copy.append(name,meta);
    const amount=document.createElement('div');amount.className='dashboard-budget-amount';
    const value=document.createElement('span');value.textContent=$m(Number(budget.total) || 0);
    const action=document.createElement('button');action.type='button';action.className='shell-link-button';action.textContent='Ver';
    action.setAttribute('aria-label','Ver presupuesto de '+name.textContent);
    action.onclick=()=>openHistoryDetail(budget.id);
    amount.append(value,action);row.append(copy,amount);list.append(row);
  }
}

// Mantiene la navegación existente y actualiza únicamente el contexto visual.
const originalShellScreen=showScreen;
showScreen=function(id,options={}){
  originalShellScreen(id,options);
  renderDesktopShell();
};

let shellRefreshScheduled=false;
const originalShellSave=save;
save=function(...args){
  const result=originalShellSave(...args);
  if(!shellRefreshScheduled){
    shellRefreshScheduled=true;
    setTimeout(()=>{shellRefreshScheduled=false;renderDesktopShell();},160);
  }
  return result;
};
window.addEventListener('online',renderDesktopShell);
window.addEventListener('offline',renderDesktopShell);
window.addEventListener('pageshow',renderDesktopShell);
renderDesktopShell();
