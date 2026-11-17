'use strict';function tr(value){return globalThis.dracoI18n?globalThis.dracoI18n.translate(value):value}let csrf='',busy=false;const $=id=>document.getElementById(id);const txt=(id,value)=>{$(id).textContent=value??'–'};async function api(path,opts={}){const r=await fetch('?api='+path,{credentials:'same-origin',cache:'no-store',...opts});const d=await r.json();if(!r.ok)throw Error(tr(d.error||d.message||tr('Anfrage fehlgeschlagen')));return d}let noticeTimer=null;
function showNotice(s,bad=false,persistent=false){const el=$('notice');if(noticeTimer)clearTimeout(noticeTimer);el.hidden=false;el.textContent=tr(s);el.classList.toggle('bad',bad);el.classList.toggle('pending',persistent);if(!persistent)noticeTimer=setTimeout(()=>{el.hidden=true;noticeTimer=null},bad?12000:7000)}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function awaitJob(name,jobId){
 const deadline=Date.now()+30*60*1000;
 while(Date.now()<deadline){
  await sleep(2000);
  try{
   const d=await api('job-status&id='+encodeURIComponent(jobId));
   if(['queued','running'].includes(d.state)){showNotice(d.message||tr('Hintergrundauftrag läuft …'),false,true);continue;}
   if(d.state==='success'){
    showNotice(d.message||tr('Auftrag erfolgreich abgeschlossen.'));
    refreshAll();return true;
   }
   showNotice(d.message||tr('Auftrag fehlgeschlagen. Bitte Protokoll prüfen.'),true);
   refreshAll();return;
  }catch(e){
   // Temporary HTTP errors do not imply a failed background job.
  }
 }
 showNotice(tr('Der Auftrag konnte innerhalb von 30 Minuten nicht bestätigt werden. Bitte Protokoll prüfen.'),true);
}
function showApp(){ $('login').hidden=true;$('app').hidden=false;refreshAll()}function fmt(n){if(n===null||n===undefined)return '–';return (n/1073741824).toFixed(1)+' GB'}function renderServerInfo(d){
 const el=$('bedrockDetails');el.replaceChildren();
 const props=d.properties||{},b=d.bedrock||{};
 const modeNames={'0':'Survival','1':'Creative','2':'Adventure','survival':'Survival','creative':'Creative','adventure':'Adventure'};
 const val=(v)=>v===undefined||v===null||v===''?'–':String(v);
 const fields=[
  [tr('Servername'),b.name||props['server-name'],'server'],
  [tr('Weltname'),b.level||props['level-name'],'world'],
  [tr('Bedrock-Version'),b.version||d.version,'version'],
  [tr('Spielmodus'),modeNames[String(b.gameType??props.gamemode)]||props.gamemode,'mode'],
  [tr('Schwierigkeit'),props.difficulty,'difficulty'],
  [tr('Spieler'),b.players!==undefined?`${b.players} / ${b.maxPlayers}`:props['max-players']?`– / ${props['max-players']}`:null,'players'],
  ['Port (IPv4)',props['server-port'],'port'],
  ['Port (IPv6)',props['server-portv6'],'port'],
  [tr('Online-Modus'),props['online-mode']==='true'?'Aktiv':props['online-mode']==='false'?'Inaktiv':null,'shield']
 ];
 for(const [label,value,kind] of fields){
  const item=document.createElement('div');item.className='server-info-item';
  const k=document.createElement('span');k.className='server-info-label';k.textContent=label;
  const v=document.createElement('strong');v.className='server-info-value';v.textContent=val(value);
  item.dataset.kind=kind;item.append(k,v);el.append(item);
 }
 if(!d.nethernet_online){
  const note=document.createElement('p');note.className='server-info-note';
  note.textContent=d.nethernet_error||(tr('NetherNet antwortet auf Port ')+(d.nethernet_port||'?')+tr(' momentan nicht. Die Konfigurationswerte stammen aus server.properties.'));
  el.append(note);
 }
}
function renderSystemMetrics(d){
 const root=$('systemInfo');root.replaceChildren();const m=d.system_metrics||{};
 const bytes=n=>Number.isFinite(n)?(n/1073741824).toLocaleString((globalThis.dracoI18n?.locale||'de-DE'),{maximumFractionDigits:2})+' GiB':'–';
 const number=n=>Number.isFinite(n)?n.toLocaleString((globalThis.dracoI18n?.locale||'de-DE'),{maximumFractionDigits:2}):'–';
 const hours=n=>Number.isFinite(n)?`${Math.floor(n/86400)} T · ${Math.floor(n%86400/3600)} Std`:'–';
 const items=[
  [tr('RAM verfügbar'),bytes(m.ram_total),m.ram_scope||''],
  [tr('RAM verwendet'),bytes(m.ram_used),m.ram_total&&m.ram_used!==null?`${Math.round(100*m.ram_used/m.ram_total)} % belegt`:''],
  [tr('CPU-Kapazität'),number(m.cpu_count),tr('Für Container verfügbar (ggf. Quota)')],
  [tr('Sichtbare CPUs'),number(m.cpu_physical_visible),tr('Logische Prozessoren')],
  ['Systemlaufzeit',hours(m.uptime_seconds),tr('Seit letztem Start')],
  ['Systemlast',Array.isArray(m.load_average)?m.load_average.map(number).join(' / '):'–',tr('1 / 5 / 15 Minuten')]
 ];
 for(const [label,value,detail] of items){const card=document.createElement('div');card.className='system-metric';
  const a=document.createElement('span');a.className='system-metric-label';a.textContent=label;
  const b=document.createElement('strong');b.className='system-metric-value';b.textContent=value;
  const c=document.createElement('small');c.className='system-metric-detail';c.textContent=detail;
  card.append(a,b,c);
  if(label===tr('RAM verwendet')&&m.ram_total>0&&Number.isFinite(m.ram_used)){
   const bar=document.createElement('div');bar.className='system-ram-track';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','RAM-Auslastung');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');const pct=Math.min(100,Math.max(0,100*m.ram_used/m.ram_total));bar.setAttribute('aria-valuenow',String(Math.round(pct)));
   const fill=document.createElement('span');fill.style.width=pct+'%';if(pct>=90)fill.classList.add('critical');else if(pct>=75)fill.classList.add('warning');bar.append(fill);card.append(bar);
  }
  root.append(card);
 }
 txt('systemTechnical',(d.service_info||'')+'\n'+(d.update_job||''));
}
async function status(){try{
 const d=await api('status');csrf=d.csrf;
 const state=d.online?(d.nethernet_online?'online':'starting'):(['activating','reloading'].includes(d.service)?'starting':d.service==='failed'?'failed':'offline');
 const names={online:'ONLINE',starting:d.online?tr('NET HERNET STARTET …'):tr('STARTET …'),offline:'OFFLINE',failed:tr('FEHLER')};
 names.starting=d.online?tr('INITIALISIERT …'):tr('STARTET …');
 txt('state',names[state]);$('state').className='server-state '+state;
 txt('version',d.version);txt('updateVersion',d.version);
 txt('players',d.bedrock?d.bedrock.players+' / '+d.bedrock.maxPlayers:'– / –');
 txt('playerCount',d.bedrock?'Aktuell '+d.bedrock.players+tr(' von ')+d.bedrock.maxPlayers+tr(' Spielern online'):tr('Spielerzahl nicht verfügbar'));
 txt('nethernet',d.nethernet_error|| (d.nethernet_online?tr('NetherNet erreichbar (Port ')+d.nethernet_port+')':tr('NetherNet nicht erreichbar (Port ')+(d.nethernet_port||'?')+')'));
 renderServerInfo(d);txt('disk',fmt(d.free_bytes));renderSystemMetrics(d);txt('updateInfo',d.update_job);
 const p=$('statusPill');p.textContent={online:'● Server online',starting:tr('● Server startet / NetherNet wartet'),offline:'● Server offline',failed:tr('● Serverfehler')}[state];p.className='pill '+state;
 }catch(e){if(e.message===tr('Nicht angemeldet')){$('app').hidden=true;$('login').hidden=false;return;}showNotice(e.message,true)}
}
// Check Mojang's official stable Linux Bedrock version without downloading a server.
let bedrockVersionBusy=false,bedrockVersionCheckedAt=0;
async function loadBedrockUpdate(force=false){
 if(bedrockVersionBusy||$('app').hidden)return;
 if(!force && bedrockVersionCheckedAt && Date.now()-bedrockVersionCheckedAt<3600000)return;
 bedrockVersionBusy=true;
 const state=$('bedrockUpdateState'),action=$('bedrockUpdateAction'),panel=$('bedrockUpdateInfo');
 state.textContent=tr('Mojang-Version wird geprüft …');
 action.hidden=true;
 panel.classList.remove('update-available','update-current','update-unknown');
 try{
  const d=await api('bedrock-update-check');
  if(d.ok!==true||typeof d.latest_version!=='string'||!/^[0-9]+(?:\.[0-9]+){2,4}$/.test(d.latest_version))
   throw Error(tr('Ungültige Versionsantwort'));
  if(d.update_available===true){
   state.textContent=tr('Update verfügbar: ')+d.latest_version;
   panel.classList.add('update-available');
   action.hidden=false;
  }else if(d.update_available===false){
   state.textContent=tr('Mojang: aktuell (')+d.latest_version+')';
   panel.classList.add('update-current');
  }else{
   state.textContent='Mojang: '+d.latest_version+tr(' · installierte Version unbekannt');
   panel.classList.add('update-unknown');
  }
  bedrockVersionCheckedAt=Date.now();
 }catch(e){
  state.textContent=tr('Mojang-Prüfung nicht verfügbar');
  panel.classList.add('update-unknown');
  // Retry errors in ten minutes rather than on every status refresh.
  bedrockVersionCheckedAt=Date.now()-3000000;
 }finally{bedrockVersionBusy=false}
}
$('bedrockUpdateAction').addEventListener('click',()=>document.querySelector('[data-tab="update"]').click());
setInterval(()=>{if(!$('app').hidden)loadBedrockUpdate()},600000);

// Monitoring consumes only bounded, aggregated server metrics. No external chart libraries.
// Monitoring charts use the same time grid for all metrics. No third-party code.
let monitoringBusy=false, monitoringPoints=[], monitoringWindow='24h',monitorHoverIndex=null,monitorHoverMetric=null;
const MONITOR_PLOT={left:50,right:16,top:16,bottom:38,height:234};
const monitorDefinitions=[
 {id:'monitorCpuChart',key:'cpu_pct',kind:'cpu',summary:'monitorCpuSummary',tooltip:'monitorCpuTooltip'},
 {id:'monitorRamChart',key:'ram_bytes',kind:'ram',summary:'monitorRamSummary',tooltip:'monitorRamTooltip'},
 {id:'monitorPlayersChart',key:'players',kind:'players',summary:'monitorPlayersSummary',tooltip:'monitorPlayersTooltip'}
];
const monitorUnitValue=(value,kind)=>kind==='ram'?value/1073741824:value;
const monitorFormat=(value,kind)=>{
 if(!Number.isFinite(value))return '–';
 const n=monitorUnitValue(value,kind);
 return n.toLocaleString((globalThis.dracoI18n?.locale||'de-DE'),{minimumFractionDigits:kind==='players'?0:2,maximumFractionDigits:kind==='players'?1:2})+(kind==='cpu'?' %':kind==='ram'?' GiB':'');
};
const monitorDate=(ts)=>new Date(ts*1000).toLocaleString((globalThis.dracoI18n?.locale||'de-DE'),{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
function monitorStats(points,key){
 const values=points.map(p=>p[key]).filter(v=>Number.isFinite(v));
 if(!values.length)return null;
 return {min:Math.min(...values),mean:values.reduce((sum,v)=>sum+v,0)/values.length,max:Math.max(...values),count:values.length};
}
function updateMonitorSummaries(){
 for(const def of monitorDefinitions){
  const stats=monitorStats(monitoringPoints,def.key);
  const unknown=monitoringPoints.filter(p=>p.samples>0&&!Number.isFinite(p[def.key])).length;
  txt(def.summary,stats
    ?'Min '+monitorFormat(stats.min,def.kind)+' · Ø '+monitorFormat(stats.mean,def.kind)+' · Max '+monitorFormat(stats.max,def.kind)+(unknown?' · '+unknown+tr(' ohne Wert'):'')
    :tr('Keine gültigen Messwerte im Zeitraum')+(unknown?' · '+unknown+tr(' ohne Wert'):''));
 }
}
function monitorX(index,total,width){
 return MONITOR_PLOT.left+index/Math.max(1,total-1)*(width-MONITOR_PLOT.left-MONITOR_PLOT.right);
}
function monitorDisplayValues(points,key){
 // Display-only interpolation of exactly one missing time bucket. No edits to
 // raw SQLite data, current status, or Min/Mean/Max statistics.
 const result=points.map(p=>Number.isFinite(p[key])?p[key]:null);
 for(let i=1;i<result.length-1;i++){
  if(result[i]!==null)continue;
  const prev=points[i-1],now=points[i],next=points[i+1];
  if(!Number.isFinite(prev[key])||!Number.isFinite(next[key]))continue;
  // Require a uniform time grid; do not bridge missing days or discontinuities.
  if(!Number.isFinite(now.ts)||now.ts-prev.ts!==next.ts-now.ts||now.ts<=prev.ts)continue;
  result[i]=(prev[key]+next[key])/2;
 }
 return result;
}
function monitorChartColor(kind){return kind==='cpu'?'#73db91':kind==='ram'?'#66b9ea':'#dfb36e'}
function drawMonitorChart(canvas,points,def){
 const rect=canvas.getBoundingClientRect();
 const width=Math.max(245,Math.round(rect.width)),height=MONITOR_PLOT.height;
 const pixelRatio=Math.max(1,Math.min(2,window.devicePixelRatio||1));
 canvas.width=Math.round(width*pixelRatio);canvas.height=height*pixelRatio;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.scale(pixelRatio,pixelRatio);ctx.clearRect(0,0,width,height);
 const {left,right,top,bottom}=MONITOR_PLOT,plotH=height-top-bottom;
 const color=monitorChartColor(def.kind);
 const foreground=getComputedStyle(document.body).color;
 const values=monitorDisplayValues(points,def.key);
 const valid=values.filter(v=>v!==null);
 const observedMax=valid.length?Math.max(...valid.map(v=>monitorUnitValue(v,def.kind))):0;
 const ceiling=def.kind==='players'?Math.max(1,Math.ceil(observedMax)):
    Math.max(def.kind==='cpu'?1:0.1,Math.ceil(observedMax*1.25*10)/10);
 const steps=def.kind==='players'?Math.min(4,Math.ceil(ceiling)):4;
 const yFor=value=>top+plotH-monitorUnitValue(value,def.kind)/ceiling*plotH;
 ctx.font='12px system-ui,sans-serif';ctx.fillStyle=foreground;
 ctx.globalAlpha=.22;ctx.strokeStyle=foreground;ctx.lineWidth=1;
 for(let i=0;i<=steps;i++){
  const y=top+plotH*i/steps;
  ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();
 }
 ctx.globalAlpha=.8;ctx.fillStyle=foreground;
 for(let i=0;i<=steps;i++){
  const v=ceiling*(steps-i)/steps;
  const label=v.toLocaleString((globalThis.dracoI18n?.locale||'de-DE'),{maximumFractionDigits:def.kind==='players'?0:2});
  ctx.fillText(label,3,top+plotH*i/steps+4);
 }
 // The fixed-size buckets returned by the API align across all three plots.
 // Draw the same four timestamps, at the same X positions in every chart.
 const tickCount=Math.min(3,Math.max(0,points.length-1));
 ctx.font='11px system-ui,sans-serif';
 for(let i=0;i<=tickCount;i++){
  const index=Math.round(i*(points.length-1)/Math.max(1,tickCount));
  const point=points[index];if(!point)continue;
  const label=new Date(point.ts*1000).toLocaleString((globalThis.dracoI18n?.locale||'de-DE'),{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  const x=monitorX(index,points.length,width);
  const size=ctx.measureText(label).width;
  ctx.fillText(label,Math.max(left,Math.min(width-right-size,x-size/2)),height-9);
 }
 if(!valid.length){
  ctx.globalAlpha=1;ctx.font='13px system-ui,sans-serif';
  ctx.fillText(tr('Keine gültigen Messwerte im Zeitraum'),left+6,top+plotH/2);
 }else{
  ctx.globalAlpha=1;ctx.lineWidth=2.2;ctx.strokeStyle=color;ctx.lineCap='round';ctx.lineJoin='round';
  let segment=false;
  values.forEach((value,i)=>{
   if(value===null){if(segment){ctx.stroke();segment=false}return}
   const x=monitorX(i,values.length,width),y=yFor(value);
   if(!segment){ctx.beginPath();ctx.moveTo(x,y);segment=true}
   else ctx.lineTo(x,y);
  });
  if(segment)ctx.stroke();
  // Isolated valid points must remain visible even without a connecting line.
  values.forEach((value,i)=>{
   if(value===null || (values[i-1]!==null && values[i+1]!==null))return;
   ctx.beginPath();ctx.fillStyle=color;
   ctx.arc(monitorX(i,values.length,width),yFor(value),2.5,0,Math.PI*2);ctx.fill();
  });
 }
 if(Number.isInteger(monitorHoverIndex)&&points[monitorHoverIndex]){
  const point=points[monitorHoverIndex],x=monitorX(monitorHoverIndex,points.length,width);
  ctx.globalAlpha=.6;ctx.lineWidth=1;ctx.strokeStyle=foreground;
  ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,height-bottom);ctx.stroke();
  ctx.setLineDash([]);ctx.globalAlpha=1;
  const value=values[monitorHoverIndex];
  const interpolated=value!==null&&!Number.isFinite(point[def.key]);
  if(value!==null){
   ctx.fillStyle=interpolated?'#e5d19c':color;
   ctx.beginPath();ctx.arc(x,yFor(value),4,0,Math.PI*2);ctx.fill();
   ctx.strokeStyle=foreground;ctx.lineWidth=1.1;ctx.stroke();
  }
 }
}
function redrawMonitoring(){
 for(const def of monitorDefinitions)drawMonitorChart($(def.id),monitoringPoints,def);
}
function monitorTooltip(){
 for(const def of monitorDefinitions){
  const tooltip=$(def.tooltip);
  if(monitorHoverMetric!==def.kind||!Number.isInteger(monitorHoverIndex)||!monitoringPoints[monitorHoverIndex]){
   tooltip.hidden=true;continue;
  }
  const p=monitoringPoints[monitorHoverIndex];
  const estimate=monitorDisplayValues(monitoringPoints,def.key)[monitorHoverIndex];
  const value=Number.isFinite(p[def.key])?monitorFormat(p[def.key],def.kind):
    Number.isFinite(estimate)?'≈ '+monitorFormat(estimate,def.kind)+tr(' (geschätzt)'):
    p.samples===0?tr('Keine Messung'):tr('Wert nicht verfügbar');
  const aggregate=p.samples>1?tr(' · Ø aus ')+p.samples+tr(' Messungen'):'';
  tooltip.textContent=monitorDate(p.ts)+' · '+value+aggregate;
  const canvas=$(def.id),width=canvas.getBoundingClientRect().width;
  const x=monitorX(monitorHoverIndex,monitoringPoints.length,width);
  tooltip.style.left=Math.max(8,Math.min(width-240,x-110))+'px';
  tooltip.hidden=false;
 }
}
function setMonitorHover(index,kind){
 monitorHoverIndex=index;monitorHoverMetric=kind;
 redrawMonitoring();monitorTooltip();
}
function clearMonitorHover(){
 if(monitorHoverIndex===null)return;
 monitorHoverIndex=null;monitorHoverMetric=null;
 redrawMonitoring();monitorTooltip();
}
for(const def of monitorDefinitions){
 const canvas=$(def.id);
 const hoverAt=e=>{
  if(!monitoringPoints.length)return;
  const rect=canvas.getBoundingClientRect();
  const x=e.clientX-rect.left;
  const progress=Math.max(0,Math.min(1,(x-MONITOR_PLOT.left)/Math.max(1,rect.width-MONITOR_PLOT.left-MONITOR_PLOT.right)));
  const index=Math.round(progress*(monitoringPoints.length-1));
  setMonitorHover(index,def.kind);
 };
 canvas.addEventListener('pointermove',hoverAt);
 canvas.addEventListener('pointerdown',hoverAt);
 canvas.addEventListener('pointerleave',clearMonitorHover);
 canvas.addEventListener('blur',clearMonitorHover);
 canvas.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(e.key))return;
  e.preventDefault();
  if(e.key==='Escape'){clearMonitorHover();return}
  if(!monitoringPoints.length)return;
  const index=e.key==='Home'?0:e.key==='End'?monitoringPoints.length-1:
    Math.max(0,Math.min(monitoringPoints.length-1,(monitorHoverIndex??0)+(e.key==='ArrowLeft'?-1:1)));
  setMonitorHover(index,def.kind);
 });
}
// v3.1: only render server-computed diagnostics. textContent prevents markup injection.
function renderMonitoringAlerts(alerts){
 const root=$('monitorAlerts');
 root.replaceChildren();
 if(!Array.isArray(alerts)){
  const note=document.createElement('p');note.className='muted tiny';
  note.textContent=tr('Warnstatus derzeit nicht verfügbar.');root.append(note);return;
 }
 if(!alerts.length){
  const ok=document.createElement('div');ok.className='monitor-alert monitor-alert-ok';
  ok.textContent=tr('✓ Keine aktuellen Warnungen – Monitoring und Dienstwerte unauffällig.');
  root.append(ok);return;
 }
 for(const alert of alerts.slice(0,8)){
  if(!alert||typeof alert.title!=='string'||typeof alert.message!=='string')continue;
  const item=document.createElement('div');
  item.className='monitor-alert monitor-alert-'+(alert.severity==='critical'?'critical':'warning');
  const title=document.createElement('strong');title.textContent=alert.title;
  const message=document.createElement('p');message.textContent=alert.message;
  item.append(title,message);root.append(item);
 }
}
// Overview reuses the authenticated, read-only monitoring history API.
let dashboardAlertsBusy=false;
async function loadDashboardAlerts(){
 if(dashboardAlertsBusy||$('app').hidden||$('overview').hidden)return;
 dashboardAlertsBusy=true;
 try{
  const data=await api('monitor-history&window=1h');
  const root=$('dashboardAlerts');
  root.replaceChildren();
  if(!Array.isArray(data.alerts))throw Error(tr('Warnstatus fehlt'));
  const alerts=data.alerts.slice(0,8);
  if(!alerts.length){
   const ok=document.createElement('div');
   ok.className='monitor-alert monitor-alert-ok';
   ok.textContent=tr('✓ Keine aktuellen Warnungen – Monitoring unauffällig.');
   root.append(ok);
  }else{
   for(const alert of alerts){
    if(!alert||typeof alert.title!=='string'||typeof alert.message!=='string')continue;
    const item=document.createElement('div');
    item.className='monitor-alert monitor-alert-'+(alert.severity==='critical'?'critical':'warning');
    const title=document.createElement('strong');title.textContent=alert.title;
    const description=document.createElement('p');description.textContent=alert.message;
    item.append(title,description);root.append(item);
   }
  }
 }catch(error){
  const root=$('dashboardAlerts');
  root.replaceChildren();
  const note=document.createElement('p');note.className='muted tiny';
  note.textContent=tr('Warnstatus nicht verfügbar – Live-Monitoring prüfen.');
  root.append(note);
 }finally{dashboardAlertsBusy=false}
}
$('dashboardAlertsDetail').addEventListener('click',()=>document.querySelector('[data-tab="monitor"]').click());
setInterval(()=>{if(!$('app').hidden&&!$('overview').hidden)loadDashboardAlerts()},60000);
let playerHistoryBusy=false;
const playerHistoryDate=new Intl.DateTimeFormat((globalThis.dracoI18n?.locale||'de-DE'),{
 dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'
});
async function loadPlayerHistory(){
 if(playerHistoryBusy)return;
 playerHistoryBusy=true;
 const table=$('playerHistoryTable'),body=$('playerHistoryRows');
 try{
  const data=await api('monitor-player-history');
  const content=document.createDocumentFragment();
  for(const session of data.sessions){
   const row=document.createElement('tr');
   const name=document.createElement('th');
   name.scope='row';
   name.textContent=session.name;
   row.append(name);
   for(const ts of [session.first_seen,session.last_seen]){
    const cell=document.createElement('td');
    cell.textContent=playerHistoryDate.format(ts*1000);
    row.append(cell);
   }
   content.append(row);
  }
  body.replaceChildren(content);
  table.hidden=!data.sessions.length;
  const status=data.sessions.length?data.sessions.length+tr(' beobachtete Abschnitte'):tr('Keine Spieler im erfassten Zeitraum beobachtet.');
  txt('playerHistoryState',data.first_sample===null?tr('Warte auf die erste Messung.'):
      status+tr(' · Messdaten im Zeitfenster seit ')+playerHistoryDate.format(data.first_sample*1000)+' (Berlin)');
 }catch(e){
  table.hidden=true;
  txt('playerHistoryState',e.message);
 }finally{playerHistoryBusy=false}
}
async function loadMonitoring(){
 loadPlayerHistory();
 if(monitoringBusy)return;
 monitoringBusy=true;txt('monitorState',tr('Lade historische Messwerte …'));
 try{
  const d=await api('monitor-history&window='+encodeURIComponent(monitoringWindow));
  if(!Array.isArray(d.points)||d.points.length>450)throw Error(tr('Ungültige Monitoring-Antwort'));
  monitoringPoints=d.points;
  renderMonitoringAlerts(d.alerts);
  monitorHoverIndex=null;monitorHoverMetric=null;
  const latest=d.latest;
  const fresh=latest && Number.isInteger(latest.ts) && Date.now()/1000-latest.ts<180;
  txt('monitorCpu',fresh && Number.isFinite(latest.cpu_pct)?latest.cpu_pct.toLocaleString((globalThis.dracoI18n?.locale||'de-DE'),{maximumFractionDigits:1})+' %':'–');
  txt('monitorRam',fresh && Number.isFinite(latest.ram_bytes)?(latest.ram_bytes/1073741824).toLocaleString((globalThis.dracoI18n?.locale||'de-DE'),{maximumFractionDigits:2})+' GiB':'–');
  txt('monitorPlayers',fresh && Number.isFinite(latest.players)?String(latest.players):'–');
  txt('monitorTime',latest?new Date(latest.ts*1000).toLocaleTimeString((globalThis.dracoI18n?.locale||'de-DE')):'–');
  txt('monitorState',(Number.isInteger(d.samples_count)?d.samples_count:d.points.filter(p=>p.samples>0).length)+tr(' Messungen · Intervall 60 Sekunden · ')+(fresh?tr('Aktuelle Messungen verfügbar'):tr('Keine aktuelle Messung – Timer prüfen')));
  updateMonitorSummaries();
  redrawMonitoring();monitorTooltip();
 }catch(e){renderMonitoringAlerts(null);monitoringPoints=[];monitorHoverIndex=null;monitorHoverMetric=null;updateMonitorSummaries();redrawMonitoring();monitorTooltip();txt('monitorState',tr('Monitoring nicht verfügbar: ')+e.message)}
 finally{monitoringBusy=false}
}
$('monitorReload').addEventListener('click',loadMonitoring);
$('monitorWindow').addEventListener('change',e=>{monitoringWindow=e.target.value;loadMonitoring()});
window.addEventListener('resize',()=>{if(!$('monitor').hidden){redrawMonitoring();monitorTooltip()}});
setInterval(()=>{if(!$('app').hidden&&!$('monitor').hidden)loadMonitoring()},60000);

function backupSize(bytes){
 if(bytes>=1073741824)return (bytes/1073741824).toFixed(2)+' GiB';
 if(bytes>=1048576)return (bytes/1048576).toFixed(1)+' MiB';
 if(bytes>=1024)return (bytes/1024).toFixed(1)+' KiB';
 return bytes+' B';
}
let scheduleDirty=false, restoreSelection=null,restoreRequest=0;
function updateScheduleForm(settings){
 if(scheduleDirty||!settings)return;
 $('scheduleEnabled').checked=settings.enabled;
 $('scheduleTime').value=settings.time;
 $('scheduleRetry').value=settings.retry_minutes;
 for(const input of $('scheduleDays').querySelectorAll('input'))input.checked=settings.days.includes(Number(input.value));
}
for(const [index,name] of [tr('Montag'),tr('Dienstag'),tr('Mittwoch'),tr('Donnerstag'),tr('Freitag'),tr('Samstag'),tr('Sonntag')].entries()){
 const label=document.createElement('label'),input=document.createElement('input');
 input.type='checkbox';input.value=String(index);input.checked=true;
 label.append(input,document.createTextNode(name));$('scheduleDays').append(label);
}
$('scheduleForm').addEventListener('input',()=>{scheduleDirty=true});
$('scheduleForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const button=event.submitter;button.disabled=true;
 try{
  await api('backup-schedule',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({
   enabled:$('scheduleEnabled').checked,time:$('scheduleTime').value,
   days:[...$('scheduleDays').querySelectorAll('input:checked')].map(input=>Number(input.value)),
   retry_minutes:Number($('scheduleRetry').value)
  })});
  scheduleDirty=false;txt('scheduleStatus',tr('Backup-Zeitplan gespeichert.'));await loadMaintenance();
 }catch(error){txt('scheduleStatus',error.message)}
 finally{button.disabled=false}
});
async function openRestore(file){
 const revision=++restoreRequest;
 restoreSelection=null;
 $('restoreForm').reset();$('restoreTarget').replaceChildren();
 txt('restoreArchive',file.name);txt('restoreDetails',tr('Archivstruktur wird geprüft …'));
 txt('restoreStatus','');$('restoreSubmit').disabled=true;$('restoreDialog').showModal();
 try{
  const preview=await api('restore-preview',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({id:file.id})});
  if(!$('restoreDialog').open||revision!==restoreRequest)return;
  restoreSelection=file;
  for(const target of preview.targets)$('restoreTarget').append(new Option(target,target));
  txt('restoreDetails',preview.files+tr(' Dateien · ')+backupSize(preview.bytes));
  $('restoreSubmit').disabled=!preview.targets.length;
  await refreshRestoreState();
 }catch(error){txt('restoreStatus',error.message)}
}
$('restoreCancel').addEventListener('click',()=>{$('restoreDialog').close();restoreSelection=null});
$('restoreStop').addEventListener('click',async()=>{await action('stop');await refreshRestoreState()});
$('restoreForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!restoreSelection||busy)return;
 busy=true;$('restoreSubmit').disabled=true;$('restoreCancel').disabled=true;
 try{
  const result=await api('restore-world',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({id:restoreSelection.id,target:$('restoreTarget').value})});
  txt('restoreStatus',tr('Die Zielwelt wird gesichert und wiederhergestellt. Bitte warten.'));
  if(await awaitJob('restore-world',result.job_id)){
   $('restoreDialog').close();restoreSelection=null;
   await loadWorlds();
  }else{txt('restoreStatus',tr('Wiederherstellung fehlgeschlagen. Bitte den Auftragsverlauf prüfen.'))}
 }catch(error){txt('restoreStatus',error.message)}
 finally{busy=false;$('restoreSubmit').disabled=false;$('restoreCancel').disabled=false}
});
async function loadMaintenance(){
 try{
  const data=await api('maintenance');
  const labels={waiting:tr('Wartet'),running:tr('Läuft'),success:tr('Erfolgreich'),failed:tr('Fehlgeschlagen'),skipped:tr('Übersprungen'),queued:tr('Vorgemerkt'),interrupted:tr('Unterbrochen')};
  const format=stamp=>new Date(stamp*1000).toLocaleString((globalThis.dracoI18n?.locale||'de-DE'));
  const last=data.last_success;
  const summary=last?tr('Letzter erfolgreich abgeschlossener Backup-Auftrag: ')+format(last.updated_at):tr('Noch kein erfolgreicher Backup-Auftrag im neuen Verlauf erfasst.');
  txt('backupSummary',summary);
  txt('backupSummaryDetail',summary);
  updateScheduleForm(data.settings);
  const schedule=data.schedule;
  const next=data.timer.NextElapseUSecRealtime;
  txt('backupSchedule',!data.settings.enabled?tr('Geplante Backups sind deaktiviert.'):(schedule.state?(labels[schedule.state]||schedule.state)+' · '+tr(schedule.message)+' ':'')+(next?tr('Nächster täglicher Termin: ')+next:tr('Backup-Timer hat keinen nächsten Termin.')));
  const checks=$('systemChecks');checks.replaceChildren();
  for(const check of data.checks){
   const row=document.createElement('p');
   row.textContent=(check.ok?'✓ ':'⚠ ')+tr(check.name)+' — '+tr(check.message);
   row.className=check.ok?'maintenance-ok':'maintenance-warning';
   checks.append(row);
  }
  const select=$('jobHistory'), selected=select.value;
  select.replaceChildren(new Option(tr('Aktueller Lauf'),''));
  for(const job of data.jobs){
   if(!/^[a-f0-9]{32}$/.test(job.invocation||''))continue;
   const actions={backup:'Backup',update:tr('Minecraft-Update'),start:'Start',stop:tr('Stopp'),restart:tr('Neustart'),'restore-world':tr('Wiederherstellung')};
   const option=new Option(format(job.started_at||job.updated_at)+' · '+actions[job.action]+' · '+(labels[job.state]||job.state),job.invocation);
   option.dataset.type=['start','stop','restart'].includes(job.action)?'server':'update';
   select.append(option);
  }
  if([...select.options].some(option=>option.value===selected))select.value=selected;
 }catch(error){
  txt('backupSummary',error.message);
  txt('backupSummaryDetail',error.message);
 }
}
setInterval(()=>{if(!$('app').hidden)loadMaintenance()},30000);
async function deleteBackup(file,button){
 if(!window.confirm('Backup „'+file.name+tr('“ vom ')+file.date+' ('+backupSize(file.size)+tr(') endgültig löschen? Diese Sicherung wird dauerhaft entfernt.')))return;
 button.disabled=true;
 try{
  await api('backup-delete',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({id:file.id})});
  await backups();
  showNotice(tr('Backup gelöscht.'));
 }catch(error){
  showNotice(error.message,true);
  button.disabled=false;
 }
}
function renderBackupList(id,files){
 const list=$(id);
 list.replaceChildren();
 if(!files.length){list.textContent=tr('Noch keine Backups vorhanden.');return}
 for(const file of files){
  const row=document.createElement('div'), info=document.createElement('span'), detail=document.createElement('small');
  const actions=document.createElement('span'), link=document.createElement('button'), remove=document.createElement('button');
  info.className='backup-entry-info';
  info.textContent=file.name;
  detail.textContent=backupSize(file.size)+' · '+file.date;
  info.append(detail);
  actions.className='backup-entry-actions';
  link.className='secondary';
  link.textContent=tr('ZIP herunterladen');
  link.type='button';
  link.addEventListener('click',()=>window.location.assign('?api=backup-download&id='+encodeURIComponent(file.id)));
  link.setAttribute('aria-label',tr('ZIP herunterladen: ')+file.name);
  remove.className='danger';
  remove.type='button';
  remove.textContent=tr('Löschen');
  remove.setAttribute('aria-label',tr('Backup löschen: ')+file.name);
  remove.addEventListener('click',()=>deleteBackup(file,remove));
  if(id==='backupWorldList'){
   const restore=document.createElement('button');restore.type='button';restore.className='secondary';
   restore.textContent='Wiederherstellen';restore.addEventListener('click',()=>openRestore(file));actions.append(restore);
  }
  actions.append(link,remove);
  row.append(info,actions);
  list.append(row);
 }
}
async function backups(){
 try{
  const data=await api('backups');
  renderBackupList('backupWorldList',data.worlds);
  renderBackupList('backupServerList',data.server);
  txt('backupStorage',tr('Gesamter Backup-Speicher: ')+backupSize(data.total_bytes));
 }catch(e){
  txt('backupStorage',tr('Gesamter Backup-Speicher konnte nicht geladen werden.'));
  txt('backupWorldList',e.message);
  txt('backupServerList',e.message);
  showNotice(e.message,true);
 }
}
async function logs(){try{const d=await api('logs&type='+encodeURIComponent($('logType').value)+'&invocation='+encodeURIComponent($('jobHistory').value));txt('logOutput',d.logs||tr('Keine Einträge.'))}catch(e){showNotice(e.message,true)}}function refreshAll(){status();backups();loadMaintenance();logs();loadDashboardAlerts();loadBedrockUpdate()}async function action(name){
 if(busy)return;
 const labels={start:tr('Server starten'),stop:tr('Server stoppen'),restart:tr('Server neu starten'),update:tr('Update starten (Server wird ggf. neu gestartet)'),backup:tr('Backup erstellen (kurze Unterbrechung möglich)')};
 if(!confirm(labels[name]+'?'))return;
 busy=true;document.querySelectorAll('[data-action]').forEach(b=>b.disabled=true);
 try{
  showNotice(labels[name]+tr(' – Auftrag wird ausgeführt …'),false,true);
  const d=await api('action',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action:name})});
  if(d.ok===false)throw Error(d.message||tr('Aktion fehlgeschlagen'));
  {
   showNotice(labels[name]+tr(' – Hintergrundauftrag läuft, Abschluss wird überwacht …'),false,true);
   if(!d.job_id)throw Error(tr('Auftrag gestartet, aber keine Auftrags-ID empfangen. Bitte Protokoll prüfen.'));
   await awaitJob(name,d.job_id);
  }
 }catch(e){showNotice(e.message,true)}
 finally{busy=false;document.querySelectorAll('[data-action]').forEach(b=>b.disabled=false)}
}
// Release notes come from GitHub and are treated as untrusted text.
// Build Markdown-like formatting with DOM text nodes (never innerHTML).
function renderReleaseMarkdown(markdown){
 const container=$('panelReleaseNotes');container.replaceChildren();
 const lines=String(markdown||tr('Keine Release Notes hinterlegt.')).replace(/\r\n?/g,'\n').split('\n');
 let list=null,code=null,paragraph=null;
 const inline=(parent,source)=>{
  const chunks=String(source).split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https:\/\/[^\s)]+\))/g);
  for(const chunk of chunks){if(!chunk)continue;
   let el;
   if(/^`[^`\n]+`$/.test(chunk)){el=document.createElement('code');el.textContent=chunk.slice(1,-1);}
   else if(/^\*\*[^*\n]+\*\*$/.test(chunk)){el=document.createElement('strong');el.textContent=chunk.slice(2,-2);}
   else if(/^\[[^\]\n]+\]\(https:\/\/[^\s)]+\)$/.test(chunk)){
    const m=chunk.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
    try{const u=new URL(m[2]);if(u.protocol!=='https:')throw Error('URL');el=document.createElement('a');el.href=u.href;el.target='_blank';el.rel='noopener noreferrer';el.textContent=m[1];}catch(_){el=document.createTextNode(chunk);}
   }else{el=document.createTextNode(chunk)}
   parent.append(el);
  }
 };
 for(const line of lines){
  if(/^\s*```/.test(line)){
   if(code){code=null;}else{list=null;paragraph=null;code=document.createElement('pre');container.append(code)}
   continue;
  }
  if(code){code.textContent+=(code.textContent?'\n':'')+line;continue}
  if(!line.trim()){list=null;paragraph=null;continue}
  const head=line.match(/^(#{1,4})\s+(.+)$/);
  if(head){list=null;paragraph=null;const h=document.createElement(head[1].length===1?'h3':'h4');inline(h,head[2]);container.append(h);continue}
  const bullet=line.match(/^\s*[-*+]\s+(.+)$/);
  if(bullet){paragraph=null;if(!list){list=document.createElement('ul');container.append(list)}const li=document.createElement('li');inline(li,bullet[1]);list.append(li);continue}
  list=null;
  if(!paragraph){paragraph=document.createElement('p');container.append(paragraph)}else{paragraph.append(document.createElement('br'))}
  inline(paragraph,line);
 }
}
async function loadPanelSecurity(){
 try{
  const d=await api('panel-security');
  txt('panelTrustKeyState',d.trusted_key_configured?tr('Gültig und eingerichtet'):tr('Nicht einsatzbereit'));
  txt('panelTrustKeyFingerprint',d.trusted_key_configured && /^[0-9a-f]{64}$/.test(d.trusted_key_fingerprint||'')
   ? tr('SHA-256 (öffentlicher PEM): ')+d.trusted_key_fingerprint.match(/.{1,16}/g).join(' ')
   : (d.trusted_key_error||tr('Kein Fingerabdruck verfügbar')));
  txt('panelAutoInstallState',tr('Prüfe Verfügbarkeit …'));
 }catch(e){txt('panelTrustKeyState',tr('Prüfung fehlgeschlagen'));txt('panelTrustKeyFingerprint',tr('Schlüsselstatus konnte nicht geladen werden.'));}
}
let panelSelectedChannel='stable';
async function loadPanelChannel(){
 try{
  const d=await api('panel-update-channel');
  panelSelectedChannel=d.channel==='test'?'test':'stable';
  $('panelUpdateChannel').value=panelSelectedChannel;
  txt('panelChannelState',panelSelectedChannel==='test'?tr('Testkanal aktiv – veröffentlichte Pre-Releases'):tr('Stabiler Kanal aktiv'));
 }catch(e){txt('panelChannelState',tr('Updatekanal nicht lesbar: ')+e.message);$('panelStartUpdate').disabled=true;}
}
$('panelSaveUpdateChannel').addEventListener('click',async()=>{
 const channel=$('panelUpdateChannel').value;
 if(!['stable','test'].includes(channel))return;
 if(channel==='test'&&!confirm(tr('Testkanal aktivieren? Pre-Releases sind möglicherweise instabil und sollten nur auf dem Testserver installiert werden.')))return;
 $('panelSaveUpdateChannel').disabled=true;
 try{
  await api('panel-update-channel',{method:'POST',headers:{'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({channel})});
  panelSelectedChannel=channel;
  await loadPanelChannel();await loadPanelRelease();
 }catch(e){showNotice('Updatekanal: '+e.message,true);await loadPanelChannel();}
 finally{$('panelSaveUpdateChannel').disabled=false;}
});
async function loadPanelRelease(){
 loadPanelSecurity();
 const button=$('panelCheckReleases');button.disabled=true;
 await loadPanelChannel();
 txt('panelUpdateState',tr('Prüfe offizielle GitHub-Releases …'));
 $('panelReleaseLink').hidden=true;
 try{
  const d=await api('panel-release');
  $('panelStartUpdate').disabled=!d.installation_enabled || d.channel!==panelSelectedChannel;
  txt('panelInstalledVersion',d.installed);
  txt('panelLatestVersion',d.latest);
  renderReleaseMarkdown(d.notes);
  txt('panelReleaseSignatureState',d.signature_assets_present?tr('Signaturdateien vorhanden – noch nicht verifiziert'):tr('Release nicht signiert'));
  txt('panelAutoInstallState',d.installation_enabled?'Bereit':tr('Gesperrt (kein signiertes neueres Release)'));
  txt('panelSignatureState', d.signature_assets_present
   ? (d.trusted_key_configured ? tr('Signierte Release-Dateien gefunden; öffentlicher Prüfschlüssel ist eingerichtet. Eine lokale Verifikation vor Installation bleibt erforderlich.') : tr('Signierte Release-Dateien gefunden, aber noch kein vertrauenswürdiger Prüfschlüssel eingerichtet.'))
   : tr('Dieses Release ist noch nicht digital signiert. Automatische Installation bleibt gesperrt.'));
  txt('panelUpdateState',d.update_available
   ? (d.installation_enabled?tr('Signiertes neues Panel-Release ist verfügbar. Update per Klick möglich.'):tr('Neue Version verfügbar, aber Signaturdateien oder vertrauenswürdiger Schlüssel fehlen.'))
   : tr('Keine neuere Panel-Version im ausgewählten Kanal verfügbar.'));
  const a=$('panelReleaseLink');
  if(/^https:\/\/github\.com\/xDraconix\/DracoRock-Control\/releases\/tag\/v\d+\.\d+\.\d+$/.test(d.release_url||'')){
   a.href=d.release_url;a.hidden=false;
  }
 }catch(e){$('panelStartUpdate').disabled=true;txt('panelUpdateState',tr('Versionsprüfung fehlgeschlagen: ')+e.message);renderReleaseMarkdown('–');txt('panelSignatureState',tr('Signaturstatus nicht verfügbar.'));txt('panelReleaseSignatureState',tr('Nicht ermittelt'));txt('panelAutoInstallState',tr('Prüfe Verfügbarkeit …'))}
 finally{button.disabled=false}
}
let panelUpdatePoll=null;
let panelUpdatePollCount=0;
async function pollPanelUpdate(){
 try{
  const d=await api('panel-update-progress');
  const log=$('panelLiveUpdateLog');log.hidden=false;
  log.textContent=(d.state||'')+'\n'+(d.logs||'');
  const active=/ActiveState=activating|ActiveState=active/.test(d.state||'');
  $('panelStartUpdate').disabled=true;
  panelUpdatePollCount++;
  if(!active && panelUpdatePollCount>=3){if(panelUpdatePoll){clearInterval(panelUpdatePoll);panelUpdatePoll=null;}await loadPanelRelease();}
 }catch(e){txt('panelUpdateState',tr('Update-Protokoll nicht erreichbar: ')+e.message);}
}
$('panelStartUpdate').addEventListener('click',async()=>{
 if(!confirm(tr('Signiertes GitHub-Release aus dem Kanal ')+(panelSelectedChannel==='test'?tr('TESTVERSIONEN'):tr('STABIL'))+tr(' installieren? Apache wird neu gestartet; Minecraft soll weiterlaufen.')))return;
 $('panelStartUpdate').disabled=true;
 try{await api('panel-update-start',{method:'POST',headers:{'X-CSRF-Token':csrf}});
   txt('panelUpdateState',tr('Panel-Updateauftrag gestartet. Protokoll wird geladen …'));
   if(panelUpdatePoll)clearInterval(panelUpdatePoll);
   panelUpdatePollCount=0;
   panelUpdatePoll=setInterval(pollPanelUpdate,2500);await sleep(1500);await pollPanelUpdate();
 }catch(e){showNotice(tr('Panel-Update: ')+e.message,true);await loadPanelRelease();}
});
$('panelShowUpdateLog').addEventListener('click',pollPanelUpdate);
$('panelCheckReleases').addEventListener('click',loadPanelRelease);
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const d=await api('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})});csrf=d.csrf;$('password').value='';txt('loginError','');showApp()}catch(e){txt('loginError',e.message)}});document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>action(b.dataset.action)));document.querySelectorAll('[data-tab]').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.remove('selected'));a.classList.add('selected');document.querySelectorAll('.tab').forEach(x=>x.hidden=x.id!==a.dataset.tab);txt('pageTitle',({overview:tr('Serverübersicht'),update:tr('Minecraft-Updates'),'panel-update':tr('Panel-Updates'),worlds:tr('Welten-Manager'),addons:'Add-on Manager',settings:tr('Server-Einstellungen'),console:tr('Live-Konsole'),monitor:tr('Live-Servermonitoring'),players:tr('Spielerverwaltung'),backups:tr('Backup-Verwaltung'),logs:tr('Systemprotokolle')})[a.dataset.tab]);if(a.dataset.tab==='panel-update')loadPanelRelease();if(a.dataset.tab==='logs')logs();if(a.dataset.tab==='backups')backups();if(a.dataset.tab==='addons')loadAddons();if(a.dataset.tab==='settings')loadProperties();if(a.dataset.tab==='worlds')loadWorlds();if(a.dataset.tab==='console')loadConsole();if(a.dataset.tab==='overview')loadDashboardAlerts();if(a.dataset.tab==='monitor')loadMonitoring();if(a.dataset.tab==='players'){status();loadPlayers();loadOnlinePlayers()}}));$('refresh').addEventListener('click',()=>{refreshAll();loadBedrockUpdate(true)});$('reloadLogs').addEventListener('click',logs);$('logType').addEventListener('change',()=>{$('jobHistory').value='';logs()});$('jobHistory').addEventListener('change',()=>{$('logType').value=$('jobHistory').selectedOptions[0].dataset.type||'update';logs()});$('updateLogButton').addEventListener('click',()=>{document.querySelector('[data-tab="logs"]').click();$('logType').value='update';logs()});$('logout').addEventListener('click',async()=>{try{await api('logout',{method:'POST',headers:{'X-CSRF-Token':csrf}})}finally{location.reload()}});api('session').then(d=>{if(d.authenticated){csrf=d.csrf;showApp()}}).catch(()=>{});setInterval(()=>{if(!$('app').hidden)status()},15000);

let addonPacks=[];
async function loadAddons(){const el=$('addonList');el.textContent=tr('Lade Pakete ...');try{const d=await api('addons');addonPacks=d.packs||[];renderAddons()}catch(e){el.textContent='Fehler: '+e.message}}
function renderAddons(){
 const el=$('addonList');el.replaceChildren();
 const filter=$('addonFilter').value,kind=$('addonKind').value,q=$('addonSearch').value.trim().toLocaleLowerCase('de');
 const active=addonPacks.filter(p=>p.active).length,system=addonPacks.filter(p=>p.category==='system').length;
 txt('addonSummary',`${active} aktiv · ${addonPacks.length-active} weitere Pakete · ${system} als Standardpakete erkannt · ${addonPacks.filter(p=>p.duplicate).length} Einträge mit mehrfacher UUID`);
 const visible=addonPacks.filter(p=>(filter==='all'||(filter==='active'?p.active:filter==='other'?!p.active&&p.category!=='system':p.category==='system'))&&(kind==='all'||p.kind===kind)&&(!q||[p.name,p.description,p.uuid,p.folder,p.version.join('.')].join(' ').toLocaleLowerCase('de').includes(q)));
 if(!visible.length){const empty=document.createElement('p');empty.className='muted';empty.textContent=tr('Keine passenden Pakete gefunden.');el.append(empty);return}
 for(const p of visible){
  const row=document.createElement('div');row.className='addon-row';
  const info=document.createElement('div');info.className='addon-info';
  const name=document.createElement('b');name.textContent=p.name||p.folder;
  const details=document.createElement('div');details.className='muted tiny';details.textContent=(p.kind==='behavior'?'Behavior Pack':'Resource Pack')+' · Version '+p.version.join('.')+' · '+(p.active?'Aktiv':'Inaktiv');
  const path=document.createElement('div');path.className='muted tiny';path.textContent='Ordner: '+p.folder+' · UUID: '+p.uuid;
  info.append(name,details,path);
  if(p.description&&p.description!==p.name){const desc=document.createElement('div');desc.className='muted tiny';desc.textContent=p.description;info.append(desc)}
  if(p.duplicate){const warn=document.createElement('div');warn.className='addon-warning';warn.textContent=tr('⚠ Mehrere installierte Versionen mit dieser UUID – Aktivierung gesperrt');info.append(warn)}
  if(p.category==='system'){const sys=document.createElement('div');sys.className='muted tiny';sys.textContent=tr('Als Standardpaket eingeordnet (anhand des Ordnernamens)');info.append(sys)}
  const btn=document.createElement('button');btn.className=p.active?'danger':'positive';btn.textContent=p.active?'Deaktivieren':'Aktivieren';btn.disabled=!!p.duplicate;
  btn.addEventListener('click',async()=>{if(!confirm((p.active?'Deaktivieren':'Aktivieren')+tr('? Minecraft muss gestoppt sein.')))return;try{const r=await api('addon-action',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action:p.active?'disable':'enable',kind:p.kind,uuid:p.uuid})});showNotice(r.message||'Gespeichert');loadAddons()}catch(e){showNotice(e.message,true)}});
  row.append(info,btn);el.append(row)
 }
}
$('addonSearch').addEventListener('input',renderAddons);
$('addonFilter').addEventListener('change',renderAddons);
$('addonKind').addEventListener('change',renderAddons);
$('reloadAddons').addEventListener('click',loadAddons);
$('addonUploadForm').addEventListener('submit',async e=>{e.preventDefault();const file=$('addonFile').files[0];if(!file)return;if(file.size>268435456){showNotice('Maximal 256 MB',true);return}if(!confirm(tr('Add-on installieren? Der Minecraft-Dienst muss gestoppt sein.')))return;const data=new FormData();data.append('addon',file);try{const r=await api('addon-upload',{method:'POST',headers:{'X-CSRF-Token':csrf},body:data});showNotice(r.message||'Installiert');$('addonUploadForm').reset();loadAddons()}catch(e){showNotice(e.message,true)}});

let consoleBusy=false;
const consoleLevelPattern=/^\[(?:(?:\d{4}-\d{2}-\d{2}) [\d:.]+ )?(FATAL|ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE)\]/i;
const consoleLevelClasses={FATAL:'error',ERROR:'error',WARN:'warning',WARNING:'warning',INFO:'info',DEBUG:'debug',TRACE:'debug'};

function consoleEntries(logs,columns){
 const entries=[];
 let current=null;
 for(const line of logs.split(/\r?\n/)){
  const level=consoleLevelPattern.exec(line);
  // SCREEN hardcopy inserts a newline after each full terminal row.
  // Only join full rows within a log entry and retain explicit boundaries.
  const startsEntry=/^\[/.test(line)||/^\s*#{3,}/.test(line);
  if(current?.level && columns>0 && current.lastWidth===columns && line.trim() && !startsEntry){
   current.text+=line;
   current.lastWidth=Array.from(line).length;
  }else{
   current={text:line,level:level?consoleLevelClasses[level[1].toUpperCase()]:null,lastWidth:Array.from(line).length};
   entries.push(current);
  }
 }
 return entries;
}

function renderConsole(logs,columns){
 const output=$('consoleOutput');
 const atBottom=output.scrollTop+output.clientHeight>=output.scrollHeight-4;
 const content=document.createDocumentFragment();
 for(const [index,entry] of consoleEntries(logs,columns).entries()){
  if(index)content.append('\n');
  const line=document.createElement('span');
  if(entry.level)line.className='console-level-'+entry.level;
  line.textContent=entry.text;
  content.append(line);
 }
 output.replaceChildren(content);
 if(atBottom)output.scrollTop=output.scrollHeight;
}

async function loadConsole(){
 if(consoleBusy)return;
 consoleBusy=true;
 try{
  const data=await api('console-tail');
  renderConsole(data.logs||tr('Keine Konsolenausgabe verfügbar.'),data.columns);
 }catch(e){
  txt('consoleOutput',tr('Konsole nicht verfügbar: ')+e.message);
 }finally{consoleBusy=false}
}
async function consoleSend(command,value=''){try{const d=await api('console-send',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({command,value})});showNotice(d.message||tr('Befehl gesendet'));setTimeout(loadConsole,600)}catch(e){showNotice(e.message,true)}}
$('consoleCommandForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const input=$('consoleCommand');
 if(input.value.trim())await consoleSend('minecraft',input.value);
});
$('reloadConsole').addEventListener('click',loadConsole);
$('consoleList').addEventListener('click',()=>consoleSend('list'));
$('consoleDay').addEventListener('click',()=>consoleSend('day'));
$('consoleNight').addEventListener('click',()=>consoleSend('night'));
function inlinePlayerActions(name,entry){
 const buttons=document.createElement('div');buttons.className='player-entry-actions';
 const addButton=(command,label,title,classes,pressed)=>{
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='player-action '+classes;
  btn.textContent=label;
  btn.title=title+' – '+name;
  btn.setAttribute('aria-label',title+tr(' für ')+name);
  if(pressed!==null)btn.setAttribute('aria-pressed',String(pressed));
  btn.addEventListener('click',()=>playerCommand(command,name));
  buttons.append(btn);
 };
 // No separate Bedrock "disallow list": Allow turns membership on/off.
 const isAllowed=!!entry && entry.allowlisted!==false;
 addButton(isAllowed?'allowlist-remove':'allowlist-add',
           isAllowed?'✓ Allow':'Allow',
           isAllowed?tr('Von der Allowlist entfernen'):tr('Zur Allowlist hinzufügen'),
           'player-action-allow'+(isAllowed?' player-action-selected':''),
           isAllowed);
 // OP status is only known when the allowlist entry has a matching XUID
 // in permissions.json. Never mark a player as non-operator on a guess.
 if(entry?.permission_known){
  const isOp=entry.permission==='operator';
  addButton(isOp?'deop':'op',isOp?'✓ OP':'OP',
            isOp?tr('Operatorrechte entziehen'):tr('Operatorrechte erteilen'),
            'player-action-op'+(isOp?' player-action-selected':''),
            isOp);
 }else{
  addButton('op','OP',tr('Operatorrechte erteilen (aktueller Status unbekannt)'),
            'player-action-op',null);
  addButton('deop','deOP',tr('Operatorrechte entziehen (aktueller Status unbekannt)'),
            'player-action-deop',null);
 }
 return buttons;
}
// Roles are matched only by exact case-insensitive gamertag. Unknown is never treated as member.
let knownPlayerRoles=new Map();
let lastOnlineRoster=null;
let onlinePlayersBusy=false;

function playerBadges(entry,isOnline){
 const badges=document.createElement('div');badges.className='player-badges';
 const badge=(value,cls)=>{
  const span=document.createElement('span');span.className='player-badge '+cls;
  span.textContent=value;badges.append(span);
 };
 if(isOnline)badge('● Online','player-badge-online');
 if(entry){
  if(entry.allowlisted===false)badge(tr('Nicht auf Allowlist'),'player-badge-not-allowed');
  else badge('✓ Allowlist','player-badge-allowed');
  if(entry.permission_known){
   const role=entry.permission;
   badge(role==='operator'?'★ OP':role==='visitor'?'Besucher':'Mitglied',
         role==='operator'?'player-badge-operator':'player-badge-member');
  }else{
   badge(tr('Rechte unbekannt'),'player-badge-unknown');
  }
 }else if(isOnline){
  badge(tr('Nicht auf Allowlist'),'player-badge-not-allowed');
  badge(tr('Rechte ohne Allowlist-XUID nicht zuordenbar'),'player-badge-unknown');
 }
 return badges;
}

function renderOnlinePlayers(players){
 const list=$('onlinePlayersList');list.replaceChildren();
 if(!players.length){
  const p=document.createElement('p');p.className='muted';p.textContent=tr('Derzeit keine Spieler online.');list.append(p);
  return;
 }
 for(const player of players){
  const row=document.createElement('div');row.className='player-entry player-entry-online';
  const info=document.createElement('div');info.className='player-entry-info';
  const name=document.createElement('strong');name.className='player-name';name.textContent=player;
  info.append(name,playerBadges(knownPlayerRoles.get(player.toLocaleLowerCase((globalThis.dracoI18n?.locale||'de-DE'))),true));
  row.append(info,inlinePlayerActions(player,knownPlayerRoles.get(player.toLocaleLowerCase((globalThis.dracoI18n?.locale||'de-DE')))));list.append(row);
 }
}

async function loadOnlinePlayers(){
 if(onlinePlayersBusy)return;
 onlinePlayersBusy=true;
 const state=$('onlinePlayersState'),list=$('onlinePlayersList');
 state.textContent=tr('Aktuelle Spieler werden über Minecraft abgefragt ...');
 try{
  const d=await api('players-online');
  if(!Array.isArray(d.players)||!Number.isInteger(d.count)||d.count!==d.players.length)throw Error(tr('Unvollständige Serverantwort'));
  if(d.players.some(n=>typeof n!=='string'))throw Error(tr('Ungültige Spielernamen'));
  const changed=lastOnlineRoster===null || d.players.length!==lastOnlineRoster.length ||
   d.players.some((name,i)=>name!==lastOnlineRoster[i]);
  lastOnlineRoster=d.players.slice();
  state.textContent=d.count+tr(' von ')+d.max_players+tr(' Spielern online · frisch über die Konsole abgefragt');
  renderOnlinePlayers(lastOnlineRoster);
  if(changed)loadPlayers();
 }catch(e){
  lastOnlineRoster=null;
  list.replaceChildren();
  state.textContent=tr('Spielernamen nicht verfügbar: ')+e.message+tr(' (keine veralteten Namen angezeigt)');
 }finally{onlinePlayersBusy=false}
}

async function loadPlayers(){
 const list=$('managedPlayers');list.textContent=tr('Lade Allowlist ...');
 try{
  const d=await api('players-state');
  txt('allowlistState',d.allowlist_enabled===true?tr('● Allowlist aktiv – nur eingetragene Gamertags können beitreten'):d.allowlist_enabled===false?tr('● Allowlist deaktiviert – aktuell keine Zugangsbeschränkung'):tr('⚠ Allowlist-Einstellung unbekannt'));
  $('allowlistState').className='player-allowlist-state '+(d.allowlist_enabled===true?'player-allowlist-enabled':'player-allowlist-disabled');
  txt('playersWarning',(Array.isArray(d.warnings)&&d.warnings.length?d.warnings.join(' · '):'')+tr(' Online-Spieler werden separat automatisch abgefragt.'));
  list.replaceChildren();
  if(!Array.isArray(d.players))throw Error(tr('Ungültige Allowlist-Antwort'));
  const known=(Array.isArray(d.identified_players)?d.identified_players:[])
   .concat(d.players);
  knownPlayerRoles=new Map(known.map(player=>[player.name.toLocaleLowerCase((globalThis.dracoI18n?.locale||'de-DE')),player]));
  if(lastOnlineRoster!==null)renderOnlinePlayers(lastOnlineRoster);
  if(!d.players.length){const p=document.createElement('p');p.className='muted';p.textContent=tr('Keine Allowlist-Einträge vorhanden.');list.append(p);return}
  for(const player of d.players){
   const row=document.createElement('div');row.className='player-entry player-entry-allowlist';
   const info=document.createElement('div');info.className='player-entry-info';
   const name=document.createElement('strong');name.className='player-name';name.textContent=player.name;
   info.append(name,playerBadges(player,false));
   row.append(info,inlinePlayerActions(player.name,player));list.append(row);
  }
 }catch(e){knownPlayerRoles=new Map();if(lastOnlineRoster!==null)renderOnlinePlayers(lastOnlineRoster);list.textContent=tr('Spielerverwaltung nicht verfügbar: ')+e.message;showNotice(e.message,true)}
}
async function playerCommand(command,name){
 const labels={'kick':tr('Spieler kicken'),'allowlist-add':tr('Zur Allowlist hinzufügen'),'allowlist-remove':tr('Von Allowlist entfernen'),'op':tr('Operatorrechte erteilen'),'deop':tr('Operatorrechte entziehen')};
 if(!Object.hasOwn(labels,command)||!name)return;
 if(!confirm(labels[command]+tr(' für ')+name+'?'+(command==='op'?tr(' Operatoren dürfen die Welt und Servereinstellungen verändern.'):'')))return;
 try{
  const d=await api('console-send',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({command,value:name})});
  showNotice(d.message||tr('Befehl an die Serverkonsole gesendet. Ausführung dort prüfen.'));
  setTimeout(()=>{loadPlayers();loadOnlinePlayers()},1200);
 }catch(e){showNotice(e.message,true)}
}
$('playersReload').addEventListener('click',()=>{loadPlayers();loadOnlinePlayers()});


$('consoleSayForm').addEventListener('submit',e=>{e.preventDefault();const msg=$('consoleMessage').value.trim();if(!msg)return;consoleSend('say',msg);$('consoleMessage').value=''});

setInterval(()=>{if(!$('app').hidden&&!$('console').hidden)loadConsole()},5000);
setInterval(()=>{if(!$('app').hidden&&!$('players').hidden)loadOnlinePlayers()},15000);

async function loadWorlds(){
 const el=$('worldList');el.textContent=tr('Lade Welten ...');
 try{
  const d=await api('worlds');el.replaceChildren();
  txt('worldSummary',tr('In server.properties ausgewählt: ')+d.selected+' · Server '+(d.running?'online':'offline'));
  if(!d.worlds.length){el.textContent=tr('Keine vollständigen Welten gefunden (level.dat fehlt).');return}
  for(const w of d.worlds){
   const row=document.createElement('div');row.className='addon-row';
   const info=document.createElement('div');info.className='addon-info';
   const name=document.createElement('b');name.textContent=w.name;
   const sub=document.createElement('div');sub.className='muted tiny';sub.textContent=w.selected?tr('In server.properties ausgewählt'):tr('Vorhandene Welt');
   info.append(name,sub);
   const meta=document.createElement('div');meta.className='muted tiny';
   const details=[];
   if(w.game_mode)details.push('Spielmodus: '+w.game_mode);
   if(w.difficulty)details.push('Schwierigkeit: '+w.difficulty);
   if(w.level_name&&w.level_name!==w.name)details.push('Weltname: '+w.level_name);
   meta.textContent=details.join(' · ');
   if(details.length)info.append(meta);
   const seedBox=document.createElement('div');seedBox.className='world-seed-row';
   const seedLabel=document.createElement('span');seedLabel.className='muted tiny';seedLabel.textContent='Weltseed:';
   const seedValue=document.createElement('code');seedValue.textContent=(typeof w.seed==='string'&&/^-?\d{1,20}$/.test(w.seed))?w.seed:tr('Nicht verfügbar');
   seedBox.append(seedLabel,seedValue);
   if(typeof w.seed==='string'&&/^-?\d{1,20}$/.test(w.seed)){
    const seedCopy=document.createElement('button');seedCopy.className='secondary';seedCopy.textContent=tr('Kopieren');
    seedCopy.title=tr('Weltseed in Zwischenablage kopieren');
    seedCopy.addEventListener('click',()=>{
     // The dashboard commonly runs on http://SERVER-IP:8088, where the
     // asynchronous Clipboard API is unavailable outside secure contexts.
     // The legacy copy command can still work directly in a user click.
     function copyLegacy(value){
      const input=document.createElement('textarea');
      input.value=value;
      input.readOnly=true;
      input.setAttribute('aria-hidden','true');
      input.style.cssText='position:fixed;left:-9999px;top:0;opacity:0;';
      const selection=window.getSelection();
      const oldRanges=[];
      if(selection)for(let i=0;i<selection.rangeCount;i++)oldRanges.push(selection.getRangeAt(i));
      const previousFocus=document.activeElement;
      document.body.append(input);
      let copied=false;
      try{
       input.focus({preventScroll:true});
       input.select();
       input.setSelectionRange(0,input.value.length);
       copied=typeof document.execCommand==='function'&&document.execCommand('copy');
      }finally{
       input.remove();
       if(selection){selection.removeAllRanges();for(const range of oldRanges)selection.addRange(range)}
       if(previousFocus&&typeof previousFocus.focus==='function')previousFocus.focus({preventScroll:true});
      }
      return copied;
     }
     if(copyLegacy(w.seed)){showNotice(tr('Weltseed in Zwischenablage kopiert.'));return}
     if(window.isSecureContext&&navigator.clipboard?.writeText){
      navigator.clipboard.writeText(w.seed)
       .then(()=>showNotice(tr('Weltseed in Zwischenablage kopiert.')))
       .catch(()=>showNotice(tr('Kopieren nicht möglich. Bitte den sichtbaren Seed markieren und Strg+C drücken.'),true));
      return;
     }
     showNotice(tr('Automatisches Kopieren wird von diesem Browser nicht unterstützt. Bitte den sichtbaren Seed markieren und Strg+C drücken.'),true);
    });
    seedBox.append(seedCopy);
   }
   info.append(seedBox);
   const btn=document.createElement('button');btn.className=w.selected?'secondary':'positive';btn.textContent=w.selected?tr('Ausgewählt'):tr('Welt auswählen');btn.disabled=!!w.selected;
   btn.addEventListener('click',()=>worldAction('select',w.name));
   const copy=document.createElement('button');copy.className='secondary';copy.textContent=tr('Duplizieren');copy.addEventListener('click',()=>{const n=prompt(tr('Name für Kopie von ')+w.name+':',w.name+tr(' Kopie'));if(n)worldDuplicate(w.name,n.trim())});
   const save=document.createElement('button');save.className='secondary';save.textContent=tr('Sichern');save.addEventListener('click',()=>worldAction('backup',w.name));
   for(const format of ['zip','mcworld']){
    const download=document.createElement('button');download.className='secondary';download.textContent='↓ '+(format==='zip'?'ZIP':'.mcworld');
    download.title=tr('Minecraft muss für den Export gestoppt sein');
    download.addEventListener('click',()=>worldExport(w.name,format));
    row.append(download);
   }
   row.prepend(info);row.append(btn,copy,save);el.append(row)
  }
 }catch(e){el.textContent='Fehler: '+e.message}
}
async function worldExport(name,format){
 if(!confirm('Welt "'+name+tr('" als ')+format+tr(' exportieren? Minecraft muss gestoppt sein.')))return;
 try{
  showNotice(tr('Weltarchiv wird vorbereitet …'),false,true);
  const d=await api('world-export',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({name,format})});
  const id=d.job_id;
  if(!/^[a-f0-9]{32}$/.test(id||''))throw Error(tr('Keine gültige Auftrags-ID erhalten'));
  for(let n=0;n<900;n++){
   await sleep(2000);
   const state=await api('job-status&id='+encodeURIComponent(id));
   if(state.state==='success'){
    showNotice(tr('Weltarchiv bereit. Download startet …'));
    const a=document.createElement('a');a.href='?api=world-download&id='+encodeURIComponent(id)+'&format='+encodeURIComponent(format);
    document.body.append(a);a.click();a.remove();return;
   }
   if(state.state==='failed')throw Error(state.message||tr('Export fehlgeschlagen'));
   showNotice(state.message||tr('Weltarchiv wird erstellt …'),false,true);
  }
  throw Error(tr('Export dauert zu lange. Bitte Protokoll prüfen.'));
 }catch(e){showNotice(e.message,true)}
}
async function worldAction(action,name){
 const question=action==='backup'?'Welt "'+name+tr('" sichern? Der Server muss gestoppt sein.'):action==='create'?tr('Neue Welt "')+name+tr('" für den nächsten Start vorbereiten?'):'Welt "'+name+tr('" auswählen? Der Server wird NICHT automatisch neu gestartet.');
 if(!confirm(question))return;
 try{const r=await api('world-action',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action,name})});showNotice(r.message||'Gespeichert');loadWorlds();if(action==='create')$('worldCreateForm').reset()}catch(e){showNotice(e.message,true)}
}
$('reloadWorlds').addEventListener('click',loadWorlds);
$('worldCreateForm').addEventListener('submit',e=>{e.preventDefault();const name=$('worldNewName').value.trim();if(name)worldAction('create',name)});

async function worldDuplicate(source,name){
 if(!confirm('Welt "'+source+tr('" nach "')+name+tr('" duplizieren? Minecraft muss gestoppt sein.')))return;
 try{const d=await api('world-duplicate',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({source,name})});showNotice(d.message||'Dupliziert');loadWorlds()}catch(e){showNotice(e.message,true)}
}
$('worldImportForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!confirm(tr('Welt importieren? Minecraft muss gestoppt sein.')))return;
 const f=new FormData();f.append('name',$('worldImportName').value.trim());f.append('world',$('worldImportFile').files[0]);
 try{const d=await api('world-import',{method:'POST',headers:{'X-CSRF-Token':csrf},body:f});showNotice(d.message||'Importiert');$('worldImportForm').reset();loadWorlds()}catch(err){showNotice(err.message,true)}
});

// Version 2.3: safe property editor (existing keys only).
let propertiesOriginal={},propertiesRevision='';
const propertyNames={'server-name':tr('Servername'),'level-name':tr('Weltname'),'gamemode':tr('Spielmodus'),'difficulty':tr('Schwierigkeit'),'max-players':tr('Maximale Spieler'),'server-port':tr('Server-Port (IPv4)'),'server-portv6':tr('Server-Port (IPv6)'),'online-mode':tr('Online-Modus'),'allow-cheats':tr('Cheats erlauben'),'enable-lan-visibility':'LAN-Sichtbarkeit','view-distance':'Sichtweite','tick-distance':'Simulationsdistanz','default-player-permission-level':tr('Standard-Spielerrechte'),'player-idle-timeout':'AFK-Timeout'};
async function loadProperties(){
 const host=$('propertiesFields');host.replaceChildren();txt('propertiesState',tr('Lade server.properties …'));$('propertiesSave').disabled=true;
 try{
  const data=await api('properties-read');propertiesRevision=data.revision;propertiesOriginal={};
  for(const f of data.fields){
   propertiesOriginal[f.key]=f.value;
   const wrap=document.createElement('div');wrap.className='property-field';
   const label=document.createElement('label');label.textContent=propertyNames[f.key]||f.key;
   const key=document.createElement('small');key.textContent=f.key;
   const id='property-'+f.key;label.htmlFor=id;
   let field;
   if(f.type==='boolean'||f.type==='select'){
    field=document.createElement('select');
    const options=f.type==='boolean'?['true','false']:f.options;
    for(const value of options){const option=document.createElement('option');option.value=value;option.textContent=value==='true'?'Aktiviert':value==='false'?'Deaktiviert':value;field.append(option)}
   }else{field=document.createElement('input');field.type=f.type==='integer'||f.type==='number'?'number':'text';if(f.type==='integer')field.step='1';if(f.type==='number')field.step='any';if(f.min!==undefined)field.min=f.min;if(f.max!==undefined)field.max=f.max;field.maxLength=512}
   field.id=id;field.dataset.propertyKey=f.key;field.value=f.value;
   field.addEventListener('input',propertyDirty);field.addEventListener('change',propertyDirty);
   wrap.append(label,key,field);host.append(wrap);
  }
  txt('propertiesState',data.fields.length+tr(' Einstellungen geladen · Noch keine Änderungen'));
 }catch(e){txt('propertiesState','Fehler: '+e.message);showNotice(e.message,true)}
}
function propertyChanges(){const changes={};document.querySelectorAll('[data-property-key]').forEach(el=>{if(el.value!==propertiesOriginal[el.dataset.propertyKey])changes[el.dataset.propertyKey]=el.value});return changes}
function propertyDirty(){const count=Object.keys(propertyChanges()).length;$('propertiesSave').disabled=count===0;txt('propertiesState',count?count+tr(' Änderung(en) noch nicht gespeichert'):tr('Keine Änderungen'))}
$('propertiesReload').addEventListener('click',()=>{if(Object.keys(propertyChanges()).length&&!confirm(tr('Ungespeicherte Änderungen verwerfen?')))return;loadProperties()});
$('propertiesSave').addEventListener('click',async()=>{
 const changes=propertyChanges();const keys=Object.keys(changes);if(!keys.length)return;
 const preview=keys.map(k=>k+': '+propertiesOriginal[k]+' → '+changes[k]).join('\n');
 if(!confirm(tr('Folgende Änderungen speichern?\n\n')+preview+tr('\n\nMinecraft wird NICHT automatisch neu gestartet.')))return;
 $('propertiesSave').disabled=true;
 try{const d=await api('properties-save',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({revision:propertiesRevision,changes})});showNotice(d.changed+tr(' Einstellung(en) gespeichert. Backup: ')+d.backup+tr('. Minecraft bitte manuell neu starten.'));await loadProperties();status()}
 catch(e){showNotice(e.message,true);propertyDirty()}
});

// v2.4.0: authenticated first-run wizard.
async function setupCheck(){
 try{const d=await api('setup-status');
   $('setupNav').hidden=d.installed;
   $('setupForm').hidden=d.installed||d.path_exists||d.service_exists;
   txt('setupState',d.installed?tr('Minecraft ist bereits installiert.'):(d.path_exists||d.service_exists)?tr('Eine vorhandene oder unvollständige Installation wurde erkannt. Aus Sicherheitsgründen wird nichts überschrieben.'):tr('Kein Minecraft-Server vorhanden. Installation ist möglich.'));
   if(!d.installed){document.querySelectorAll('a[data-tab]').forEach(a=>a.classList.remove('selected'));document.querySelectorAll('section.tab').forEach(x=>x.hidden=true);$('setup').hidden=false;$('setupNav').classList.add('selected');}
 }catch(e){showNotice(tr('Setup-Prüfung: ')+e.message,true)}
}
$('setupForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const data={server_name:$('setupServer').value.trim(),world_name:$('setupWorld').value.trim(),gamemode:$('setupMode').value,difficulty:$('setupDifficulty').value,port:Number($('setupPort').value),max_players:Number($('setupPlayers').value)};
 if(!confirm(tr('Minecraft Bedrock jetzt offiziell herunterladen und installieren?')))return;
 $('setupInstall').disabled=true;$('setupProgress').hidden=false;
 try{
  const r=await api('setup-install',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)});
  const deadline=Date.now()+25*60*1000;
  while(Date.now()<deadline){
   await sleep(2500);
   const s=await api('setup-job&id='+encodeURIComponent(r.job_id));
   txt('setupProgress',s.message||s.state);
   if(s.state==='success'){showNotice(s.message);await setupCheck();refreshAll();return;}
   if(s.state==='failed')throw Error(s.message||tr('Installation fehlgeschlagen'));
  }
  throw Error(tr('Zeitüberschreitung. Bitte Installationsprotokoll prüfen.'));
 }catch(err){showNotice(err.message,true);txt('setupProgress',err.message)}finally{$('setupInstall').disabled=false}
});
// Call setup detection after login; preserve existing dashboard behaviour.
const oldShowApp=showApp;
showApp=function(){oldShowApp();setupCheck()};

$('restoreDialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();else{restoreSelection=null;restoreRequest++}});

async function refreshRestoreState(){
 const state=await api('status');
 const stopped=state.service==='inactive';
 $('restoreStop').disabled=stopped;
 $('restoreSubmit').disabled=!stopped||!$('restoreTarget').options.length;
 txt('restoreStatus',stopped?tr('Minecraft ist gestoppt. Die Zielwelt kann wiederhergestellt werden.'):tr('Bitte Minecraft vor der Wiederherstellung stoppen.'));
}
