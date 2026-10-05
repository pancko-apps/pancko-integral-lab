/* Experimental only. This file runs after budget-workbench.js. */
(() => {
 'use strict';
 const ORIGIN=location.origin;
 const modal=document.createElement('dialog');modal.id='panckoOnlinePreview';modal.className='pancko-online-dialog';
 modal.innerHTML='<div id="panckoOnlineContent"></div><div class="pancko-online-actions"><button type="button" class="btn btn-back" id="panckoOnlineCancel">Cancelar</button><button type="button" class="btn btn-primary" id="panckoOnlineApply">Aplicar al presupuesto</button></div>';
 document.body.append(modal);
 const content=modal.querySelector('#panckoOnlineContent'),apply=modal.querySelector('#panckoOnlineApply');
 let pending=null;
 const diagnostic=document.createElement('section');diagnostic.id='panckoBridgeDiagnostic';diagnostic.className='pancko-bridge-diagnostic';
 diagnostic.innerHTML='<div><strong>Bridge experimental</strong> <button type="button" class="btn btn-back" id="panckoBridgeTest">Probar Bridge</button></div><div id="panckoBridgeStatus" role="status">Bridge detectado: sin probar · Mensaje enviado: no · Respuesta recibida: no · Pestaña tintométrico: sin probar · Lista: sin probar · Último error: —</div>';
 document.getElementById('cartItems')?.before(diagnostic);
 const diagnosticStatus=diagnostic.querySelector('#panckoBridgeStatus');
 const state={bridge:'sin probar',version:'—',sent:'no',received:'no',tab:'sin probar',list:'sin probar',error:'—'};
 let labOnline=null;
 function showDiagnostic(){diagnosticStatus.textContent=`Bridge detectado: ${state.bridge} · Extensión: ${state.version} · Mensaje enviado: ${state.sent} · Respuesta recibida: ${state.received} · Pestaña tintométrico: ${state.tab} · Lista: ${state.list} · Último error: ${state.error}`;}
 function recordBackground(info){if(!info)return;state.tab=info.official_tab_found?'sí':'no';state.list=info.list_detected?'sí':'no';if(info.error)state.error=String(info.error);showDiagnostic();}
 modal.querySelector('#panckoOnlineCancel').onclick=()=>{pending=null;modal.close();};
 modal.addEventListener('close',()=>{pending=null;});
 const originalError=window.budgetFormulaError;
 window.budgetFormulaError=function(input,message){
  originalError(input,message);
  const controls=input?.closest('.budget-formula-controls');if(!controls)return;
  controls.querySelector('.pancko-online-trigger')?.remove();
  if(message==='Fórmula no encontrada. Revisá el código o abrí 🎨.' && input.value.trim()){
   const button=document.createElement('button');button.type='button';button.className='budget-formula-advanced pancko-online-trigger';button.textContent='Buscar online';
   button.onclick=()=>window.panckoSearchOnline(input);controls.append(button);
   originalError(input,'No está offline. Podés buscarla online.');
  }
 };
 const onlineSuggestTimers=new WeakMap(),onlineSuggestSeq=new WeakMap();
 function selectedProductBase(input,mode){
  const item=mode==='lab'?selectedLabProduct:getCartItemByKey(input.dataset.key);
  if(!item)return null;
  const product=mode==='lab'?item:budgetProductForItem(item);
  const bases=compatibleBasesForProduct(product).map(normKey);
  return bases.length===1&&/^(PASTEL|TINT|DEEP|ACCENT)$/.test(bases[0])?bases[0]:null;
 }
 function hideOnlineSuggestions(input){input?.closest('.budget-formula')?.querySelector('.pancko-online-suggestions')?.remove();
  document.getElementById('panckoLabOnlineSuggestions')?.remove();}
 function scheduleOnlineSuggestions(input,mode){
  clearTimeout(onlineSuggestTimers.get(input));const query=input.value.trim(),seq=(onlineSuggestSeq.get(input)||0)+1;
  onlineSuggestSeq.set(input,seq);hideOnlineSuggestions(input);
  if(query.length<2||query.length>64||!navigator.onLine)return;
  const timer=setTimeout(async()=>{
   try{const result=await send('PANCKO_TINTO_SUGGEST_V1',query);
    if(onlineSuggestSeq.get(input)!==seq||input.value.trim()!==query||!document.contains(input))return;
    const parent=mode==='lab'?document.getElementById('labColorSuggest')?.parentElement:input.closest('.budget-formula');
    if(!parent)return;const box=document.createElement('div');box.className='pancko-online-suggestions';
    if(mode==='lab')box.id='panckoLabOnlineSuggestions';
    if(!result?.ok){box.textContent='Online: '+String(result?.error||'Sin respuesta de búsqueda.');parent.append(box);return;}
    const heading=document.createElement('small');heading.textContent='Tintométrico online · '+(result.suggestions?.length||0)+' coincidencias'+(result.truncated?' (mostrando primeras 30)':'');box.append(heading);
    if(!result.suggestions?.length){const empty=document.createElement('div');empty.textContent='Sin coincidencias online.';box.append(empty);}
    for(const option of result.suggestions||[]){const button=document.createElement('button');button.type='button';
      const title=document.createElement('span');title.textContent=option.codigo+' — '+option.descripcion;
      const detail=document.createElement('small');detail.className='pancko-online-row-meta';
      const base=/^(PASTEL|TINT|DEEP|ACCENT)$/.test(option.base||'')?option.base:null;
      const productBase=selectedProductBase(input,mode);
      detail.textContent=(base?'Base '+base:productBase?'Base de la fórmula a confirmar · Producto '+productBase:'Base a confirmar')+' · Online';button.append(title,detail);
      button.title='Consultar esta fórmula online para el artículo elegido';
      button.onclick=()=>{hideOnlineSuggestions(input);input.value=option.codigo;
       if(mode==='lab'){window.renderLabFormula();window.panckoSearchLabOnline(option.id);}
       else window.panckoSearchOnline(input,option.id);};box.append(button);}
    parent.append(box);
   }catch(error){if(onlineSuggestSeq.get(input)===seq){const parent=mode==='lab'?document.getElementById('labColorSuggest')?.parentElement:input.closest('.budget-formula');
      if(parent){const box=document.createElement('div');box.className='pancko-online-suggestions';box.textContent='Online: '+String(error.message||error);parent.append(box);}}}
  },450);onlineSuggestTimers.set(input,timer);
 }
 const originalSuggest=window.budgetSuggestFormula;
 window.budgetSuggestFormula=function(input){input.closest('.budget-formula-controls')?.querySelector('.pancko-online-trigger')?.remove();
  scheduleOnlineSuggestions(input,'budget');return originalSuggest(input);};
 document.getElementById('labColorInput')?.addEventListener('input',event=>scheduleOnlineSuggestions(event.target,'lab'));
 document.addEventListener('click',event=>{if(!event.target.closest('.pancko-online-suggestions')&&!event.target.closest('#labColorInput')&&!event.target.closest('.budget-formula-controls input')){
  document.querySelectorAll('.pancko-online-suggestions').forEach(box=>box.remove());}});
 function send(type,code='',cod='',formulaId=null){return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID();let timer;
  const receive=event=>{if(event.source!==window||event.origin!==ORIGIN||event.data?.type!=='PANCKO_TINTO_RESULT_V1'||event.data.id!==id)return;
   clearTimeout(timer);window.removeEventListener('message',receive);state.bridge='sí';state.received='sí';
   if(event.data.response?.extension_version)state.version=String(event.data.response.extension_version);
   if(event.data.response?.background)recordBackground(event.data.response.background);
   if(event.data.response?.error)state.error=String(event.data.response.error);
   showDiagnostic();resolve(event.data.response);};
  window.addEventListener('message',receive);
  state.sent='sí';state.received='no';state.error='—';showDiagnostic();
  timer=setTimeout(()=>{window.removeEventListener('message',receive);state.bridge='no';state.error='No llegó respuesta del content script. Recargá la extensión v0.3.3 y luego esta pestaña.';showDiagnostic();reject(Error(state.error));},type==='PANCKO_TINTO_PING_V1'?3500:type==='PANCKO_TINTO_SUGGEST_V1'?18000:65000);
  window.postMessage({type,id,code,cod,formulaId},ORIGIN);
 });}
 async function testBridge(){
  try{const result=await send('PANCKO_TINTO_PING_V1');
   state.bridge=result?.bridge_detected?'sí':'no';recordBackground(result?.background);
   if(!result?.ok)throw Error(result?.error||'El Bridge no respondió correctamente.');
   if(!result.background?.official_tab_found)throw Error('No se encontró una pestaña del tintométrico oficial.');
   if(!result.background?.list_detected)throw Error('Lista no detectada. Abrí una fórmula oficial una vez.');
   state.error='—';showDiagnostic();return true;
  }catch(error){state.error=error.message||String(error);showDiagnostic();return false;}
 }
 diagnostic.querySelector('#panckoBridgeTest').onclick=testBridge;
 function pack(description){
  const match=String(description||'').toUpperCase().match(/(?:\b(\d+(?:[.,]\d+)?)\s*(L(?:T|TS|ITROS?)?|KG|KGS|G|ML)\b)/);
  if(!match)return null;
  const unit=/^(?:L)/.test(match[2])?'L':/^K/.test(match[2])?'KG':match[2];
  const value=Number(match[1].replace(',','.'))*((unit==='ML'||unit==='G')?0.001:1);
  return {unit:unit==='ML'?'L':unit==='G'?'KG':unit,value};
 }
 function compatiblePresentation(localPack,remotePack){
  if(!localPack||!remotePack||localPack.unit!==remotePack.unit)return false;
  if(!Number.isFinite(localPack.value)||!Number.isFinite(remotePack.value)||remotePack.value<=0)return false;
  if(Math.abs(localPack.value-remotePack.value)<=0.0001)return true;
  // Mismo COD: presentación comercial de 1/4/10/20 L frente al contenido real
  // indicado por la web. No convertir pulsos ni alterar el tamaño de la receta.
  if(localPack.unit==='L'){
   const minimums={1:0.5,4:3,10:9,20:18};
   const minimum=minimums[localPack.value];
   if(minimum!==undefined)return remotePack.value>=minimum&&remotePack.value<localPack.value;
  }
  // Para otras presentaciones se conserva la tolerancia pequeña anterior.
  return localPack.value>=1&&Number.isInteger(localPack.value)&&
   remotePack.value<localPack.value&&remotePack.value>=localPack.value*0.95;
 }
 function prepare(item,recipe,code){
  const product=budgetProductForItem(item),localCode=String(item.COD||product.COD||'').trim();
  if(recipe?.schema!=='pancko-tinto-exact/1'||!/^\d{1,20}$/.test(localCode)||recipe.codigo_articulo!==localCode)throw Error('COD distinto: no se puede aplicar.');
  if(normKey(recipe.codigo)!==normKey(code))throw Error('El código de fórmula devuelto no coincide.');
  const bases=compatibleBasesForProduct(product),base=normKey(recipe.base);
  if(!base||!bases.includes(base))throw Error('Base online desconocida o incompatible con el artículo.');
  const localPack=pack(item.base_ARTIC||product.ARTIC||item.ARTIC),remotePack=pack(recipe.articulo);
  if(!compatiblePresentation(localPack,remotePack))throw Error('El envase es distinto para COD '+localCode+': Pancko '+(localPack?localPack.value+' '+localPack.unit:'sin tamaño')+'; tintométrico '+(remotePack?remotePack.value+' '+remotePack.unit:'sin tamaño')+'. No se aplicó.');
  if(!Array.isArray(recipe.colorantes)||!recipe.colorantes.length)throw Error('La receta no tiene colorantes.');
  const seen=new Set(),lines=recipe.colorantes.map(row=>{
   const colorante=normKey(row.colorante),pulsos=Number(row.pulsos),price=Number(colorantPrices[colorante]);
   if(seen.has(colorante)||!tintColorantList().includes(colorante)||!Number.isFinite(pulsos)||pulsos<=0)throw Error('Colorante duplicado, desconocido o pulsos inválidos.');
   seen.add(colorante);
   if(!Number.isFinite(price)||price<=0)throw Error('Falta precio local para el colorante '+colorante+'. Configuralo antes de aplicar.');
   return {colorante,pulsos,pulsosRaw:pulsos,precioPulso:price,subtotal:pulsos*price};
  });
  return {recipe,lines,base,envase:remotePack,envaseNominal:localPack,total:lines.reduce((n,x)=>n+x.subtotal,0),localCode};
 }
 function onlineSnapshot(candidate,manualModified=false){
  const {recipe,lines,base,envase,envaseNominal,total,localCode}=candidate;
  return {consultado_en:recipe.consultado_en,codigo:recipe.codigo,id_formula:recipe.id_formula,
   descripcion:recipe.descripcion,id_articulo:recipe.id_articulo,cod_local:localCode,
   cod_online:recipe.codigo_articulo,articulo_online:recipe.articulo,base,envase,envase_nominal:envaseNominal,
   colorantes:budgetClone(lines),total_tintas:total,manual_modified:manualModified,guardada_offline:false};
 }
 function preview(candidate,mode,context){
  const {recipe,lines,base,envase,envaseNominal,total,localCode}=candidate;
  pending={mode,candidate,...context};
  const basePrice=mode==='budget'?budgetBasePrice(context.item):num(context.item?.PR_CON_IVA);
  content.innerHTML=`<h2>Vista previa · fórmula online ${esc(recipe.codigo)}</h2><p><b>${esc(recipe.descripcion)}</b><br>${esc(recipe.articulo)} · COD ${esc(localCode)} · Base ${esc(base)}${recipe.base_source==='inferida_del_articulo'?' (inferida del artículo)':' (campo del artículo)'}<br>Presentación Pancko: ${esc(String(envaseNominal.value))} ${esc(envaseNominal.unit)} · Contenido indicado online: ${esc(String(envase.value))} ${esc(envase.unit)}</p><ul>${lines.map(x=>`<li>${esc(x.colorante)}: ${esc(String(x.pulsos))} pulsos × ${$m(x.precioPulso)} = ${$m(x.subtotal)}</li>`).join('')}</ul><p><b>Tintas ${$m(total)} · Artículo con tintas ${$m(basePrice+total)}</b></p><small>Pulsos exactos del envase online. No se agrega al catálogo de recetas.</small>`;
  apply.disabled=false;modal.showModal();
 }
 window.panckoSearchOnline=async (input,formulaId=null)=>{
  const key=input.dataset.key,code=input.value.trim(),item=getCartItemByKey(key);
  if(!item||!code)return;
  if(!navigator.onLine){budgetFormulaError(input,'Sin conexión. El presupuesto offline sigue disponible.');return;}
  const product=budgetProductForItem(item),cod=String(item.COD||product.COD||'').trim();
  if(!/^\d{1,20}$/.test(cod)){budgetFormulaError(input,'El COD local no es válido para buscar online.');return;}
  budgetFormulaError(input,'Consultando tintométrico online…');
  try{
   if(!await testBridge())throw Error(state.error);
   let result=await send('PANCKO_TINTO_LOOKUP_V1',code,cod,formulaId);
   if(result?.choices){
    const options=result.choices.map((x,i)=>`${i+1}. ${x.codigo} — ${x.descripcion}`).join('\n');
    const chosen=prompt('Hay varias fórmulas. Elegí el número:\n'+options);
    if(chosen===null){budgetFormulaError(input,'Consulta cancelada.');return;}
    const selected=result.choices[Number(chosen)-1];if(!selected){budgetFormulaError(input,'Selección inválida.');return;}
    result=await send('PANCKO_TINTO_LOOKUP_V1',code,cod,selected.id);
   }
   if(!result?.ok)throw Error(result?.error||'La extensión no devolvió una receta.');
   if(getCartItemByKey(key)!==item||input.value.trim()!==code)throw Error('La línea cambió durante la consulta. Buscá nuevamente.');
   const candidate=prepare(item,result.recipe,code);
   preview(candidate,'budget',{key,item,code,budgetCode:currentBudgetCode});
  }catch(error){budgetFormulaError(input,error.message||String(error));}
 };
 const originalLabRender=window.renderLabFormula;
 function labMatches(){const code=document.getElementById('labColorInput')?.value.trim();
  return labOnline&&selectedLabProduct&&String(selectedLabProduct.COD)===labOnline.candidate.localCode&&normKey(extractColorId(code))===normKey(labOnline.code);}
 function renderOnlineLab(){
  const {candidate}=labOnline,{recipe,lines,base,total}=candidate,p=selectedLabProduct;
  selectedLabCalc={ok:true,rec:{idcolor:recipe.codigo,descripcion:recipe.descripcion,id_formula:recipe.id_formula},
   base_formula:base,base_fisica:normKey(p.base_fisica_tinto||p.base_tinto||base),factor:1,
   factor_mode:'online_exact',lines:budgetClone(lines),tintCost:total};
  selectedLabManualLines=budgetClone(lines);
  document.getElementById('labResult').innerHTML=`<div class="lab-formula-card"><div class="lab-formula-title">${esc(recipe.codigo)} · ${esc(recipe.descripcion)} <small>online</small></div><div class="lab-meta">Producto: <b>${esc(p.ARTIC)}</b><br>COD: <b>${esc(candidate.localCode)}</b> · Base: <b>${esc(base)}</b> ${recipe.base_source==='inferida_del_articulo'?'(inferida del artículo)':'(campo del artículo)'} · Presentación: <b>${esc(String(candidate.envaseNominal.value))} ${esc(candidate.envaseNominal.unit)}</b> · Contenido online: <b>${esc(String(candidate.envase.value))} ${esc(candidate.envase.unit)}</b><br>Pulsos exactos del artículo consultado. Tintas: <b>${$m(total)}</b></div><div id="labFormulaTableBox"></div><div id="pendingCanAlertsBox"></div><button class="btn btn-primary lab-label-btn" style="width:100%;margin:10px 0 12px" onclick="printCurrentLabLabel()">🏷️ Etiqueta para lata</button><div class="lab-manual-box"><div style="font-weight:700;margin-bottom:6px">Editar fórmula usada</div><div class="muted" style="font-size:.78rem;margin-bottom:8px">Los cambios manuales quedan en este registro; no modifican la receta online.</div><div class="lab-manual-head"><div>Tinta</div><div>Pulsos</div><div></div></div><div id="labManualRows"></div><button class="btn btn-back" style="width:100%;margin-top:8px" onclick="addLabManualRow()">＋ Agregar tinta</button><button class="btn btn-back" style="width:100%;margin-top:8px" onclick="restoreLabCalculatedFormula()">Restaurar pulsos online</button></div></div>`;
  renderLabManualRows(selectedLabManualLines);renderLabFormulaTable(selectedLabManualLines);
  renderPendingCanAlerts(selectedLabCalc,p);
 }
 window.renderLabFormula=function(){
  if(labMatches()){renderOnlineLab();return;}
  labOnline=null;originalLabRender();
  const p=selectedLabProduct,code=document.getElementById('labColorInput')?.value.trim(),result=document.getElementById('labResult');
  if(!p||!code||!isTintableProduct(p)||!result||selectedLabCalc)return;
  const wanted=normKey(extractColorId(code)),bases=compatibleBasesForProduct(p);
  if(tintRecipes.some(r=>bases.includes(normKey(r.base))&&normKey(r.idcolor||r.codigo_formula)===wanted))return;
  const button=document.createElement('button');button.className='btn btn-primary';button.type='button';button.textContent='Buscar fórmula online';
  button.onclick=()=>window.panckoSearchLabOnline();result.append(button);
 };
 window.panckoSearchLabOnline=async function(formulaId=null){
  if(!selectedLabProduct)selectLabProductFromInput();const item=selectedLabProduct;
  const code=document.getElementById('labColorInput')?.value.trim(),cod=String(item?.COD||'').trim();
  const resultBox=document.getElementById('labResult');
  if(!item||!code||!/^\d{1,20}$/.test(cod)){resultBox.textContent='Elegí un artículo con COD numérico e ingresá un código de fórmula.';return;}
  if(!navigator.onLine){resultBox.textContent='Sin conexión. Las recetas offline siguen disponibles.';return;}
  resultBox.textContent='Consultando tintométrico online…';
  try{
   if(!await testBridge())throw Error(state.error);
   let result=await send('PANCKO_TINTO_LOOKUP_V1',code,cod,formulaId);
   if(result?.choices){const options=result.choices.map((x,i)=>`${i+1}. ${x.codigo} — ${x.descripcion}`).join('\n');
    const chosen=prompt('Hay varias fórmulas. Elegí el número:\n'+options);
    if(chosen===null){renderLabFormula();return;}
    const selected=result.choices[Number(chosen)-1];if(!selected)throw Error('Selección inválida.');
    result=await send('PANCKO_TINTO_LOOKUP_V1',code,cod,selected.id);
   }
   if(!result?.ok)throw Error(result?.error||'La extensión no devolvió una receta.');
   if(selectedLabProduct!==item||document.getElementById('labColorInput')?.value.trim()!==code)throw Error('El producto o el color cambió. Consultá nuevamente.');
   const candidate=prepare(item,result.recipe,code);
   if(candidate.lines.some(x=>Math.abs(x.pulsos-roundPulse(x.pulsos))>0.00001))throw Error('El Laboratorio actual sólo admite pasos de 0,125 pulso. No se redondearon los pulsos online.');
   preview(candidate,'lab',{item,code});
  }catch(error){resultBox.textContent=error.message||String(error);}
 };
 const originalLabPayload=window.getLabRecordPayload;
 window.getLabRecordPayload=function(){const payload=originalLabPayload();
  if(payload.ok&&labMatches()){payload.record.origin='online';payload.record.online_snapshot=onlineSnapshot(labOnline.candidate,payload.record.manualModified);}
  return payload;};
 const originalLabAdd=window.addLabToBudget;
 window.addLabToBudget=function(){const snapshot=labMatches()?onlineSnapshot(labOnline.candidate,labFormulaModified()):null;
  const before=cart.length;originalLabAdd();
  if(snapshot&&cart.length===before+1){const item=cart.at(-1);item.tintData.origin='online';item.tintData.online_snapshot=snapshot;save();}
 };
 const originalLabLoad=window.loadLabRecord;
 window.loadLabRecord=function(id){originalLabLoad(id);const r=labRecords.find(x=>x.id===id);
  labOnline=r?.origin==='online'&&r.online_snapshot&&selectedLabProduct?{
   code:r.online_snapshot.codigo,candidate:{recipe:{schema:'pancko-tinto-exact/1',codigo:r.online_snapshot.codigo,descripcion:r.descripcion,id_formula:r.id_formula,codigo_articulo:String(r.COD),articulo:r.online_snapshot.articulo_online,id_articulo:r.online_snapshot.id_articulo,consultado_en:r.online_snapshot.consultado_en,base:r.base_formula,colorantes:(r.formula_original||[]).map(x=>({colorante:x.colorante,pulsos:x.pulsos}))},lines:budgetClone(r.formula_original||[]),base:r.base_formula,envase:r.online_snapshot.envase,total:num(r.online_snapshot.total_tintas),localCode:String(r.COD)}}:null;
 };
 apply.onclick=()=>{
  if(!pending)return;const {key,item,code,candidate,budgetCode}=pending;
  if(pending.mode==='lab'){
   if(selectedLabProduct!==item||document.getElementById('labColorInput')?.value.trim()!==code){content.textContent='El producto o color cambió. Cerrá y consultá nuevamente.';apply.disabled=true;return;}
   try{prepare(item,candidate.recipe,code);}catch(error){content.textContent=error.message;apply.disabled=true;return;}
   labOnline={candidate,code};pending=null;modal.close();renderLabFormula();return;
  }
  if(currentBudgetCode!==budgetCode||getCartItemByKey(key)!==item){content.textContent='La línea o el presupuesto cambió. Cerrá y consultá nuevamente.';apply.disabled=true;return;}
  const live=document.querySelector(`#cartItems .budget-formula input[data-key="${CSS.escape(String(key))}"]`);
  if(!live||live.value.trim()!==code){content.textContent='El código cambió. Cerrá y consultá nuevamente.';apply.disabled=true;return;}
  try{prepare(item,candidate.recipe,code);}catch(error){content.textContent=error.message;apply.disabled=true;return;}
  if(item.tintData?.manualModified&&!confirm('La fórmula actual fue modificada. ¿Reemplazarla?'))return;
  const {recipe,lines,base,total}=candidate,now=new Date().toISOString(),p=budgetProductForItem(item),basePrice=budgetBasePrice(item);
  touchCurrentBudgetForEdit();item.product_snapshot=budgetClone(item.product_snapshot||p);item.base_price_snapshot=basePrice;
  item.base_ARTIC=item.base_ARTIC||p.ARTIC||item.ARTIC;item.ARTIC=`${item.base_ARTIC} (${code})`;
  item.PR_CON_IVA=basePrice+total;item.PR_SIN_IVA=item.PR_CON_IVA/1.21;
  item.tintData={color:code,color_original:code,descripcion:recipe.descripcion,manualModified:false,base_formula:base,base_fisica:normKey(p.base_fisica_tinto||p.base_tinto||base),factor:1,factor_mode:'online_exact',id_formula:recipe.id_formula,tintCost:total,formula_original:budgetClone(lines),formula:budgetClone(lines),created_at:now,updated_at:now,origin:'online',online_snapshot:onlineSnapshot(candidate)};
  save();pending=null;modal.close();renderCart();
 };
})();
