/* Pancko Gestión v0.12.5 · Detalle opcional de artículos en cargos manuales. */
'use strict';
let ccProductDraft=[],ccProductMode='current',ccProductSuggested='',ccProductSave=null;
const CC_PRODUCT_MODES={current:'articulo_actual',manual:'manual',none:'sin_precio'};

function ccProductValidate(detail){
 if(detail===undefined)return;
 if(!detail||typeof detail!=='object'||Array.isArray(detail)||!CC_PRODUCT_MODES[detail.mode]||!Array.isArray(detail.lines)||!detail.lines.length||detail.lines.length>12)throw new Error('Detalle de productos inválido.');
 for(const line of detail.lines){
  if(!line||typeof line.codigo!=='string'||!line.codigo.trim()||line.codigo.length>100||typeof line.descripcion!=='string'||!line.descripcion.trim()||line.descripcion.length>180||!Number.isFinite(line.cantidad)||line.cantidad<=0||line.cantidad>100000||Math.abs(Math.round(line.cantidad*1000)-line.cantidad*1000)>1e-7||line.modo_precio!==detail.mode||line.precio_origen!==CC_PRODUCT_MODES[detail.mode])throw new Error('Línea de productos inválida.');
  if(detail.mode==='none'){
   if(line.precio_unitario_cents!==null||line.subtotal_cents!==null)throw new Error('El detalle sin precio no puede tener importes.');
  }else if(!Number.isSafeInteger(line.precio_unitario_cents)||line.precio_unitario_cents<0||!Number.isSafeInteger(line.subtotal_cents)||line.subtotal_cents!==Math.round(line.precio_unitario_cents*line.cantidad))throw new Error('Importe de producto inválido.');
 }
 if(JSON.stringify(detail).length>7000)throw new Error('Demasiados datos en el detalle de productos.');
}
const cc125ValidBook=ccValidBook;
ccValidBook=function(book){cc125ValidBook(book);for(const m of book.movements){if(m.product_detail!==undefined){if(m.type!=='charge')throw new Error('Sólo un cargo admite detalle de productos.');ccProductValidate(m.product_detail);}}return book;};

function ccProductSection(){return `<details id="ccProductsPanel" class="cc-products-panel"><summary>Detalle de productos (opcional)</summary><div class="cc-products-body"><p class="gestion-help">Informativo. El importe final del cargo es el que afecta el saldo.</p><label for="ccProductMode">Precio del detalle</label><select id="ccProductMode" onchange="ccProductSetMode(this.value)"><option value="current">Usar precio actual del artículo</option><option value="manual">Precio manual</option><option value="none">Sin precio · sólo detalle</option></select><div class="cc-products-search"><button type="button" class="btn btn-back" onclick="ccProductFind()">+ Agregar producto</button><input id="ccProductQuery" type="search" autocomplete="off" placeholder="Código o descripción" aria-label="Buscar artículo para el cargo" oninput="ccProductFind()"></div><div id="ccProductMatches" class="cc-products-matches"></div><div id="ccProductRows"></div><div id="ccProductSummary" aria-live="polite"></div></div></details>`;}
function ccProductAttach(){const form=document.getElementById('ccMovementForm');if(!form)return;const grid=form.querySelector('.cc-entry-grid');if(!grid)return;grid.insertAdjacentHTML('afterend',ccProductSection());document.getElementById('ccAmount').addEventListener('input',ccProductTotal);ccProductVisible();}
function ccProductVisible(){const panel=document.getElementById('ccProductsPanel');if(panel)panel.hidden=document.getElementById('ccKind')?.value!=='charge';}
const cc125OpenForm=ccOpenForm;
ccOpenForm=function(kind){ccProductDraft=[];ccProductMode='current';ccProductSuggested='';cc125OpenForm(kind);ccProductAttach();};
const cc125SwitchKind=ccSwitchKind;
ccSwitchKind=function(){cc125SwitchKind();ccProductVisible();};
const cc125EditMovement=ccEditMovement;
ccEditMovement=function(id){cc125EditMovement(id);const m=ccBook.movements.find(x=>x.id===id);if(!m||m.voided_at)return;
 if(m.type==='charge'&&m.product_detail){ccProductValidate(m.product_detail);ccProductMode=m.product_detail.mode;ccProductDraft=JSON.parse(JSON.stringify(m.product_detail.lines));const panel=document.getElementById('ccProductsPanel');panel.open=true;document.getElementById('ccProductMode').value=ccProductMode;ccProductRender();}
};
const cc125CancelForm=ccCancelForm;
ccCancelForm=function(){ccProductDraft=[];ccProductSave=null;cc125CancelForm();};

function ccProductFind(){const input=document.getElementById('ccProductQuery'),out=document.getElementById('ccProductMatches');if(!input||!out)return;const q=ccNormalize(input.value);out.replaceChildren();if(!q){input.focus();return;}
 const matches=products.filter(p=>ccNormalize(String(p.COD)+' '+String(p.ARTIC)).includes(q)).slice(0,12);
 for(const p of matches){const button=document.createElement('button');button.type='button';button.className='cc-product-match';button.textContent=String(p.COD)+' · '+String(p.ARTIC)+' · '+ccMoney(Math.round(Number(p.PR_CON_IVA)*100));button.onclick=()=>ccProductAdd(p);out.appendChild(button);}
 if(!matches.length)out.textContent='Sin artículos con ese código o descripción.';
}
function ccProductAdd(p){if(ccProductDraft.length>=12){ccNotice('Máximo 12 productos por cargo.');return;}const price=Math.round(Number(p.PR_CON_IVA)*100);if(!Number.isSafeInteger(price)||price<0){ccNotice('El artículo no tiene un precio válido. Revisá la lista local.');return;}
 const line={codigo:String(p.COD).slice(0,100),descripcion:String(p.ARTIC).slice(0,180),cantidad:1,modo_precio:ccProductMode,precio_origen:CC_PRODUCT_MODES[ccProductMode],precio_unitario_cents:ccProductMode==='current'?price:ccProductMode==='none'?null:0,subtotal_cents:ccProductMode==='current'?price:ccProductMode==='none'?null:0,articulo_snapshot:{COD:String(p.COD).slice(0,100),ARTIC:String(p.ARTIC).slice(0,180),PR_CON_IVA:Number(p.PR_CON_IVA)}};if(ccProductMode==='manual')line.manual_empty=true;
 ccProductDraft.push(line);document.getElementById('ccProductsPanel').open=true;document.getElementById('ccProductQuery').value='';document.getElementById('ccProductMatches').replaceChildren();ccProductRender();
}
function ccProductSetMode(mode){if(!CC_PRODUCT_MODES[mode])return;ccProductMode=mode;for(const l of ccProductDraft){l.modo_precio=mode;l.precio_origen=CC_PRODUCT_MODES[mode];l.precio_unitario_cents=mode==='none'?null:mode==='manual'?0:Math.round(Number(products.find(p=>String(p.COD)===l.codigo)?.PR_CON_IVA??l.articulo_snapshot?.PR_CON_IVA)*100);l.subtotal_cents=mode==='none'?null:Math.round(l.precio_unitario_cents*l.cantidad);l.manual_empty=mode==='manual';delete l.price_raw;}ccProductRender();}
function ccProductRemove(index){ccProductDraft.splice(index,1);ccProductRender();}
function ccProductRender(){const out=document.getElementById('ccProductRows');if(!out)return;out.replaceChildren();
 ccProductDraft.forEach((l,i)=>{const row=document.createElement('div');row.className='cc-product-line';const title=document.createElement('div');title.className='cc-product-title';title.textContent=l.codigo+' · '+l.descripcion;row.appendChild(title);
  const qty=document.createElement('label');qty.textContent='Cantidad';const qtyInput=document.createElement('input');qtyInput.type='text';qtyInput.inputMode='decimal';qtyInput.value=String(l.cantidad).replace('.',',');qtyInput.setAttribute('aria-label','Cantidad de '+l.descripcion);qtyInput.oninput=()=>{l.quantity_raw=qtyInput.value;ccProductTotal();};qty.appendChild(qtyInput);row.appendChild(qty);
  if(ccProductMode!=='none'){const price=document.createElement('label');price.textContent='Precio unitario';const pInput=document.createElement('input');pInput.type='text';pInput.inputMode='decimal';pInput.value=ccProductMode==='manual'&&l.manual_empty?'':cashInputMoney(l.precio_unitario_cents);pInput.readOnly=ccProductMode==='current';pInput.setAttribute('aria-label','Precio unitario de '+l.descripcion);pInput.oninput=()=>{l.price_raw=pInput.value;l.manual_empty=false;ccProductTotal();};price.appendChild(pInput);row.appendChild(price);const subtotal=document.createElement('strong');subtotal.className='cc-product-subtotal';subtotal.textContent='Subtotal '+ccMoney(l.subtotal_cents);row.appendChild(subtotal);}
  const remove=document.createElement('button');remove.type='button';remove.className='btn btn-back';remove.textContent='Quitar';remove.setAttribute('aria-label','Quitar '+l.descripcion);remove.onclick=()=>ccProductRemove(i);row.appendChild(remove);out.appendChild(row);
 });ccProductTotal();}
function ccProductAmount(line){const raw=line.quantity_raw??String(line.cantidad).replace('.',',');if(!/^\d+(?:[.,]\d{1,3})?$/.test(raw))throw new Error('Cantidad inválida: usá hasta tres decimales.');const q=Number(raw.replace(',','.'));if(q<=0||q>100000)throw new Error('La cantidad debe ser mayor que cero y menor que 100.000.');line.cantidad=q;
 if(ccProductMode==='manual'&&line.manual_empty&&line.price_raw===undefined)throw new Error('Ingresá el precio manual del producto.');
 if(ccProductMode==='manual'&&line.price_raw!==undefined){if(!line.price_raw.trim())throw new Error('Ingresá el precio manual del producto.');line.precio_unitario_cents=cashParseMoney(line.price_raw,{nonnegative:true});}
 if(ccProductMode==='none'){line.precio_unitario_cents=null;line.subtotal_cents=null;}else{if(!Number.isSafeInteger(line.precio_unitario_cents)||line.precio_unitario_cents<0)throw new Error('Precio unitario inválido.');line.subtotal_cents=Math.round(q*line.precio_unitario_cents);if(!Number.isSafeInteger(line.subtotal_cents))throw new Error('Subtotal demasiado grande.');}
 return line.subtotal_cents||0;
}
function ccProductTotal(){const summary=document.getElementById('ccProductSummary'),amountInput=document.getElementById('ccAmount');if(!summary||!amountInput)return;summary.replaceChildren();if(!ccProductDraft.length)return;
 try{const total=ccProductDraft.reduce((n,l)=>n+ccProductAmount(l),0);if(ccProductMode!=='none'&&!Number.isSafeInteger(total))throw new Error('Total de productos demasiado grande.');
  for(const [i,l] of ccProductDraft.entries()){const el=document.querySelectorAll('#ccProductRows .cc-product-subtotal')[i];if(el)el.textContent='Subtotal '+ccMoney(l.subtotal_cents);}
  if(ccProductMode!=='none'){
   const formatted=cashInputMoney(total);if(!amountInput.value.trim()||amountInput.value===ccProductSuggested){amountInput.value=formatted;ccPreviewAmount();}ccProductSuggested=formatted;
   const b=document.createElement('strong');b.textContent='Total de productos: '+ccMoney(total);summary.appendChild(b);
   const use=document.createElement('button');use.type='button';use.className='btn btn-back';use.textContent='Usar este total como importe';use.onclick=()=>{amountInput.value=formatted;ccProductSuggested=formatted;ccPreviewAmount();ccProductTotal();};summary.appendChild(use);
   let amount=null;try{amount=cashParseMoney(amountInput.value,{nonnegative:true});}catch{}if(amount!==null&&amount!==total){const warn=document.createElement('p');warn.className='cc-product-warning';warn.textContent='El importe del cargo difiere del total del detalle de productos. El saldo usará '+ccMoney(amount)+'.';summary.appendChild(warn);}
  }else summary.textContent='Sólo detalle informativo: completá el importe del cargo manualmente.';
 }catch(e){const warn=document.createElement('p');warn.className='cc-product-warning';warn.textContent=e.message;summary.appendChild(warn);}
}
function ccProductPrepare(){if(document.getElementById('ccKind')?.value!=='charge'||!ccProductDraft.length)return undefined;const detail={mode:ccProductMode,lines:ccProductDraft.map(l=>{const copy={...l};ccProductAmount(copy);delete copy.quantity_raw;delete copy.price_raw;delete copy.manual_empty;return copy;})};ccProductValidate(detail);return detail;}
const cc125SaveMovement=ccSaveMovement;
ccSaveMovement=function(){try{ccProductSave=ccProductPrepare();}catch(e){ccNotice(e.message);return;}try{cc125SaveMovement();}finally{ccProductSave=null;}};

function ccProductDisplayLines(m){return m?.type==='charge'&&m.product_detail?.lines?.length?m.product_detail.lines:[];}
function ccProductPrintText(m){return ccProductDisplayLines(m).map(l=>'    '+l.codigo+' · '+l.descripcion+' × '+l.cantidad+(m.product_detail.mode==='none'?'':' · '+ccMoney(l.precio_unitario_cents)+' → '+ccMoney(l.subtotal_cents)));}
function ccProductPrintHTML(m){const lines=ccProductDisplayLines(m);if(!lines.length)return '';return `<div style="font-size:10px;margin-top:4px">${lines.map(l=>`<div>${esc(l.codigo)} · ${esc(l.descripcion)} × ${esc(String(l.cantidad))}${m.product_detail.mode==='none'?'':' · '+esc(ccMoney(l.precio_unitario_cents))+' → '+esc(ccMoney(l.subtotal_cents))}</div>`).join('')}</div>`;}
const cc125RenderLedger=ccRenderLedger;
ccRenderLedger=function(){cc125RenderLedger();const c=ccClient(),tbody=document.querySelector('#ccLedger tbody');if(!c||!tbody)return;const from=document.getElementById('ccFrom').value,to=document.getElementById('ccTo').value,visible=ccMoves(c.id).filter(m=>(!from||m.date>=from)&&(!to||m.date<=to));
 visible.forEach((m,i)=>{const lines=ccProductDisplayLines(m);if(!lines.length)return;const cell=tbody.querySelectorAll('tr')[i]?.querySelectorAll('td')[3];if(!cell)return;const details=document.createElement('details');details.className='cc-product-history';const summary=document.createElement('summary');summary.textContent='Ver productos · '+lines.length;details.appendChild(summary);const table=document.createElement('div');table.className='cc-product-history-lines';for(const l of lines){const row=document.createElement('div');row.textContent=l.codigo+' · '+l.descripcion+' × '+l.cantidad+(m.product_detail.mode==='none'?'':' · '+ccMoney(l.precio_unitario_cents)+' → '+ccMoney(l.subtotal_cents));table.appendChild(row);}details.appendChild(table);cell.appendChild(details);});
};
