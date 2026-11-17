'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/public/assets/i18n.js','utf8');
function load(language){
 const text={nodeValue:'  Serverübersicht ',parentElement:{closest:()=>null}};
 const selector={addEventListener:(event,callback)=>selector.change=callback,value:'de'};
 let visited=false,reloaded=false,saved;
 const document={
  documentElement:{lang:'de'},body:{},
  createTreeWalker:()=>({currentNode:text,nextNode:()=>{if(visited)return false;visited=true;return true}}),
  querySelectorAll:selector=>selector==='.language-select'?[selectorObject]:[]
 };
 const selectorObject=selector;
 const context={window:{},document,NodeFilter:{SHOW_TEXT:4},
  localStorage:{getItem:()=>language,setItem:(key,value)=>saved=[key,value]},
  location:{reload:()=>{reloaded=true}}};
 vm.runInNewContext(source,context);
 return {translate:context.window.dracoI18n.translate,document,text,selector,
  saved:()=>saved,reloaded:()=>reloaded};
}
const english=load('en');
assert.equal(english.document.documentElement.lang,'en');
assert.equal(english.text.nodeValue,'  Server Overview ');
assert.equal(english.translate('Welt wiederherstellen'),'Restore world');
assert.equal(english.translate('Backup-Zeitplan gespeichert.'),'Backup schedule saved.');
assert.equal(english.translate('<img src=x onerror=alert(1)>'),'<img src=x onerror=alert(1)>');
assert.equal(english.translate('My custom world'),'My custom world');
english.selector.value='de';english.selector.change();
assert.deepEqual(english.saved(),['dracorock-language','de']);
assert(english.reloaded());
const german=load('de');
assert.equal(german.text.nodeValue,'  Serverübersicht ');
assert.equal(german.translate('Welt wiederherstellen'),'Welt wiederherstellen');
console.log('OK: German/English selection, persistence, static and dynamic translations, custom text preservation');
