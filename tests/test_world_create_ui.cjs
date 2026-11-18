const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('app/public/assets/app.js','utf8');
const code=source.slice(source.indexOf('async function worldAction('),source.indexOf('async function worldDuplicate('));
const handlers={}, requests=[];
let resets=0;
const fields={worldNewName:{value:'New world'},worldNewSeed:{value:''}};
const context={csrf:'test',tr:s=>s,confirm:()=>true,showNotice:()=>{},loadWorlds:()=>{},
 $:id=>fields[id]||{addEventListener:(event,fn)=>{handlers[id]=fn},reset:()=>{resets++}},
 api:async (url,options)=>{requests.push(JSON.parse(options.body));return {message:'OK'}}};
vm.createContext(context);
vm.runInContext(code,context);
(async()=>{
 for(const seed of ['', '0', '-42', '9223372036854775807', 'My island']){
  fields.worldNewSeed.value=seed;
  handlers.worldCreateForm({preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(requests[requests.length-1],{action:'create',name:'New world',seed});
 }
 assert.equal(resets,5);
 await context.worldAction('select','Existing');
 assert.deepEqual(requests[requests.length-1],{action:'select',name:'Existing'});
 for(const [id,value] of Object.entries({setupServer:'Test',setupWorld:'World',setupMode:'survival',setupDifficulty:'easy',setupPort:'19132',setupPlayers:'10',setupSeed:'-9223372036854775808'}))fields[id]={value};
 const setupPayload=source.slice(source.indexOf("$('setupForm').addEventListener('submit'"));
 const declaration=setupPayload.split('\n').find(line=>line.includes('const data='));
 vm.runInContext(declaration.replace('const data=','globalThis.setupPayload='),context);
 assert.equal(context.setupPayload.world_seed,'-9223372036854775808');
 console.log('PASS: world form sends exact optional seed strings; selection payload unchanged');
})().catch(error=>{console.error(error);process.exitCode=1});
