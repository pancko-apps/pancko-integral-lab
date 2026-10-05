/* LAB only: GitHub Pages project paths share the production origin. */
'use strict';
(() => {
 const prefix='pancko_lab_r9:';
 const wrap=store=>Object.freeze({
  getItem(key){return store.getItem(prefix+String(key));},
  setItem(key,value){return store.setItem(prefix+String(key),String(value));},
  removeItem(key){return store.removeItem(prefix+String(key));},
  eventKey(key){return typeof key==='string'&&key.startsWith(prefix)?key.slice(prefix.length):null;}
 });
 window.labStorage=wrap(window.localStorage);
 window.labSession=wrap(window.sessionStorage);
 window.PANCKO_LAB_STORE_ID='LAB-DEMO-001';
})();
