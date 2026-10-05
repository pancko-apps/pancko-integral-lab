
/* Pancko Gestión v0.12.18 · Extiende la base sin cambiar sus reglas comerciales. */
'use strict';
let budgetClientId=labStorage.getItem('pk_draft_client_id') || '';
let quickClientReturn=false;
let catalogPreview=null;
let managementSyncBusy=false;
let lastCatalogMessage='';
const gestionModules={remitos:{economic:false,status:'prepared'},cc:{economic:true,status:'central-manual'},recibos:{economic:false,status:'prepared'},cheques:{economic:false,status:'prepared'},scanner:{status:'prepared'}};
function getBudgetPrintOptions(){return document.getElementById('budgetPrintOptions')?.value || labStorage.getItem('pk_budget_print_options') || 'full';}
function setBudgetPrintOptions(value){touchCurrentBudgetForEdit();labStorage.setItem('pk_budget_print_options',['none','configured','full'].includes(value)?value:'full');}
function persistDraftClient(){labStorage.setItem('pk_draft_client_name',document.getElementById('clientName').value);labStorage.setItem('pk_draft_client_id',budgetClientId);}
function budgetClientTyped(){touchCurrentBudgetForEdit();budgetClientId='';persistDraftClient();}
const legacyResolveClientData=resolveClientData;
resolveClientData=function(){const name=document.getElementById('clientName').value.trim();const c=clients.find(x=>String(x.id)===budgetClientId && norm(x.cliente)===norm(name));return c ? {id:c.id,nombre:c.cliente,cuit:c.cuit || '',direccion:c.direccion || '',telefono:c.telefono || ''} : legacyResolveClientData();};
selectClientAutocomplete=function(id){const c=clients.find(x=>String(x.id)===String(id));if(!c)return;touchCurrentBudgetForEdit();budgetClientId=String(c.id);document.getElementById('clientName').value=c.cliente;persistDraftClient();hideClientAutocomplete();};
useClientForBudget=function(id){selectClientAutocomplete(id);showScreen('cartScreen');showToast('Cliente cargado en presupuesto');};
renderClientAutocomplete=function(){const box=document.getElementById('clientAutocompleteList');const q=norm(document.getElementById('clientName').value);box.replaceChildren();if(!q){box.style.display='none';return;}const matches=clients.filter(c=>norm([c.cliente,c.cuit,c.telefono].join(' ')).includes(q)).slice(0,16);for(const c of matches){const row=document.createElement('button');row.type='button';row.className='autocomplete-item';row.style.cssText='width:100%;text-align:left;background:transparent;color:inherit;border:0;';const title=document.createElement('div');title.className='autocomplete-name';title.textContent=c.cliente;const meta=document.createElement('div');meta.className='autocomplete-meta';meta.textContent=[c.cuit || 'Sin DNI/CUIT',c.telefono].filter(Boolean).join(' · ');row.append(title,meta);row.onclick=()=>selectClientAutocomplete(c.id);box.append(row);}if(!matches.length){const row=document.createElement('button');row.className='btn btn-back';row.textContent='Cliente nuevo: crear sin perder el presupuesto';row.onclick=quickClientForBudget;box.append(row);}box.style.display='block';};
function chooseCounterClient(){touchCurrentBudgetForEdit();budgetClientId='';document.getElementById('clientName').value='CONSUMIDOR FINAL';const c=clients.find(x=>norm(x.cliente)==='consumidor final');if(c)budgetClientId=String(c.id);persistDraftClient();hideClientAutocomplete();}
function quickClientForBudget(){const typed=document.getElementById('clientName').value.trim();quickClientReturn=true;openClientForm(null);document.getElementById('clientFrmNombre').value=typed;document.getElementById('clientFrmNombre').focus();}
function cancelClientForm(){const target=quickClientReturn?'cartScreen':'clientsScreen';quickClientReturn=false;showScreen(target);}
const legacyOpenClientForm=openClientForm;
openClientForm=function(id){legacyOpenClientForm(id);document.querySelectorAll('#clientFormScreen .btn-back').forEach(b=>b.onclick=cancelClientForm);};
const legacySaveClientForm=saveClientForm;
saveClientForm=function(){const name=document.getElementById('clientFrmNombre').value.trim();if(!name){legacySaveClientForm();return;}const returning=quickClientReturn;legacySaveClientForm();if(returning){quickClientReturn=false;const c=clients[clients.length-1];if(c)selectClientAutocomplete(c.id);showScreen('cartScreen');showToast('Cliente creado y seleccionado. Presupuesto conservado.');}};
const legacyScreen=showScreen;
showScreen=function(id,options={}){if(!document.getElementById(id))id='homeScreen';legacyScreen(id,options);const groups={detailScreen:'searchScreen',clientFormScreen:'clientsScreen',clientColorsScreen:'clientsScreen',historyDetailScreen:'historyScreen',importScreen:'configScreen',discountScreen:'configScreen',configDataScreen:'configScreen',styleScreen:'configScreen',manageArticlesScreen:'configScreen',articleFormScreen:'configScreen',clientsImportScreen:'configScreen',pendingCansScreen:'labScreen',tintCompositionSearchScreen:'labScreen'};document.querySelectorAll('.gestion-nav').forEach(b=>{const active=b.dataset.screen===(groups[id] || id);b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(id==='syncScreen')renderManagementSync();if(id==='importScreen')renderCatalogManagement();};
// Historical output keeps the saved customer, factor, configuration and payment conditions.
const legacyHistoryDetail=openHistoryDetail;
openHistoryDetail=function(id){legacyHistoryDetail(id);const h=budgetHistory.find(x=>String(x.id)===String(id));if(!h)return;const box=document.getElementById('histDetailContainer');const actions=document.createElement('div');actions.className='gestion-actions';const a4=document.createElement('button');a4.className='btn btn-back';a4.textContent='Vista A4 del presupuesto guardado';a4.onclick=()=>{const html=buildA4HTML({items:h.cart,cfg:h.config || config,client:h.cliente,clientData:h.clientData,mode:{label:h.modo,percent:h.modePercent || 0},fecha:h.fecha,codigo:h.id,printOptions:h.printOptions || 'full',paymentConditions:h.paymentConditions || discounts});const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000);};actions.append(a4);const b=document.createElement('button');b.className='btn btn-back';b.textContent='Remitos: en elaboración';b.onclick=()=>showScreen('remitosScreen');actions.append(b);box.append(actions);};
// Gestión de catálogo v0.11.7. Presupuestos y fórmulas guardadas no se recalculan.
let catalogBusy=false;
let catalogApplying=false;
function catalogJSON(key,fallback){try{return JSON.parse(labStorage.getItem(key) || 'null') ?? fallback;}catch{return fallback;}}
function catalogDate(value){if(!value)return 'Sin registrar';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}):'Sin registrar';}
function catalogName(value,required=true){const name=String(value || '').trim();if((required&&!name)||name.length>100||/[\u0000-\u001f\u007f]/.test(name))throw new Error('Ingresá un nombre de lista de 1 a 100 caracteres, por ejemplo: Lista nº 73.');return name;}
function validateArticleRows(rows){
  if(!Array.isArray(rows)||!rows.length)throw new Error('La lista está vacía.');
  if(rows.length>15000)throw new Error('La lista supera 15.000 artículos.');
  const ids=new Set();
  return rows.map((r,i)=>{
    const p={...r};p.COD=String(r.COD ?? '').trim();p.ARTIC=String(r.ARTIC ?? '').trim();
    const price=typeof r.PR_CON_IVA==='number'?r.PR_CON_IVA:parseAmount(r.PR_CON_IVA);
    if(!p.COD||!p.ARTIC||r.PR_CON_IVA==null||r.PR_CON_IVA===''||!Number.isFinite(price)||price<0)throw new Error(`Fila ${i+2}: falta código, descripción o precio válido.`);
    if(/^[=+@-]/.test(p.COD)||/[\u0000-\u001f'"\\<>`]/.test(p.COD))throw new Error(`Código no válido: ${p.COD}`);
    if(ids.has(p.COD))throw new Error(`Código duplicado: ${p.COD}. Corregí el CSV antes de aplicar.`);
    if(JSON.stringify(p).length>15000)throw new Error(`Artículo ${p.COD} demasiado extenso.`);
    ids.add(p.COD);p.PR_CON_IVA=price;return p;
  });
}
function validateArticleRowsOrEmpty(rows){return rows?.length?validateArticleRows(rows):[];}
// Parser exclusivo de artículos: acepta el CSV full exportado, incluidas comillas y saltos de línea.
// No altera la importación histórica de recetas o clientes.
function catalogCSVRows(text){
  const input=String(text || '').replace(/^\uFEFF/,'').replace(/^\s*\r?\n/,'');
  const first=input.split(/\r?\n/,1)[0] || '';
  const counts={';':0,',':0,'\t':0};let quoted=false;
  for(let i=0;i<first.length;i++){if(first[i]==='"'){if(quoted&&first[i+1]==='"')i++;else quoted=!quoted;}else if(!quoted&&first[i] in counts)counts[first[i]]++;}
  const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
  const rows=[];let row=[],cell='',inQuote=false,closed=false,hasRecord=false;
  const endCell=()=>{row.push(cell.trim());cell='';closed=false;};
  const endRow=()=>{endCell();if(hasRecord||row.some(Boolean)||row.length>1)rows.push(row);row=[];hasRecord=false;};
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(inQuote){if(c==='"'){if(input[i+1]==='"'){cell+='"';i++;}else{inQuote=false;closed=true;}}else cell+=c;continue;}
    if(c==='"'){if(cell.trim()||closed)throw new Error('CSV con comillas fuera de lugar.');cell='';inQuote=true;hasRecord=true;}
    else if(c===delimiter){endCell();hasRecord=true;}
    else if(c==='\r'||c==='\n'){if(c==='\r'&&input[i+1]==='\n')i++;endRow();}
    else{if(closed&&c.trim())throw new Error('CSV con contenido después de cerrar comillas.');cell+=c;if(c.trim())hasRecord=true;}
  }
  if(inQuote)throw new Error('CSV con comillas sin cerrar.');
  if(cell||row.length||hasRecord)endRow();
  if(rows.length<2)throw new Error('CSV vacío o sin artículos.');
  const headers=rows.shift(),seen=new Set();
  headers.forEach(h=>{if(!h||seen.has(h)||['__proto__','constructor','prototype'].includes(h))throw new Error('CSV con encabezados vacíos, duplicados o no admitidos.');seen.add(h);});
  return rows.map((cells,i)=>{if(cells.length!==headers.length)throw new Error(`Fila ${i+2}: cantidad de columnas incorrecta.`);return Object.fromEntries(headers.map((h,j)=>[h,cells[j]]));});
}
function parseArticleImport(text){
  const raw=catalogCSVRows(text);
  const norm=h=>h.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const byNorm=Object.fromEntries(Object.keys(raw[0]).map(h=>[norm(h),h]));
  const key=names=>names.map(n=>byNorm[n]).find(Boolean);
  const cod=key(['cod','codigo','art','articulocodigo','articulo']),art=key(['artic','descripcion','productoservicio','producto','descripcionarticulo']),price=key(['prconiva','preciociva','precioconiva','precio','pcf']);
  if(!cod||!art||!price)throw new Error('Faltan columnas de código, descripción o precio con IVA.');
  return validateArticleRows(raw.map((r,i)=>{
    const textPrice=String(r[price]).trim();
    if(!textPrice||!/^(?:ARS\s*|\$\s*)?-?[\d\s.,]+$/i.test(textPrice))throw new Error(`Fila ${i+2}: precio inválido.`);
    const p={...r,COD:r[cod],ARTIC:r[art],PR_CON_IVA:parseAmount(textPrice)};
    if(p.PR_SIN_IVA===undefined||p.PR_SIN_IVA==='')p.PR_SIN_IVA=p.PR_CON_IVA/1.21;
    return p;
  }));
}
function mergeArticleRows(base,incoming,mode='prices'){
  const out=base.map(p=>({...p})),byCod=new Map(out.map(p=>[String(p.COD),p]));
  const stats={updated:0,added:0,unchanged:0,kept:base.length,configuration:0},changes=[];
  for(const row of incoming){const old=byCod.get(row.COD);
    if(old){stats.kept--;const before={...old},next=mode==='master'?{...old,...row}:{...old,ARTIC:row.ARTIC,PR_CON_IVA:row.PR_CON_IVA};
      const extra=mode==='master'&&Object.keys(row).some(k=>!['COD','ARTIC','PR_CON_IVA','PR_SIN_IVA'].includes(k)&&String(old[k]??'')!==String(row[k]??''));
      if(Object.keys(next).some(k=>String(old[k]??'')!==String(next[k]??''))){Object.assign(old,next);stats.updated++;if(extra)stats.configuration++;changes.push({COD:row.COD,ARTIC:row.ARTIC,old:Number(before.PR_CON_IVA),price:row.PR_CON_IVA,configuration:extra});}else stats.unchanged++;
    }else{out.push({...row});byCod.set(row.COD,out[out.length-1]);stats.added++;changes.push({COD:row.COD,ARTIC:row.ARTIC,old:null,price:row.PR_CON_IVA});}
  }
  if(out.length>15000)throw new Error('El catálogo combinado supera 15.000 artículos. No se aplicó ningún cambio.');
  return {rows:out,stats,changes};
}
function catalogSetBusy(on){catalogBusy=on;['catalogReceiveBtn','catalogPublishBtn'].forEach(id=>{document.getElementById(id).disabled=on;});}
async function previewArticleFile(inputId,mode='prices'){
  if(catalogBusy||catalogApplying)return;catalogSetBusy(true);
  try{
    const name=catalogName(document.getElementById('catalogListName').value),file=document.getElementById(inputId).files[0];
    if(!file)throw new Error('Seleccioná un archivo CSV.');
    const fingerprint=JSON.stringify(products),rows=parseArticleImport(decodeText(await file.arrayBuffer()));
    if(fingerprint!==JSON.stringify(products))throw new Error('El catálogo cambió mientras se leía el archivo. Volvé a revisarlo.');
    openCatalogPreview({...mergeArticleRows(products,rows,mode),type:'local',mode,name,incoming:rows,localFingerprint:fingerprint,title:mode==='master'?'Revisar maestro completo':'Revisar actualización de precios',source:file.name});
  }catch(e){lastCatalogMessage=e.message;showToast(e.message);renderCatalogManagement();}finally{catalogSetBusy(false);}
}
importCSV=()=>previewArticleFile('csvFileInput','master');
updatePricesFromCSV=()=>previewArticleFile('priceUpdateCsvInput','prices');
function openCatalogPreview(p){
  catalogPreview=p;const st=p.stats;
  document.getElementById('catalogPreviewTitle').textContent=p.title;
  document.getElementById('catalogPreviewBody').innerHTML=`<p><b>${esc(p.name || 'Lista sin nombre (publicación anterior)')}</b></p><p class="gestion-help">${esc(p.source || '')}</p><div class="preview-counts"><div><strong>${st.updated}</strong>Actualizados</div><div><strong>${st.added}</strong>Nuevos</div><div><strong>${st.unchanged}</strong>Sin cambios</div><div><strong>${st.kept}</strong>Ausentes conservados</div></div>${p.mode==='master'?`<p class="budget-notice"><b>Maestro completo:</b> puede cambiar bases, factores y otras columnas. ${st.configuration} productos existentes tienen cambios en columnas adicionales. Los campos presentes vacíos borran el valor anterior; los omitidos se conservan.</p>`:'<p class="budget-notice">Sólo precios: conserva las columnas tintométricas existentes del destino.</p>'}<p class="gestion-help">No cambia presupuestos ni líneas ya cargadas. No elimina artículos ausentes. La fecha de ${p.type==='publish'?'publicación':'aplicación en este dispositivo'} se registra al confirmar.</p>${p.type==='publish'?'<p class="gestion-help">Otros dispositivos deben recibirla manualmente. La vista legible se genera desde el resultado central.</p>':''}<p>${p.rows.length} artículos después de aplicar. Se muestran hasta 20 cambios.</p><div class="gestion-table-wrap"><table class="gestion-table"><thead><tr><th>Código</th><th>Descripción</th><th>Antes → Nuevo</th></tr></thead><tbody>${p.changes.slice(0,20).map(r=>`<tr><td>${esc(r.COD)}</td><td>${esc(r.ARTIC)}${r.configuration?'<br><small>Cambian columnas adicionales</small>':''}</td><td>${r.old==null?'Nuevo':$m(r.old)} → ${$m(r.price)}</td></tr>`).join('')}</tbody></table></div>`;
  document.getElementById('catalogApplyBtn').textContent=p.type==='publish'?'Publicar en Sheet':'Aplicar en este dispositivo';
  document.getElementById('catalogApplyBtn').disabled=false;document.getElementById('catalogPreviewModal').classList.add('open');
}
function cancelCatalogPreview(){if(catalogApplying)return;catalogPreview=null;document.getElementById('catalogPreviewModal').classList.remove('open');}
async function catalogRequest(path,options={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
  try{const res=await panckoFetch(PANCKO_API_URL+path,{...options,cache:'no-store',signal:controller.signal});const data=await res.json();if(!res.ok||!data.ok)throw new Error(data.error || `HTTP ${res.status}`);return data;}
  catch(e){if(e.name==='AbortError')throw new Error('La consulta tardó demasiado. Si estabas publicando, pudo completarse: reintentá desde esta revisión para conservar el mismo ID.');if(e instanceof SyntaxError)throw new Error('El backend no respondió artículos válidos. Revisá la implementación de Apps Script y Worker.');throw e;}finally{clearTimeout(timeout);}
}
function catalogCentralInfo(data){return {version:data.version||'',name:data.list_name||'',count:Number.isFinite(Number(data.count))?Number(data.count):null,published_at:data.updated_at||'',checked_at:new Date().toISOString()};}
function rememberCatalogCentral(data){const central=catalogCentralInfo(data);labStorage.setItem('pk_catalog_central',JSON.stringify(central));return central;}
async function previewCentralCatalog(){
  if(catalogBusy||catalogApplying)return;catalogSetBusy(true);
  try{lastCatalogMessage='Consultando Sheet…';renderCatalogManagement();const data=await catalogRequest('/articles');
    const incoming=data.version?validateArticleRows(data.articles):[];
    if(data.version&&incoming.length!==Number(data.count))throw new Error('La lista central llegó incompleta. No se aplicó ningún cambio.');
    const central=rememberCatalogCentral(data);
    if(!data.version){lastCatalogMessage='Todavía no hay lista central publicada. Podés publicar el catálogo local actual con un nombre.';return;}
    openCatalogPreview({...mergeArticleRows(products,incoming),type:'sheet',mode:'prices',name:central.name,version:data.version,central,incoming,localFingerprint:JSON.stringify(products),title:'Revisar lista recibida de Sheet',source:`Publicada: ${catalogDate(data.updated_at)} · ${data.version}`});
    lastCatalogMessage='Lista recibida para revisión. Falta confirmar su aplicación.';
  }catch(e){lastCatalogMessage=e.message;showToast(e.message);}finally{catalogSetBusy(false);renderCatalogManagement();}
}
async function publishCentralCatalog(){
  if(catalogBusy||catalogApplying)return;catalogSetBusy(true);
  try{
    const name=catalogName(document.getElementById('catalogListName').value),token=panckoAppToken();
    if(!token)throw new Error('Ingresá la Clave operativa Pancko en Sincronización.');
    const rows=validateArticleRows(products),fingerprint=JSON.stringify(products);
    lastCatalogMessage='Consultando versión antes de publicar…';renderCatalogManagement();
    const meta=await catalogRequest('/articles/meta');rememberCatalogCentral(meta);
    if(!meta.publish_configured)throw new Error('Falta configurar PANCKO_APP_TOKEN en las propiedades de Apps Script.');
    if(!meta.catalog_metadata_supported)throw new Error('Para guardar nombre, fecha y vista legible, actualizá la implementación de Apps Script a v0.11.2. El Worker v0.11.0 sigue siendo compatible.');
    const current=meta.version?await catalogRequest('/articles'):{articles:[],version:''};
    if(current.version!==meta.version)throw new Error('La versión central cambió. Volvé a revisar la publicación.');
    if(fingerprint!==JSON.stringify(products))throw new Error('El catálogo local cambió. Volvé a revisar la publicación.');
    const central=validateArticleRowsOrEmpty(current.articles);
    if(meta.version&&central.length!==Number(current.count))throw new Error('La lista central llegó incompleta. No se publicará.');
    openCatalogPreview({...mergeArticleRows(central,rows),type:'publish',mode:'prices',name,incoming:rows,localFingerprint:fingerprint,expectedVersion:meta.version||'',uploadId:'art_'+crypto.randomUUID(),title:'Revisar publicación central',source:`Maestro local · versión actual: ${meta.version || 'primera publicación'}`});
  }catch(e){lastCatalogMessage=e.message;showToast(e.message);}finally{catalogSetBusy(false);renderCatalogManagement();}
}
function catalogWriteBatch(values){
  const old=Object.keys(values).map(k=>[k,labStorage.getItem(k)]);
  try{Object.entries(values).forEach(([k,v])=>labStorage.setItem(k,v));}
  catch(e){old.reverse().forEach(([k,v])=>{try{v===null?labStorage.removeItem(k):labStorage.setItem(k,v);}catch{}});throw new Error('No hay espacio para guardar la lista y su registro en este dispositivo. Conservá un respaldo antes de liberar espacio.');}
}
function catalogNextHistory(entry){const old=catalogJSON('pk_catalog_history',[]);return JSON.stringify([entry,...old.filter(x=>x.event_id!==entry.event_id)].slice(0,100));}
async function applyCatalogPreview(){
  const p=catalogPreview;if(!p||catalogApplying)return;
  catalogApplying=true;const btn=document.getElementById('catalogApplyBtn');btn.disabled=true;let finished=false;
  try{
    if(p.localFingerprint&&p.localFingerprint!==JSON.stringify(products))throw new Error('El catálogo local cambió desde la revisión. Cancelá y volvé a revisar.');
    if(p.type==='publish'){
      const data=await catalogRequest('/articles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({articles:p.incoming,expected_version:p.expectedVersion,upload_id:p.uploadId,list_name:p.name,catalog_metadata_version:1})});
      const central=catalogCentralInfo(data.central||data),entry={event_id:'publish_'+data.version,action:'Publicación central',name:data.list_name||p.name,published_at:data.updated_at,count:data.count,version:data.version,mode:'prices'};
      catalogWriteBatch({pk_catalog_version:data.version,pk_catalog_central:JSON.stringify(central),pk_catalog_last_published_at:data.updated_at||'',pk_catalog_history:catalogNextHistory(entry)});
      lastCatalogMessage=`Publicada: ${entry.name} · ${data.count} artículos · ${catalogDate(data.updated_at)}. ${data.mirror_ok===false?'La publicación técnica está guardada, pero falló la vista legible: '+(data.mirror_warning||'revisar Apps Script'):'Vista legible de Sheet actualizada.'}${central.version!==data.version?' Existe una publicación central posterior; revisá el estado central.':''}`;
    }else{
      const now=new Date().toISOString(),name=p.type==='local'?catalogName(p.name):p.name||'',version=p.version||'local_'+crypto.randomUUID();
      const details={name,applied_at:now,version,mode:p.mode||'prices'},entry={event_id:'apply_'+crypto.randomUUID(),action:p.type==='sheet'?'Recepción de Sheet':p.mode==='master'?'Importación maestro':'Actualización de precios',name,applied_at:now,published_at:p.central?.published_at||'',count:p.rows.length,version,mode:p.mode||'prices'};
      const writes={pk_products:JSON.stringify(p.rows),pk_catalog_details:JSON.stringify(details),pk_catalog_source:p.type==='sheet'?'sheet':'local',pk_catalog_updated_at:now,pk_catalog_history:catalogNextHistory(entry)};
      if(p.type==='sheet'){writes.pk_catalog_version=p.version;writes.pk_catalog_last_received_at=now;writes.pk_catalog_central=JSON.stringify(p.central);}
      catalogWriteBatch(writes);products=p.rows;
      syncTintPricesFromProducts(false);renderImportStatus();renderTintStatus();renderTintPriceInputs();renderSearch();renderManageList();
      if(typeof renderDesktopShell==='function')renderDesktopShell();
      document.getElementById('catalogListName').value=name;
      lastCatalogMessage=`${name||'Lista central sin nombre'} aplicada: ${products.length} artículos · ${catalogDate(now)}.`;
    }
    finished=true;showToast(lastCatalogMessage);
  }catch(e){lastCatalogMessage=e.message;showToast(e.message);}
  finally{catalogApplying=false;if(finished)cancelCatalogPreview();else btn.disabled=false;renderCatalogManagement();}
}
function renderCatalogManagement(){
  const source=labStorage.getItem('pk_catalog_source'),details=catalogJSON('pk_catalog_details',{}),central=catalogJSON('pk_catalog_central',{}),repo=catalogJSON(BUNDLED_DATA_VERSION_KEY,{});
  const pair=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${esc(String(value))}</dd></div>`;
  document.getElementById('catalogLocalStatus').innerHTML=`<dl class="catalog-facts">${pair('Nombre',details.name||'Sin nombre registrado')}${pair('Artículos locales',products.length)}${pair('Origen',source==='sheet'?'Sheet central':source==='local'?'Importación / edición local':'CSV del repositorio')}${pair('Aplicada en este dispositivo',catalogDate(details.applied_at))}${pair('Versión local / base',details.version||repo.articulos||'Sin registrar')}${pair('Conexión',navigator.onLine?'Disponible':'Sin conexión · catálogo local')}</dl>`;
  document.getElementById('catalogSyncStatus').innerHTML=`<dl class="catalog-facts">${pair('Nombre central',central.name||'Sin nombre registrado')}${pair('Versión central consultada',central.version||'Sin publicación conocida')}${pair('Artículos de esa versión',central.count==null?'Sin consultar':central.count)}${pair('Publicada en Sheet',catalogDate(central.published_at))}${pair('Última consulta',catalogDate(central.checked_at))}${pair('Última recepción en este dispositivo',catalogDate(labStorage.getItem('pk_catalog_last_received_at')))}${pair('Versión recibida / publicada aquí',labStorage.getItem('pk_catalog_version')||'Ninguna')}</dl><p class="catalog-message">${esc(lastCatalogMessage)}</p>`;
  const nameInput=document.getElementById('catalogListName');if(!nameInput.value&&details.name)nameInput.value=details.name;
  const history=catalogJSON('pk_catalog_history',[]);
  document.getElementById('catalogHistory').innerHTML=history.length?`<div class="gestion-table-wrap"><table class="gestion-table"><thead><tr><th>Lista</th><th>Operación</th><th>Fecha y hora (Argentina)</th><th>Artículos</th></tr></thead><tbody>${history.slice(0,10).map(h=>`<tr><td>${esc(h.name||'Sin nombre registrado')}</td><td>${esc(h.action)}</td><td>${esc(catalogDate(h.applied_at||h.published_at))}</td><td>${esc(String(h.count))}</td></tr>`).join('')}</tbody></table></div>`:'<p class="gestion-help">Todavía no hay operaciones registradas con esta versión. Los datos anteriores se conservan; no se inventan fechas históricas.</p>';
}
function renderManagementSync(){
  const pendingBud=budgetHistory.filter(h=>h._sync!=='synced').length,pendingLab=labRecords.filter(r=>r._sync!=='synced').length;
  document.getElementById('syncSummary').innerHTML=`Red: <b>${navigator.onLine?'conectada':'sin conexión'}</b><br>Presupuestos pendientes: <b>${pendingBud}</b><br>Colores pendientes: <b>${pendingLab}</b><br>El borrado de colores sigue siendo local.`;
  document.getElementById('retrySyncBtn').disabled=managementSyncBusy;
  document.getElementById('pwaStatus').textContent=`Pancko Gestión LAB v0.12.19 R9 · ${'serviceWorker' in navigator?'PWA disponible en HTTPS.':'Este navegador no permite service worker.'}`;
  if('serviceWorker' in navigator)navigator.serviceWorker.getRegistration().then(r=>{document.getElementById('pwaStatus').textContent=`Pancko Gestión LAB v0.12.19 R9 · ${r?.waiting?'Actualización esperando: cerrá todas las ventanas y reabrí.':r?.active?'Service worker activo. Datos base disponibles offline tras completar la instalación.':'Instalación offline aún no completada.'}`;}).catch(()=>{});
  renderCatalogManagement();
}

async function retryManagementSync(){if(managementSyncBusy)return;managementSyncBusy=true;renderManagementSync();try{await syncPendingBudgets();await syncPendingLabRecords();await syncBudgetsFromCloud();await syncLabRecordsFromCloud();showToast('Sincronización finalizada. Revisá los pendientes.');}finally{managementSyncBusy=false;renderManagementSync();}}
window.addEventListener('online',()=>{renderCatalogManagement();retryManagementSync();});
window.addEventListener('offline',renderManagementSync);
// Full-fidelity backup import: merge by stable ID, preserve all snapshots and pending flags.
importHistoryJSON=function(event){const file=event?.target?.files?.[0];if(!file)return;file.text().then(text=>{const data=JSON.parse(text);const rows=Array.isArray(data)?data:data.history;if(!Array.isArray(rows)||!rows.length)throw new Error('No hay presupuestos en el archivo.');const incoming=rows.map(h=>{if(!h || !Array.isArray(h.cart) || !h.id)throw new Error('El respaldo contiene un presupuesto sin ID o líneas.');const entry=JSON.parse(JSON.stringify(h));entry._sync='pending';entry.cart=entry.cart.map(item=>{if(!Number.isFinite(Number(item.PR_CON_IVA))||!Number.isFinite(Number(item.qty))||Number(item.qty)<=0)throw new Error('Hay líneas con precio o cantidad inválida.');return item;});return entry;});if(!confirm(`Importar ${incoming.length} presupuestos conservando fórmulas y descuentos. Los IDs existentes se mantienen sin reemplazar. ¿Continuar?`))return;const ids=new Set(budgetHistory.map(h=>String(h.id)));for(const h of incoming)if(!ids.has(String(h.id))&&!getDeletedBudgetIds().has(String(h.id))){budgetHistory.push(h);ids.add(String(h.id));}save();renderHistory();showToast('Respaldo importado completo.');}).catch(e=>alert('Error al importar: '+e.message)).finally(()=>{event.target.value='';});};
// Editing an article explicitly makes this device's catalog local.
const legacySaveArticleForm=saveArticleForm;
saveArticleForm=function(){const before=JSON.stringify(products);legacySaveArticleForm();if(JSON.stringify(products)!==before)labStorage.setItem('pk_catalog_source','local');};
const legacyRemoveArticle=removeArticle;
removeArticle=function(i){const before=products.length;legacyRemoveArticle(i);if(products.length!==before)labStorage.setItem('pk_catalog_source','local');};
document.getElementById('clientName').value=labStorage.getItem('pk_draft_client_name') || '';
document.getElementById('budgetPrintOptions').value=labStorage.getItem('pk_budget_print_options') || 'full';
showScreen(document.querySelector('.screen.active')?.id || 'homeScreen',{push:false,sync:false});
// Crear/guardar y reimprimir son acciones distintas: una etiqueta repetida no duplica el registro.
let labSavedFingerprint='',labSavedId='';
function labRecordFingerprint(r){return JSON.stringify({COD:r.COD,ARTIC:r.ARTIC,cliente:r.cliente,nota:r.nota,color:r.color,color_original:r.color_original,descripcion:r.descripcion,factor:r.factor,factor_mode:r.factor_mode,formula:r.formula,formula_original:r.formula_original});}
function ensureCurrentLabRecord(){const payload=getLabRecordPayload();if(!payload.ok)throw new Error(payload.msg);const fingerprint=labRecordFingerprint(payload.record);const previous=labRecords.find(r=>r.id===labSavedId);if(previous && fingerprint===labSavedFingerprint)return previous;payload.record._sync='pending';labRecords.unshift(payload.record);save();labSavedFingerprint=fingerprint;labSavedId=payload.record.id;renderLabRecords();syncLabRecordToCloud(payload.record);return payload.record;}
saveLabRecord=function(){try{ensureCurrentLabRecord();showToast('Registro de laboratorio guardado');}catch(e){alert(e.message);}};
printCurrentLabLabel=function(){try{const payload=labLabelPayloadFromCurrent();if(!payload.ok)throw new Error(payload.msg);ensureCurrentLabRecord();drawAndShowLabLabel(payload.data);showToast('Etiqueta lista. Registro conservado sin duplicar.');}catch(e){alert(e.message);}};
const legacyLoadLabRecord=loadLabRecord;
loadLabRecord=function(id){legacyLoadLabRecord(id);const record=labRecords.find(r=>r.id===id);const p=getLabRecordPayload();if(record && p.ok){labSavedId=id;labSavedFingerprint=labRecordFingerprint(p.record);}else{labSavedId='';labSavedFingerprint='';}};
openCtaCteWipModal=function(){showScreen('ccScreen');};
openClientCC=function(id){showScreen('ccScreen');};
// Desde el presupuesto se agrega una línea sin saltar a otra pantalla.
selectCartQuickProduct=function(cod){const p=products.find(x=>String(x.COD)===String(cod));if(!p)return;touchCurrentBudgetForEdit();const uid='u_'+crypto.randomUUID();cart.push({...p,uid,qty:1,extraDiscount:0});save();const input=document.getElementById('cartQuickProductInput');input.value='';input.dataset.cod='';input.dataset.cleared='0';document.getElementById('cartQuickProductSuggest').classList.remove('show');renderCart();if(isTintableProduct(p))openTintEditModal(uid);else input.focus();};
const legacyTintManualLines=getCurrentTintManualLines;
getCurrentTintManualLines=function(){const lines=legacyTintManualLines();const item=getCartItemByKey(editingTintKey);const saved=item?.tintData;const typed=extractColorId(document.getElementById('tintEditColorInput')?.value || '');if(!saved || normKey(cleanLabColorCode(saved.color_original || saved.color))!==normKey(typed))return lines;const prices=new Map([...(saved.formula_original || []),...(saved.formula || [])].map(x=>[x.colorante,num(x.precioPulso)]));return lines.map(x=>prices.has(x.colorante)?{...x,precioPulso:prices.get(x.colorante),subtotal:x.pulsos*prices.get(x.colorante)}:x);};
const legacyLabManualLines=getCurrentLabManualLines;
getCurrentLabManualLines=function(){const lines=legacyLabManualLines();const prices=new Map([...(selectedLabCalc?.lines || []),...selectedLabManualLines].map(x=>[x.colorante,num(x.precioPulso)]));return lines.map(x=>prices.has(x.colorante)?{...x,precioPulso:prices.get(x.colorante),subtotal:x.pulsos*prices.get(x.colorante)}:x);};
// Guardado local inmediato; la red no bloquea el mostrador.
saveBudgetOnly=async function(){if(!cart.length){showToast('El presupuesto está vacío');return;}const entry=saveToHistory(getCurrentBudgetCode());markCurrentBudgetFinalized();renderCart();showToast('Presupuesto guardado local. Sincronizando cuando haya conexión.');syncBudgetToCloud(entry);};
const legacyDeleteBudgetCloud=deleteBudgetFromCloud;
deleteBudgetFromCloud=async function(id){const queue=new Set(JSON.parse(labStorage.getItem('pk_budget_delete_queue') || '[]'));queue.add(String(id));labStorage.setItem('pk_budget_delete_queue',JSON.stringify([...queue]));const ok=await legacyDeleteBudgetCloud(id);if(ok){const latest=new Set(JSON.parse(labStorage.getItem('pk_budget_delete_queue') || '[]'));latest.delete(String(id));labStorage.setItem('pk_budget_delete_queue',JSON.stringify([...latest]));}return ok;};
const legacySyncPendingBudgets=syncPendingBudgets;
syncPendingBudgets=async function(){const queue=JSON.parse(labStorage.getItem('pk_budget_delete_queue') || '[]');for(const id of queue)await deleteBudgetFromCloud(id);await legacySyncPendingBudgets();};
function paymentConditionLabel(d){const pct=clampPct(d.percent)+'%';const label=String(d.label || '');return label.includes(pct)?label:label+' '+pct;}
function saveAnotherLabRecord(){labSavedFingerprint='';labSavedId='';saveLabRecord();}
document.addEventListener('keydown',event=>{if(event.key==='Escape' && document.getElementById('catalogPreviewModal').classList.contains('open')){event.preventDefault();event.stopImmediatePropagation();cancelCatalogPreview();}},true);
document.getElementById('catalogPreviewModal').addEventListener('click',event=>{if(event.target===event.currentTarget)cancelCatalogPreview();});
refreshHeader();

