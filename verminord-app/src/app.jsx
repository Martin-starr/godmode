import React, { useState, useEffect, useRef, useCallback } from 'react';

const C = {
  ink:'#0A1424', navy:'#15233A',
  navy60:'rgba(21,35,58,0.6)', navy40:'rgba(21,35,58,0.4)',
  navy20:'rgba(21,35,58,0.2)', navy08:'rgba(21,35,58,0.08)', navy04:'rgba(21,35,58,0.04)',
  cream:'#F4EEDF', creamPaper:'#FAF6EA', creamDeep:'#ECE3CE',
  gold:'#B8923A', goldSoft:'rgba(184,146,58,0.08)',
  sage:'#6B7544', rust:'#A64B2A', graphite:'#5C5448',
  hairline:'rgba(21,35,58,0.12)',
};

const T = {
  heroHead:{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:700,fontSize:52,lineHeight:1.04,letterSpacing:'-0.022em',color:C.ink},
  heroSub:{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:400,fontStyle:'italic',fontSize:52,lineHeight:1.04,letterSpacing:'-0.018em',color:C.navy60},
  heroBody:{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:400,fontSize:15,lineHeight:1.6,color:C.graphite},
  eyebrow:{fontFamily:'"IBM Plex Mono",monospace',fontWeight:400,fontSize:10,textTransform:'uppercase',letterSpacing:'0.22em',color:C.navy60},
  section:{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:500,fontSize:11,textTransform:'uppercase',letterSpacing:'0.22em',color:C.ink},
  panel:{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:500,fontSize:11,textTransform:'uppercase',letterSpacing:'0.20em',color:C.ink},
  metaMono:{fontFamily:'"IBM Plex Mono",monospace',fontWeight:400,fontSize:11,color:C.navy60,letterSpacing:'0.04em'},
  bigNum:{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:500,fontSize:56,lineHeight:1,letterSpacing:'-0.025em',color:C.ink},
  midNum:{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:500,fontSize:34,lineHeight:1,letterSpacing:'-0.018em',color:C.ink},
  statNum:{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:500,fontSize:20,letterSpacing:'-0.01em',color:C.ink},
  statLbl:{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:400,fontSize:11,color:C.navy60,textTransform:'uppercase',letterSpacing:'0.10em',marginTop:4},
  itemTitle:{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:500,fontSize:15,color:C.ink},
  itemBody:{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:400,fontSize:13,color:C.graphite,lineHeight:1.5},
  monoData:{fontFamily:'"IBM Plex Mono",monospace',fontWeight:400,fontSize:12,color:C.graphite},
  monoLbl:{fontFamily:'"IBM Plex Mono",monospace',fontWeight:400,fontSize:10,textTransform:'uppercase',letterSpacing:'0.16em',color:C.navy60},
  tag:{fontFamily:'"IBM Plex Mono",monospace',fontWeight:400,fontSize:10,textTransform:'uppercase',letterSpacing:'0.14em'},
  quote:{fontFamily:'"IBM Plex Serif",serif',fontWeight:300,fontStyle:'italic',fontSize:17,lineHeight:1.55,color:C.ink,letterSpacing:'-0.005em'},
};

const KEY_DATA='verminord-v6';
const KEY_META='verminord-meta-v6';

const SEED = {
  sales:{mtd:47200,target:100000,daysLeft:9,deltaVsLastMonth:38,activeOrders:3,d2cMay:12,pricePerBag:389,draftsAtHabiba:2,trend:[12,14,11,18,16,22,19,24,28,26,32,30,35,38,42,47.2]},
  feedstock:[
    {name:'Lamamøkk',days:18,source:'Sikret · lokalt'},
    {name:'Bryggermask · RYGR',days:6,source:'Ukentlig · Sandnes'},
    {name:'Brukt mycelium',days:11,source:'Månedlig'},
    {name:'Bølgepapp',days:24,source:'Lokalt'},
    {name:'Løvkompost',days:14,source:'Sesong'},
  ],
  feedstockAlert:{title:'RYGR-leveranse',note:'Bestill innen onsdag'},
  feedstockOutreach:[
    {name:'Yeastside',stage:'planlagt',notes:'Kontakt uke 23 — etter Dyrkeland'},
    {name:'Berentsens',stage:'kontaktet',notes:'Sendt e-post 12.05, ingen svar enda'},
    {name:'Salikatt',stage:'planlagt',notes:'Avventer Lervig-tilbakemelding'},
  ],
  deliveries:[
    {material:'RYGR mash',date:'2026-05-24',amount:'200 kg',status:'bekreftet'},
    {material:'Lamamøkk',date:'2026-05-29',amount:'~150 kg',status:'planlagt'},
    {material:'Mycelium',date:'2026-06-03',amount:'~80 kg',status:'venter'},
  ],
  production:{
    cft1:{lastFed:'20.05',by:'Mathias',ph:'7,1',moisture:'62 %',temp:'21°C',status:'Aktiv · stabil'},
    cft2:{lastFed:'18.05',by:'Martin',ph:'7,3',moisture:'65 %',temp:'22°C',status:'Aktiv · høy aktivitet'},
    readyBatch:'2026-007',readyBags:84,precompostBatch:'2026-008',precompostDay:9,
  },
  greeting:{
    eyebrow:'00 — Daglig brief · uke 21',
    headline:'God morgen, Martin.', subhead:'Tre saker venter.',
    intro:'Måneden er 60 % gjennomført. Du ligger like under takten på 100 000-målet, men Dyrkeland-ordren alene løfter deg over om den lukkes denne uka.',
  },
  actions:[
    {title:'Dyrkeland venter på revidert pristilbud',context:'40 × 20L bestilling diskutert 18. mai. Habiba har utkast.',tag:'Varm lead · 4 dgr',tagType:'urgent',value:'Forventet verdi 31 200 NOK'},
    {title:'ALS-rapport for batch 2026-007 er klar',context:'Ikke konvertert til kundevennlig énpager ennå. Mathias har varslet.',tag:'Innhold · 2 dgr',tagType:'warm',value:'Blokkerer 3 D2C-svar'},
    {title:'RYGR — sist kontakt 12 dager siden',context:'Mash-leveranse stabil, men relasjonen kjøles ned uten oppfølging.',tag:'Partnerpuls · 12 dgr',tagType:'neutral',value:'Råstoff-kritisk'},
  ],
  orders:[
    {customer:'Dyrkeland',items:'40 × 20L',amount:31200,status:'utkast',date:'18.05',notes:'Habiba har utkast'},
    {customer:'A. Bergmann (D2C)',items:'2 × 5L',amount:778,status:'pakket',date:'21.05',notes:''},
    {customer:'H. Klepp (D2C)',items:'1 × 5L',amount:389,status:'sendt',date:'20.05',notes:''},
  ],
  partners:[
    {name:'Dyrkeland',type:'B2B · forhandler',temp:'hot',last:'18.05',age:'4d',kind:'Pristilbud',next:'Send revidert tilbud (40×20L)'},
    {name:'RYGR',type:'Råstoffleverandør',temp:'warm',last:'10.05',age:'12d',kind:'Leverandør',next:'Bekreft mai-leveranse'},
    {name:'NLR Rogaland',type:'Forskning · feltforsøk',temp:'warm',last:'14.05',age:'8d',kind:'Samarbeid',next:'Avtal befaring uke 23'},
    {name:'Lervig',type:'Bryggeri',temp:'lukewarm',last:'28.04',age:'24d',kind:'Leverandør',next:'Følg opp mash-tilgang'},
    {name:'Statsforvalteren Rogaland',type:'Offentlig · søknad',temp:'warm',last:'06.05',age:'16d',kind:'Finansiering',next:'Avventer svar'},
    {name:'Gartnerbutikken',type:'B2B · forhandler',temp:'cold',last:'02.04',age:'50d',kind:'Prospekt',next:'Ny utreach med ALS-data'},
    {name:'Smartvekst',type:'B2B · forhandler',temp:'cold',last:'22.03',age:'61d',kind:'Prospekt',next:'Reaktiver etter Dyrkeland'},
  ],
  tasks:[
    {title:'Send Dyrkeland revidert pristilbud',assignee:'Martin',priority:'kritisk',due:'2026-05-22',status:'active',project:'Dyrkeland-pilot',notes:'Habiba har utkast'},
    {title:'Konvertere ALS-rapport til kundenpager',assignee:'Martin',priority:'høy',due:'2026-05-22',status:'active',project:'ALS-rapport rollout',notes:''},
    {title:'Sjekke pH og fukt i CFT2',assignee:'Mathias',priority:'høy',due:'2026-05-22',status:'active',project:'',notes:'Daglig rutine'},
    {title:'Ring RYGR om mai-leveranse',assignee:'Martin',priority:'kritisk',due:'2026-05-25',status:'active',project:'',notes:'Bryggermask må sikres innen onsdag'},
    {title:'Pakke 5 D2C-ordre fra helgen',assignee:'Mathias',priority:'middels',due:'2026-05-23',status:'active',project:'',notes:''},
    {title:'Forberede materialer til NLR-befaring',assignee:'Martin',priority:'middels',due:'2026-05-26',status:'active',project:'NLR feltforsøk',notes:'Presentasjon + ALS-rapport'},
    {title:'Oppdatere Instagram med batch 2026-007',assignee:'Martin',priority:'lav',due:'2026-05-24',status:'active',project:'ALS-rapport rollout',notes:''},
    {title:'Vending forkompost batch 2026-008',assignee:'Mathias',priority:'høy',due:'2026-05-23',status:'active',project:'VermiCast 008',notes:'Dag 10'},
    {title:'Sende mai-fakturering til Habiba',assignee:'Martin',priority:'middels',due:'2026-06-02',status:'active',project:'',notes:''},
    {title:'Oppdatere SOP-001 med mycelium-justering',assignee:'Martin',priority:'lav',due:'2026-06-15',status:'backlog',project:'Pre-kompost optimalisering',notes:''},
    {title:'Identifisere 3 VCT-pilotpartnere',assignee:'Martin',priority:'lav',due:'2026-06-30',status:'backlog',project:'VCT-pilot forberedelse',notes:''},
  ],
  projects:[
    {name:'Dyrkeland-pilot',status:'aktiv',progress:70,partner:'Dyrkeland',dueDate:'2026-05-31',nextMilestone:'Lukk 40×20L ordre',notes:'Avgjørende for mai-måltal'},
    {name:'ALS-rapport rollout',status:'aktiv',progress:40,partner:'D2C + forhandlere',dueDate:'2026-05-25',nextMilestone:'Énpager publisert',notes:''},
    {name:'NLR feltforsøk',status:'aktiv',progress:20,partner:'NLR Rogaland',dueDate:'2026-08-30',nextMilestone:'Befaring uke 23',notes:'Bygger forskningskredibilitet'},
    {name:'Statsforvalteren-søknad',status:'venter',progress:90,partner:'Statsforvalteren',dueDate:'2026-06-15',nextMilestone:'Svar fra saksbehandler',notes:'Søknad sendt 06.05'},
    {name:'VCT-pilot forberedelse',status:'planlagt',progress:5,partner:'Lokale dyrkere',dueDate:'2026-09-30',nextMilestone:'Identifisere 3 pilotpartnere',notes:'Etter Dyrkeland'},
    {name:'Pre-kompost optimalisering',status:'pågående',progress:60,partner:'—',dueDate:'',nextMilestone:'SOP-revisjon med ny formel',notes:'Intern, kontinuerlig'},
    {name:'VermiCast 2026-008 produksjon',status:'aktiv',progress:30,partner:'—',dueDate:'2026-06-12',nextMilestone:'Forkompost ferdig dag 14',notes:''},
  ],
  sops:[
    {code:'SOP-001',title:'Pre-kompostering',category:'Produksjon',version:'1.0',lastReviewed:'2026-03-15',owner:'Martin',status:'aktiv'},
    {code:'SOP-01B',title:'Pre-kompostering — variabel mycelium',category:'Produksjon',version:'1.0',lastReviewed:'2026-03-15',owner:'Martin',status:'aktiv'},
    {code:'SOP-02',title:'Wedge System Management',category:'Produksjon',version:'1.0',lastReviewed:'2026-03-15',owner:'Mathias',status:'aktiv'},
    {code:'SOP-02C',title:'Pre-kompostering prosessflyt',category:'Produksjon',version:'1.0',lastReviewed:'2026-03-15',owner:'Martin',status:'aktiv'},
    {code:'SOP-03',title:'Produksjon — wedge feeding flow',category:'Produksjon',version:'1.0',lastReviewed:'2026-03-15',owner:'Mathias',status:'aktiv'},
    {code:'SOP-04',title:'Høsting, screening & bagging',category:'Produksjon',version:'1.0',lastReviewed:'2026-03-15',owner:'Mathias',status:'aktiv'},
    {code:'DD-01',title:'Daglig drift — gjøremål',category:'Drift',version:'1.0',lastReviewed:'2026-04-01',owner:'Martin',status:'aktiv'},
    {code:'KS-01',title:'Batch-sporing & traceability',category:'Kvalitet',version:'1.0',lastReviewed:'2026-03-20',owner:'Martin',status:'aktiv'},
    {code:'KS-02',title:'ALS-rapport tolkning',category:'Kvalitet',version:'1.0',lastReviewed:'2026-04-10',owner:'Martin',status:'revisjon'},
    {code:'OF-01',title:'D2C-ordrebehandling',category:'Drift',version:'0.9',lastReviewed:'2026-04-22',owner:'Habiba',status:'aktiv'},
  ],
  events:[
    {date:'2026-05-22',time:'14:00',title:'Fuktsjekk CFT2',type:'produksjon',who:'Mathias',notes:''},
    {date:'2026-05-23',time:'09:00',title:'Ring RYGR — mai-leveranse',type:'leveranse',who:'Martin',notes:''},
    {date:'2026-05-23',time:'14:00',title:'Vending forkompost batch 008',type:'produksjon',who:'Mathias',notes:'Dag 10'},
    {date:'2026-05-25',time:'12:00',title:'Frist: Bestille bryggermask',type:'frist',who:'Martin',notes:''},
    {date:'2026-05-27',time:'10:00',title:'NLR-befaring på anlegget',type:'møte',who:'Martin',notes:'Jæren · NLR Rogaland-team'},
    {date:'2026-05-29',time:'',title:'Lamamøkk-leveranse',type:'leveranse',who:'Mathias',notes:'~150 kg'},
    {date:'2026-06-02',time:'14:00',title:'Mai-rapport til Habiba',type:'møte',who:'Martin',notes:'Fakturering + regnskap'},
    {date:'2026-06-03',time:'',title:'Mycelium-leveranse',type:'leveranse',who:'Mathias',notes:'~80 kg'},
  ],
  compass:{
    week:21, focus:'Lukke Dyrkeland-ordren og distribuere ALS-rapport som kundeenpager.',
    pillars:[
      {name:'Salg',focus:'Lukke Dyrkeland\n40 × 20L'},
      {name:'Produksjon',focus:'Frigi batch\n2026-007'},
      {name:'Råstoff',focus:'Sikre RYGR\njuni-leveranse'},
      {name:'Innhold',focus:'ALS-énpager +\nInstagram-post'},
    ],
    activePillar:0, energy:4,
    decisions:[
      {text:'Holder Dyrkeland-pris uendret tross økt fraktkost — verdien ligger i premium-posisjonering, ikke marginal pris.',date:'20.05'},
      {text:'Utsetter nytt sifte-utstyr til etter Dyrkeland-betaling. Cashflow før kapasitet.',date:'21.05'},
    ],
    wins:[
      'Statsforvalteren bekreftet mottak av søknad.',
      'Mathias løste fukt-problem i CFT2 alene — ikke ringt Martin.',
      'Tre D2C-bestillinger uten markedsføring — søkemotorene fanger opp.',
    ],
    lessons:[
      'Onsdag gir høyere B2B-svarrate enn mandag eller fredag.',
      'ALS-rapporten må sendes ut samme dag som den kommer — venting fjerner momentum.',
    ],
  },
  quote:{text:'Kvalitet må holde seg foran skala. Struktur skal gradvis erstatte improvisasjon. Partnerskap skal bygges før de trengs.',source:'— Verminord Strategic Map · v1'},
};

function deepMerge(target,source){if(typeof source!=='object'||source===null)return target;if(Array.isArray(source))return source;const out={...target};for(const key in source){if(typeof source[key]==='object'&&source[key]!==null&&!Array.isArray(source[key])&&typeof target[key]==='object'&&target[key]!==null&&!Array.isArray(target[key])){out[key]=deepMerge(target[key],source[key]);}else{out[key]=source[key];}}return out;}
function setByPath(obj,path,value){const keys=path.split('.');if(Array.isArray(obj)){const result=[...obj];const idx=parseInt(keys[0],10);if(keys.length===1)result[idx]=value;else result[idx]=setByPath(obj[idx],keys.slice(1).join('.'),value);return result;}const result={...obj};const k=keys[0];if(keys.length===1)result[k]=value;else result[k]=setByPath(obj[k]!=null?obj[k]:{},keys.slice(1).join('.'),value);return result;}
function storageGet(key){try{const v=localStorage.getItem(key);return v?JSON.parse(v):null;}catch(e){return null;}}
function storageSet(key,val){try{localStorage.setItem(key,JSON.stringify(val));if(key===KEY_DATA&&typeof window.__vnSyncToSupabase==='function'){try{window.__vnSyncToSupabase(val);}catch(e){console.warn('sync err',e);}}return true;}catch(e){return false;}}
function storageDelete(key){try{localStorage.removeItem(key);return true;}catch(e){return false;}}

function parseDate(iso){if(!iso)return null;const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m)return null;return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));}
function parseDateTime(date,time){const d=parseDate(date);if(!d)return null;if(time&&time!=='—'){const m=String(time).match(/^(\d{1,2}):(\d{2})/);if(m)d.setHours(Number(m[1]),Number(m[2])||0);}return d;}
function startOfDay(d){const x=new Date(d);x.setHours(0,0,0,0);return x;}
function daysBetween(a,b){return Math.round((startOfDay(b).getTime()-startOfDay(a).getTime())/86400000);}
const WD=['Søn','Man','Tir','Ons','Tor','Fre','Lør'];
function formatDayLabel(iso,now){const d=parseDate(iso);if(!d)return '—';const diff=daysBetween(now,d);if(diff===0)return 'I dag';if(diff===1)return 'I morgen';if(diff===-1)return 'I går';if(diff<0&&diff>=-7)return 'Forfalt '+(-diff)+'d';if(diff<0)return 'Forfalt '+Math.floor(-diff/7)+'u';if(diff<7)return WD[d.getDay()]+' '+String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0');return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0');}
function formatTimeUntil(date,time,now){const target=parseDateTime(date,time);if(!target)return '';const ms=target.getTime()-now.getTime();if(ms<0)return 'Forbi';const days=Math.floor(ms/86400000);const hours=Math.floor((ms%86400000)/3600000);const mins=Math.floor((ms%3600000)/60000);if(days>1)return 'Om '+days+' dager';if(days===1)return 'I morgen';if(hours>0)return 'Om '+hours+' t '+(mins>0?mins+' min':'');if(mins>1)return 'Om '+mins+' min';return 'Nå';}
function formatReviewAge(iso,now){const d=parseDate(iso);if(!d)return {label:'—',color:C.navy60};const days=daysBetween(d,now);if(days<30)return {label:'For '+days+' dgr',color:C.sage};if(days<90)return {label:'For '+Math.floor(days/30)+' mnd',color:C.sage};if(days<180)return {label:'For '+Math.floor(days/30)+' mnd',color:C.gold};return {label:'For '+Math.floor(days/30)+' mnd',color:C.rust};}
function formatRelative(iso){if(!iso)return null;const diff=(Date.now()-new Date(iso).getTime())/1000;if(diff<30)return 'akkurat nå';if(diff<60)return Math.floor(diff)+' sek siden';if(diff<3600)return Math.floor(diff/60)+' min siden';if(diff<86400)return Math.floor(diff/3600)+' t siden';return Math.floor(diff/86400)+' d siden';}

const tagColor=(t)=>t==='urgent'?C.rust:t==='warm'?C.gold:C.navy60;
const tempColor=(t)=>({hot:C.rust,warm:C.gold,lukewarm:C.graphite,cold:C.navy40}[t]||C.navy60);
const tempLabel=(t)=>({hot:'Het',warm:'Varm',lukewarm:'Lunken',cold:'Kald'}[t]||'Velg');
const tagLabel=(t)=>({urgent:'Akutt',warm:'Innhold',neutral:'Notat'}[t]||'Notat');
const orderStatusColor=(s)=>({utkast:C.navy60,bekreftet:C.gold,pakket:C.gold,sendt:C.sage,betalt:C.sage,levert:C.sage}[s]||C.navy60);
const orderStatusLabel=(s)=>({utkast:'Utkast',bekreftet:'Bekreftet',pakket:'Pakket',sendt:'Sendt',betalt:'Betalt',levert:'Levert'}[s]||s);
const stageColor=(s)=>({planlagt:C.navy60,kontaktet:C.gold,aktiv:C.sage,pause:C.navy40}[s]||C.navy60);
const stageLabel=(s)=>({planlagt:'Planlagt',kontaktet:'Kontaktet',aktiv:'Aktiv',pause:'Pause'}[s]||s);
const deliveryColor=(s)=>({planlagt:C.navy60,bekreftet:C.gold,venter:C.graphite,mottatt:C.sage}[s]||C.navy60);
const deliveryLabel=(s)=>({planlagt:'Planlagt',bekreftet:'Bekreftet',venter:'Venter',mottatt:'Mottatt'}[s]||s);
const priorityColor=(p)=>({kritisk:C.rust,høy:C.gold,middels:C.ink,lav:C.navy60}[p]||C.navy60);
const priorityLabel=(p)=>({kritisk:'Kritisk',høy:'Høy',middels:'Middels',lav:'Lav'}[p]||p);
const taskStatusColor=(s)=>({backlog:C.navy60,active:C.ink,blocked:C.rust,done:C.sage}[s]||C.navy60);
const taskStatusLabel=(s)=>({backlog:'Backlog',active:'Aktiv',blocked:'Blokkert',done:'Ferdig'}[s]||s);
const projectStatusColor=(s)=>({planlagt:C.navy60,aktiv:C.ink,pågående:C.ink,venter:C.gold,levert:C.sage,pause:C.navy40}[s]||C.navy60);
const projectStatusLabel=(s)=>({planlagt:'Planlagt',aktiv:'Aktiv',pågående:'Pågående',venter:'Venter',levert:'Levert',pause:'Pause'}[s]||s);
const sopStatusColor=(s)=>({aktiv:C.sage,revisjon:C.gold,utdatert:C.rust,utkast:C.navy60}[s]||C.navy60);
const sopStatusLabel=(s)=>({aktiv:'Aktiv',revisjon:'Under revisjon',utdatert:'Utdatert',utkast:'Utkast'}[s]||s);
const eventTypeColor=(t)=>({møte:C.ink,leveranse:C.gold,frist:C.rust,produksjon:C.sage,personlig:C.navy60}[t]||C.navy60);
const eventTypeLabel=(t)=>({møte:'Møte',leveranse:'Leveranse',frist:'Frist',produksjon:'Produksjon',personlig:'Personlig'}[t]||t);
const feedColor=(days)=>days<=7?C.rust:days<=14?C.gold:C.ink;
const feedPct=(days)=>Math.max(4,Math.min(100,(days/30)*100));
const nbsp=(n)=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'\u00A0');

function Editable({value,onSave,multiline,type,style,formatter,placeholder,minWidth}){
  type=type||'text';placeholder=placeholder||'—';minWidth=minWidth||40;
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(value==null?'':String(value));
  const inputRef=useRef(null);
  const committedRef=useRef(false);
  const autoSaveTimer=useRef(null);
  useEffect(()=>{setDraft(value==null?'':String(value));},[value]);
  useEffect(()=>{if(editing&&inputRef.current){inputRef.current.focus();try{inputRef.current.select();}catch(e){}}},[editing]);
  // Cleanup auto-save timer on unmount
  useEffect(()=>()=>{if(autoSaveTimer.current)clearTimeout(autoSaveTimer.current);},[]);
  const commit=()=>{if(committedRef.current)return;committedRef.current=true;if(autoSaveTimer.current)clearTimeout(autoSaveTimer.current);const parsed=type==='number'?(Number(draft)||0):draft;if(parsed!==value)onSave(parsed);setEditing(false);setTimeout(()=>{committedRef.current=false;},50);};
  const cancel=()=>{setDraft(value==null?'':String(value));setEditing(false);};
  // Auto-save on typing — guarantees edit persists even if user refreshes before blurring
  const handleChange=(e)=>{
    const v=e.target.value;
    setDraft(v);
    if(autoSaveTimer.current)clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current=setTimeout(()=>{
      const parsed=type==='number'?(Number(v)||0):v;
      if(parsed!==value)onSave(parsed);
    },600);
  };
  const inputStyle={...style,background:C.goldSoft,border:'none',borderBottom:'1px solid '+C.gold,outline:'none',fontFamily:style&&style.fontFamily?style.fontFamily:'inherit',padding:'1px 4px',margin:'-1px -4px',width:multiline?'100%':'auto',minWidth,boxSizing:'content-box',resize:'none',color:'inherit'};
  if(editing){
    if(multiline){
      return <textarea ref={inputRef} value={draft} onChange={handleChange} onBlur={commit} onKeyDown={(e)=>{if(e.key==='Escape'){e.preventDefault();cancel();}if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();commit();}}} rows={Math.max(2,draft.split('\n').length)} style={{...inputStyle,lineHeight:'inherit'}}/>;
    }
    return <input ref={inputRef} type="text" value={draft} onChange={handleChange} onBlur={commit} onKeyDown={(e)=>{if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape'){e.preventDefault();cancel();}}} style={inputStyle}/>;
  }
  const dv=value==null||value===''?placeholder:(formatter?formatter(value):value);
  return <span className="vn-editable" onClick={(e)=>{e.stopPropagation();setEditing(true);}} style={{...style,cursor:'text',display:multiline?'block':'inline-block',whiteSpace:multiline?'pre-line':'normal'}}>{dv}</span>;
}

function Picker({value,onChange,options,getColor,getLabel,sizeCompact}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{function h(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}if(open)document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);},[open]);
  const fs=sizeCompact?10:11; const ls=sizeCompact?'0.14em':'0.08em'; const ds=sizeCompact?4:8;
  return (
    <div ref={ref} style={{position:'relative',display:'inline-block'}}>
      <button onClick={()=>setOpen(!open)} className="vn-mono vn-editable" style={{background:'none',border:'none',display:'inline-flex',alignItems:'center',gap:sizeCompact?6:8,fontSize:fs,letterSpacing:ls,textTransform:'uppercase',color:getColor(value),fontFamily:'inherit',padding:0,cursor:'pointer'}}>
        <span style={{width:ds,height:ds,borderRadius:'50%',background:getColor(value),border:value==='cold'?'1px solid '+C.navy60:'none',boxSizing:'border-box'}}></span>
        {getLabel(value)}
      </button>
      {open&&(
        <div style={{position:'absolute',top:'100%',left:0,marginTop:6,background:C.creamPaper,border:'1px solid '+C.hairline,boxShadow:'0 4px 12px rgba(21,35,58,0.08)',zIndex:50,minWidth:140}}>
          {options.map((o)=>(
            <button key={o} onClick={()=>{onChange(o);setOpen(false);}} className="vn-mono" style={{display:'flex',alignItems:'center',gap:sizeCompact?6:8,padding:'8px 14px',width:'100%',background:o===value?C.goldSoft:'none',border:'none',fontSize:fs,letterSpacing:ls,textTransform:'uppercase',color:getColor(o),fontFamily:'inherit',textAlign:'left',cursor:'pointer'}}>
              <span style={{width:ds,height:ds,borderRadius:'50%',background:getColor(o),border:o==='cold'?'1px solid '+C.navy60:'none',boxSizing:'border-box'}}></span>
              {getLabel(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TempPicker=({value,onChange})=><Picker value={value} onChange={onChange} options={['hot','warm','lukewarm','cold']} getColor={tempColor} getLabel={tempLabel}/>;
const TagPicker=({value,onChange})=><Picker value={value} onChange={onChange} options={['urgent','warm','neutral']} getColor={tagColor} getLabel={tagLabel} sizeCompact/>;
const OrderStatusPicker=({value,onChange})=><Picker value={value} onChange={onChange} options={['utkast','bekreftet','pakket','sendt','levert','betalt']} getColor={orderStatusColor} getLabel={orderStatusLabel}/>;
const StagePicker=({value,onChange})=><Picker value={value} onChange={onChange} options={['planlagt','kontaktet','aktiv','pause']} getColor={stageColor} getLabel={stageLabel}/>;
const DeliveryStatusPicker=({value,onChange})=><Picker value={value} onChange={onChange} options={['planlagt','bekreftet','venter','mottatt']} getColor={deliveryColor} getLabel={deliveryLabel}/>;
const PriorityPicker=({value,onChange})=><Picker value={value} onChange={onChange} options={['kritisk','høy','middels','lav']} getColor={priorityColor} getLabel={priorityLabel} sizeCompact/>;
const TaskStatusPicker=({value,onChange})=><Picker value={value} onChange={onChange} options={['backlog','active','blocked','done']} getColor={taskStatusColor} getLabel={taskStatusLabel}/>;
const ProjectStatusPicker=({value,onChange})=><Picker value={value} onChange={onChange} options={['planlagt','aktiv','pågående','venter','levert','pause']} getColor={projectStatusColor} getLabel={projectStatusLabel}/>;
const SopStatusPicker=({value,onChange})=><Picker value={value} onChange={onChange} options={['aktiv','revisjon','utdatert','utkast']} getColor={sopStatusColor} getLabel={sopStatusLabel}/>;
const EventTypePicker=({value,onChange})=><Picker value={value} onChange={onChange} options={['møte','leveranse','frist','produksjon','personlig']} getColor={eventTypeColor} getLabel={eventTypeLabel} sizeCompact/>;

function Sparkline({data}){
  const W=320,H=70;
  if(!data||data.length<2)return <div style={{height:H}}></div>;
  const max=Math.max(...data),min=Math.min(...data);
  const range=max-min||1;
  const pts=data.map((v,i)=>[(i/(data.length-1))*W,H-8-((v-min)/range)*(H-16)]);
  const path=pts.map((p,i)=>(i===0?'M'+p[0]+','+p[1]:'L'+p[0]+','+p[1])).join(' ');
  const area=path+' L'+W+','+H+' L0,'+H+' Z';
  const endX=pts[pts.length-1][0],endY=pts[pts.length-1][1];
  return (
    <svg viewBox={'0 0 '+W+' '+H} width="100%" height={H} preserveAspectRatio="none" style={{display:'block',margin:'8px 0 22px'}}>
      <defs><linearGradient id="sparkFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.navy} stopOpacity="0.15"/><stop offset="100%" stopColor={C.navy} stopOpacity="0"/></linearGradient></defs>
      <path d={area} fill="url(#sparkFade)"/>
      <path d={path} fill="none" stroke={C.navy} strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx={endX} cy={endY} r="3" fill={C.gold}/>
    </svg>
  );
}

function BrandMark(){return <svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13.5" fill="none" stroke={C.ink} strokeWidth="1.5"/><circle cx="15" cy="15" r="6.5" fill="none" stroke={C.ink} strokeWidth="1.5"/><circle cx="15" cy="15" r="2.5" fill={C.ink}/></svg>;}
function Ornament(){return <div style={{display:'flex',justifyContent:'center',padding:'40px 0 8px'}}><svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1 L13 7 L7 13 L1 7 Z" fill={C.gold}/></svg></div>;}

function PageHero({eyebrow,headline,subhead,intro,onSave,rightContent}){
  return (
    <section className="vn-hero vn-rise" style={{padding:'72px 0 64px',borderBottom:'1px solid '+C.hairline,display:'grid',gridTemplateColumns:'1.15fr 1fr',gap:80,alignItems:'end'}}>
      <div>
        <Editable value={eyebrow} onSave={(v)=>onSave('eyebrow',v)} style={{...T.eyebrow,display:'inline-block'}}/>
        <h1 style={{...T.heroHead,margin:'22px 0 22px',maxWidth:580}}>
          <Editable value={headline} onSave={(v)=>onSave('headline',v)} style={T.heroHead}/><br/>
          <span style={T.heroSub}><Editable value={subhead} onSave={(v)=>onSave('subhead',v)} style={T.heroSub}/></span>
        </h1>
        <Editable value={intro} onSave={(v)=>onSave('intro',v)} multiline style={{...T.heroBody,maxWidth:480,display:'block'}}/>
      </div>
      <div className="vn-hero-right" style={{borderLeft:'1px solid '+C.hairline,paddingLeft:56}}>{rightContent}</div>
    </section>
  );
}

function AddRow({onClick,label}){
  return <button onClick={onClick} className="vn-mono" style={{display:'block',width:'100%',textAlign:'left',padding:'14px 28px',background:'none',border:'none',borderTop:'1px solid '+C.hairline,fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:C.navy60,cursor:'pointer',fontFamily:'inherit',transition:'background 0.15s, color 0.15s'}} onMouseEnter={(e)=>{e.currentTarget.style.background=C.goldSoft;e.currentTarget.style.color=C.gold;}} onMouseLeave={(e)=>{e.currentTarget.style.background='none';e.currentTarget.style.color=C.navy60;}}>+ {label}</button>;
}

function SectionHead({title,meta}){
  return (
    <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',margin:'64px 0 28px'}}>
      <h2 style={{...T.section,margin:0}}>{title}</h2>
      <div style={{flex:1,height:1,background:C.hairline,margin:'0 24px'}}></div>
      {meta&&<span style={T.metaMono}>{meta}</span>}
    </div>
  );
}

function Panel({title,link,children,className,minH}){
  return (
    <div className={className} style={{border:'1px solid '+C.hairline,background:C.creamPaper,padding:28,minHeight:minH||320,display:'flex',flexDirection:'column'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:22,paddingBottom:16,borderBottom:'1px solid '+C.hairline}}>
        <span style={T.panel}>{title}</span>
        {typeof link==='string'?<a className="vn-mono" style={{fontSize:10,color:C.navy60,textDecoration:'none',letterSpacing:'0.06em',cursor:'pointer'}}>{link}</a>:link}
      </div>
      {children}
    </div>
  );
}

function Stat({value,label,color}){return <div style={{borderTop:'1px solid '+C.hairline,paddingTop:14}}><div style={{...T.statNum,color:color||C.ink}}>{value}</div><div style={T.statLbl}>{label}</div></div>;}
function EditableStat({value,onSave,label,formatter}){return <div style={{borderTop:'1px solid '+C.hairline,paddingTop:14}}><Editable value={value} onSave={onSave} type="number" formatter={formatter} style={T.statNum}/><div style={T.statLbl}>{label}</div></div>;}
function PulseCard({label,value,sub,accent,small}){
  return <div style={{border:'1px solid '+C.hairline,background:C.creamPaper,padding:'22px 22px 20px',borderTop:'2px solid '+(accent||C.ink)}}>
    <div style={{...T.monoLbl,marginBottom:12,letterSpacing:'0.16em'}}>{label}</div>
    <div style={{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:500,fontSize:small?18:32,lineHeight:1.15,letterSpacing:'-0.015em',color:accent||C.ink,marginBottom:6,whiteSpace:small?'nowrap':'normal',overflow:small?'hidden':'visible',textOverflow:small?'ellipsis':'clip'}}>{value}</div>
    {sub&&<div style={{...T.metaMono,fontSize:11}}>{sub}</div>}
  </div>;
}

function RevenueProgress({data,update}){
  const pct=data.sales.target>0?(data.sales.mtd/data.sales.target)*100:0;
  const pace=pct>=60?{label:'På sporet',color:C.sage}:pct>=40?{label:'Like under takt',color:C.gold}:{label:'Bak skjema',color:C.rust};
  return (
    <div>
      <div style={{...T.monoLbl,marginBottom:18,letterSpacing:'0.22em'}}>Omsetning hittil i mai</div>
      <div style={{display:'flex',alignItems:'baseline',gap:14}}>
        <Editable value={data.sales.mtd} onSave={(v)=>update('sales.mtd',v)} type="number" formatter={(v)=>nbsp(v)} style={T.bigNum}/>
        <span style={{fontSize:18,fontWeight:400,color:C.navy60,letterSpacing:'0.04em'}}>NOK</span>
      </div>
      <div style={{...T.metaMono,marginTop:10}}>
        Mål <Editable value={data.sales.target} onSave={(v)=>update('sales.target',v)} type="number" formatter={(v)=>nbsp(v)} style={T.metaMono}/> NOK · <Editable value={data.sales.daysLeft} onSave={(v)=>update('sales.daysLeft',v)} type="number" style={T.metaMono}/> dager igjen
      </div>
      <div style={{marginTop:24,height:4,background:C.navy08,position:'relative',overflow:'hidden'}}>
        <div style={{height:'100%',width:Math.min(100,pct)+'%',background:C.ink,position:'relative'}}>
          <span style={{position:'absolute',right:0,top:-3,width:1,height:10,background:C.ink}}></span>
        </div>
      </div>
      <div style={{...T.metaMono,display:'flex',justifyContent:'space-between',marginTop:12}}>
        <span>{pct.toFixed(1).replace('.',',')} % av månedsmål</span>
        <span style={{color:pace.color,fontWeight:500}}>{pace.label}</span>
      </div>
    </div>
  );
}

function Settings({open,onClose,onReset,onExport,onImport}){
  const fileInputRef=useRef(null);
  if(!open)return null;
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(10,20,36,0.4)',zIndex:100,display:'flex',alignItems:'flex-start',justifyContent:'flex-end'}}>
      <div onClick={(e)=>e.stopPropagation()} style={{background:C.creamPaper,width:380,maxWidth:'92vw',height:'100vh',padding:'32px',borderLeft:'1px solid '+C.hairline,overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:32}}>
          <h3 style={{...T.eyebrow,margin:0,fontWeight:500}}>Innstillinger</h3>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:C.navy60,padding:0,lineHeight:1}}>×</button>
        </div>
        <div style={{marginBottom:36}}>
          <div style={{...T.monoLbl,marginBottom:16,letterSpacing:'0.22em'}}>Data</div>
          <button onClick={onExport} style={{display:'block',width:'100%',textAlign:'left',padding:'14px 0',background:'none',border:'none',borderTop:'1px solid '+C.hairline,cursor:'pointer',fontFamily:'inherit'}}>
            <div style={{fontSize:14,fontWeight:500,color:C.ink,marginBottom:2}}>Last ned backup (.json)</div>
            <div style={{fontSize:12,color:C.graphite,lineHeight:1.4}}>Hele kommandosentralen som JSON.</div>
          </button>
          <button onClick={()=>fileInputRef.current&&fileInputRef.current.click()} style={{display:'block',width:'100%',textAlign:'left',padding:'14px 0',background:'none',border:'none',borderTop:'1px solid '+C.hairline,cursor:'pointer',fontFamily:'inherit'}}>
            <div style={{fontSize:14,fontWeight:500,color:C.ink,marginBottom:2}}>Importer fra fil</div>
            <div style={{fontSize:12,color:C.graphite,lineHeight:1.4}}>Erstatter alt nåværende data.</div>
          </button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" style={{display:'none'}} onChange={(e)=>{const f=e.target.files&&e.target.files[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{try{onImport(JSON.parse(ev.target.result));onClose();}catch(err){alert('Kunne ikke lese filen — er det gyldig JSON?');}};r.readAsText(f);e.target.value='';}}/>
          <button onClick={()=>{if(confirm('Tilbakestille til standarddata?'))onReset();}} style={{display:'block',width:'100%',textAlign:'left',padding:'14px 0',background:'none',border:'none',borderTop:'1px solid '+C.hairline,cursor:'pointer',fontFamily:'inherit'}}>
            <div style={{fontSize:14,fontWeight:500,color:C.rust,marginBottom:2}}>Tilbakestill til standard</div>
            <div style={{fontSize:12,color:C.graphite,lineHeight:1.4}}>Sletter alle endringer.</div>
          </button>
        </div>
        <div style={{marginBottom:36}}>
          <div style={{...T.monoLbl,marginBottom:16,letterSpacing:'0.22em'}}>Lagring</div>
          <div style={{fontSize:13,color:C.graphite,lineHeight:1.55,marginBottom:16}}>Data lagres lokalt i nettleseren. Hold filen samme sted.</div>
        </div>
        <div>
          <div style={{...T.monoLbl,marginBottom:16,letterSpacing:'0.22em'}}>Om</div>
          <div style={{...T.metaMono,lineHeight:1.8}}>Verminord AS · 935 948 878<br/>Operativ kommandosentral · v0.6<br/>Jæren, Rogaland</div>
        </div>
      </div>
    </div>
  );
}

function CftBlock({id,cft,path,update}){
  return (
    <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'18px 16px',marginBottom:20,paddingBottom:20,borderBottom:'1px solid '+C.hairline}}>
      <div className="vn-mono" style={{fontSize:11,color:C.navy60,letterSpacing:'0.06em',paddingTop:2}}>{id}</div>
      <div>
        <Editable value={cft.status} onSave={(v)=>update(path+'.status',v)} style={{...T.itemTitle,fontSize:14,marginBottom:5,display:'block'}}/>
        <div className="vn-mono" style={{fontSize:11,color:C.graphite,lineHeight:1.7}}>
          <span style={{color:C.navy60}}>Fôret </span><Editable value={cft.lastFed} onSave={(v)=>update(path+'.lastFed',v)} style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:C.graphite}}/>{' av '}<Editable value={cft.by} onSave={(v)=>update(path+'.by',v)} style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:C.graphite}}/><br/>
          <span style={{color:C.navy60}}>pH </span><Editable value={cft.ph} onSave={(v)=>update(path+'.ph',v)} style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:C.graphite}}/>{' · '}<span style={{color:C.navy60}}>Fukt </span><Editable value={cft.moisture} onSave={(v)=>update(path+'.moisture',v)} style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:C.graphite}}/>{' · '}<span style={{color:C.navy60}}>Temp </span><Editable value={cft.temp} onSave={(v)=>update(path+'.temp',v)} style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:C.graphite}}/>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// OPERASJONELL PULS — live status of Mathias' operations
// Queries 6 tables, surfaces activity + anomalies + overall health
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// PULS CHART — pure SVG line chart for time-series log data
// One line per series (bin/batch). Auto-scales Y, shows 3 dates on X.
// ═══════════════════════════════════════════════════════
const PULS_RANGE_LABEL = {'7d':'SISTE 7D','1m':'SISTE 1M','3m':'SISTE 3M','1y':'SISTE 1Y','all':'ALL TIME'};
const PULS_RANGE_LABEL_LONG = {'7d':'siste 7 dagene','1m':'siste måneden','3m':'siste 3 månedene','1y':'siste året','all':'hele historikken'};
const PULS_RANGE_DAYS = {'7d':7,'1m':30,'3m':90,'1y':365,'all':null};

// Biologically plausible ranges — anything outside these is treated as a slider slip / typo.
function isPlausible(val, metricKey){
  if(val==null||isNaN(val)) return false;
  if(metricKey==='temperatur_c') return val>=5 && val<=80;
  if(metricKey==='ph') return val>=3 && val<=14;
  if(metricKey==='fuktighet_pct') return val>=5 && val<=100;
  return true;
}

function PulsChart({seriesByName, metricKey, height}){
  const H=height||200;
  const W=560;
  const pl=42,pr=14,pt=12,pb=32;
  const innerW=W-pl-pr;
  const innerH=H-pt-pb;
  // 7 distinct colors so we don't wrap with 6+ series
  const colors=[C.ink,C.gold,C.sage,C.rust,C.graphite,'#8B6914','#4A6B3F'];

  // Collect all valid (plausible) points across series
  const allPts=[];
  Object.values(seriesByName).forEach(pts=>{
    pts.forEach(p=>{ if(isPlausible(p.y,metricKey)) allPts.push(p); });
  });

  if(allPts.length===0){
    return null;
  }

  const xs=allPts.map(p=>new Date(p.x).getTime());
  const ys=allPts.map(p=>p.y);
  const xMin=Math.min(...xs);
  const xMax=Math.max(...xs);
  const xRange=Math.max(1,xMax-xMin);
  const yMin=Math.min(...ys);
  const yMax=Math.max(...ys);
  const yPad=Math.max(0.5,(yMax-yMin)*0.12);
  let yLow=yMin-yPad;
  let yHigh=yMax+yPad;
  // Never show negative axis for temp/moisture/pH (all non-negative quantities)
  if(metricKey==='temperatur_c'||metricKey==='fuktighet_pct'||metricKey==='ph') yLow=Math.max(0,yLow);
  // For pH cap top at 14 + small headroom
  if(metricKey==='ph') yHigh=Math.min(14.5,yHigh);
  const yRange=Math.max(0.1,yHigh-yLow);

  const xToPx=x=>pl+((new Date(x).getTime()-xMin)/xRange)*innerW;
  const yToPx=y=>pt+innerH-((y-yLow)/yRange)*innerH;

  const fmtDate=ms=>{
    const d=new Date(ms);
    return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getFullYear()).slice(-2);
  };
  const yDecimals=metricKey==='ph'?1:0;
  const yLabels=[yLow,(yLow+yHigh)/2,yHigh];
  const xLabels=xMin===xMax?[xMin]:[xMin,(xMin+xMax)/2,xMax];

  return (
    <svg viewBox={'0 0 '+W+' '+H} width="100%" height={H} preserveAspectRatio="xMidYMid meet" style={{display:'block',overflow:'visible'}}>
      {/* Horizontal grid lines */}
      {yLabels.map((y,i)=>(
        <line key={'g'+i} x1={pl} x2={W-pr} y1={yToPx(y)} y2={yToPx(y)} stroke={C.hairline} strokeWidth="0.5"/>
      ))}
      {/* Y axis labels */}
      {yLabels.map((y,i)=>(
        <text key={'y'+i} x={pl-6} y={yToPx(y)+3} fontSize="9" fill={C.navy60} textAnchor="end" fontFamily='"IBM Plex Mono", monospace'>
          {y.toFixed(yDecimals)}
        </text>
      ))}
      {/* X axis labels */}
      {xLabels.map((x,i)=>(
        <text key={'x'+i} x={xToPx(x)} y={H-10} fontSize="9" fill={C.navy60}
          textAnchor={xLabels.length===1?'middle':(i===0?'start':i===xLabels.length-1?'end':'middle')}
          fontFamily='"IBM Plex Mono", monospace'>
          {fmtDate(x)}
        </text>
      ))}
      {/* Lines + dots per series */}
      {Object.entries(seriesByName).map(([name,points],idx)=>{
        const validPts=[...points].filter(p=>isPlausible(p.y,metricKey)).sort((a,b)=>new Date(a.x).getTime()-new Date(b.x).getTime());
        if(validPts.length===0) return null;
        const color=colors[idx%colors.length];
        const dash=idx===1?'5,3':(idx===2?'1,3':(idx===3?'8,2,2,2':'none'));
        if(validPts.length===1){
          const p=validPts[0];
          return <circle key={name} cx={xToPx(p.x)} cy={yToPx(p.y)} r="3.5" fill={color}/>;
        }
        const path=validPts.map((p,i)=>(i===0?'M':'L')+xToPx(p.x).toFixed(1)+','+yToPx(p.y).toFixed(1)).join(' ');
        return (
          <g key={name}>
            <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={dash} strokeLinejoin="round" strokeLinecap="round"/>
            {validPts.map((p,i)=>(
              <circle key={i} cx={xToPx(p.x)} cy={yToPx(p.y)} r="1.8" fill={color}/>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function PulsChartPanel({title, dataByGroup, range}){
  const [metric,setMetric]=useState('temperatur_c');
  const METRICS=[
    {key:'temperatur_c',label:'Temp',unit:'°C',dec:1},
    {key:'ph',label:'pH',unit:'',dec:2},
    {key:'fuktighet_pct',label:'Fukt',unit:'%',dec:1},
  ];
  const activeMetric=METRICS.find(m=>m.key===metric);

  // Build series for active metric, prettifying unit names (Hist-Bin-1-2025 → Bin 1)
  const prettify=(name)=>name.replace(/^Hist-/,'').replace(/-2025$/,'').replace(/-/g,' ').replace(/^Bin /,'Bin ').replace(/^Pre Batch /,'Batch ');
  // Sort by observation count desc so biggest series get primary colors
  const sortedEntries=Object.entries(dataByGroup).sort((a,b)=>b[1].length-a[1].length);
  const seriesByName={};
  sortedEntries.forEach(([name,rows])=>{
    const pretty=prettify(name);
    seriesByName[pretty]=rows
      .filter(r=>r[metric]!=null)
      .map(r=>({x:r.dato,y:Number(r[metric])}));
  });

  // Stats use only plausible values (slider slips don't poison min/avg/max)
  const allValues=Object.values(seriesByName).flat()
    .map(p=>p.y)
    .filter(v=>isPlausible(v,metric));
  const min=allValues.length?Math.min(...allValues):null;
  const max=allValues.length?Math.max(...allValues):null;
  const avg=allValues.length?(allValues.reduce((s,v)=>s+v,0)/allValues.length):null;
  const totalPts=allValues.length;

  const colors=[C.ink,C.gold,C.sage,C.rust,C.graphite];

  return (
    <div className="vn-puls-chart" style={{padding:'22px 28px',borderTop:'1px solid '+C.hairline}}>
      <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:12}}>
        <div style={{...T.monoLbl,color:C.navy60}}>{title}</div>
        <div style={{display:'flex',gap:14}}>
          {METRICS.map(m=>(
            <button key={m.key} onClick={()=>setMetric(m.key)} className="vn-mono"
              style={{background:'none',border:'none',padding:'4px 0',fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',
                color:metric===m.key?C.ink:C.navy60,fontWeight:metric===m.key?500:400,
                fontFamily:'inherit',cursor:'pointer',
                borderBottom:'2px solid '+(metric===m.key?C.gold:'transparent'),
                transition:'all .15s'}}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {totalPts===0?(
        <div style={{...T.metaMono,color:C.navy60,fontStyle:'italic',padding:'40px 0',textAlign:'center'}}>
          Ingen {activeMetric.label.toLowerCase()}-data i denne perioden.
        </div>
      ):(
        <>
          <PulsChart seriesByName={seriesByName} metricKey={metric}/>
          {/* Legend + summary stats */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginTop:10,flexWrap:'wrap',gap:14}}>
            <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
              {Object.entries(seriesByName).map(([name,pts],i)=>{
                const color=colors[i%colors.length];
                const dashStyle=i===1?'dashed':(i===2?'dotted':'solid');
                return (
                  <div key={name} style={{display:'flex',alignItems:'center',gap:6,fontSize:11}}>
                    <span style={{width:18,height:0,borderTop:'2px '+dashStyle+' '+color,display:'inline-block'}}></span>
                    <span style={{color:C.ink,fontFamily:'"IBM Plex Mono",monospace'}}>{name}</span>
                    <span style={{color:C.navy60,fontFamily:'"IBM Plex Mono",monospace'}}>· {pts.length} obs</span>
                  </div>
                );
              })}
            </div>
            {avg!=null&&(
              <div style={{display:'flex',gap:18,fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:C.navy60}}>
                <span>Min <b style={{color:C.ink}}>{min.toFixed(activeMetric.dec)}{activeMetric.unit}</b></span>
                <span>Snitt <b style={{color:C.ink}}>{avg.toFixed(activeMetric.dec)}{activeMetric.unit}</b></span>
                <span>Max <b style={{color:C.ink}}>{max.toFixed(activeMetric.dec)}{activeMetric.unit}</b></span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function OperasjonellPuls({now}){
  const [puls,setPuls]=useState(null);
  const [error,setError]=useState(null);
  const [loading,setLoading]=useState(true);
  const [range,setRange]=useState('1m'); // '7d' | '1m' | '3m' | '1y' | 'all'

  const fetchPuls=useCallback(async()=>{
    if(!window.__vnSb){setLoading(false);return;}
    const sb=window.__vnSb;

    // Compute date threshold from range
    const days=PULS_RANGE_DAYS[range];
    const sinceDate=days?new Date(Date.now()-days*86400000).toISOString().slice(0,10):null;
    const queryLimit=range==='all'?5000:(range==='1y'?2000:(range==='3m'?1000:300));

    try{
      let obsQuery=sb.from('wedge_observasjoner').select('*').order('dato',{ascending:false});
      if(sinceDate) obsQuery=obsQuery.gte('dato',sinceDate);
      obsQuery=obsQuery.limit(queryLimit);

      let fkLogQuery=sb.from('forkompost_logg').select('*').order('dato',{ascending:false});
      if(sinceDate) fkLogQuery=fkLogQuery.gte('dato',sinceDate);
      fkLogQuery=fkLogQuery.limit(queryLimit);

      const [obsRes,fkLogRes,tasksRes,lagerRes,hostRes,labRes,batcherRes]=await Promise.all([
        obsQuery,
        fkLogQuery,
        sb.from('oppgaver').select('*').order('updated_at',{ascending:false}),
        sb.from('lager').select('*'),
        sb.from('host_batcher').select('*').order('created_at',{ascending:false}).limit(5),
        sb.from('lab_rapporter').select('*').order('created_at',{ascending:false}).limit(5),
        sb.from('forkompost_batcher').select('*').eq('status','aktiv'),
      ]);

      const obs=obsRes.data||[];
      const fkLogs=fkLogRes.data||[];
      const tasks=tasksRes.data||[];
      const lager=lagerRes.data||[];
      const hosts=hostRes.data||[];
      const labs=labRes.data||[];
      const activeBatcher=batcherRes.data||[];

      const nowMs=Date.now();
      const dayMs=86400000;
      // For events with real timestamps (tasks, lager, hosts, labs)
      const within=(iso,d)=>iso&&(nowMs-new Date(iso).getTime())<=d*dayMs;
      // For observations using `dato` (date-only). null days = no filter (ALLTID).
      const inRange=(datoISO)=>!days||(datoISO&&(nowMs-new Date(datoISO+'T12:00:00').getTime())<=days*dayMs);
      const eventDays=days||365*5; // for non-observation events, large window if ALLTID

      // ── ACTIVITY FEED (filtered by dato for observations, by created_at for events) ──
      const activities=[];

      obs.forEach(o=>{
        if(!inRange(o.dato)) return;
        const parts=[];
        if(o.ph!=null) parts.push('pH '+String(o.ph).replace('.',','));
        if(o.fuktighet_pct!=null) parts.push(Math.round(o.fuktighet_pct)+'%');
        if(o.temperatur_c!=null) parts.push(Math.round(o.temperatur_c)+'°C');
        activities.push({
          ts:o.dato+'T12:00:00',
          who:o.ansvarlig||'Mathias',
          text:'logget '+(o.wedge_id||'wedge'),
          detail:parts.join(' · ')||'observasjon registrert',
          kind:'obs',
        });
      });

      fkLogs.forEach(f=>{
        if(!inRange(f.dato)) return;
        const parts=[];
        if(f.temperatur_c!=null) parts.push(Math.round(f.temperatur_c)+'°C');
        if(f.ph!=null) parts.push('pH '+String(f.ph).replace('.',','));
        if(f.fuktighet_pct!=null) parts.push(Math.round(f.fuktighet_pct)+'%');
        activities.push({
          ts:f.dato+'T12:00:00',
          who:f.ansvarlig||'Mathias',
          text:'forkompost '+(f.batch_id||''),
          detail:parts.join(' · ')||'logget',
          kind:'fk',
        });
      });

      tasks.forEach(t=>{
        if(t.status!=='ferdig')return;
        if(!t.fullfort_at||!within(t.fullfort_at,eventDays))return;
        activities.push({
          ts:t.fullfort_at,
          who:t.ansvarlig||'noen',
          text:'fullførte oppgave',
          detail:'"'+(t.tittel||'').slice(0,50)+(t.tittel&&t.tittel.length>50?'…':'')+'"',
          kind:'task_done',
        });
      });

      lager.forEach(l=>{
        if(!within(l.oppdatert_at,eventDays))return;
        activities.push({
          ts:l.oppdatert_at,
          who:l.oppdatert_av||'noen',
          text:'oppdaterte '+(l.navn||l.vare),
          detail:Math.round(l.prosent)+'% beholdning',
          kind:'lager',
        });
      });

      hosts.forEach(h=>{
        if(!within(h.created_at,eventDays))return;
        activities.push({
          ts:h.created_at,
          who:h.frigitt_av||'noen',
          text:'høstet batch '+h.host_batch_id,
          detail:h.volum_uttatt_liter?h.volum_uttatt_liter+' L uttatt':'',
          kind:'host',
        });
      });

      labs.forEach(lab=>{
        if(!within(lab.created_at,eventDays))return;
        activities.push({
          ts:lab.created_at,
          who:'ALS',
          text:'lab-rapport '+lab.rapport_id,
          detail:lab.tungmetallklasse?'Klasse '+lab.tungmetallklasse:'',
          kind:'lab',
        });
      });

      activities.sort((a,b)=>new Date(b.ts)-new Date(a.ts));
      const recentActivities=activities.slice(0,10);

      // ── ANOMALY DETECTION (always current state, not range-dependent) ──
      const anomalies=[];

      // 1. Stale wedges — only non-historical
      const latestPerWedge={};
      obs.forEach(o=>{
        const k=o.wedge_id;if(!k)return;
        if(!latestPerWedge[k]||o.dato>latestPerWedge[k].dato){
          latestPerWedge[k]=o;
        }
      });
      Object.entries(latestPerWedge).forEach(([wedgeId,latest])=>{
        if(wedgeId.startsWith('Hist-')) return; // skip historisk wedges
        const daysSince=Math.floor((nowMs-new Date(latest.dato+'T12:00:00').getTime())/dayMs);
        if(daysSince>=7){
          anomalies.push({severity:'critical',icon:'🔴',text:wedgeId+' ikke logget på '+daysSince+' dager',context:'Mathias har ikke registrert observasjon nylig'});
        }else if(daysSince>=3){
          anomalies.push({severity:'warning',icon:'⚠',text:wedgeId+' ikke logget på '+daysSince+' dager',context:'Sjekk om alt er bra'});
        }
      });

      // 2. Forkompost temp drops on active batches
      const fkPerBatch={};
      fkLogs.forEach(f=>{
        const k=f.batch_id;if(!k||f.temperatur_c==null)return;
        if(!fkPerBatch[k])fkPerBatch[k]=[];
        fkPerBatch[k].push(f);
      });
      activeBatcher.forEach(b=>{
        const logs=fkPerBatch[b.batch_id]||[];
        if(logs.length<2)return;
        logs.sort((x,y)=>new Date(y.dato)-new Date(x.dato));
        const [newest,prev]=logs;
        const drop=Number(prev.temperatur_c)-Number(newest.temperatur_c);
        if(drop>=5){
          anomalies.push({
            severity:drop>=10?'critical':'warning',
            icon:drop>=10?'🔴':'⚠',
            text:'Forkompost '+b.batch_id+' temp -'+drop.toFixed(1)+'°C',
            context:'Falt fra '+Math.round(prev.temperatur_c)+' til '+Math.round(newest.temperatur_c)+'°C',
          });
        }
      });

      activeBatcher.forEach(b=>{
        const logs=fkPerBatch[b.batch_id]||[];
        if(logs.length===0){
          anomalies.push({severity:'warning',icon:'⚠',text:'Forkompost '+b.batch_id+' uten logg',context:'Aktiv batch men ingen observasjoner ennå'});
          return;
        }
        const newest=logs.sort((x,y)=>new Date(y.dato)-new Date(x.dato))[0];
        const daysSince=Math.floor((nowMs-new Date(newest.dato+'T12:00:00').getTime())/dayMs);
        if(daysSince>=3){
          anomalies.push({severity:daysSince>=7?'critical':'warning',icon:daysSince>=7?'🔴':'⚠',text:'Forkompost '+b.batch_id+' ikke logget på '+daysSince+'d',context:'Aktiv batch trenger oppfølging'});
        }
      });

      // 3. Overdue tasks
      const today=new Date();today.setHours(0,0,0,0);
      const overdue=tasks.filter(t=>t.status!=='ferdig'&&t.frist&&new Date(t.frist)<today);
      if(overdue.length>0){
        anomalies.push({
          severity:overdue.length>=3?'critical':'warning',
          icon:overdue.length>=3?'🔴':'⚠',
          text:overdue.length+' oppgave'+(overdue.length===1?'':'r')+' forfalt',
          context:overdue.slice(0,2).map(t=>'"'+(t.tittel||'').slice(0,30)+'"').join(', ')+(overdue.length>2?'…':''),
        });
      }

      // 4. Low inventory
      lager.forEach(l=>{
        const pct=Number(l.prosent);
        if(pct<=10){
          anomalies.push({severity:'critical',icon:'🔴',text:(l.navn||l.vare)+': '+Math.round(pct)+'%',context:'Bestill omgående'});
        }else if(pct<=15){
          anomalies.push({severity:'warning',icon:'⚠',text:(l.navn||l.vare)+': '+Math.round(pct)+'%',context:'Lav beholdning'});
        }
      });

      // ── OVERALL HEALTH ──
      const critCount=anomalies.filter(a=>a.severity==='critical').length;
      const warnCount=anomalies.filter(a=>a.severity==='warning').length;
      let health='green';
      if(critCount>=1) health='red';
      else if(warnCount>=1) health='yellow';

      const lastActivity=activities[0]||null;

      // ── CHART DATA (group obs/fk by unit, in selected range) ──
      const obsByUnit={};
      obs.filter(o=>inRange(o.dato)).forEach(o=>{
        const k=o.wedge_id||'ukjent';
        if(!obsByUnit[k])obsByUnit[k]=[];
        obsByUnit[k].push(o);
      });
      const fkByBatch={};
      fkLogs.filter(f=>inRange(f.dato)).forEach(f=>{
        const k=f.batch_id||'ukjent';
        if(!fkByBatch[k])fkByBatch[k]=[];
        fkByBatch[k].push(f);
      });

      setPuls({
        activities:recentActivities,
        anomalies:anomalies.slice(0,8),
        health,critCount,warnCount,lastActivity,
        totalAnomalies:anomalies.length,
        obsByUnit,fkByBatch,
      });
      setError(null);
      setLoading(false);
    }catch(e){
      console.warn('Puls fetch failed:',e);
      setError(e.message);
      setLoading(false);
    }
  },[range]);

  useEffect(()=>{
    fetchPuls();
    const id=setInterval(fetchPuls,60000);
    return ()=>clearInterval(id);
  },[fetchPuls]);

  if(loading) return (
    <div style={{marginTop:48,padding:'28px 32px',border:'1px solid '+C.hairline,background:C.creamPaper}}>
      <div style={{...T.monoLbl}}>OPERASJONELL PULS</div>
      <div style={{...T.itemBody,color:C.navy60,marginTop:8}}>Laster data fra Supabase…</div>
    </div>
  );

  if(error||!puls) return null; // fail quietly

  const healthBg={green:'rgba(107,117,68,0.08)',yellow:'rgba(184,146,58,0.10)',red:'rgba(166,75,42,0.10)'}[puls.health];
  const healthBorder={green:C.sage,yellow:C.gold,red:C.rust}[puls.health];
  const healthLabel={green:'✓ Alt grønt',yellow:'⚠ Trenger ditt blikk',red:'🔴 Krever handling'}[puls.health];
  const healthLabelColor={green:C.sage,yellow:C.gold,red:C.rust}[puls.health];

  const lastTs=puls.lastActivity?puls.lastActivity.ts:null;
  const lastAgo=lastTs?formatRelative(lastTs):'—';
  const lastWho=puls.lastActivity?puls.lastActivity.who:null;

  const fmtRelMini=(iso)=>{
    if(!iso) return '—';
    const diff=(Date.now()-new Date(iso).getTime())/1000;
    if(diff<60) return 'nå';
    if(diff<3600) return Math.floor(diff/60)+'min';
    if(diff<86400) return Math.floor(diff/3600)+'t';
    if(diff<7*86400) return Math.floor(diff/86400)+'d';
    return iso.slice(5,10).replace('-','.');
  };

  const RANGES=[['7d','7D'],['1m','1M'],['3m','3M'],['1y','1Y'],['all','ALL TIME']];
  const obsUnitCount=Object.keys(puls.obsByUnit).length;
  const fkBatchCount=Object.keys(puls.fkByBatch).length;

  return (
    <section className="vn-puls" style={{marginTop:48,border:'1px solid '+C.hairline,borderLeft:'3px solid '+healthBorder,background:healthBg,position:'relative'}}>
      {/* Header bar with range toggle */}
      <div style={{padding:'18px 28px',borderBottom:'1px solid '+C.hairline,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div>
          <div style={{...T.monoLbl,letterSpacing:'0.22em'}}>OPERASJONELL PULS</div>
          <div style={{...T.metaMono,marginTop:4}}>
            {puls.lastActivity?('Siste aktivitet: '+lastAgo+(lastWho?' · '+lastWho:'')):('Ingen aktivitet i '+PULS_RANGE_LABEL_LONG[range])}
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
          <div className="vn-puls-range" style={{display:'flex',gap:0,border:'1px solid '+C.hairline,background:'white'}}>
            {RANGES.map(([k,lbl])=>(
              <button key={k} onClick={()=>setRange(k)} className="vn-mono"
                style={{padding:'5px 11px',background:range===k?C.ink:'transparent',color:range===k?C.cream:C.navy60,
                  fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',border:'none',cursor:'pointer',
                  fontFamily:'inherit',transition:'all .15s'}}>{lbl}</button>
            ))}
          </div>
          {puls.totalAnomalies>0&&(
            <span style={{...T.monoLbl,color:C.navy60}}>{puls.totalAnomalies} flagg</span>
          )}
          <span style={{...T.tag,fontSize:11,padding:'5px 14px',background:'white',border:'1px solid '+healthBorder,color:healthLabelColor,fontWeight:500,letterSpacing:'0.12em'}}>
            {healthLabel}
          </span>
        </div>
      </div>

      {/* Two-column body */}
      <div className="vn-puls-body" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>
        {/* LEFT: Activity feed */}
        <div style={{padding:'22px 28px',borderRight:'1px solid '+C.hairline}}>
          <div style={{...T.monoLbl,marginBottom:14,color:C.navy60}}>AKTIVITET · {PULS_RANGE_LABEL[range]}</div>
          {puls.activities.length===0&&(
            <div style={{...T.itemBody,color:C.navy60,fontStyle:'italic'}}>Ingenting registrert i denne perioden.</div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {puls.activities.map((a,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'48px 1fr',gap:14,alignItems:'baseline'}}>
                <div className="vn-mono" style={{fontSize:10,color:C.navy40,letterSpacing:'0.04em',textAlign:'right'}}>
                  {fmtRelMini(a.ts)}
                </div>
                <div>
                  <div style={{fontSize:13,color:C.ink,lineHeight:1.45}}>
                    <span style={{fontWeight:500}}>{a.who}</span> {a.text}
                  </div>
                  {a.detail&&<div style={{...T.metaMono,marginTop:2,fontSize:11}}>{a.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Anomalies */}
        <div style={{padding:'22px 28px'}}>
          <div style={{...T.monoLbl,marginBottom:14,color:C.navy60}}>TRENGER OPPMERKSOMHET</div>
          {puls.anomalies.length===0&&(
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'18px 0'}}>
              <span style={{fontSize:24}}>✓</span>
              <div>
                <div style={{fontSize:14,fontWeight:500,color:C.sage}}>Alt ser bra ut</div>
                <div style={{...T.metaMono,marginTop:2}}>Ingen anomalier oppdaget</div>
              </div>
            </div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {puls.anomalies.map((an,i)=>{
              const color=an.severity==='critical'?C.rust:C.gold;
              return (
                <div key={i} style={{display:'grid',gridTemplateColumns:'24px 1fr',gap:12,alignItems:'baseline'}}>
                  <div style={{fontSize:14,lineHeight:1.45}}>{an.icon}</div>
                  <div>
                    <div style={{fontSize:13,color,fontWeight:500,lineHeight:1.4}}>{an.text}</div>
                    {an.context&&<div style={{...T.metaMono,marginTop:2,fontSize:11}}>{an.context}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CHART PANELS — one per log type */}
      {obsUnitCount>0&&(
        <PulsChartPanel title={'PRODUKSJONSLOGGER · '+PULS_RANGE_LABEL[range]} dataByGroup={puls.obsByUnit} range={range}/>
      )}
      {fkBatchCount>0&&(
        <PulsChartPanel title={'PRE-KOMPOSTERINGSLOGGER · '+PULS_RANGE_LABEL[range]} dataByGroup={puls.fkByBatch} range={range}/>
      )}
    </section>
  );
}

function DailyBrief({data,update,replaceList,now,openDetail}){
  const onSave=(k,v)=>update('greeting.'+k,v);
  const addAction=()=>replaceList('actions',[...data.actions,{title:'Ny sak',context:'Klikk for å redigere.',tag:'Notat · i dag',tagType:'neutral',value:''}]);
  const removeAction=(i)=>{if(confirm('Fjern denne saken?'))replaceList('actions',data.actions.filter((_,idx)=>idx!==i));};
  const addFeed=()=>replaceList('feedstock',[...data.feedstock,{name:'Nytt materiale',days:14,source:''}]);
  const removeFeed=(i)=>{if(confirm('Fjern dette råstoffet?'))replaceList('feedstock',data.feedstock.filter((_,idx)=>idx!==i));};
  const openD=openDetail||(()=>{});
  const todayTasks=data.tasks.filter(t=>t.status!=='done'&&t.due&&daysBetween(now,parseDate(t.due))===0);
  const nextEvent=data.events.map(e=>({...e,when:parseDateTime(e.date,e.time)})).filter(e=>e.when&&e.when.getTime()>=now.getTime()).sort((a,b)=>a.when-b.when)[0];
  const lowestFeed=Math.min(...data.feedstock.map(f=>f.days));

  return (
    <div>
      <PageHero eyebrow={data.greeting.eyebrow} headline={data.greeting.headline} subhead={data.greeting.subhead} intro={data.greeting.intro} onSave={onSave} rightContent={<RevenueProgress data={data} update={update}/>}/>

      <section style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:24,marginTop:48}}>
        <PulseCard label="Oppgaver i dag" value={todayTasks.length} sub={todayTasks.filter(t=>t.priority==='kritisk').length+' kritiske'} accent={todayTasks.filter(t=>t.priority==='kritisk').length>0?C.rust:C.ink}/>
        <PulseCard label="Neste hendelse" value={nextEvent?nextEvent.title:'—'} sub={nextEvent?formatTimeUntil(nextEvent.date,nextEvent.time,now):''} small accent={nextEvent&&daysBetween(now,parseDate(nextEvent.date))===0?C.gold:C.ink}/>
        <PulseCard label="Råstoff kritisk" value={lowestFeed} sub="dager rest · korteste" accent={lowestFeed<=7?C.rust:C.ink}/>
        <PulseCard label="Aktive prosjekter" value={data.projects.filter(p=>p.status==='aktiv'||p.status==='pågående').length} sub={data.projects.filter(p=>p.status==='venter').length+' venter'} accent={C.ink}/>
      </section>

      <OperasjonellPuls now={now}/>

      <SectionHead title="Krever handling i dag" meta={data.actions.length+' '+(data.actions.length===1?'sak':'saker')}/>
      <section style={{border:'1px solid '+C.hairline,background:C.creamPaper,position:'relative'}}>
        <div style={{position:'absolute',left:-1,top:-1,width:32,height:2,background:C.gold}}></div>
        {data.actions.map((a,i)=>(
          <div key={i} className="vn-action-row vn-row-hover" onClick={(e)=>rowClick(e,()=>openD('actions',i))} style={{display:'grid',gridTemplateColumns:'56px 1fr 180px 200px 100px',gap:32,alignItems:'center',padding:'24px 28px',borderBottom:i<data.actions.length-1?'1px solid '+C.hairline:'none',cursor:'pointer'}}>
            <div className="vn-mono" style={{fontSize:11,color:C.navy40,letterSpacing:'0.08em',display:'flex',alignItems:'center',gap:4}}>
              <span>{String(i+1).padStart(2,'0')}</span>
              <button onClick={(e)=>{e.stopPropagation();removeAction(i);}} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button>
            </div>
            <div>
              <Editable value={a.title} onSave={(v)=>update('actions.'+i+'.title',v)} style={{...T.itemTitle,display:'block',marginBottom:5}}/>
              <Editable value={a.context} onSave={(v)=>update('actions.'+i+'.context',v)} multiline style={T.itemBody}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6,alignItems:'flex-start'}}>
              <TagPicker value={a.tagType} onChange={(v)=>update('actions.'+i+'.tagType',v)}/>
              <Editable value={a.tag} onSave={(v)=>update('actions.'+i+'.tag',v)} style={{...T.tag,color:tagColor(a.tagType)}}/>
            </div>
            <div style={T.monoData}><Editable value={a.value} onSave={(v)=>update('actions.'+i+'.value',v)} style={T.monoData} placeholder="—"/></div>
            <button className="vn-cta" onClick={(e)=>{e.stopPropagation();openD('actions',i);}} style={{justifySelf:'end'}}>Åpne →</button>
          </div>
        ))}
        <AddRow onClick={addAction} label="Legg til sak"/>
      </section>

      <SectionHead title="Hovedtall" meta="Oppdatert nå"/>
      <section style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:32}} className="vn-three-col">
        <Panel title="Salg" link="→ Salg & ordre">
          <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:8}}>
            <Editable value={data.sales.mtd} onSave={(v)=>update('sales.mtd',v)} type="number" formatter={(v)=>nbsp(v)} style={T.midNum}/>
            <span className="vn-mono" style={{fontSize:13,color:C.navy60}}>NOK MTD</span>
          </div>
          <div className="vn-mono" style={{fontSize:11,color:C.sage,marginBottom:22}}>↗ <Editable value={data.sales.deltaVsLastMonth} onSave={(v)=>update('sales.deltaVsLastMonth',v)} type="number" style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:C.sage}}/> % vs. april</div>
          <Sparkline data={data.sales.trend}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px 24px',marginTop:'auto'}}>
            <EditableStat value={data.sales.activeOrders} onSave={(v)=>update('sales.activeOrders',v)} label="Aktive ordre"/>
            <EditableStat value={data.sales.d2cMay} onSave={(v)=>update('sales.d2cMay',v)} label="D2C i mai"/>
            <EditableStat value={data.sales.pricePerBag} onSave={(v)=>update('sales.pricePerBag',v)} label="NOK / 5L pose"/>
            <EditableStat value={data.sales.draftsAtHabiba} onSave={(v)=>update('sales.draftsAtHabiba',v)} label="Utkast hos Habiba"/>
          </div>
        </Panel>
        <Panel title="Råstoff" link="→ Råstoff">
          {data.feedstock.map((f,i)=>(
            <div key={i} className="vn-row-hover" onClick={(e)=>rowClick(e,()=>openD('feedstock',i))} style={{marginBottom:20,position:'relative',cursor:'pointer'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
                <Editable value={f.name} onSave={(v)=>update('feedstock.'+i+'.name',v)} style={{fontSize:13}}/>
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <Editable value={f.days} onSave={(v)=>update('feedstock.'+i+'.days',v)} type="number" style={T.monoData}/> <span className="vn-mono" style={{fontSize:12,color:C.graphite}}>dager</span>
                  <button onClick={(e)=>{e.stopPropagation();removeFeed(i);}} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button>
                </span>
              </div>
              <div style={{height:3,background:C.navy08,position:'relative',overflow:'hidden'}}>
                <div style={{height:'100%',width:feedPct(f.days)+'%',background:feedColor(f.days)}}></div>
              </div>
            </div>
          ))}
          <button onClick={addFeed} className="vn-mono" style={{display:'block',width:'100%',textAlign:'left',padding:'10px 0',background:'none',border:'none',borderTop:'1px solid '+C.hairline,fontSize:10,letterSpacing:'0.14em',textTransform:'uppercase',color:C.navy60,cursor:'pointer',fontFamily:'inherit',marginBottom:16}}>+ Legg til</button>
          <div style={{marginTop:'auto',paddingTop:14,borderTop:'1px solid '+C.hairline}}>
            <Editable value={data.feedstockAlert.title} onSave={(v)=>update('feedstockAlert.title',v)} style={{fontFamily:'"IBM Plex Sans",sans-serif',fontSize:18,fontWeight:500,color:C.rust,letterSpacing:'-0.01em',display:'block'}}/>
            <Editable value={data.feedstockAlert.note} onSave={(v)=>update('feedstockAlert.note',v)} style={{...T.monoLbl,marginTop:4,display:'block'}}/>
          </div>
        </Panel>
        <Panel title="Produksjon" link="Endre →">
          <CftBlock id="CFT 1" cft={data.production.cft1} path="production.cft1" update={update}/>
          <CftBlock id="CFT 2" cft={data.production.cft2} path="production.cft2" update={update}/>
          <div style={{display:'flex',flexWrap:'wrap',gap:18,fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:C.graphite,marginTop:4}}>
            <div><Editable value={data.production.readyBatch} onSave={(v)=>update('production.readyBatch',v)} style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:C.ink,fontWeight:500}}/> klar · <Editable value={data.production.readyBags} onSave={(v)=>update('production.readyBags',v)} type="number" style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11}}/> poser</div>
            <div><Editable value={data.production.precompostBatch} onSave={(v)=>update('production.precompostBatch',v)} style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:C.ink,fontWeight:500}}/> forkompost dag&nbsp;<Editable value={data.production.precompostDay} onSave={(v)=>update('production.precompostDay',v)} type="number" style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11}}/></div>
          </div>
        </Panel>
      </section>

      <SectionHead title="Partnerpuls" meta={data.partners.length+' aktive'}/>
      <PartnerTable data={data} update={update} replaceList={replaceList} openDetail={openDetail}/>

      <section style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:48,marginTop:56,paddingTop:40,borderTop:'1px solid '+C.hairline}} className="vn-footrow">
        <div>
          <div style={{...T.monoLbl,marginBottom:18,letterSpacing:'0.22em'}}>Ukentlig kompass — uke <Editable value={data.compass.week} onSave={(v)=>update('compass.week',v)} type="number" style={{...T.monoLbl,letterSpacing:'0.22em'}}/></div>
          <h3 style={{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:500,fontSize:24,lineHeight:1.3,letterSpacing:'-0.012em',margin:'0 0 26px',maxWidth:520,color:C.ink}}>
            <Editable value={data.compass.focus} onSave={(v)=>update('compass.focus',v)} multiline style={{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:500,fontSize:24,lineHeight:1.3,letterSpacing:'-0.012em'}}/>
          </h3>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:22}} className="vn-compass-pillars">
            {data.compass.pillars.map((p,i)=>{
              const active=i===data.compass.activePillar;
              return (
                <div key={i} style={{borderTop:'1px solid '+(active?C.gold:C.hairline),paddingTop:14,transition:'border-color .15s'}}>
                  <div onClick={()=>update('compass.activePillar',i)} style={{cursor:'pointer'}}>
                    <Editable value={p.name} onSave={(v)=>update('compass.pillars.'+i+'.name',v)} style={{...T.monoLbl,color:active?C.gold:C.navy60,marginBottom:8,display:'block',letterSpacing:'0.14em'}}/>
                  </div>
                  <Editable value={p.focus} onSave={(v)=>update('compass.pillars.'+i+'.focus',v)} multiline style={{fontSize:13,lineHeight:1.45,whiteSpace:'pre-line',display:'block',color:C.ink}}/>
                </div>
              );
            })}
          </div>
        </div>
        <div className="vn-quote" style={{paddingLeft:36,borderLeft:'1px solid '+C.hairline}}>
          <div style={{...T.monoLbl,marginBottom:20,letterSpacing:'0.22em'}}>Fra strategikartet</div>
          <blockquote style={{...T.quote,margin:0}}><Editable value={data.quote.text} onSave={(v)=>update('quote.text',v)} multiline style={T.quote}/></blockquote>
          <cite style={{...T.monoLbl,display:'block',fontStyle:'normal',marginTop:16,letterSpacing:'0.16em'}}><Editable value={data.quote.source} onSave={(v)=>update('quote.source',v)} style={{...T.monoLbl,letterSpacing:'0.16em'}}/></cite>
        </div>
      </section>
    </div>
  );
}

function PartnerTable({data,update,replaceList,filter,openDetail}){
  const openD=openDetail||(()=>{});
  // P1-6 fix: INSERT path — write to Supabase first, get real ID, then add to local state.
  // Falls back to local-only insert if Supabase is unreachable.
  const addPartner=async()=>{
    const localFallback={name:'Ny partner',type:'Partner',temp:'lukewarm',last:'—',age:'—',kind:'Lead',next:'Avtal første kontakt'};
    if(!window.__vnSb){replaceList('partners',[...data.partners,localFallback]);return;}
    try{
      const today=new Date().toISOString().slice(0,10);
      const {data:newRow,error}=await window.__vnSb.from('partnere').insert({
        navn:'Ny partner',type:'Partner',status:'Lead',
        notater:'Avtal første kontakt',siste_kontakt:today,
      }).select().single();
      if(error) throw error;
      const newPartner={
        name:newRow.navn,type:newRow.type||'Partner',temp:'lukewarm',
        last:newRow.siste_kontakt?newRow.siste_kontakt.slice(5,10).replace('-','.'):'—',
        age:'0d',kind:newRow.status||'Lead',next:newRow.notater||'',
        _id:newRow.id,_src:'partnere',
      };
      if(window.__vnLastPartners) window.__vnLastPartners=[...window.__vnLastPartners,JSON.parse(JSON.stringify(newPartner))];
      replaceList('partners',[...data.partners,newPartner]);
    }catch(e){
      console.warn('[addPartner] Supabase insert failed, fallback local-only:',e.message);
      replaceList('partners',[...data.partners,localFallback]);
    }
  };
  const removePartner=(i)=>{if(confirm('Fjern denne partneren?'))replaceList('partners',data.partners.filter((_,idx)=>idx!==i));};
  const visible=data.partners.map((p,i)=>({...p,_i:i})).filter(p=>!filter||filter==='all'||p.temp===filter);
  return (
    <section style={{border:'1px solid '+C.hairline,background:C.creamPaper}}>
      <div className="vn-partner-row vn-mono" style={{display:'grid',gridTemplateColumns:'2fr 1fr 1.4fr 1fr 1.5fr 100px',gap:28,padding:'14px 28px',background:C.creamDeep,fontSize:10,textTransform:'uppercase',letterSpacing:'0.16em',color:C.navy60}}>
        <div>Partner</div><div>Temp</div><div>Sist kontakt</div><div>Type</div><div>Neste handling</div><div></div>
      </div>
      {visible.length===0&&<div style={{padding:'32px 28px',textAlign:'center',color:C.navy60,fontSize:13}}>Ingen partnere i denne kategorien.</div>}
      {visible.map((p,viewIdx)=>{
        const i=p._i;
        return (
          <div key={i} className="vn-partner-row vn-row-hover" onClick={(e)=>rowClick(e,()=>openD('partners',i))} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1.4fr 1fr 1.5fr 100px',gap:28,alignItems:'center',padding:'20px 28px',borderBottom:viewIdx<visible.length-1?'1px solid '+C.hairline:'none',fontSize:13,cursor:'pointer'}}>
            <div>
              <Editable value={p.name} onSave={(v)=>update('partners.'+i+'.name',v)} style={{...T.itemTitle,fontSize:14,display:'block'}}/>
              <Editable value={p.type} onSave={(v)=>update('partners.'+i+'.type',v)} style={{...T.metaMono,marginTop:3,display:'inline-block'}}/>
            </div>
            <TempPicker value={p.temp} onChange={(v)=>update('partners.'+i+'.temp',v)}/>
            <span style={T.monoData}>
              <Editable value={p.last} onSave={(v)=>update('partners.'+i+'.last',v)} style={T.monoData}/> — <Editable value={p.age} onSave={(v)=>update('partners.'+i+'.age',v)} style={T.monoData}/>
            </span>
            <Editable value={p.kind} onSave={(v)=>update('partners.'+i+'.kind',v)} style={{color:C.graphite,fontSize:13}}/>
            <Editable value={p.next} onSave={(v)=>update('partners.'+i+'.next',v)} style={{color:C.graphite,fontSize:13}}/>
            <div style={{display:'flex',gap:8,alignItems:'center',justifySelf:'end'}}>
              <button onClick={(e)=>{e.stopPropagation();removePartner(i);}} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button>
              <button className="vn-cta" onClick={(e)=>{e.stopPropagation();openD('partners',i);}}>Åpne →</button>
            </div>
          </div>
        );
      })}
      <AddRow onClick={addPartner} label="Legg til partner"/>
    </section>
  );
}

function SalesPage({data,update,replaceList,openDetail}){
  const openD=openDetail||(()=>{});
  // P1-6 fix: INSERT path — write to Supabase first, get real ID, then add to local state.
  const addOrder=async()=>{
    const localFallback={customer:'Ny kunde',items:'1 × 5L',amount:389,status:'utkast',date:new Date().toLocaleDateString('nb-NO',{day:'2-digit',month:'2-digit'}),notes:''};
    if(!window.__vnSb){replaceList('orders',[...data.orders,localFallback]);return;}
    try{
      const ordreNr='ORD-'+Date.now().toString().slice(-6);
      const today=new Date().toISOString().slice(0,10);
      const {data:newRow,error}=await window.__vnSb.from('ordrer').insert({
        ordre_nr:ordreNr,status:'utkast',total_nok:389,
        notater:'1 × 5L',ordredato:today,
      }).select().single();
      if(error) throw error;
      const newOrder={
        customer:'Ny kunde',items:'1 × 5L',amount:Number(newRow.total_nok)||0,
        status:newRow.status||'utkast',
        date:newRow.ordredato?newRow.ordredato.slice(5,10).replace('-','.'):new Date().toLocaleDateString('nb-NO',{day:'2-digit',month:'2-digit'}),
        notes:newRow.notater||'',
        _id:newRow.id,_src:'ordrer',
      };
      if(window.__vnLastOrders) window.__vnLastOrders=[...window.__vnLastOrders,JSON.parse(JSON.stringify(newOrder))];
      replaceList('orders',[...data.orders,newOrder]);
    }catch(e){
      console.warn('[addOrder] Supabase insert failed, fallback local-only:',e.message);
      replaceList('orders',[...data.orders,localFallback]);
    }
  };
  const removeOrder=(i)=>{if(confirm('Fjern denne ordren?'))replaceList('orders',data.orders.filter((_,idx)=>idx!==i));};
  const total=data.orders.reduce((s,o)=>s+(Number(o.amount)||0),0);
  return (
    <div>
      <PageHero eyebrow="01 — Salg & ordre · uke 21" headline={nbsp(data.sales.mtd)+' kroner.'} subhead={'Mai måned, '+data.sales.daysLeft+' dager igjen.'} intro="Du ligger like under takt. Dyrkeland-ordren alene løfter deg over 100 000-målet om den lukkes denne uka. Habiba har to utkast som venter på godkjenning." onSave={()=>{}} rightContent={<RevenueProgress data={data} update={update}/>}/>
      <SectionHead title="Ordre i pipeline" meta={data.orders.length+' totalt · '+nbsp(total)+' NOK'}/>
      <section style={{border:'1px solid '+C.hairline,background:C.creamPaper}}>
        <div className="vn-mono" style={{display:'grid',gridTemplateColumns:'2fr 1.2fr 1fr 1fr 1.4fr 80px',gap:24,padding:'14px 28px',background:C.creamDeep,fontSize:10,textTransform:'uppercase',letterSpacing:'0.16em',color:C.navy60}}>
          <div>Kunde</div><div>Innhold</div><div>Beløp</div><div>Status</div><div>Notater</div><div></div>
        </div>
        {data.orders.map((o,i)=>(
          <div key={i} className="vn-partner-row vn-row-hover" onClick={(e)=>rowClick(e,()=>openD('orders',i))} style={{display:'grid',gridTemplateColumns:'2fr 1.2fr 1fr 1fr 1.4fr 80px',gap:24,alignItems:'center',padding:'20px 28px',borderBottom:i<data.orders.length-1?'1px solid '+C.hairline:'none',fontSize:13,cursor:'pointer'}}>
            <div>
              <Editable value={o.customer} onSave={(v)=>update('orders.'+i+'.customer',v)} style={{...T.itemTitle,fontSize:14,display:'block'}}/>
              <Editable value={o.date} onSave={(v)=>update('orders.'+i+'.date',v)} style={{...T.metaMono,marginTop:2,display:'inline-block'}}/>
            </div>
            <Editable value={o.items} onSave={(v)=>update('orders.'+i+'.items',v)} style={{...T.monoData,fontSize:13,color:C.ink}}/>
            <span className="vn-mono" style={{fontWeight:500,fontSize:14,color:C.ink}}>
              <Editable value={o.amount} onSave={(v)=>update('orders.'+i+'.amount',v)} type="number" formatter={(v)=>nbsp(v)} style={{fontFamily:'"IBM Plex Mono",monospace',fontWeight:500,fontSize:14}}/>
              <span style={{fontWeight:400,color:C.navy60,fontSize:11,marginLeft:4}}>NOK</span>
            </span>
            <OrderStatusPicker value={o.status} onChange={(v)=>update('orders.'+i+'.status',v)}/>
            <Editable value={o.notes} onSave={(v)=>update('orders.'+i+'.notes',v)} style={{fontSize:12,color:C.graphite}} placeholder="—"/>
            <div style={{justifySelf:'end'}}><button onClick={(e)=>{e.stopPropagation();removeOrder(i);}} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button></div>
          </div>
        ))}
        <AddRow onClick={addOrder} label="Legg til ordre"/>
      </section>
      <SectionHead title="Kanaloversikt mai" meta="Hittil i måneden"/>
      <section style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:32}} className="vn-three-col">
        <Panel title="D2C">
          <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:6}}>
            <Editable value={data.sales.d2cMay} onSave={(v)=>update('sales.d2cMay',v)} type="number" style={T.midNum}/>
            <span className="vn-mono" style={{fontSize:13,color:C.navy60}}>ordre</span>
          </div>
          <div className="vn-mono" style={{fontSize:11,color:C.sage,marginBottom:24}}>↗ {data.sales.deltaVsLastMonth} % vs. april</div>
          <div style={{marginTop:'auto'}}><div style={T.monoLbl}>Snittkurv</div><div style={{...T.statNum,marginTop:6}}>{nbsp(389)} NOK</div></div>
        </Panel>
        <Panel title="B2B">
          <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:6}}>
            <span style={T.midNum}>1</span><span className="vn-mono" style={{fontSize:13,color:C.navy60}}>aktiv ordre</span>
          </div>
          <div className="vn-mono" style={{fontSize:11,color:C.navy60,marginBottom:24}}>Dyrkeland venter på revidert tilbud</div>
          <div style={{marginTop:'auto'}}><div style={T.monoLbl}>Forventet ved lukking</div><div style={{...T.statNum,marginTop:6,color:C.gold}}>{nbsp(31200)} NOK</div></div>
        </Panel>
        <Panel title="Habiba-kø">
          <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:6}}>
            <Editable value={data.sales.draftsAtHabiba} onSave={(v)=>update('sales.draftsAtHabiba',v)} type="number" style={T.midNum}/>
            <span className="vn-mono" style={{fontSize:13,color:C.navy60}}>utkast</span>
          </div>
          <div className="vn-mono" style={{fontSize:11,color:C.navy60,marginBottom:24}}>Til godkjenning og fakturering</div>
          <div style={{marginTop:'auto'}}><div style={T.monoLbl}>Eldste utkast</div><div style={{...T.statNum,marginTop:6}}>4 dager</div></div>
        </Panel>
      </section>
      <Ornament/>
    </div>
  );
}

function FeedstockPage({data,update,replaceList,now,openDetail}){
  const openD=openDetail||(()=>{});
  const lowest=Math.min(...data.feedstock.map(f=>f.days));
  const lowestItem=data.feedstock.find(f=>f.days===lowest);
  const addF=()=>replaceList('feedstock',[...data.feedstock,{name:'Nytt materiale',days:14,source:''}]);
  const removeF=(i)=>{if(confirm('Fjern dette råstoffet?'))replaceList('feedstock',data.feedstock.filter((_,idx)=>idx!==i));};
  const addO=()=>replaceList('feedstockOutreach',[...data.feedstockOutreach,{name:'Ny leverandør',stage:'planlagt',notes:''}]);
  const removeO=(i)=>{if(confirm('Fjern denne?'))replaceList('feedstockOutreach',data.feedstockOutreach.filter((_,idx)=>idx!==i));};
  const addD=()=>replaceList('deliveries',[...data.deliveries,{material:'Nytt materiale',date:'',amount:'',status:'planlagt'}]);
  const removeD=(i)=>{if(confirm('Fjern denne?'))replaceList('deliveries',data.deliveries.filter((_,idx)=>idx!==i));};

  return (
    <div>
      <PageHero eyebrow="02 — Råstoff · uke 21" headline="Sikre input." subhead="Før de trengs." intro="Fem aktive strømmer. RYGR-bryggermask må bestilles innen onsdag for å unngå fôringsbrudd. Tre nye leverandører i utreach-pipeline." onSave={()=>{}} rightContent={
        <div>
          <div style={{...T.monoLbl,marginBottom:18,letterSpacing:'0.22em'}}>Kritisk grense</div>
          <div style={{display:'flex',alignItems:'baseline',gap:14}}>
            <span style={{...T.bigNum,color:feedColor(lowest)}}>{lowest}</span>
            <span style={{fontSize:18,fontWeight:400,color:C.navy60,letterSpacing:'0.04em'}}>dager</span>
          </div>
          <div style={{...T.metaMono,marginTop:10}}>{lowestItem?lowestItem.name:'—'} · korteste rest</div>
          <div style={{marginTop:24,paddingTop:18,borderTop:'1px solid '+C.hairline}}>
            <div style={T.monoLbl}>Neste leveranse</div>
            <div style={{fontSize:15,color:C.ink,marginTop:6}}>{data.deliveries[0]?data.deliveries[0].material+' · '+formatDayLabel(data.deliveries[0].date,now):'—'}</div>
          </div>
        </div>
      }/>
      <SectionHead title="Aktive strømmer" meta={data.feedstock.length+' materialer'}/>
      <section style={{border:'1px solid '+C.hairline,background:C.creamPaper,padding:'28px 28px 8px'}}>
        {data.feedstock.map((f,i)=>(
          <div key={i} className="vn-row-hover" onClick={(e)=>rowClick(e,()=>openD('feedstock',i))} style={{marginBottom:24,position:'relative',cursor:'pointer'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
              <div>
                <Editable value={f.name} onSave={(v)=>update('feedstock.'+i+'.name',v)} style={{...T.itemTitle,fontSize:15,display:'block'}}/>
                <Editable value={f.source} onSave={(v)=>update('feedstock.'+i+'.source',v)} style={{...T.metaMono,marginTop:4,display:'inline-block'}} placeholder="Kilde / leverandør"/>
              </div>
              <span style={{display:'flex',alignItems:'baseline',gap:6}}>
                <span style={{...T.midNum,fontSize:28,color:feedColor(f.days)}}><Editable value={f.days} onSave={(v)=>update('feedstock.'+i+'.days',v)} type="number" style={{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:500,fontSize:28,color:feedColor(f.days),letterSpacing:'-0.018em'}}/></span>
                <span className="vn-mono" style={{fontSize:12,color:C.navy60}}>dager</span>
                <button onClick={()=>removeF(i)} className="vn-remove-btn vn-row-actions" aria-label="Fjern" style={{marginLeft:6}}>×</button>
              </span>
            </div>
            <div style={{height:4,background:C.navy08,position:'relative',overflow:'hidden'}}>
              <div style={{height:'100%',width:feedPct(f.days)+'%',background:feedColor(f.days)}}></div>
            </div>
          </div>
        ))}
        <AddRow onClick={addF} label="Legg til materiale"/>
      </section>
      <SectionHead title="Leveranseplan" meta={data.deliveries.length+' planlagte'}/>
      <section style={{border:'1px solid '+C.hairline,background:C.creamPaper}}>
        <div className="vn-mono" style={{display:'grid',gridTemplateColumns:'1.5fr 1.2fr 1fr 1fr 80px',gap:24,padding:'14px 28px',background:C.creamDeep,fontSize:10,textTransform:'uppercase',letterSpacing:'0.16em',color:C.navy60}}>
          <div>Materiale</div><div>Når</div><div>Mengde</div><div>Status</div><div></div>
        </div>
        {data.deliveries.map((d,i)=>{
          const days=d.date?daysBetween(now,parseDate(d.date)):null;
          const dc=days==null?C.graphite:days<=0?C.rust:days<=3?C.gold:C.ink;
          return (
            <div key={i} className="vn-partner-row vn-row-hover" onClick={(e)=>rowClick(e,()=>openD('deliveries',i))} style={{display:'grid',gridTemplateColumns:'1.5fr 1.2fr 1fr 1fr 80px',gap:24,alignItems:'center',padding:'18px 28px',borderBottom:i<data.deliveries.length-1?'1px solid '+C.hairline:'none',fontSize:13,cursor:'pointer'}}>
              <Editable value={d.material} onSave={(v)=>update('deliveries.'+i+'.material',v)} style={T.itemTitle}/>
              <div>
                <Editable value={d.date} onSave={(v)=>update('deliveries.'+i+'.date',v)} style={T.monoData} placeholder="YYYY-MM-DD"/>
                <div style={{...T.monoLbl,color:dc,marginTop:2,letterSpacing:'0.10em'}}>{d.date?formatDayLabel(d.date,now):'—'}</div>
              </div>
              <Editable value={d.amount} onSave={(v)=>update('deliveries.'+i+'.amount',v)} style={T.monoData} placeholder="—"/>
              <DeliveryStatusPicker value={d.status} onChange={(v)=>update('deliveries.'+i+'.status',v)}/>
              <div style={{justifySelf:'end'}}><button onClick={()=>removeD(i)} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button></div>
            </div>
          );
        })}
        <AddRow onClick={addD} label="Legg til leveranse"/>
      </section>
      <SectionHead title="Utreach — nye leverandører" meta={data.feedstockOutreach.length+' i pipeline'}/>
      <section style={{border:'1px solid '+C.hairline,background:C.creamPaper}}>
        <div className="vn-mono" style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 2.5fr 80px',gap:24,padding:'14px 28px',background:C.creamDeep,fontSize:10,textTransform:'uppercase',letterSpacing:'0.16em',color:C.navy60}}>
          <div>Leverandør</div><div>Fase</div><div>Notater</div><div></div>
        </div>
        {data.feedstockOutreach.map((o,i)=>(
          <div key={i} className="vn-partner-row vn-row-hover" onClick={(e)=>rowClick(e,()=>openD('feedstockOutreach',i))} style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 2.5fr 80px',gap:24,alignItems:'center',padding:'18px 28px',borderBottom:i<data.feedstockOutreach.length-1?'1px solid '+C.hairline:'none',fontSize:13,cursor:'pointer'}}>
            <Editable value={o.name} onSave={(v)=>update('feedstockOutreach.'+i+'.name',v)} style={T.itemTitle}/>
            <StagePicker value={o.stage} onChange={(v)=>update('feedstockOutreach.'+i+'.stage',v)}/>
            <Editable value={o.notes} onSave={(v)=>update('feedstockOutreach.'+i+'.notes',v)} multiline style={{fontSize:13,color:C.graphite,lineHeight:1.45}} placeholder="—"/>
            <div style={{justifySelf:'end'}}><button onClick={()=>removeO(i)} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button></div>
          </div>
        ))}
        <AddRow onClick={addO} label="Legg til prospekt"/>
      </section>
      <Ornament/>
    </div>
  );
}

function PartnersPage({data,update,replaceList,openDetail}){
  const [filter,setFilter]=useState('all');
  const filters=[
    {key:'all',label:'Alle',count:data.partners.length},
    {key:'hot',label:'Het',count:data.partners.filter(p=>p.temp==='hot').length},
    {key:'warm',label:'Varm',count:data.partners.filter(p=>p.temp==='warm').length},
    {key:'lukewarm',label:'Lunken',count:data.partners.filter(p=>p.temp==='lukewarm').length},
    {key:'cold',label:'Kald',count:data.partners.filter(p=>p.temp==='cold').length},
  ];
  const counts={hot:0,warm:0,lukewarm:0,cold:0};
  data.partners.forEach(p=>{if(counts[p.temp]!=null)counts[p.temp]++;});
  const total=data.partners.length||1;
  return (
    <div>
      <PageHero eyebrow="03 — Partnere · uke 21" headline={data.partners.length+' partnere.'} subhead="Bygges over tid." intro={counts.hot+' het. '+counts.warm+' varme. '+counts.lukewarm+' lunkne. '+counts.cold+' kalde som venter på Dyrkeland-lukking.'} onSave={()=>{}} rightContent={
        <div>
          <div style={{...T.monoLbl,marginBottom:20,letterSpacing:'0.22em'}}>Temperaturfordeling</div>
          {['hot','warm','lukewarm','cold'].map((t)=>(
            <div key={t} style={{marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
                <span className="vn-mono" style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.14em',color:tempColor(t),display:'inline-flex',alignItems:'center',gap:8}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:tempColor(t),border:t==='cold'?'1px solid '+C.navy60:'none',boxSizing:'border-box'}}></span>
                  {tempLabel(t)}
                </span>
                <span className="vn-mono" style={{fontSize:12,color:C.graphite}}>{counts[t]}</span>
              </div>
              <div style={{height:3,background:C.navy08}}><div style={{height:'100%',width:(counts[t]/total*100)+'%',background:tempColor(t)}}></div></div>
            </div>
          ))}
        </div>
      }/>
      <div style={{display:'flex',gap:24,margin:'64px 0 24px',borderBottom:'1px solid '+C.hairline,paddingBottom:16,flexWrap:'wrap'}}>
        {filters.map((f)=>(
          <button key={f.key} onClick={()=>setFilter(f.key)} className="vn-mono" style={{background:'none',border:'none',cursor:'pointer',fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:filter===f.key?C.ink:C.navy60,fontWeight:filter===f.key?500:400,fontFamily:'inherit',padding:'4px 0',borderBottom:'2px solid '+(filter===f.key?C.gold:'transparent'),transition:'color .15s, border-color .15s'}}>{f.label} · {f.count}</button>
        ))}
      </div>
      <PartnerTable data={data} update={update} replaceList={replaceList} filter={filter} openDetail={openDetail}/>
      <Ornament/>
    </div>
  );
}

// Native date picker — replaces the YYYY-MM-DD text input
function DateInput({value,onSave,style,placeholder}){
  const [draft,setDraft]=useState(value||'');
  useEffect(()=>{setDraft(value||'');},[value]);
  const handleChange=(e)=>{
    const v=e.target.value;
    setDraft(v);
    if(v!==value) onSave(v);
  };
  return (
    <input
      type="date"
      value={draft}
      onChange={handleChange}
      style={{
        background:'transparent',border:'none',outline:'none',
        padding:'2px 4px',margin:'-2px -4px',
        fontFamily:'"IBM Plex Mono", monospace',fontSize:12,color:C.graphite,
        cursor:'pointer',colorScheme:'light',
        ...style,
      }}
      onFocus={(e)=>{e.target.style.background=C.goldSoft;}}
      onBlur={(e)=>{e.target.style.background='transparent';}}
    />
  );
}

function TaskList({tasks,update,removeTask,toggleDone,now,accent,addLabel,onAdd,muted,openDetail}){
  const openD=openDetail||(()=>{});
  if(tasks.length===0&&!onAdd)return <div style={{border:'1px solid '+C.hairline,background:C.creamPaper,padding:'24px 28px',color:C.navy60,fontSize:13}}>Ingen oppgaver her.</div>;
  return (
    <section style={{border:'1px solid '+C.hairline,background:C.creamPaper,position:'relative'}}>
      {accent&&<div style={{position:'absolute',left:-1,top:-1,width:32,height:2,background:accent}}></div>}
      {tasks.length===0&&<div style={{padding:'20px 28px',color:C.navy60,fontSize:13,borderBottom:'1px solid '+C.hairline}}>Ingen oppgaver her.</div>}
      {tasks.map((t,viewIdx)=>{
        const i=t._i;
        const isDone=t.status==='done';
        const isOverdue=!isDone&&t.due&&daysBetween(now,parseDate(t.due))<0;
        const dayLbl=t.due?formatDayLabel(t.due,now):'Ingen frist';
        const dayColor=isOverdue?C.rust:(t.due&&daysBetween(now,parseDate(t.due))===0)?C.gold:C.graphite;
        return (
          <div key={i} className="vn-partner-row vn-row-hover" onClick={(e)=>rowClick(e,()=>openD('tasks',i))} style={{display:'grid',gridTemplateColumns:'40px 1fr 140px 120px 140px 60px',gap:24,alignItems:'center',padding:'20px 28px',borderBottom:viewIdx<tasks.length-1?'1px solid '+C.hairline:'none',opacity:muted||isDone?0.55:1,cursor:'pointer'}}>
            <button onClick={(e)=>{e.stopPropagation();toggleDone(i);}} style={{width:18,height:18,border:'1.5px solid '+(isDone?C.sage:C.navy40),background:isDone?C.sage:'transparent',borderRadius:2,cursor:'pointer',padding:0,display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}} aria-label="Marker som ferdig">
              {isDone&&<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5 L4 8 L9 2" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>}
            </button>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <Editable value={t.title} onSave={(v)=>update('tasks.'+i+'.title',v)} style={{...T.itemTitle,fontSize:14,display:'inline-block',textDecoration:isDone?'line-through':'none'}}/>
                {(()=>{
                  const ds=delegationStatus(t);
                  if(!ds) return null;
                  return <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 9px',fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase',fontFamily:'"IBM Plex Mono", monospace',background:ds.color+'18',color:ds.color,border:'1px solid '+ds.color+'40',borderRadius:2,whiteSpace:'nowrap'}}><span style={{fontSize:11}}>{ds.icon}</span>{ds.label}</span>;
                })()}
              </div>
              <div style={{...T.metaMono,marginTop:3,display:'flex',gap:12,flexWrap:'wrap',alignItems:'baseline'}}>
                <Editable value={t.assignee} onSave={(v)=>update('tasks.'+i+'.assignee',v)} style={T.metaMono}/>
                <span>· <Editable value={t.project} onSave={(v)=>update('tasks.'+i+'.project',v)} style={T.metaMono} placeholder="+ prosjekt"/></span>
                <span>· <Editable value={t.notes} onSave={(v)=>update('tasks.'+i+'.notes',v)} multiline style={{...T.metaMono,color:C.graphite}} placeholder="+ notat"/></span>
              </div>
            </div>
            <PriorityPicker value={t.priority} onChange={(v)=>update('tasks.'+i+'.priority',v)}/>
            <TaskStatusPicker value={t.status} onChange={(v)=>update('tasks.'+i+'.status',v)}/>
            <div>
              <DateInput value={t.due} onSave={(v)=>update('tasks.'+i+'.due',v)}/>
              <div style={{...T.monoLbl,color:dayColor,marginTop:2,letterSpacing:'0.10em'}}>{dayLbl}</div>
            </div>
            <div style={{justifySelf:'end'}}><button onClick={()=>removeTask(i)} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button></div>
          </div>
        );
      })}
      {onAdd&&<AddRow onClick={onAdd} label={addLabel||'Legg til'}/>}
    </section>
  );
}

// ── Martin → Mathias task delegation ──────────────
function delegationStatus(task){
  // Only meaningful for tasks Martin sent to Mathias
  if(task.assignee!=='Mathias'||!task._created_at) return null;
  if(task._db_status==='ferdig'||task.status==='done') return {label:'Ferdig',color:C.sage,icon:'✓'};
  if(task._db_status==='pagar'||task.status==='active'&&task._updated_at&&task._updated_at!==task._created_at){
    const updated=new Date(task._updated_at);
    const created=new Date(task._created_at);
    const gapMs=updated.getTime()-created.getTime();
    if(gapMs>2000) return {label:task._db_status==='pagar'?'Pågår':'Sett av Mathias',color:C.gold,icon:task._db_status==='pagar'?'⚙':'👁'};
  }
  // Just sent
  if(task._created_at){
    const ageMin=(Date.now()-new Date(task._created_at).getTime())/60000;
    return {label:ageMin<60?'Sendt nylig':'Sendt',color:C.navy60,icon:'↗'};
  }
  return null;
}

async function sendTaskToMathias({tittel,beskrivelse,prioritet,frist}){
  if(!window.__vnSb) throw new Error('Supabase not ready');
  const {data,error}=await window.__vnSb.from('oppgaver').insert({
    tittel:tittel.trim(),
    beskrivelse:beskrivelse?beskrivelse.trim():null,
    ansvarlig:'Mathias',
    prioritet:prioritet||'medium',
    status:'ikke_startet',
    frist:frist||null,
  }).select().single();
  if(error) throw error;
  return data;
}

function SendToMathiasForm({onSent}){
  const [tittel,setTittel]=useState('');
  const [beskrivelse,setBeskrivelse]=useState('');
  const [prioritet,setPrioritet]=useState('medium');
  const [frist,setFrist]=useState('');
  const [sending,setSending]=useState(false);
  const [msg,setMsg]=useState(null);
  const [open,setOpen]=useState(false);

  const submit=async()=>{
    if(!tittel.trim()){setMsg({type:'error',text:'Tittel kreves'});return;}
    setSending(true);setMsg(null);
    try{
      await sendTaskToMathias({tittel,beskrivelse,prioritet,frist});
      setTittel('');setBeskrivelse('');setFrist('');setPrioritet('medium');
      setMsg({type:'ok',text:'Sendt til Mathias.'});
      if(onSent) onSent();
      setTimeout(()=>setMsg(null),3000);
    }catch(e){
      setMsg({type:'error',text:'Feilet: '+e.message});
    }finally{
      setSending(false);
    }
  };

  if(!open){
    return (
      <div style={{margin:'24px 0 8px',padding:'18px 24px',border:'1px dashed '+C.hairline,background:'rgba(184,146,58,0.04)'}}>
        <button onClick={()=>setOpen(true)} style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',color:C.gold,fontWeight:500}}>
          ↗ Send oppgave til Mathias
        </button>
      </div>
    );
  }

  return (
    <div style={{margin:'24px 0 8px',padding:'24px 28px',border:'1px solid '+C.hairline,background:C.creamPaper,borderTop:'2px solid '+C.gold}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
        <div style={{...T.monoLbl,letterSpacing:'0.22em',color:C.gold}}>↗ SEND OPPGAVE TIL MATHIAS</div>
        <button onClick={()=>setOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:C.navy60,fontSize:18,padding:'0 4px'}}>×</button>
      </div>
      <div style={{display:'grid',gap:12}}>
        <input value={tittel} onChange={(e)=>setTittel(e.target.value)} placeholder="Hva skal Mathias gjøre?"
          style={{fontFamily:'"IBM Plex Sans",sans-serif',fontSize:15,padding:'12px 14px',border:'1px solid '+C.hairline,background:C.cream,color:C.ink,outline:'none'}} />
        <textarea value={beskrivelse} onChange={(e)=>setBeskrivelse(e.target.value)} placeholder="Notater (valgfritt)" rows={2}
          style={{fontFamily:'"IBM Plex Sans",sans-serif',fontSize:13,padding:'10px 14px',border:'1px solid '+C.hairline,background:C.cream,color:C.ink,outline:'none',resize:'vertical'}} />
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <select value={prioritet} onChange={(e)=>setPrioritet(e.target.value)}
            style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,padding:'10px 12px',border:'1px solid '+C.hairline,background:C.cream,color:C.ink,textTransform:'uppercase',letterSpacing:'0.12em'}}>
            <option value="lav">Lav prioritet</option>
            <option value="medium">Medium prioritet</option>
            <option value="hoy">Høy prioritet</option>
          </select>
          <input type="date" value={frist} onChange={(e)=>setFrist(e.target.value)}
            style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,padding:'10px 12px',border:'1px solid '+C.hairline,background:C.cream,color:C.ink}} />
        </div>
        {msg&&<div style={{padding:'8px 12px',fontSize:12,background:msg.type==='ok'?'rgba(107,117,68,0.12)':'rgba(166,75,42,0.10)',color:msg.type==='ok'?C.sage:C.rust,border:'1px solid '+(msg.type==='ok'?C.sage:C.rust)}}>{msg.text}</div>}
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <button onClick={submit} disabled={sending||!tittel.trim()}
            style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',padding:'12px 22px',background:C.ink,color:C.cream,border:'none',cursor:sending||!tittel.trim()?'not-allowed':'pointer',opacity:sending||!tittel.trim()?0.5:1}}>
            {sending?'Sender…':'Send til Mathias'}
          </button>
          <span style={{fontSize:11,color:C.navy60,fontFamily:'"IBM Plex Mono",monospace',letterSpacing:'0.06em'}}>
            Synces direkte til hans app
          </span>
        </div>
      </div>
    </div>
  );
}

function TasksPage({data,update,replaceList,now,openDetail}){
  const [filterAssignee,setFilterAssignee]=useState('alle');
  const [filterPriority,setFilterPriority]=useState('alle');
  const [searchTerm,setSearchTerm]=useState('');

  const allTasks=data.tasks.map((t,i)=>({...t,_i:i}));
  // Apply filters
  const tasks=allTasks.filter(t=>{
    if(filterAssignee!=='alle' && (t.assignee||'').toLowerCase()!==filterAssignee.toLowerCase()) return false;
    if(filterPriority!=='alle' && t.priority!==filterPriority) return false;
    if(searchTerm){
      const s=searchTerm.toLowerCase();
      const hay=((t.title||'')+' '+(t.notes||'')+' '+(t.project||'')+' '+(t.assignee||'')).toLowerCase();
      if(!hay.includes(s)) return false;
    }
    return true;
  });

  const todo=tasks.filter(t=>t.status!=='done');
  const todayT=todo.filter(t=>t.due&&daysBetween(now,parseDate(t.due))===0);
  const overdue=todo.filter(t=>t.due&&daysBetween(now,parseDate(t.due))<0);
  const weekT=todo.filter(t=>t.due&&daysBetween(now,parseDate(t.due))>0&&daysBetween(now,parseDate(t.due))<=7);
  const later=todo.filter(t=>!t.due||daysBetween(now,parseDate(t.due))>7||t.status==='backlog');
  const done=tasks.filter(t=>t.status==='done');
  const filtersActive=filterAssignee!=='alle'||filterPriority!=='alle'||searchTerm.trim()!=='';
  const totalFiltered=tasks.length;
  const totalAll=allTasks.length;
  const addT=async()=>{
    // Insert into Supabase oppgaver so the new task gets a real _id and syncs cleanly
    if(window.__vnSb){
      try{
        const {data:newRow,error}=await window.__vnSb.from('oppgaver').insert({
          tittel:'Ny oppgave',
          ansvarlig:'Martin',
          prioritet:'medium',
          status:'ikke_startet',
        }).select().single();
        if(error) throw error;
        const newTask={
          title:newRow.tittel,assignee:newRow.ansvarlig||'',priority:'middels',
          due:newRow.frist||'',status:'active',project:'',notes:newRow.beskrivelse||'',
          _id:newRow.id,_src:'oppgaver',
          _created_at:newRow.created_at,_updated_at:newRow.updated_at,
          _fullfort_at:null,_db_prioritet:'medium',_db_status:'ikke_startet',
        };
        // Also update the snapshot so the sync diff doesn't try to re-insert
        if(window.__vnLastTasks) window.__vnLastTasks=[...window.__vnLastTasks,JSON.parse(JSON.stringify(newTask))];
        replaceList('tasks',[...data.tasks,newTask]);
        return;
      }catch(e){console.warn('Kunne ikke opprette oppgave i Supabase:',e.message);}
    }
    // Fallback (no Supabase): local only — won't sync to Mathias
    replaceList('tasks',[...data.tasks,{title:'Ny oppgave',assignee:'Martin',priority:'middels',due:'',status:'active',project:'',notes:''}]);
  };
  const removeT=(i)=>{if(confirm('Fjern denne oppgaven?'))replaceList('tasks',data.tasks.filter((_,idx)=>idx!==i));};
  const toggleDone=(i)=>{const t=data.tasks[i];update('tasks.'+i+'.status',t.status==='done'?'active':'done');};
  const critToday=todayT.filter(t=>t.priority==='kritisk').length;

  // Refresh tasks from Supabase (pulls Mathias' updates + new tasks)
  const refreshFromSupabase=useCallback(async()=>{
    if(!window.__vnSb) return;
    try{
      const {data:rows}=await window.__vnSb.from('oppgaver').select('*').order('frist',{ascending:true,nullsFirst:false});
      if(!rows) return;
      const prioMap={hoy:'høy',medium:'middels',lav:'lav'};
      const statusMap={ferdig:'done',pagar:'active',ikke_startet:'active'};
      const mapped=rows.map(t=>({
        title:t.tittel, assignee:t.ansvarlig||'',
        priority:prioMap[t.prioritet]||'middels',
        due:t.frist||'', status:statusMap[t.status]||'active',
        project:'', notes:t.beskrivelse||'',
        _id:t.id, _src:'oppgaver',
        _created_at:t.created_at, _updated_at:t.updated_at, _fullfort_at:t.fullfort_at,
        _db_prioritet:t.prioritet, _db_status:t.status,
      }));
      replaceList('tasks',mapped);
    }catch(e){console.warn('refresh failed:',e);}
  },[replaceList]);

  // Auto-refresh every 30s so Martin sees Mathias' read confirmations live
  useEffect(()=>{
    const id=setInterval(refreshFromSupabase,30000);
    return()=>clearInterval(id);
  },[refreshFromSupabase]);

  return (
    <div>
      <PageHero eyebrow="04 — Oppgaver · uke 21" headline={todayT.length+' i dag.'} subhead={overdue.length>0?overdue.length+' forfalt.':critToday+' kritiske.'} intro={'Aktive: '+todo.length+'. Forfalt: '+overdue.length+'. Backlog: '+later.length+'. Mathias har '+todo.filter(t=>t.assignee==='Mathias').length+' åpne. Martin har '+todo.filter(t=>t.assignee==='Martin').length+'.'} onSave={()=>{}} rightContent={
        <div>
          <div style={{...T.monoLbl,marginBottom:18,letterSpacing:'0.22em'}}>Ferdig denne uka</div>
          <div style={{display:'flex',alignItems:'baseline',gap:14}}>
            <span style={{...T.bigNum,color:C.sage}}>{done.length}</span>
            <span style={{fontSize:18,fontWeight:400,color:C.navy60,letterSpacing:'0.04em'}}>oppgaver</span>
          </div>
          <div style={{...T.metaMono,marginTop:10}}>Av {tasks.length} totalt</div>
          <div style={{marginTop:24,height:4,background:C.navy08,position:'relative',overflow:'hidden'}}>
            <div style={{height:'100%',width:(done.length/Math.max(tasks.length,1)*100)+'%',background:C.sage}}></div>
          </div>
          <div style={{marginTop:24,paddingTop:18,borderTop:'1px solid '+C.hairline,display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
            <Stat value={overdue.length} label="Forfalt" color={overdue.length>0?C.rust:C.ink}/>
            <Stat value={critToday} label="Kritisk i dag" color={critToday>0?C.rust:C.ink}/>
          </div>
        </div>
      }/>
      <SendToMathiasForm onSent={refreshFromSupabase}/>

      {/* ── FILTERS ─────────────────────────────────── */}
      <div style={{margin:'18px 0 4px',padding:'14px 20px',background:C.creamPaper,border:'1px solid '+C.hairline,display:'flex',flexWrap:'wrap',alignItems:'center',gap:18,rowGap:10}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{...T.monoLbl,letterSpacing:'0.18em'}}>TILDELT</span>
          {['alle','Martin','Mathias'].map(a=>(
            <button key={a} onClick={()=>setFilterAssignee(a)}
              style={{background:filterAssignee===a?C.ink:'transparent',color:filterAssignee===a?C.cream:C.navy60,border:'1px solid '+(filterAssignee===a?C.ink:C.hairline),padding:'5px 12px',fontFamily:'"IBM Plex Mono",monospace',fontSize:10,letterSpacing:'0.14em',textTransform:'uppercase',cursor:'pointer',transition:'all .15s'}}>
              {a==='alle'?'Alle':a}
            </button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{...T.monoLbl,letterSpacing:'0.18em'}}>PRIORITET</span>
          {['alle','kritisk','høy','middels','lav'].map(p=>(
            <button key={p} onClick={()=>setFilterPriority(p)}
              style={{background:filterPriority===p?priorityColor(p==='alle'?'middels':p):'transparent',color:filterPriority===p?C.cream:C.navy60,border:'1px solid '+(filterPriority===p?priorityColor(p==='alle'?'middels':p):C.hairline),padding:'5px 12px',fontFamily:'"IBM Plex Mono",monospace',fontSize:10,letterSpacing:'0.14em',textTransform:'uppercase',cursor:'pointer',transition:'all .15s'}}>
              {p==='alle'?'Alle':priorityLabel(p)}
            </button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:200}}>
          <span style={{...T.monoLbl,letterSpacing:'0.18em'}}>SØK</span>
          <input value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} placeholder="Tittel, notat, prosjekt…"
            style={{flex:1,padding:'6px 10px',border:'1px solid '+C.hairline,background:C.cream,fontFamily:'"IBM Plex Sans",sans-serif',fontSize:12,color:C.ink,outline:'none'}}
            onFocus={(e)=>e.target.style.borderColor=C.gold}
            onBlur={(e)=>e.target.style.borderColor=C.hairline}/>
        </div>
        {filtersActive&&(
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{...T.monoLbl,color:C.gold}}>{totalFiltered}/{totalAll}</span>
            <button onClick={()=>{setFilterAssignee('alle');setFilterPriority('alle');setSearchTerm('');}}
              style={{background:'none',border:'none',padding:0,fontFamily:'"IBM Plex Mono",monospace',fontSize:10,letterSpacing:'0.14em',textTransform:'uppercase',color:C.rust,cursor:'pointer'}}>
              ✕ Nullstill
            </button>
          </div>
        )}
      </div>
      {overdue.length>0&&<><SectionHead title="Forfalt" meta={overdue.length+' oppgaver'}/><TaskList tasks={overdue} update={update} removeTask={removeT} toggleDone={toggleDone} now={now} accent={C.rust} openDetail={openDetail}/></>}
      <SectionHead title="I dag" meta={todayT.length+' oppgaver'}/>
      <TaskList tasks={todayT} update={update} removeTask={removeT} toggleDone={toggleDone} now={now} accent={C.gold} addLabel="Legg til for i dag" onAdd={addT} openDetail={openDetail}/>
      <SectionHead title="Denne uka" meta={weekT.length+' oppgaver'}/>
      <TaskList tasks={weekT} update={update} removeTask={removeT} toggleDone={toggleDone} now={now} openDetail={openDetail}/>
      <SectionHead title="Senere & backlog" meta={later.length+' oppgaver'}/>
      <TaskList tasks={later} update={update} removeTask={removeT} toggleDone={toggleDone} now={now} addLabel="Legg til oppgave" onAdd={addT} openDetail={openDetail}/>
      {done.length>0&&<><SectionHead title="Ferdig" meta={done.length+''}/><TaskList tasks={done} update={update} removeTask={removeT} toggleDone={toggleDone} now={now} muted openDetail={openDetail}/></>}
      <Ornament/>
    </div>
  );
}

function ProjectCard({project,idx,update,removeProject,now,openDetail}){
  const openD=openDetail||(()=>{});
  const days=project.dueDate?daysBetween(now,parseDate(project.dueDate)):null;
  const dueColor=days==null?C.graphite:days<0?C.rust:days<=7?C.gold:C.ink;
  return (
    <div className="vn-row-hover" onClick={(e)=>rowClick(e,()=>openD('projects',idx))} style={{border:'1px solid '+C.hairline,background:C.creamPaper,padding:'24px 26px',borderTop:'2px solid '+projectStatusColor(project.status),position:'relative',cursor:'pointer'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
        <div style={{flex:1}}>
          <Editable value={project.name} onSave={(v)=>update('projects.'+idx+'.name',v)} style={{...T.itemTitle,fontSize:17,display:'block',marginBottom:4}}/>
          <Editable value={project.partner} onSave={(v)=>update('projects.'+idx+'.partner',v)} style={{...T.metaMono,display:'inline-block'}} placeholder="+ partner"/>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <ProjectStatusPicker value={project.status} onChange={(v)=>update('projects.'+idx+'.status',v)}/>
          <button onClick={()=>removeProject(idx)} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button>
        </div>
      </div>
      <div style={{marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
          <span style={{...T.monoLbl,letterSpacing:'0.14em'}}>Fremdrift</span>
          <span style={{...T.monoData,fontWeight:500,color:C.ink}}><Editable value={project.progress} onSave={(v)=>update('projects.'+idx+'.progress',Math.max(0,Math.min(100,v)))} type="number" style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:12,fontWeight:500,color:C.ink}}/> %</span>
        </div>
        <div style={{height:4,background:C.navy08}}><div style={{height:'100%',width:Math.max(0,Math.min(100,project.progress))+'%',background:projectStatusColor(project.status)}}></div></div>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{...T.monoLbl,marginBottom:6,letterSpacing:'0.14em'}}>Neste milepæl</div>
        <Editable value={project.nextMilestone} onSave={(v)=>update('projects.'+idx+'.nextMilestone',v)} style={{fontSize:14,color:C.ink,display:'block',lineHeight:1.5}} placeholder="—"/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',paddingTop:14,borderTop:'1px solid '+C.hairline}}>
        <div>
          <Editable value={project.dueDate} onSave={(v)=>update('projects.'+idx+'.dueDate',v)} style={T.monoData} placeholder="YYYY-MM-DD"/>
          {project.dueDate&&<span style={{...T.monoLbl,color:dueColor,marginLeft:8,letterSpacing:'0.10em'}}>· {formatDayLabel(project.dueDate,now)}</span>}
        </div>
        <Editable value={project.notes} onSave={(v)=>update('projects.'+idx+'.notes',v)} style={{...T.metaMono,fontStyle:'italic'}} placeholder="+ notat"/>
      </div>
    </div>
  );
}

function ProjectsPage({data,update,replaceList,now,openDetail}){
  const addP=()=>replaceList('projects',[...data.projects,{name:'Nytt prosjekt',status:'planlagt',progress:0,partner:'',dueDate:'',nextMilestone:'',notes:''}]);
  const removeP=(i)=>{if(confirm('Fjern dette prosjektet?'))replaceList('projects',data.projects.filter((_,idx)=>idx!==i));};
  const aktive=data.projects.filter(p=>p.status==='aktiv'||p.status==='pågående');
  const venter=data.projects.filter(p=>p.status==='venter');
  const planlagt=data.projects.filter(p=>p.status==='planlagt');
  const buckets=['aktiv','venter','planlagt','levert','pause'];
  const counts={}; buckets.forEach(b=>counts[b]=0);
  data.projects.forEach(p=>{if(counts[p.status]!=null)counts[p.status]++;else if(p.status==='pågående')counts['aktiv']++;});
  const total=data.projects.length||1;

  return (
    <div>
      <PageHero eyebrow="05 — Prosjekter · uke 21" headline={data.projects.length+' prosjekter.'} subhead={aktive.length+' aktive nå.'} intro={aktive.length+' aktive. '+venter.length+' venter på respons. '+planlagt.length+' planlagt etter Dyrkeland-lukking.'} onSave={()=>{}} rightContent={
        <div>
          <div style={{...T.monoLbl,marginBottom:20,letterSpacing:'0.22em'}}>Portefølje-status</div>
          {buckets.map((s)=>(
            <div key={s} style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}}>
                <span className="vn-mono" style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.14em',color:projectStatusColor(s),display:'inline-flex',alignItems:'center',gap:8}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:projectStatusColor(s)}}></span>{projectStatusLabel(s)}
                </span>
                <span className="vn-mono" style={{fontSize:12,color:C.graphite}}>{counts[s]}</span>
              </div>
              <div style={{height:3,background:C.navy08}}><div style={{height:'100%',width:(counts[s]/total*100)+'%',background:projectStatusColor(s)}}></div></div>
            </div>
          ))}
        </div>
      }/>
      <SectionHead title="Aktive prosjekter" meta={aktive.length+''}/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:24}}>
        {aktive.map((p)=>{const i=data.projects.indexOf(p);return <ProjectCard key={i} project={p} idx={i} update={update} removeProject={removeP} now={now} openDetail={openDetail}/>;})}
      </div>
      {venter.length>0&&<>
        <SectionHead title="Venter" meta={venter.length+''}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:24}}>
          {venter.map((p)=>{const i=data.projects.indexOf(p);return <ProjectCard key={i} project={p} idx={i} update={update} removeProject={removeP} now={now} openDetail={openDetail}/>;})}
        </div>
      </>}
      {planlagt.length>0&&<>
        <SectionHead title="Planlagt" meta={planlagt.length+''}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:24}}>
          {planlagt.map((p)=>{const i=data.projects.indexOf(p);return <ProjectCard key={i} project={p} idx={i} update={update} removeProject={removeP} now={now} openDetail={openDetail}/>;})}
        </div>
      </>}
      <div style={{marginTop:32,textAlign:'center'}}>
        <button onClick={addP} className="vn-mono" style={{background:'none',border:'1px solid '+C.hairline,padding:'14px 24px',fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:C.navy60,cursor:'pointer',fontFamily:'inherit'}}>+ Nytt prosjekt</button>
      </div>
      <Ornament/>
    </div>
  );
}

function SopsPage({data,update,replaceList,now,openDetail}){
  const openD=openDetail||(()=>{});
  const addS=()=>replaceList('sops',[...data.sops,{code:'NY-00',title:'Ny prosedyre',category:'Produksjon',version:'0.1',lastReviewed:'',owner:'Martin',status:'utkast'}]);
  const removeS=(i)=>{if(confirm('Fjern denne SOPen?'))replaceList('sops',data.sops.filter((_,idx)=>idx!==i));};
  const categories=['Produksjon','Drift','Kvalitet'];
  const grouped={}; categories.forEach(c=>grouped[c]=[]);
  data.sops.forEach((s,i)=>{const cat=grouped[s.category]?s.category:'Produksjon';grouped[cat].push({...s,_i:i});});
  const fresh=data.sops.filter(s=>s.lastReviewed&&daysBetween(parseDate(s.lastReviewed),now)<90).length;
  const aging=data.sops.filter(s=>s.lastReviewed&&daysBetween(parseDate(s.lastReviewed),now)>=90&&daysBetween(parseDate(s.lastReviewed),now)<180).length;
  const stale=data.sops.filter(s=>!s.lastReviewed||daysBetween(parseDate(s.lastReviewed),now)>=180).length;
  const total=data.sops.length||1;
  const dueForReview=data.sops.filter(s=>!s.lastReviewed||daysBetween(parseDate(s.lastReviewed),now)>90).length;

  return (
    <div>
      <PageHero eyebrow="06 — Standard prosedyrer" headline="Disiplin før skala." subhead={data.sops.length+' dokumenter aktive.'} intro={'Struktur skal gradvis erstatte improvisasjon. '+dueForReview+' SOPer er over 3 mnd siden sist revidert og bør oppdateres. '+data.sops.filter(s=>s.status==='revisjon').length+' under aktiv revisjon.'} onSave={()=>{}} rightContent={
        <div>
          <div style={{...T.monoLbl,marginBottom:20,letterSpacing:'0.22em'}}>Revisjonsstatus</div>
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}}>
              <span className="vn-mono" style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.14em',color:C.sage,display:'inline-flex',alignItems:'center',gap:8}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:C.sage}}></span>Frisk (&lt; 3 mnd)
              </span>
              <span className="vn-mono" style={{fontSize:12,color:C.graphite}}>{fresh}</span>
            </div>
            <div style={{height:3,background:C.navy08}}><div style={{height:'100%',width:(fresh/total*100)+'%',background:C.sage}}></div></div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}}>
              <span className="vn-mono" style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.14em',color:C.gold,display:'inline-flex',alignItems:'center',gap:8}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:C.gold}}></span>Aldrer (3–6 mnd)
              </span>
              <span className="vn-mono" style={{fontSize:12,color:C.graphite}}>{aging}</span>
            </div>
            <div style={{height:3,background:C.navy08}}><div style={{height:'100%',width:(aging/total*100)+'%',background:C.gold}}></div></div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}}>
              <span className="vn-mono" style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.14em',color:C.rust,display:'inline-flex',alignItems:'center',gap:8}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:C.rust}}></span>Trenger revisjon (&gt; 6 mnd)
              </span>
              <span className="vn-mono" style={{fontSize:12,color:C.graphite}}>{stale}</span>
            </div>
            <div style={{height:3,background:C.navy08}}><div style={{height:'100%',width:(stale/total*100)+'%',background:C.rust}}></div></div>
          </div>
        </div>
      }/>
      {categories.map((cat)=>grouped[cat].length>0&&(
        <React.Fragment key={cat}>
          <SectionHead title={cat} meta={grouped[cat].length+' SOPer'}/>
          <section style={{border:'1px solid '+C.hairline,background:C.creamPaper}}>
            <div className="vn-mono" style={{display:'grid',gridTemplateColumns:'100px 2fr 80px 1.2fr 1fr 1fr 60px',gap:20,padding:'14px 28px',background:C.creamDeep,fontSize:10,textTransform:'uppercase',letterSpacing:'0.16em',color:C.navy60}}>
              <div>Kode</div><div>Tittel</div><div>Versjon</div><div>Sist revidert</div><div>Eier</div><div>Status</div><div></div>
            </div>
            {grouped[cat].map((s,viewIdx)=>{
              const i=s._i;
              const reviewAge=formatReviewAge(s.lastReviewed,now);
              return (
                <div key={i} className="vn-partner-row vn-row-hover" onClick={(e)=>rowClick(e,()=>openD('sops',i))} style={{display:'grid',gridTemplateColumns:'100px 2fr 80px 1.2fr 1fr 1fr 60px',gap:20,alignItems:'center',padding:'20px 28px',borderBottom:viewIdx<grouped[cat].length-1?'1px solid '+C.hairline:'none',fontSize:13,cursor:'pointer'}}>
                  <Editable value={s.code} onSave={(v)=>update('sops.'+i+'.code',v)} style={{...T.monoData,fontWeight:500,color:C.ink,fontSize:12}}/>
                  <Editable value={s.title} onSave={(v)=>update('sops.'+i+'.title',v)} style={{...T.itemTitle,fontSize:14}}/>
                  <Editable value={s.version} onSave={(v)=>update('sops.'+i+'.version',v)} style={{...T.monoData,fontSize:12}}/>
                  <div>
                    <Editable value={s.lastReviewed} onSave={(v)=>update('sops.'+i+'.lastReviewed',v)} style={T.monoData} placeholder="YYYY-MM-DD"/>
                    <div style={{...T.monoLbl,color:reviewAge.color,marginTop:2,letterSpacing:'0.10em'}}>{reviewAge.label}</div>
                  </div>
                  <Editable value={s.owner} onSave={(v)=>update('sops.'+i+'.owner',v)} style={{fontSize:13,color:C.graphite}}/>
                  <SopStatusPicker value={s.status} onChange={(v)=>update('sops.'+i+'.status',v)}/>
                  <div style={{justifySelf:'end'}}><button onClick={()=>removeS(i)} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button></div>
                </div>
              );
            })}
          </section>
        </React.Fragment>
      ))}
      <div style={{marginTop:32,textAlign:'center'}}>
        <button onClick={addS} className="vn-mono" style={{background:'none',border:'1px solid '+C.hairline,padding:'14px 24px',fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:C.navy60,cursor:'pointer',fontFamily:'inherit'}}>+ Ny SOP</button>
      </div>
      <Ornament/>
    </div>
  );
}

function EventList({events,update,removeEvent,now,accent,openDetail}){
  const openD=openDetail||(()=>{});
  return (
    <section style={{border:'1px solid '+C.hairline,background:C.creamPaper,position:'relative'}}>
      {accent&&<div style={{position:'absolute',left:-1,top:-1,width:32,height:2,background:accent}}></div>}
      {events.map((e,viewIdx)=>{
        const i=e._i;
        return (
          <div key={i} className="vn-partner-row vn-row-hover" onClick={(ev)=>rowClick(ev,()=>openD('events',i))} style={{display:'grid',gridTemplateColumns:'120px 80px 1fr 140px 140px 60px',gap:24,alignItems:'center',padding:'20px 28px',borderBottom:viewIdx<events.length-1?'1px solid '+C.hairline:'none',fontSize:13,cursor:'pointer'}}>
            <div>
              <Editable value={e.date} onSave={(v)=>update('events.'+i+'.date',v)} style={T.monoData} placeholder="YYYY-MM-DD"/>
              <div style={{...T.monoLbl,color:daysBetween(now,parseDate(e.date))===0?C.gold:C.navy60,marginTop:2,letterSpacing:'0.10em'}}>{formatDayLabel(e.date,now)}</div>
            </div>
            <Editable value={e.time} onSave={(v)=>update('events.'+i+'.time',v)} style={{...T.monoData,fontWeight:500,color:eventTypeColor(e.type)}} placeholder="—"/>
            <div>
              <Editable value={e.title} onSave={(v)=>update('events.'+i+'.title',v)} style={{...T.itemTitle,fontSize:14,display:'block'}}/>
              {e.notes&&<Editable value={e.notes} onSave={(v)=>update('events.'+i+'.notes',v)} style={{...T.metaMono,marginTop:3,display:'inline-block'}}/>}
              {!e.notes&&<Editable value={e.notes} onSave={(v)=>update('events.'+i+'.notes',v)} style={{...T.metaMono,marginTop:3,display:'inline-block'}} placeholder="+ notat"/>}
            </div>
            <EventTypePicker value={e.type} onChange={(v)=>update('events.'+i+'.type',v)}/>
            <Editable value={e.who} onSave={(v)=>update('events.'+i+'.who',v)} style={{fontSize:13,color:C.graphite}}/>
            <div style={{justifySelf:'end'}}><button onClick={()=>removeEvent(i)} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button></div>
          </div>
        );
      })}
    </section>
  );
}

// ═══════════════════════════════════════════════════════
// LOGG — complete production-log register (Mattilsynet / traceability)
// Lists EVERY entry from wedge_observasjoner + forkompost_logg, exportable to CSV.
// ═══════════════════════════════════════════════════════
function LoggPage(){
  const [rows,setRows]=useState(null);
  const [error,setError]=useState(null);
  const [source,setSource]=useState('all');   // all | wedge | forkompost
  const [unit,setUnit]=useState('all');        // specific wedge_id / batch_id
  const [search,setSearch]=useState('');
  const [sortDesc,setSortDesc]=useState(true);

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      const sb=window.__vnSb;
      if(!sb){setError('Supabase ikke tilgjengelig.');return;}
      try{
        const [obs,fk]=await Promise.all([
          sb.from('wedge_observasjoner').select('*').order('dato',{ascending:false}).order('tid',{ascending:false}),
          sb.from('forkompost_logg').select('*').order('dato',{ascending:false}).order('tid',{ascending:false}),
        ]);
        if(obs.error) throw obs.error;
        if(fk.error) throw fk.error;
        const norm=[];
        (obs.data||[]).forEach(o=>norm.push({
          kilde:'Wedge', enhet:o.wedge_id||'—', dato:o.dato||'', tid:(o.tid||'').slice(0,5),
          temp:o.temperatur_c, ph:o.ph,
          fukt:o.fuktighet_pct!=null?o.fuktighet_pct+' %':(o.fukt||''),
          lukt:o.lukt||'', struktur:o.struktur||'', aktivitet:o.mark_aktivitet||'',
          avvik:o.avvik||'', tiltak:o.tiltak||'', ansvarlig:o.ansvarlig||'',
          notater:o.notater||'', loggtype:o.loggtype||'', _id:o.id, _ts:(o.dato||'')+'T'+(o.tid||'00:00'),
        }));
        (fk.data||[]).forEach(o=>norm.push({
          kilde:'Forkompost', enhet:o.batch_id||'—', dato:o.dato||'', tid:(o.tid||'').slice(0,5),
          temp:o.temperatur_c, ph:o.ph,
          fukt:o.fuktighet_pct!=null?o.fuktighet_pct+' %':(o.fukt||''),
          lukt:o.lukt||'', struktur:o.struktur||'', aktivitet:o.aktivitet||'',
          avvik:o.avvik||'', tiltak:o.tiltak||'', ansvarlig:o.ansvarlig||'',
          notater:o.notater||'', loggtype:'', _id:o.id, _ts:(o.dato||'')+'T'+(o.tid||'00:00'),
        }));
        if(!cancelled) setRows(norm);
      }catch(e){ if(!cancelled) setError(e.message||'Kunne ikke hente loggdata'); }
    })();
    return ()=>{cancelled=true;};
  },[]);

  const units=rows?Array.from(new Set(rows.filter(r=>source==='all'||r.kilde.toLowerCase().startsWith(source)).map(r=>r.enhet))).sort():[];

  const filtered=(rows||[]).filter(r=>{
    if(source!=='all' && !r.kilde.toLowerCase().startsWith(source)) return false;
    if(unit!=='all' && r.enhet!==unit) return false;
    if(search){
      const q=search.toLowerCase();
      const hay=[r.enhet,r.dato,r.ansvarlig,r.avvik,r.tiltak,r.notater,r.lukt,r.struktur,r.aktivitet].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  }).sort((a,b)=> sortDesc ? (a._ts<b._ts?1:-1) : (a._ts>b._ts?1:-1));

  const COLS=[
    {k:'dato',label:'Dato'},{k:'tid',label:'Tid'},{k:'kilde',label:'Kilde'},{k:'enhet',label:'Enhet'},
    {k:'temp',label:'Temp °C'},{k:'ph',label:'pH'},{k:'fukt',label:'Fukt'},{k:'lukt',label:'Lukt'},
    {k:'struktur',label:'Struktur'},{k:'aktivitet',label:'Aktivitet'},{k:'avvik',label:'Avvik'},
    {k:'tiltak',label:'Tiltak'},{k:'ansvarlig',label:'Ansvarlig'},{k:'notater',label:'Notater'},
  ];

  const exportCsv=()=>{
    const esc=(v)=>{ const s=v==null?'':String(v); return /[",\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
    const header=COLS.map(c=>c.label).join(';');
    const lines=filtered.map(r=>COLS.map(c=>esc(r[c.k])).join(';'));
    const csv='﻿'+[header,...lines].join('\r\n');   // BOM for Excel + Norwegian chars
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download='verminord-loggregister-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const avvikCount=(rows||[]).filter(r=>r.avvik&&r.avvik.trim()).length;
  const dateRange=rows&&rows.length?(()=>{ const ds=rows.map(r=>r.dato).filter(Boolean).sort(); return ds.length?ds[0]+' → '+ds[ds.length-1]:'—'; })():'—';

  return (
    <div>
      <PageHero
        eyebrow="08 — Loggregister"
        headline="Full sporbarhet."
        subhead={rows?(rows.length+' loggføringer totalt.'):'Henter…'}
        intro={rows?('Komplett register over alle produksjonsobservasjoner — wedge-bed og forkompost. Periode: '+dateRange+'. '+avvikCount+' avvik registrert. Eksporter til CSV for Mattilsynet eller arkiv.'):'Laster loggdata fra databasen…'}
        onSave={()=>{}}
        rightContent={
          <div>
            <div style={{...T.monoLbl,marginBottom:20,letterSpacing:'0.22em'}}>Eksport</div>
            <button onClick={exportCsv} disabled={!rows||filtered.length===0}
              style={{width:'100%',padding:'14px 18px',background:C.ink,color:C.cream,border:'none',fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.16em',textTransform:'uppercase',cursor:!rows||filtered.length===0?'not-allowed':'pointer',opacity:!rows||filtered.length===0?0.4:1,marginBottom:12}}>
              ↓ Last ned CSV ({filtered.length})
            </button>
            <div style={{...T.metaMono,color:C.navy60,lineHeight:1.5}}>
              Lastes ned med semikolon-skille og BOM — åpnes rett i Excel med norske tegn.
            </div>
          </div>
        }
      />

      {error && <div style={{margin:'0 0 20px',padding:'14px 18px',background:'rgba(166,75,42,0.10)',color:C.rust,border:'1px solid '+C.rust,fontSize:13}}>Feil: {error}</div>}

      {/* Filters */}
      <div style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'center',marginBottom:18}}>
        <div style={{display:'inline-flex',border:'1px solid '+C.hairline,background:C.creamPaper}}>
          {[['all','Alle'],['wedge','Wedge'],['forkompost','Forkompost']].map(([k,lbl])=>(
            <button key={k} onClick={()=>{setSource(k);setUnit('all');}} className="vn-mono"
              style={{padding:'9px 16px',background:source===k?C.ink:'transparent',color:source===k?C.cream:C.navy60,border:'none',cursor:'pointer',fontSize:10,letterSpacing:'0.14em',textTransform:'uppercase'}}>{lbl}</button>
          ))}
        </div>
        <select value={unit} onChange={(e)=>setUnit(e.target.value)} className="vn-mono"
          style={{padding:'9px 12px',border:'1px solid '+C.hairline,background:C.creamPaper,color:C.ink,fontSize:11,minHeight:38}}>
          <option value="all">Alle enheter</option>
          {units.map(u=><option key={u} value={u}>{u}</option>)}
        </select>
        <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Søk: dato, ansvarlig, avvik, notat…"
          style={{flex:1,minWidth:200,padding:'9px 14px',border:'1px solid '+C.hairline,background:C.creamPaper,color:C.ink,fontSize:13,minHeight:38}}/>
        <button onClick={()=>setSortDesc(!sortDesc)} className="vn-mono"
          style={{padding:'9px 14px',border:'1px solid '+C.hairline,background:C.creamPaper,color:C.navy60,cursor:'pointer',fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',minHeight:38}}>
          {sortDesc?'↓ Nyeste først':'↑ Eldste først'}
        </button>
      </div>

      {!rows && !error && <div style={{...T.itemBody,color:C.navy60,padding:'40px 0',textAlign:'center'}}>Laster loggdata…</div>}

      {rows && (
        <div style={{overflowX:'auto',border:'1px solid '+C.hairline,background:C.creamPaper}}>
          <table style={{borderCollapse:'collapse',width:'100%',minWidth:1100,fontSize:12}}>
            <thead>
              <tr style={{background:C.creamDeep}}>
                {COLS.map(c=>(
                  <th key={c.k} className="vn-mono" style={{textAlign:'left',padding:'12px 14px',fontSize:9.5,textTransform:'uppercase',letterSpacing:'0.12em',color:C.navy60,whiteSpace:'nowrap',borderBottom:'1px solid '+C.hairline,position:'sticky',top:0}}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && (
                <tr><td colSpan={COLS.length} style={{padding:'30px',textAlign:'center',color:C.navy60,fontSize:13}}>Ingen loggføringer matcher filteret.</td></tr>
              )}
              {filtered.map((r,i)=>(
                <tr key={r._id||i} style={{borderBottom:'1px solid '+C.hairline,background:r.avvik&&r.avvik.trim()?'rgba(166,75,42,0.05)':'transparent'}}>
                  {COLS.map(c=>{
                    const v=r[c.k];
                    const isMono=['dato','tid','temp','ph','fukt'].includes(c.k);
                    const isEnhet=c.k==='enhet'||c.k==='kilde';
                    return (
                      <td key={c.k} style={{padding:'10px 14px',verticalAlign:'top',color:c.k==='avvik'&&v?C.rust:C.graphite,fontFamily:isMono?'"IBM Plex Mono",monospace':'inherit',fontWeight:isEnhet?500:400,whiteSpace:c.k==='notater'||c.k==='tiltak'?'normal':'nowrap',maxWidth:c.k==='notater'?260:undefined}}>
                        {v==null||v===''?'—':String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows && <div style={{...T.metaMono,color:C.navy60,marginTop:14}}>Viser {filtered.length} av {rows.length} loggføringer.</div>}
    </div>
  );
}

function CalendarPage({data,update,replaceList,now,openDetail}){
  const addE=()=>replaceList('events',[...data.events,{date:new Date().toISOString().slice(0,10),time:'',title:'Ny hendelse',type:'møte',who:'Martin',notes:''}]);
  const removeE=(i)=>{if(confirm('Fjern denne hendelsen?'))replaceList('events',data.events.filter((_,idx)=>idx!==i));};
  const all=data.events.map((e,i)=>({...e,_i:i,when:parseDateTime(e.date,e.time)})).filter(e=>e.when);
  const sorted=[...all].sort((a,b)=>a.when-b.when);
  const upcoming=sorted.filter(e=>e.when.getTime()>=startOfDay(now).getTime());
  const next=sorted.find(e=>e.when.getTime()>=now.getTime());
  const todayE=upcoming.filter(e=>daysBetween(now,parseDate(e.date))===0);
  const tomorrowE=upcoming.filter(e=>daysBetween(now,parseDate(e.date))===1);
  const thisWeek=upcoming.filter(e=>{const d=daysBetween(now,parseDate(e.date));return d>1&&d<=7;});
  const nextWeek=upcoming.filter(e=>{const d=daysBetween(now,parseDate(e.date));return d>7&&d<=14;});
  const later=upcoming.filter(e=>daysBetween(now,parseDate(e.date))>14);

  return (
    <div>
      <PageHero eyebrow="07 — Kalender · uke 21" headline={next?next.title:'Ingen flere hendelser.'} subhead={next?formatTimeUntil(next.date,next.time,now)+'.':'Tom kalender foran.'} intro={todayE.length+' i dag. '+tomorrowE.length+' i morgen. '+thisWeek.length+' senere denne uka.'} onSave={()=>{}} rightContent={
        <div>
          <div style={{...T.monoLbl,marginBottom:20,letterSpacing:'0.22em'}}>Dagens agenda</div>
          {todayE.length===0?<div style={{fontSize:15,color:C.graphite,lineHeight:1.5}}>Ingen planlagte hendelser i dag.</div>:todayE.map((e,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'70px 1fr',gap:14,padding:'12px 0',borderBottom:i<todayE.length-1?'1px solid '+C.hairline:'none'}}>
              <span className="vn-mono" style={{fontSize:13,color:eventTypeColor(e.type),fontWeight:500}}>{e.time||'—'}</span>
              <div>
                <div style={{fontSize:14,color:C.ink,marginBottom:2}}>{e.title}</div>
                <div style={T.monoLbl}>{eventTypeLabel(e.type)} · {e.who}</div>
              </div>
            </div>
          ))}
        </div>
      }/>
      {todayE.length>0&&<><SectionHead title="I dag" meta={todayE.length+' hendelser'}/><EventList events={todayE} update={update} removeEvent={removeE} now={now} accent={C.gold} openDetail={openDetail}/></>}
      {tomorrowE.length>0&&<><SectionHead title="I morgen" meta={tomorrowE.length+''}/><EventList events={tomorrowE} update={update} removeEvent={removeE} now={now} openDetail={openDetail}/></>}
      {thisWeek.length>0&&<><SectionHead title="Senere denne uka" meta={thisWeek.length+''}/><EventList events={thisWeek} update={update} removeEvent={removeE} now={now} openDetail={openDetail}/></>}
      {nextWeek.length>0&&<><SectionHead title="Neste uke" meta={nextWeek.length+''}/><EventList events={nextWeek} update={update} removeEvent={removeE} now={now} openDetail={openDetail}/></>}
      {later.length>0&&<><SectionHead title="Senere" meta={later.length+''}/><EventList events={later} update={update} removeEvent={removeE} now={now} openDetail={openDetail}/></>}
      <div style={{marginTop:32,textAlign:'center'}}>
        <button onClick={addE} className="vn-mono" style={{background:'none',border:'1px solid '+C.hairline,padding:'14px 24px',fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:C.navy60,cursor:'pointer',fontFamily:'inherit'}}>+ Ny hendelse</button>
      </div>
      <Ornament/>
    </div>
  );
}

function CompassPage({data,update,replaceList}){
  const addD=()=>replaceList('compass',{...data.compass,decisions:[...data.compass.decisions,{text:'Ny beslutning…',date:new Date().toLocaleDateString('nb-NO',{day:'2-digit',month:'2-digit'})}]});
  const removeD=(i)=>{if(confirm('Fjern denne?'))replaceList('compass',{...data.compass,decisions:data.compass.decisions.filter((_,idx)=>idx!==i)});};
  const addW=()=>replaceList('compass',{...data.compass,wins:[...data.compass.wins,'Ny vinning…']});
  const removeW=(i)=>{if(confirm('Fjern denne?'))replaceList('compass',{...data.compass,wins:data.compass.wins.filter((_,idx)=>idx!==i)});};
  const addL=()=>replaceList('compass',{...data.compass,lessons:[...data.compass.lessons,'Ny lærdom…']});
  const removeL=(i)=>{if(confirm('Fjern denne?'))replaceList('compass',{...data.compass,lessons:data.compass.lessons.filter((_,idx)=>idx!==i)});};

  return (
    <div>
      <PageHero eyebrow={'08 — Ukentlig kompass · uke '+data.compass.week} headline={'Uke '+data.compass.week+'.'} subhead={data.compass.pillars[data.compass.activePillar]?data.compass.pillars[data.compass.activePillar].name+' først.':'Fokus.'} intro={data.compass.focus} onSave={()=>{}} rightContent={
        <div>
          <div style={{...T.monoLbl,marginBottom:18,letterSpacing:'0.22em'}}>Founder-energi</div>
          <div style={{display:'flex',alignItems:'baseline',gap:14}}>
            <Editable value={data.compass.energy} onSave={(v)=>update('compass.energy',Math.max(1,Math.min(5,v)))} type="number" style={{...T.bigNum,color:data.compass.energy>=4?C.sage:data.compass.energy>=3?C.gold:C.rust}}/>
            <span style={{fontSize:18,fontWeight:400,color:C.navy60,letterSpacing:'0.04em'}}>/ 5</span>
          </div>
          <div style={{...T.metaMono,marginTop:10}}>Selvvurdert · klikk for å oppdatere</div>
          <div style={{marginTop:24,display:'flex',gap:6}}>
            {[1,2,3,4,5].map(n=>(<div key={n} onClick={()=>update('compass.energy',n)} style={{flex:1,height:8,background:n<=data.compass.energy?(data.compass.energy>=4?C.sage:data.compass.energy>=3?C.gold:C.rust):C.navy08,cursor:'pointer',transition:'background .2s'}}></div>))}
          </div>
          <div style={{marginTop:24,paddingTop:18,borderTop:'1px solid '+C.hairline}}>
            <div style={T.monoLbl}>Operativ prioritet</div>
            <div style={{fontSize:14,color:C.ink,marginTop:8,fontStyle:'italic',lineHeight:1.5}}>"Beskytt founder-energi" — Strategikart-pilar</div>
          </div>
        </div>
      }/>
      <SectionHead title="Fire pilarer · ukens fokus"/>
      <section style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:24}}>
        {data.compass.pillars.map((p,i)=>{
          const active=i===data.compass.activePillar;
          return (
            <div key={i} style={{border:'1px solid '+C.hairline,background:active?'rgba(184,146,58,0.05)':C.creamPaper,padding:'28px 24px',borderTop:'3px solid '+(active?C.gold:C.hairline),transition:'border-color .15s, background .15s',minHeight:180}}>
              <div onClick={()=>update('compass.activePillar',i)} style={{cursor:'pointer',marginBottom:14}}>
                <Editable value={p.name} onSave={(v)=>update('compass.pillars.'+i+'.name',v)} style={{...T.monoLbl,color:active?C.gold:C.navy60,fontWeight:500,letterSpacing:'0.16em',display:'block'}}/>
              </div>
              <Editable value={p.focus} onSave={(v)=>update('compass.pillars.'+i+'.focus',v)} multiline style={{fontSize:14,lineHeight:1.5,whiteSpace:'pre-line',display:'block',color:C.ink}}/>
            </div>
          );
        })}
      </section>
      <SectionHead title="Beslutninger denne uka" meta={data.compass.decisions.length+' tatt'}/>
      <section style={{border:'1px solid '+C.hairline,background:C.creamPaper}}>
        {data.compass.decisions.map((d,i)=>(
          <div key={i} className="vn-row-hover" style={{display:'grid',gridTemplateColumns:'80px 1fr 60px',gap:24,alignItems:'flex-start',padding:'22px 28px',borderBottom:i<data.compass.decisions.length-1?'1px solid '+C.hairline:'none'}}>
            <Editable value={d.date} onSave={(v)=>update('compass.decisions.'+i+'.date',v)} style={T.monoData}/>
            <Editable value={d.text} onSave={(v)=>update('compass.decisions.'+i+'.text',v)} multiline style={{fontSize:14,lineHeight:1.5,color:C.ink}}/>
            <div style={{justifySelf:'end'}}><button onClick={()=>removeD(i)} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button></div>
          </div>
        ))}
        <AddRow onClick={addD} label="Legg til beslutning"/>
      </section>
      <section style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:32,marginTop:32}}>
        <div>
          <SectionHead title="Vinninger" meta={data.compass.wins.length+''}/>
          <section style={{border:'1px solid '+C.hairline,background:C.creamPaper,marginTop:-16}}>
            {data.compass.wins.map((w,i)=>(
              <div key={i} className="vn-row-hover" style={{display:'grid',gridTemplateColumns:'24px 1fr 60px',gap:16,alignItems:'flex-start',padding:'18px 24px',borderBottom:i<data.compass.wins.length-1?'1px solid '+C.hairline:'none'}}>
                <div style={{...T.monoLbl,color:C.sage,paddingTop:2}}>↗</div>
                <Editable value={w} onSave={(v)=>update('compass.wins.'+i,v)} multiline style={{fontSize:13,lineHeight:1.5,color:C.ink}}/>
                <div style={{justifySelf:'end'}}><button onClick={()=>removeW(i)} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button></div>
              </div>
            ))}
            <AddRow onClick={addW} label="Legg til"/>
          </section>
        </div>
        <div>
          <SectionHead title="Lærdom" meta={data.compass.lessons.length+''}/>
          <section style={{border:'1px solid '+C.hairline,background:C.creamPaper,marginTop:-16}}>
            {data.compass.lessons.map((l,i)=>(
              <div key={i} className="vn-row-hover" style={{display:'grid',gridTemplateColumns:'24px 1fr 60px',gap:16,alignItems:'flex-start',padding:'18px 24px',borderBottom:i<data.compass.lessons.length-1?'1px solid '+C.hairline:'none'}}>
                <div style={{...T.monoLbl,color:C.gold,paddingTop:2}}>◇</div>
                <Editable value={l} onSave={(v)=>update('compass.lessons.'+i,v)} multiline style={{fontSize:13,lineHeight:1.5,color:C.ink}}/>
                <div style={{justifySelf:'end'}}><button onClick={()=>removeL(i)} className="vn-remove-btn vn-row-actions" aria-label="Fjern">×</button></div>
              </div>
            ))}
            <AddRow onClick={addL} label="Legg til"/>
          </section>
        </div>
      </section>
      <section style={{marginTop:56,paddingTop:40,borderTop:'1px solid '+C.hairline}}>
        <div style={{...T.monoLbl,marginBottom:20,letterSpacing:'0.22em'}}>Fra strategikartet</div>
        <blockquote style={{...T.quote,fontSize:22,lineHeight:1.5,margin:0,maxWidth:760}}>
          <Editable value={data.quote.text} onSave={(v)=>update('quote.text',v)} multiline style={{...T.quote,fontSize:22,lineHeight:1.5}}/>
        </blockquote>
        <cite style={{...T.monoLbl,display:'block',fontStyle:'normal',marginTop:18,letterSpacing:'0.16em'}}>
          <Editable value={data.quote.source} onSave={(v)=>update('quote.source',v)} style={{...T.monoLbl,letterSpacing:'0.16em'}}/>
        </cite>
      </section>
      <Ornament/>
    </div>
  );
}

function VerminordApp(){
  const [view,setView]=useState('brief');
  const [data,setData]=useState(SEED);
  const [meta,setMeta]=useState({});
  const [loaded,setLoaded]=useState(false);
  const [saveStatus,setSaveStatus]=useState('saved');
  const [now,setNow]=useState(new Date());
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [detail,setDetail]=useState(null); // {collection, idx} — opens DetailPanel
  const saveTimerRef=useRef(null);
  const openDetail=useCallback((collection, idx)=>{ setDetail({collection, idx}); }, []);
  const closeDetail=useCallback(()=>setDetail(null), []);
  // Close detail panel on Escape, switching tabs handled elsewhere
  useEffect(()=>{
    if(!detail) return;
    const onKey=(e)=>{ if(e.key==='Escape') setDetail(null); };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[detail]);

  useEffect(()=>{
    const stored=storageGet(KEY_DATA);
    const storedMeta=storageGet(KEY_META);
    if(stored)setData(deepMerge(SEED,stored));
    if(storedMeta)setMeta(storedMeta);
    setLoaded(true);
  },[]);

  useEffect(()=>{
    const id=setInterval(()=>setNow(new Date()),30000);
    return ()=>clearInterval(id);
  },[]);

  useEffect(()=>{
    if(typeof window!=='undefined')window.scrollTo({top:0,behavior:'smooth'});
  },[view]);

  const persist=useCallback((newData)=>{
    setSaveStatus('saving');
    if(saveTimerRef.current)clearTimeout(saveTimerRef.current);
    saveTimerRef.current=setTimeout(()=>{
      const ok=storageSet(KEY_DATA,newData);
      const newMeta={lastSaved:new Date().toISOString()};
      setMeta(newMeta); storageSet(KEY_META,newMeta);
      setSaveStatus(ok?'saved':'error');
    },300);
  },[]);

  const update=useCallback((path,value)=>{
    setData(prev=>{const next=setByPath(prev,path,value);persist(next);return next;});
  },[persist]);

  const replaceList=useCallback((key,newList)=>{
    setData(prev=>{const next={...prev,[key]:newList};persist(next);return next;});
  },[persist]);

  const onReset=()=>{storageDelete(KEY_DATA);storageDelete(KEY_META);setData(SEED);setMeta({});setSaveStatus('saved');};
  const onExport=()=>{
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='verminord-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();
    URL.revokeObjectURL(url);
  };
  const onImport=(imported)=>{setData(deepMerge(SEED,imported));persist(deepMerge(SEED,imported));};

  const dateStr=now.toLocaleDateString('nb-NO',{weekday:'long',day:'numeric',month:'long'});
  const timeStr=now.toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'});
  const lastSaved=meta.lastSaved?formatRelative(meta.lastSaved):null;
  const statusText=saveStatus==='saving'?'Lagrer…':saveStatus==='error'?'Lagringsfeil':lastSaved?'Lagret '+lastSaved:'Klar';
  const statusColor=saveStatus==='error'?C.rust:saveStatus==='saving'?C.gold:C.sage;
  const statusGlow=saveStatus==='saving'?'vn-pulse':'';

  const navItems=[
    {key:'brief',label:'Brief'},
    {key:'sales',label:'Salg'},
    {key:'feedstock',label:'Råstoff'},
    {key:'partners',label:'Partnere'},
    {key:'tasks',label:'Oppgaver'},
    {key:'projects',label:'Prosjekter'},
    {key:'sops',label:'SOPs'},
    {key:'logg',label:'Logg'},
    {key:'calendar',label:'Kalender'},
    {key:'compass',label:'Kompass'},
  ];

  if(!loaded)return <div className="vn-boot">Laster…</div>;

  return (
    <div className="vn-page" style={{minHeight:'100vh',background:C.cream,color:C.ink}}>
      <Settings open={settingsOpen} onClose={()=>setSettingsOpen(false)} onReset={onReset} onExport={onExport} onImport={onImport}/>
      <header className="vn-header" style={{borderBottom:'1px solid '+C.hairline,padding:'24px 48px',display:'flex',justifyContent:'space-between',alignItems:'center',maxWidth:1320,margin:'0 auto',background:C.cream,position:'sticky',top:0,zIndex:40}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <BrandMark/>
          <div>
            <div style={{fontWeight:500,fontSize:15,letterSpacing:'-0.005em',color:C.ink}}>VERMINORD</div>
            <div className="vn-mono" style={{fontSize:9.5,color:C.navy60,letterSpacing:'0.2em',textTransform:'uppercase',marginTop:2}}>Operativ sentral</div>
          </div>
        </div>
        <nav className="vn-nav" style={{display:'flex',gap:24,alignItems:'center'}}>
          {navItems.map((n)=>(
            <button key={n.key} onClick={()=>setView(n.key)} className="vn-mono" style={{background:'none',border:'none',cursor:'pointer',fontSize:12,letterSpacing:'0.10em',textTransform:'uppercase',color:view===n.key?C.ink:C.navy60,fontWeight:view===n.key?500:400,fontFamily:'inherit',padding:'4px 0',borderBottom:'2px solid '+(view===n.key?C.gold:'transparent'),transition:'color .15s, border-color .15s'}}>{n.label}</button>
          ))}
        </nav>
        <div style={{display:'flex',alignItems:'center',gap:18}}>
          <div className="vn-header-meta" style={{textAlign:'right'}}>
            <div className="vn-mono" style={{fontSize:11,color:C.navy60,letterSpacing:'0.1em',textTransform:'uppercase'}}>{dateStr}</div>
            <div className="vn-mono" style={{fontSize:11,color:C.ink,marginTop:2,letterSpacing:'0.04em'}}>{timeStr} · Jæren</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,paddingLeft:14,borderLeft:'1px solid '+C.hairline}}>
            <span className={statusGlow} style={{width:6,height:6,borderRadius:'50%',background:statusColor}}></span>
            <span className="vn-mono" style={{fontSize:10,color:C.navy60,letterSpacing:'0.12em',textTransform:'uppercase',minWidth:88}}>{statusText}</span>
          </div>
          <button onClick={()=>setSettingsOpen(true)} aria-label="Innstillinger" style={{background:'none',border:'none',cursor:'pointer',padding:6,color:C.navy60,display:'flex',alignItems:'center'}} onMouseEnter={(e)=>e.currentTarget.style.color=C.ink} onMouseLeave={(e)=>e.currentTarget.style.color=C.navy60}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M8 1V3M8 13V15M15 8H13M3 8H1M12.95 3.05L11.54 4.46M4.46 11.54L3.05 12.95M12.95 12.95L11.54 11.54M4.46 4.46L3.05 3.05" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </button>
        </div>
      </header>
      <main className="vn-shell" style={{maxWidth:1320,margin:'0 auto',padding:'0 48px 80px'}}>
        {view==='brief'&&<DailyBrief data={data} update={update} replaceList={replaceList} now={now} openDetail={openDetail}/>}
        {view==='sales'&&<SalesPage data={data} update={update} replaceList={replaceList} openDetail={openDetail}/>}
        {view==='feedstock'&&<FeedstockPage data={data} update={update} replaceList={replaceList} now={now} openDetail={openDetail}/>}
        {view==='partners'&&<PartnersPage data={data} update={update} replaceList={replaceList} openDetail={openDetail}/>}
        {view==='tasks'&&<TasksPage data={data} update={update} replaceList={replaceList} now={now} openDetail={openDetail}/>}
        {view==='projects'&&<ProjectsPage data={data} update={update} replaceList={replaceList} now={now} openDetail={openDetail}/>}
        {view==='sops'&&<SopsPage data={data} update={update} replaceList={replaceList} now={now} openDetail={openDetail}/>}
        {view==='logg'&&<LoggPage/>}
        {view==='calendar'&&<CalendarPage data={data} update={update} replaceList={replaceList} now={now} openDetail={openDetail}/>}
        {view==='compass'&&<CompassPage data={data} update={update} replaceList={replaceList}/>}
        <BrainDump data={data} update={update} replaceList={replaceList}/>
        <DetailPanel detail={detail} data={data} update={update} replaceList={replaceList} now={now} onClose={closeDetail}/>
        <footer style={{marginTop:40,paddingTop:40,borderTop:'1px solid '+C.hairline,display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
          <div style={{...T.metaMono}}>Verminord AS · 935 948 878 · Jæren, Rogaland</div>
          <div style={{...T.metaMono}}>Operativ sentral v0.6 · {dateStr}</div>
        </footer>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// BRAIN DUMP — AI-powered context capture
// Paste any text → Claude extracts structured data → user confirms → writes to Supabase
// ═══════════════════════════════════════════════════════
function BrainDump({data, replaceList, update}){
  const [open,setOpen]=useState(false);
  const [text,setText]=useState('');
  const [suggestions,setSuggestions]=useState(null);
  const [selected,setSelected]=useState({});
  const [processing,setProcessing]=useState(false);
  const [committing,setCommitting]=useState(false);
  const [status,setStatus]=useState(null);

  const reset=useCallback(()=>{
    setText('');setSuggestions(null);setSelected({});setStatus(null);setProcessing(false);setCommitting(false);
  },[]);

  const handleSubmit=async()=>{
    if(!text.trim()||processing) return;
    setProcessing(true);setStatus(null);
    try{
      const res=await fetch('/.netlify/functions/brain-dump',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text,context:{partners:(data.partners||[]).map(p=>p.name)}}),
      });
      const result=await res.json();
      if(!res.ok||result.error) throw new Error(result.error||('HTTP '+res.status));
      setSuggestions(result);
      const sel={};
      (result.actions||[]).forEach((_,i)=>{sel[i]=true;});
      setSelected(sel);
    }catch(e){
      setStatus({type:'error',text:'Kunne ikke forstå: '+e.message});
    }finally{
      setProcessing(false);
    }
  };

  const handleConfirm=async()=>{
    if(!suggestions||committing) return;
    const toApply=(suggestions.actions||[]).filter((_,i)=>selected[i]);
    if(toApply.length===0){setStatus({type:'error',text:'Velg minst én forslag'});return;}
    setCommitting(true);setStatus(null);
    let okCount=0,errCount=0;
    const errors=[];

    for(const action of toApply){
      try{
        await executeAction(action,data,update,replaceList);
        okCount++;
      }catch(e){
        errCount++;
        errors.push(action.type+': '+e.message);
      }
    }

    if(errCount===0){
      setStatus({type:'ok',text:'✓ '+okCount+' endringer lagret'});
      setTimeout(()=>{setOpen(false);reset();},1500);
    }else{
      setStatus({type:'error',text:okCount+' ok, '+errCount+' feilet: '+errors.join('; ')});
      setCommitting(false);
    }
  };

  const toggleSel=(i)=>setSelected(s=>({...s,[i]:!s[i]}));

  return (
    <>
      {/* Floating brain button — bottom right, always visible */}
      <button
        onClick={()=>setOpen(true)}
        aria-label="Brain dump"
        style={{
          position:'fixed',right:24,bottom:'max(24px, calc(env(safe-area-inset-bottom) + 16px))',zIndex:998,
          width:56,height:56,borderRadius:'50%',
          background:C.ink,color:C.cream,
          border:'none',cursor:'pointer',
          boxShadow:'0 6px 24px rgba(21,35,58,0.25), 0 0 0 1px rgba(21,35,58,0.1)',
          fontSize:24,display:'flex',alignItems:'center',justifyContent:'center',
          transition:'transform .15s, box-shadow .15s',
        }}
        onMouseEnter={(e)=>e.currentTarget.style.transform='scale(1.06)'}
        onMouseLeave={(e)=>e.currentTarget.style.transform='scale(1)'}
      >🧠</button>

      {/* Modal overlay */}
      {open&&(
        <div onClick={()=>!committing&&!processing&&setOpen(false)}
          style={{position:'fixed',inset:0,zIndex:999,background:'rgba(10,20,36,0.55)',display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'40px 20px',backdropFilter:'blur(4px)'}}>
          <div onClick={(e)=>e.stopPropagation()}
            style={{background:C.cream,maxWidth:680,width:'100%',maxHeight:'85vh',overflow:'auto',padding:'32px 28px',borderTop:'3px solid '+C.gold,border:'1px solid '+C.hairline,boxShadow:'0 20px 60px rgba(0,0,0,0.2)',position:'relative'}}>

            {/* Header */}
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:18}}>
              <div>
                <div style={{...T.monoLbl,color:C.gold,letterSpacing:'0.22em'}}>🧠 BRAIN DUMP</div>
                <h2 style={{fontFamily:'"IBM Plex Sans",sans-serif',fontSize:24,fontWeight:500,letterSpacing:'-0.015em',marginTop:6,color:C.ink}}>Hva sa eller skrev noen?</h2>
              </div>
              <button onClick={()=>!committing&&!processing&&setOpen(false)}
                style={{background:'none',border:'none',cursor:'pointer',fontSize:22,color:C.navy60,padding:'4px 8px'}}>×</button>
            </div>

            {!suggestions&&(
              <>
                <p style={{...T.itemBody,color:C.graphite,marginBottom:14}}>
                  Lim inn e-post, notater, samtale-resymé — eller bare en idé. Claude forstår og foreslår endringer.
                </p>
                <textarea
                  value={text}
                  onChange={(e)=>setText(e.target.value)}
                  placeholder={'F.eks. "Snakket med Habiba i dag — Dyrkeland vil ha 60×20L istedenfor 40, ny pris ca 47k. Vil ha levering uke 24. Jeg lovte å sende oppdatert tilbud innen tirsdag."'}
                  rows={9}
                  disabled={processing}
                  style={{width:'100%',padding:'14px 16px',border:'1px solid '+C.hairline,background:C.creamPaper,fontFamily:'"IBM Plex Sans",sans-serif',fontSize:14,lineHeight:1.55,color:C.ink,outline:'none',resize:'vertical',minHeight:160,boxSizing:'border-box'}}
                />
                {status&&(
                  <div style={{marginTop:14,padding:'10px 14px',fontSize:13,background:status.type==='ok'?'rgba(107,117,68,0.10)':'rgba(166,75,42,0.10)',color:status.type==='ok'?C.sage:C.rust,border:'1px solid '+(status.type==='ok'?C.sage:C.rust)}}>
                    {status.text}
                  </div>
                )}
                <div style={{marginTop:20,display:'flex',gap:12,justifyContent:'flex-end'}}>
                  <button onClick={()=>!processing&&setOpen(false)} disabled={processing}
                    style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',padding:'12px 22px',background:'none',color:C.navy60,border:'1px solid '+C.hairline,cursor:processing?'not-allowed':'pointer'}}>
                    Avbryt
                  </button>
                  <button onClick={handleSubmit} disabled={!text.trim()||processing}
                    style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',padding:'12px 22px',background:C.ink,color:C.cream,border:'none',cursor:!text.trim()||processing?'not-allowed':'pointer',opacity:!text.trim()||processing?0.5:1}}>
                    {processing?'Forstår…':'Forstå det →'}
                  </button>
                </div>
              </>
            )}

            {suggestions&&(
              <>
                {suggestions.summary&&(
                  <div style={{padding:'14px 18px',background:'rgba(184,146,58,0.06)',border:'1px solid rgba(184,146,58,0.2)',borderLeft:'3px solid '+C.gold,marginBottom:18}}>
                    <div style={{...T.monoLbl,color:C.gold,marginBottom:6}}>OPPSUMMERING</div>
                    <div style={{...T.itemBody}}>{suggestions.summary}</div>
                  </div>
                )}
                <div style={{...T.monoLbl,marginBottom:12}}>🎯 FORSLAG ({(suggestions.actions||[]).length})</div>
                <div style={{border:'1px solid '+C.hairline,background:C.creamPaper}}>
                  {(suggestions.actions||[]).map((action,i)=>(
                    <label key={i} style={{display:'flex',gap:14,padding:'14px 18px',borderBottom:i<suggestions.actions.length-1?'1px solid '+C.hairline:'none',cursor:'pointer',alignItems:'flex-start'}}>
                      <input type="checkbox" checked={!!selected[i]} onChange={()=>toggleSel(i)}
                        style={{marginTop:3,width:16,height:16,accentColor:C.gold}} />
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                          <span style={{...T.monoLbl,color:actionColor(action.type),padding:'2px 8px',background:actionColor(action.type)+'15',border:'1px solid '+actionColor(action.type)+'40'}}>{actionLabel(action.type)}</span>
                        </div>
                        <div style={{...T.itemTitle,fontSize:14}}>{actionDescribe(action)}</div>
                        {action.preview&&<div style={{...T.itemBody,marginTop:4,color:C.graphite}}>{action.preview}</div>}
                      </div>
                    </label>
                  ))}
                </div>
                {status&&(
                  <div style={{marginTop:14,padding:'10px 14px',fontSize:13,background:status.type==='ok'?'rgba(107,117,68,0.10)':'rgba(166,75,42,0.10)',color:status.type==='ok'?C.sage:C.rust,border:'1px solid '+(status.type==='ok'?C.sage:C.rust)}}>
                    {status.text}
                  </div>
                )}
                <div style={{marginTop:20,display:'flex',gap:12,justifyContent:'space-between',alignItems:'center'}}>
                  <button onClick={()=>{setSuggestions(null);setSelected({});setStatus(null);}} disabled={committing}
                    style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',padding:'12px 18px',background:'none',color:C.navy60,border:'1px solid '+C.hairline,cursor:committing?'not-allowed':'pointer'}}>
                    ← Tilbake
                  </button>
                  <button onClick={handleConfirm} disabled={committing||Object.values(selected).filter(Boolean).length===0}
                    style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',padding:'12px 22px',background:C.gold,color:C.cream,border:'none',cursor:committing?'not-allowed':'pointer',opacity:committing?0.6:1}}>
                    {committing?'Lagrer…':'Bekreft '+Object.values(selected).filter(Boolean).length+' valgt'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Action helpers
function actionColor(type){
  return ({
    ADD_TASK:C.gold,
    UPDATE_PARTNER:C.sage,
    CREATE_ORDER:C.rust,
    ADD_TO_COMPASS_WINS:C.sage,
    ADD_TO_COMPASS_DECISIONS:C.ink,
    ADD_LAB_REPORT:C.navy60,
  }[type]||C.navy60);
}
function actionLabel(type){
  return ({
    ADD_TASK:'Ny oppgave',
    UPDATE_PARTNER:'Oppdater partner',
    CREATE_ORDER:'Ny ordre',
    ADD_TO_COMPASS_WINS:'Win',
    ADD_TO_COMPASS_DECISIONS:'Beslutning',
    ADD_LAB_REPORT:'Lab-rapport',
  }[type]||type);
}
function actionDescribe(a){
  const d=a.data||{};
  if(a.type==='ADD_TASK') return (d.tittel||'Oppgave')+(d.ansvarlig?' → '+d.ansvarlig:'')+(d.frist?' · frist '+d.frist:'');
  if(a.type==='UPDATE_PARTNER') return d.name+(d.status?' → '+d.status:'')+(d.notater?' · '+d.notater:'');
  if(a.type==='CREATE_ORDER') return (d.customer||'Kunde')+(d.items?' · '+d.items:'')+(d.amount_nok?' · '+d.amount_nok+' NOK':'');
  if(a.type==='ADD_TO_COMPASS_WINS') return typeof d==='string'?d:(d.text||'');
  if(a.type==='ADD_TO_COMPASS_DECISIONS') return (typeof d==='string'?d:(d.text||''))+(d.date?' ('+d.date+')':'');
  if(a.type==='ADD_LAB_REPORT') return 'Lab-rapport'+(d.rapport_id?' '+d.rapport_id:'');
  return JSON.stringify(d);
}

// Execute a confirmed action against Supabase + local state
async function executeAction(action,data,update,replaceList){
  const sb=window.__vnSb;
  if(!sb) throw new Error('Supabase ikke koblet til');
  const d=action.data||{};

  if(action.type==='ADD_TASK'){
    const {error}=await sb.from('oppgaver').insert({
      tittel:d.tittel||'Ny oppgave',
      beskrivelse:d.beskrivelse||null,
      ansvarlig:d.ansvarlig||'Martin',
      prioritet:d.prioritet||'medium',
      status:'ikke_startet',
      frist:d.frist||null,
    });
    if(error) throw error;
    return;
  }
  if(action.type==='UPDATE_PARTNER'){
    // Find existing partner row — use fuzzy match with wildcards
    const searchName=(d.name||'').trim();
    if(!searchName) throw new Error('Partner-navn mangler');
    const {data:rows,error:findErr}=await sb.from('partnere').select('id, navn').ilike('navn','%'+searchName+'%');
    if(findErr) throw findErr;
    // Prefer exact case-insensitive match if multiple results
    let match=null;
    if(rows&&rows.length>0){
      match=rows.find(r=>r.navn.toLowerCase()===searchName.toLowerCase()) || rows[0];
    }
    const updates={siste_kontakt:new Date().toISOString().slice(0,10)};
    if(d.status) updates.status=d.status;
    if(d.notater) updates.notater=d.notater;
    if(match){
      const {error}=await sb.from('partnere').update(updates).eq('id',match.id);
      if(error) throw error;
    }else{
      // Create new partner
      const {error}=await sb.from('partnere').insert({navn:searchName,type:d.type||null,status:d.status||'lead',notater:d.notater||null,siste_kontakt:updates.siste_kontakt});
      if(error) throw error;
    }
    return;
  }
  if(action.type==='CREATE_ORDER'){
    // Try find partner by name (fuzzy match)
    let partner_id=null;
    if(d.customer){
      const searchName=d.customer.trim();
      const {data:rows}=await sb.from('partnere').select('id, navn').ilike('navn','%'+searchName+'%');
      if(rows&&rows.length>0){
        const match=rows.find(r=>r.navn.toLowerCase()===searchName.toLowerCase()) || rows[0];
        partner_id=match.id;
      }
    }
    const ord_nr='ORD-'+Date.now().toString().slice(-6);
    const {error}=await sb.from('ordrer').insert({
      ordre_nr:ord_nr,
      partner_id,
      status:d.status||'utkast',
      total_nok:d.amount_nok||0,
      notater:d.notes||d.items||null,
    });
    if(error) throw error;
    return;
  }
  if(action.type==='ADD_TO_COMPASS_WINS'){
    const text=typeof d==='string'?d:(d.text||'');
    if(!text) throw new Error('Tom win-tekst');
    // P1-7 fix: re-read fresh state before appending (the `data` prop is a closure
    // captured when the modal opened — could be stale if auto-refresh updated state since)
    let fresh=null; try{fresh=JSON.parse(localStorage.getItem(KEY_DATA)||'{}');}catch(e){}
    const current=(fresh&&fresh.compass)||data.compass||{};
    const wins=[...(current.wins||[]),text];
    update('compass.wins',wins);
    return;
  }
  if(action.type==='ADD_TO_COMPASS_DECISIONS'){
    const text=typeof d==='string'?d:(d.text||'');
    if(!text) throw new Error('Tom beslutning-tekst');
    const date=(typeof d==='object'&&d.date)?d.date:new Date().toISOString().slice(5,10).replace('-','.');
    // P1-7 fix: re-read fresh state before appending (see ADD_TO_COMPASS_WINS above)
    let fresh=null; try{fresh=JSON.parse(localStorage.getItem(KEY_DATA)||'{}');}catch(e){}
    const current=(fresh&&fresh.compass)||data.compass||{};
    const decisions=[...(current.decisions||[]),{text,date}];
    update('compass.decisions',decisions);
    return;
  }
  if(action.type==='ADD_LAB_REPORT'){
    const {error}=await sb.from('lab_rapporter').insert({
      rapport_id:d.rapport_id||'AUTO-'+Date.now().toString().slice(-6),
      test_dato:d.test_dato||new Date().toISOString().slice(0,10),
      ph:d.ph||null,n_pct:d.n_pct||null,p_pct:d.p_pct||null,k_pct:d.k_pct||null,
      notater:d.notater||d.notes||null,
    });
    if(error) throw error;
    return;
  }
  throw new Error('Ukjent action type: '+action.type);
}

// ═══════════════════════════════════════════════════════
// ERROR BOUNDARY — catches any render crash so the screen never goes blank.
// Gives Martin a recovery path: reload, export emergency backup, or copy the error.
// ═══════════════════════════════════════════════════════
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { error: null, info: null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){
    this.setState({ info });
    try { console.error('[Verminord crash]', error, info); } catch(e) {}
  }
  exportBackup = () => {
    try {
      const data = localStorage.getItem(KEY_DATA) || '{}';
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'verminord-emergency-' + new Date().toISOString().slice(0,16).replace(/[T:]/g,'-') + '.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch(e) {
      alert('Kunne ikke laste ned: ' + e.message);
    }
  };
  copyError = () => {
    try {
      const text = String(this.state.error?.stack || this.state.error?.message || this.state.error);
      navigator.clipboard.writeText(text);
    } catch(e) {}
  };
  render(){
    if(!this.state.error) return this.props.children;
    return (
      <div style={{minHeight:'100vh',background:C.cream,padding:'40px 24px',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{background:C.creamPaper,border:'1px solid '+C.hairline,borderTop:'3px solid '+C.rust,padding:'36px 32px',maxWidth:560,width:'100%',boxShadow:'0 8px 32px rgba(21,35,58,0.08)'}}>
          <div style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:10,letterSpacing:'0.22em',textTransform:'uppercase',color:C.rust,marginBottom:12}}>● FEIL · APPEN KRASJET</div>
          <h1 style={{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:700,fontSize:30,lineHeight:1.1,letterSpacing:'-0.018em',color:C.ink,margin:'0 0 12px'}}>Noe gikk galt.</h1>
          <p style={{fontFamily:'"IBM Plex Sans",sans-serif',fontSize:14,lineHeight:1.55,color:C.graphite,marginBottom:18}}>
            Dataen din er trygg i nettleseren. Last på nytt for å prøve igjen — eller last ned en sikkerhetskopi før du gjør noe.
          </p>
          <div style={{padding:'12px 14px',background:'rgba(166,75,42,0.08)',border:'1px solid rgba(166,75,42,0.25)',fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:C.rust,marginBottom:20,lineHeight:1.5,wordBreak:'break-word'}}>
            {String(this.state.error?.message || this.state.error || 'Ukjent feil')}
          </div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            <button onClick={()=>location.reload()} style={{padding:'12px 22px',background:C.ink,color:C.cream,border:'none',fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>Last på nytt</button>
            <button onClick={this.exportBackup} style={{padding:'12px 22px',background:'transparent',color:C.ink,border:'1px solid '+C.hairline,fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>Last ned data</button>
            <button onClick={this.copyError} style={{padding:'12px 22px',background:'transparent',color:C.navy60,border:'1px solid '+C.hairline,fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>Kopier feil</button>
          </div>
        </div>
      </div>
    );
  }
}

// ═══════════════════════════════════════════════════════
// DETAIL PANEL — click any row/card to open this side panel with full editable view
// Row click is filtered: only fires when the click target is NOT an interactive element
// (button, input, .vn-editable, etc.) — so inline editing keeps working untouched.
// ═══════════════════════════════════════════════════════
function DetailField({label, children, hint}){
  return (
    <div style={{marginBottom:18, paddingBottom:18, borderBottom:'1px solid '+C.hairline}}>
      <div style={{...T.monoLbl, marginBottom:8, letterSpacing:'0.16em'}}>{label}</div>
      <div style={{fontSize:14, color:C.ink, lineHeight:1.55}}>{children}</div>
      {hint && <div style={{...T.metaMono, marginTop:6, fontStyle:'italic'}}>{hint}</div>}
    </div>
  );
}

function DetailSection({title, children}){
  return (
    <div style={{marginTop:24, paddingTop:18, borderTop:'2px solid '+C.hairline}}>
      <div style={{...T.monoLbl, marginBottom:14, letterSpacing:'0.18em', color:C.gold}}>{title}</div>
      {children}
    </div>
  );
}

function DetailRelatedRow({primary, secondary, accent}){
  return (
    <div style={{padding:'12px 0', borderTop:'1px solid '+C.hairline, display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12}}>
      <span style={{fontSize:13, color:C.ink, flex:1, lineHeight:1.4}}>{primary}</span>
      {secondary && <span style={{...T.metaMono, color:accent||C.navy60, whiteSpace:'nowrap'}}>{secondary}</span>}
    </div>
  );
}

function DetailPanel({detail, data, update, replaceList, now, onClose}){
  if(!detail) return null;
  const {collection, idx} = detail;
  const list = data[collection];
  if(!Array.isArray(list)) return null;
  const item = list[idx];
  if(!item) return null;

  const path = (k) => collection+'.'+idx+'.'+k;
  const removeItem = () => {
    if(!confirm('Slett denne?')) return;
    replaceList(collection, list.filter((_,i)=>i!==idx));
    onClose();
  };

  let eyebrow='', title='', body=null;

  if(collection==='tasks'){
    eyebrow='OPPGAVE';
    title=item.title || 'Uten tittel';
    const ds = delegationStatus(item);
    body = (
      <>
        <DetailField label="Tittel"><Editable value={item.title} onSave={(v)=>update(path('title'),v)} style={{fontSize:16, fontWeight:500, color:C.ink, display:'block'}}/></DetailField>
        <DetailField label="Ansvarlig"><Editable value={item.assignee} onSave={(v)=>update(path('assignee'),v)} placeholder="Martin / Mathias" style={{fontSize:14, color:C.ink}}/></DetailField>
        <DetailField label="Prosjekt"><Editable value={item.project} onSave={(v)=>update(path('project'),v)} placeholder="—" style={{fontSize:14, color:C.ink}}/></DetailField>
        <DetailField label="Prioritet"><PriorityPicker value={item.priority} onChange={(v)=>update(path('priority'),v)}/></DetailField>
        <DetailField label="Status"><TaskStatusPicker value={item.status} onChange={(v)=>update(path('status'),v)}/></DetailField>
        <DetailField label="Frist"><DateInput value={item.due} onSave={(v)=>update(path('due'),v)}/></DetailField>
        <DetailField label="Notater"><Editable value={item.notes} onSave={(v)=>update(path('notes'),v)} multiline placeholder="—" style={{fontSize:14, color:C.graphite, lineHeight:1.55, display:'block'}}/></DetailField>
        {ds && <DetailField label="Delegering"><span style={{color:ds.color, fontWeight:500}}>{ds.icon} {ds.label}</span></DetailField>}
        {item._created_at && <DetailField label="Opprettet"><span style={T.monoData}>{new Date(item._created_at).toLocaleString('nb-NO')}</span></DetailField>}
        {item._updated_at && item._updated_at!==item._created_at && <DetailField label="Sist endret"><span style={T.monoData}>{new Date(item._updated_at).toLocaleString('nb-NO')}</span></DetailField>}
      </>
    );
  } else if(collection==='partners'){
    eyebrow='PARTNER';
    title=item.name || 'Uten navn';
    const n = (item.name||'').toLowerCase();
    const relOrders = n ? (data.orders||[]).filter(o => (o.customer||'').toLowerCase().includes(n)) : [];
    const relTasks  = n ? (data.tasks||[]).filter(t => ((t.title||'').toLowerCase().includes(n) || (t.project||'').toLowerCase().includes(n) || (t.notes||'').toLowerCase().includes(n))) : [];
    body = (
      <>
        <DetailField label="Navn"><Editable value={item.name} onSave={(v)=>update(path('name'),v)} style={{fontSize:16, fontWeight:500, color:C.ink, display:'block'}}/></DetailField>
        <DetailField label="Type"><Editable value={item.type} onSave={(v)=>update(path('type'),v)} style={{fontSize:14, color:C.ink}}/></DetailField>
        <DetailField label="Temperatur"><TempPicker value={item.temp} onChange={(v)=>update(path('temp'),v)}/></DetailField>
        <DetailField label="Sist kontakt"><Editable value={item.last} onSave={(v)=>update(path('last'),v)} placeholder="DD.MM" style={T.monoData}/><span style={{color:C.navy60, marginLeft:8}}>·</span> <Editable value={item.age} onSave={(v)=>update(path('age'),v)} placeholder="—" style={T.monoData}/></DetailField>
        <DetailField label="Kategori"><Editable value={item.kind} onSave={(v)=>update(path('kind'),v)} style={{fontSize:14, color:C.ink}}/></DetailField>
        <DetailField label="Neste handling"><Editable value={item.next} onSave={(v)=>update(path('next'),v)} multiline placeholder="—" style={{fontSize:14, color:C.graphite, lineHeight:1.55, display:'block'}}/></DetailField>
        {relOrders.length>0 && (
          <DetailSection title={'Ordrer ('+relOrders.length+')'}>
            {relOrders.map((o,i)=>(<DetailRelatedRow key={i} primary={(o.customer||'—')+' · '+(o.items||'')} secondary={nbsp(o.amount||0)+' NOK · '+orderStatusLabel(o.status)} accent={orderStatusColor(o.status)}/>))}
          </DetailSection>
        )}
        {relTasks.length>0 && (
          <DetailSection title={'Oppgaver ('+relTasks.length+')'}>
            {relTasks.map((t,i)=>(<DetailRelatedRow key={i} primary={t.title||'—'} secondary={priorityLabel(t.priority)+' · '+taskStatusLabel(t.status)} accent={priorityColor(t.priority)}/>))}
          </DetailSection>
        )}
      </>
    );
  } else if(collection==='projects'){
    eyebrow='PROSJEKT';
    title=item.name || 'Nytt prosjekt';
    const n = (item.name||'').toLowerCase();
    const relTasks = n ? (data.tasks||[]).filter(t => (t.project||'').toLowerCase()===n) : [];
    body = (
      <>
        <DetailField label="Navn"><Editable value={item.name} onSave={(v)=>update(path('name'),v)} style={{fontSize:16, fontWeight:500, color:C.ink, display:'block'}}/></DetailField>
        <DetailField label="Partner"><Editable value={item.partner} onSave={(v)=>update(path('partner'),v)} placeholder="—" style={{fontSize:14, color:C.ink}}/></DetailField>
        <DetailField label="Status"><ProjectStatusPicker value={item.status} onChange={(v)=>update(path('status'),v)}/></DetailField>
        <DetailField label="Fremdrift"><Editable value={item.progress} onSave={(v)=>update(path('progress'),Math.max(0,Math.min(100,v)))} type="number" style={{fontSize:14, color:C.ink}}/> %</DetailField>
        <DetailField label="Frist"><DateInput value={item.dueDate} onSave={(v)=>update(path('dueDate'),v)}/></DetailField>
        <DetailField label="Neste milepæl"><Editable value={item.nextMilestone} onSave={(v)=>update(path('nextMilestone'),v)} multiline placeholder="—" style={{fontSize:14, color:C.ink, display:'block', lineHeight:1.55}}/></DetailField>
        <DetailField label="Notater"><Editable value={item.notes} onSave={(v)=>update(path('notes'),v)} multiline placeholder="—" style={{fontSize:14, color:C.graphite, display:'block', lineHeight:1.55}}/></DetailField>
        {relTasks.length>0 && (
          <DetailSection title={'Oppgaver i prosjektet ('+relTasks.length+')'}>
            {relTasks.map((t,i)=>(<DetailRelatedRow key={i} primary={t.title||'—'} secondary={priorityLabel(t.priority)+' · '+taskStatusLabel(t.status)} accent={priorityColor(t.priority)}/>))}
          </DetailSection>
        )}
      </>
    );
  } else if(collection==='orders'){
    eyebrow='ORDRE';
    title=item.customer || 'Uten kunde';
    body = (
      <>
        <DetailField label="Kunde"><Editable value={item.customer} onSave={(v)=>update(path('customer'),v)} style={{fontSize:16, fontWeight:500, color:C.ink, display:'block'}}/></DetailField>
        <DetailField label="Innhold"><Editable value={item.items} onSave={(v)=>update(path('items'),v)} style={{fontSize:14, color:C.ink}}/></DetailField>
        <DetailField label="Beløp"><Editable value={item.amount} onSave={(v)=>update(path('amount'),v)} type="number" formatter={(v)=>nbsp(v)} style={{fontSize:16, fontWeight:500, color:C.ink}}/> NOK</DetailField>
        <DetailField label="Status"><OrderStatusPicker value={item.status} onChange={(v)=>update(path('status'),v)}/></DetailField>
        <DetailField label="Dato"><Editable value={item.date} onSave={(v)=>update(path('date'),v)} placeholder="DD.MM" style={T.monoData}/></DetailField>
        <DetailField label="Notater"><Editable value={item.notes} onSave={(v)=>update(path('notes'),v)} multiline placeholder="—" style={{fontSize:14, color:C.graphite, display:'block', lineHeight:1.55}}/></DetailField>
      </>
    );
  } else if(collection==='actions'){
    eyebrow='HANDLING I DAG';
    title=item.title || 'Ny sak';
    body = (
      <>
        <DetailField label="Tittel"><Editable value={item.title} onSave={(v)=>update(path('title'),v)} style={{fontSize:16, fontWeight:500, color:C.ink, display:'block'}}/></DetailField>
        <DetailField label="Kontekst"><Editable value={item.context} onSave={(v)=>update(path('context'),v)} multiline style={{fontSize:14, color:C.graphite, display:'block', lineHeight:1.55}}/></DetailField>
        <DetailField label="Type"><TagPicker value={item.tagType} onChange={(v)=>update(path('tagType'),v)}/></DetailField>
        <DetailField label="Tag-tekst"><Editable value={item.tag} onSave={(v)=>update(path('tag'),v)} style={{fontSize:14, color:tagColor(item.tagType)}}/></DetailField>
        <DetailField label="Verdi"><Editable value={item.value} onSave={(v)=>update(path('value'),v)} placeholder="—" style={T.monoData}/></DetailField>
      </>
    );
  } else if(collection==='sops'){
    eyebrow='SOP';
    title=(item.code?item.code+' · ':'')+(item.title||'Uten tittel');
    const ra = formatReviewAge(item.lastReviewed, now);
    body = (
      <>
        <DetailField label="Kode"><Editable value={item.code} onSave={(v)=>update(path('code'),v)} style={{fontFamily:'"IBM Plex Mono",monospace', fontSize:14, fontWeight:500, color:C.ink}}/></DetailField>
        <DetailField label="Tittel"><Editable value={item.title} onSave={(v)=>update(path('title'),v)} style={{fontSize:16, fontWeight:500, color:C.ink, display:'block'}}/></DetailField>
        <DetailField label="Kategori"><Editable value={item.category} onSave={(v)=>update(path('category'),v)} style={{fontSize:14, color:C.ink}}/></DetailField>
        <DetailField label="Versjon"><Editable value={item.version} onSave={(v)=>update(path('version'),v)} style={T.monoData}/></DetailField>
        <DetailField label="Sist revidert" hint={ra && ra.label!=='—' ? ra.label : null}><Editable value={item.lastReviewed} onSave={(v)=>update(path('lastReviewed'),v)} placeholder="YYYY-MM-DD" style={T.monoData}/></DetailField>
        <DetailField label="Eier"><Editable value={item.owner} onSave={(v)=>update(path('owner'),v)} style={{fontSize:14, color:C.ink}}/></DetailField>
        <DetailField label="Status"><SopStatusPicker value={item.status} onChange={(v)=>update(path('status'),v)}/></DetailField>
      </>
    );
  } else if(collection==='events'){
    eyebrow='HENDELSE';
    title=item.title || 'Ny hendelse';
    body = (
      <>
        <DetailField label="Tittel"><Editable value={item.title} onSave={(v)=>update(path('title'),v)} style={{fontSize:16, fontWeight:500, color:C.ink, display:'block'}}/></DetailField>
        <DetailField label="Dato" hint={item.date?formatDayLabel(item.date,now):null}><DateInput value={item.date} onSave={(v)=>update(path('date'),v)}/></DetailField>
        <DetailField label="Tid"><Editable value={item.time} onSave={(v)=>update(path('time'),v)} placeholder="HH:MM" style={T.monoData}/></DetailField>
        <DetailField label="Type"><EventTypePicker value={item.type} onChange={(v)=>update(path('type'),v)}/></DetailField>
        <DetailField label="Hvem"><Editable value={item.who} onSave={(v)=>update(path('who'),v)} style={{fontSize:14, color:C.ink}}/></DetailField>
        <DetailField label="Notater"><Editable value={item.notes} onSave={(v)=>update(path('notes'),v)} multiline placeholder="—" style={{fontSize:14, color:C.graphite, display:'block', lineHeight:1.55}}/></DetailField>
      </>
    );
  } else if(collection==='feedstock'){
    eyebrow='RÅSTOFF';
    title=item.name || 'Nytt materiale';
    body = (
      <>
        <DetailField label="Navn"><Editable value={item.name} onSave={(v)=>update(path('name'),v)} style={{fontSize:16, fontWeight:500, color:C.ink, display:'block'}}/></DetailField>
        <DetailField label="Dager rest"><Editable value={item.days} onSave={(v)=>update(path('days'),v)} type="number" style={{fontSize:18, fontWeight:500, color:feedColor(item.days)}}/></DetailField>
        <DetailField label="Kilde / leverandør"><Editable value={item.source} onSave={(v)=>update(path('source'),v)} placeholder="—" style={{fontSize:14, color:C.ink}}/></DetailField>
      </>
    );
  } else if(collection==='deliveries'){
    eyebrow='LEVERANSE';
    title=item.material || 'Ny leveranse';
    body = (
      <>
        <DetailField label="Materiale"><Editable value={item.material} onSave={(v)=>update(path('material'),v)} style={{fontSize:16, fontWeight:500, color:C.ink, display:'block'}}/></DetailField>
        <DetailField label="Dato" hint={item.date?formatDayLabel(item.date,now):null}><DateInput value={item.date} onSave={(v)=>update(path('date'),v)}/></DetailField>
        <DetailField label="Mengde"><Editable value={item.amount} onSave={(v)=>update(path('amount'),v)} placeholder="—" style={T.monoData}/></DetailField>
        <DetailField label="Status"><DeliveryStatusPicker value={item.status} onChange={(v)=>update(path('status'),v)}/></DetailField>
      </>
    );
  } else if(collection==='feedstockOutreach'){
    eyebrow='LEVERANDØR-PROSPEKT';
    title=item.name || 'Ny prospekt';
    body = (
      <>
        <DetailField label="Navn"><Editable value={item.name} onSave={(v)=>update(path('name'),v)} style={{fontSize:16, fontWeight:500, color:C.ink, display:'block'}}/></DetailField>
        <DetailField label="Fase"><StagePicker value={item.stage} onChange={(v)=>update(path('stage'),v)}/></DetailField>
        <DetailField label="Notater"><Editable value={item.notes} onSave={(v)=>update(path('notes'),v)} multiline placeholder="—" style={{fontSize:14, color:C.graphite, display:'block', lineHeight:1.55}}/></DetailField>
      </>
    );
  } else {
    body = <div style={{color:C.navy60}}>Detalj ikke støttet for "{collection}".</div>;
  }

  return (
    <div onClick={onClose} className="vn-detail-backdrop" style={{position:'fixed', inset:0, background:'rgba(10,20,36,0.45)', zIndex:1100, display:'flex', justifyContent:'flex-end'}}>
      <div onClick={(e)=>e.stopPropagation()} className="vn-detail-panel" style={{width:480, maxWidth:'94vw', height:'100vh', background:C.creamPaper, overflowY:'auto', borderLeft:'1px solid '+C.hairline, boxShadow:'-12px 0 32px rgba(10,20,36,0.18)', display:'flex', flexDirection:'column'}}>
        <div style={{padding:'22px 28px 16px', borderBottom:'1px solid '+C.hairline, display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'sticky', top:0, background:C.creamPaper, zIndex:1}}>
          <div>
            <div style={{...T.monoLbl, color:C.gold, marginBottom:4, letterSpacing:'0.22em'}}>{eyebrow}</div>
            <div style={{fontSize:10, color:C.navy60, fontFamily:'"IBM Plex Mono",monospace', letterSpacing:'0.06em'}}>#{String(idx+1).padStart(2,'0')}</div>
          </div>
          <button onClick={onClose} aria-label="Lukk" style={{background:'none', border:'none', fontSize:24, color:C.navy60, cursor:'pointer', padding:'4px 8px', lineHeight:1}}>×</button>
        </div>
        <div style={{padding:'24px 28px', flex:1}}>
          <h2 style={{fontFamily:'"IBM Plex Sans",sans-serif', fontWeight:500, fontSize:22, lineHeight:1.25, letterSpacing:'-0.012em', marginBottom:28, color:C.ink}}>{title}</h2>
          {body}
        </div>
        <div style={{padding:'18px 28px', borderTop:'1px solid '+C.hairline, display:'flex', justifyContent:'space-between', position:'sticky', bottom:0, background:C.creamPaper}}>
          <button onClick={removeItem} style={{background:'none', border:'1px solid '+C.rust, color:C.rust, padding:'10px 18px', fontFamily:'"IBM Plex Mono",monospace', fontSize:11, letterSpacing:'0.14em', textTransform:'uppercase', cursor:'pointer'}}>Slett</button>
          <button onClick={onClose} style={{background:C.ink, border:'none', color:C.cream, padding:'10px 22px', fontFamily:'"IBM Plex Mono",monospace', fontSize:11, letterSpacing:'0.14em', textTransform:'uppercase', cursor:'pointer'}}>Ferdig</button>
        </div>
      </div>
    </div>
  );
}

// Click filter for rows — opens DetailPanel only when click target is NOT an interactive element.
// (Prevents accidental open when user clicks Editable, Picker, delete button, etc.)
function rowClick(e, openFn){
  if(e.target.closest('button, input, textarea, select, .vn-editable, [data-no-row-click], a, label')) return;
  openFn();
}

// ═══════════════════════════════════════════════════════
// LOGIN SCREEN — magic-link email auth (no client passwords)
// Server allow-lists emails via /.netlify/functions/sign-in.
// ═══════════════════════════════════════════════════════
function LoginScreen(){
  const [email,setEmail]=useState('');
  const [code,setCode]=useState('');
  const [sending,setSending]=useState(false);
  const [verifying,setVerifying]=useState(false);
  const [sent,setSent]=useState(false);
  const [sentTo,setSentTo]=useState('');
  const [error,setError]=useState(null);
  const [canResend,setCanResend]=useState(false);

  // STEP 1 — send a one-time code (and a fallback magic link) to the email.
  const submit=async(e)=>{
    if(e&&e.preventDefault) e.preventDefault();
    const value=email.trim();
    if(!value||sending) return;
    setSending(true); setError(null);
    try{
      const sb=window.__vnSb;
      if(!sb||!sb.auth){
        throw new Error('Klienten er ikke ferdig lastet — last siden på nytt');
      }
      if(!value.includes('@')||value.length>200){
        throw new Error('Ugyldig e-postformat');
      }
      // signInWithOtp delivers BOTH a 6-digit code ({{ .Token }}) and a magic link.
      // The code lets the user stay inside the app; the link is a fallback.
      const redirectBase = location.origin + '/martin/';
      const { error: otpErr } = await sb.auth.signInWithOtp({
        email: value,
        options: {
          emailRedirectTo: redirectBase,
          shouldCreateUser: false
        }
      });
      if(otpErr){
        if(/user not found|signup.*disabled|not allowed/i.test(otpErr.message||'')){
          throw new Error('Denne e-posten finnes ikke i systemet. Sjekk at det er @verminord.no (ikke .com).');
        }
        throw new Error(otpErr.message||'Kunne ikke sende koden');
      }
      setSentTo(value);
      setSent(true);
      setCode('');
      setCanResend(false);
      setTimeout(()=>setCanResend(true),30000);
    }catch(err){
      setError(err.message||'Kunne ikke sende koden');
    }finally{
      setSending(false);
    }
  };

  // STEP 2 — verify the 6-digit code in-app (no inbox round-trip needed).
  const verify=async(e)=>{
    if(e&&e.preventDefault) e.preventDefault();
    const token=code.trim();
    if(!token||verifying) return;
    setVerifying(true); setError(null);
    try{
      const sb=window.__vnSb;
      if(!sb||!sb.auth){
        throw new Error('Klienten er ikke ferdig lastet — last siden på nytt');
      }
      if(!/^\d{6}$/.test(token)){
        throw new Error('Koden er 6 sifre.');
      }
      const { error: verErr } = await sb.auth.verifyOtp({
        email: sentTo,
        token,
        type: 'email'
      });
      if(verErr){
        if(/expired|invalid|incorrect/i.test(verErr.message||'')){
          throw new Error('Feil eller utløpt kode. Be om en ny.');
        }
        throw new Error(verErr.message||'Kunne ikke verifisere koden');
      }
      // Session is now stored — reload so boot re-runs and the app mounts.
      location.reload();
    }catch(err){
      setError(err.message||'Kunne ikke verifisere koden');
      setVerifying(false);
    }
  };

  return (
    <div style={{minHeight:'100vh',background:C.cream,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div style={{background:C.creamPaper,border:'1px solid '+C.hairline,borderTop:'3px solid '+C.gold,padding:'44px 36px',maxWidth:420,width:'100%',boxShadow:'0 8px 32px rgba(21,35,58,0.08)'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:28}}>
          <BrandMark/>
          <div>
            <div style={{fontWeight:500,fontSize:14,letterSpacing:'-0.005em',color:C.ink}}>VERMINORD</div>
            <div className="vn-mono" style={{fontSize:9.5,color:C.navy60,letterSpacing:'0.2em',textTransform:'uppercase',marginTop:2}}>Operativ sentral</div>
          </div>
        </div>

        {!sent ? (
          <>
            <h1 style={{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:700,fontSize:34,lineHeight:1.05,letterSpacing:'-0.018em',color:C.ink,margin:'0 0 12px'}}>Logg inn.</h1>
            <p style={{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:400,fontSize:14,lineHeight:1.55,color:C.graphite,marginBottom:24}}>
              Skriv inn e-postadressen din. Vi sender en 6-sifret kode — ingen passord å huske.
            </p>
            <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:12}}>
              <input
                type="email" value={email}
                onChange={(e)=>setEmail(e.target.value)}
                placeholder="din@verminord.no"
                autoComplete="email" autoFocus required
                disabled={sending}
                style={{padding:'14px 16px',border:'1px solid '+C.hairline,background:C.cream,fontFamily:'"IBM Plex Sans",sans-serif',fontSize:16,color:C.ink,outline:'none',minHeight:48}}
                onFocus={(e)=>e.target.style.borderColor=C.gold}
                onBlur={(e)=>e.target.style.borderColor=C.hairline}
              />
              <button
                type="submit" disabled={!email.trim()||sending}
                style={{padding:'14px 22px',background:C.ink,color:C.cream,border:'none',fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',cursor:!email.trim()||sending?'not-allowed':'pointer',opacity:!email.trim()||sending?0.5:1,minHeight:48}}>
                {sending?'Sender…':'Send kode'}
              </button>
            </form>
            {error&&(
              <div style={{marginTop:14,padding:'10px 14px',fontSize:13,background:'rgba(166,75,42,0.10)',color:C.rust,border:'1px solid '+C.rust}}>
                {error}
              </div>
            )}
          </>
        ) : (
          <>
            <h1 style={{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:700,fontSize:34,lineHeight:1.05,letterSpacing:'-0.018em',color:C.ink,margin:'0 0 12px'}}>Skriv inn koden.</h1>
            <p style={{fontFamily:'"IBM Plex Sans",sans-serif',fontWeight:400,fontSize:14,lineHeight:1.55,color:C.graphite,marginBottom:18}}>
              Vi sendte en 6-sifret kode til <b style={{color:C.ink}}>{sentTo}</b>. Skriv den inn her — du trenger ikke forlate appen.
            </p>
            <form onSubmit={verify} style={{display:'flex',flexDirection:'column',gap:12}}>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={code}
                onChange={(e)=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                placeholder="000000"
                autoComplete="one-time-code" autoFocus maxLength={6}
                disabled={verifying}
                style={{padding:'14px 16px',border:'1px solid '+C.hairline,background:C.cream,fontFamily:'"IBM Plex Mono",monospace',fontSize:28,letterSpacing:'0.4em',textAlign:'center',color:C.ink,outline:'none',minHeight:56}}
                onFocus={(e)=>e.target.style.borderColor=C.gold}
                onBlur={(e)=>e.target.style.borderColor=C.hairline}
              />
              <button
                type="submit" disabled={code.length<6||verifying}
                style={{padding:'14px 22px',background:C.ink,color:C.cream,border:'none',fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',cursor:code.length<6||verifying?'not-allowed':'pointer',opacity:code.length<6||verifying?0.5:1,minHeight:48}}>
                {verifying?'Verifiserer…':'Logg inn'}
              </button>
            </form>
            <div style={{padding:'12px 16px',background:C.goldSoft,borderLeft:'3px solid '+C.gold,fontSize:12.5,color:C.graphite,lineHeight:1.5,margin:'18px 0'}}>
              Ser du ingen e-post? Sjekk søppelpost / spam. Den kommer fra <em>noreply@mail.app.supabase.io</em>. E-posten har også en lenke du kan klikke i stedet.
            </div>
            {error&&(
              <div style={{marginBottom:14,padding:'10px 14px',fontSize:13,background:'rgba(166,75,42,0.10)',color:C.rust,border:'1px solid '+C.rust}}>
                {error}
              </div>
            )}
            {canResend ? (
              <button onClick={()=>{setSent(false);setError(null);setCode('');}}
                style={{background:'none',border:'none',color:C.gold,fontFamily:'"IBM Plex Mono",monospace',fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',cursor:'pointer',padding:0}}>
                ↻ Send ny kode
              </button>
            ) : (
              <div style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:C.navy60,letterSpacing:'0.04em'}}>Du kan sende på nytt om 30 sekunder.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}


export { VerminordApp, LoginScreen, ErrorBoundary };
