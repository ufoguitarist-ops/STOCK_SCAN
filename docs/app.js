/* ==================================================
   STOCK SCAN – PREMIUM iPHONE FEEDBACK BUILD
   ================================================== */

const STORAGE = 'stockscan_premium_feedback_v1';

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const els = {
  upload: $('btnUpload'),
  file: $('fileInput'),
  make: $('makeFilter'),
  model: $('modelFilter'),
  reset: $('btnReset'),
  status: $('statusPill'),

  expected: $('expected'),
  scanned: $('scanned'),
  remaining: $('remaining'),

  ring: $('ring'),
  pct: $('pct'),

  heroTitle: $('heroTitle'),
  heroSub: $('heroSub'),

  lastCode: $('lastCode'),
  toast: $('toast'),

  camBtn: $('btnCamera'),
  camModal: $('camModal'),
  camClose: $('btnCamClose'),
  camVideo: $('camVideo'),
  camHint: $('camHint'),
};

/* ---------- STATE ---------- */
let state = {
  rows: [],
  scanned: new Set(),
  make: '',
  model: '',
  last: '',
  startTime: null
};

/* ---------- HELPERS ---------- */
const norm = v => String(v ?? '').trim().toLowerCase();

/* ---------- AUDIO (optional) ---------- */
let audioCtx = null;
let audioUnlocked = false;
function unlockAudio(){
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    audioCtx.resume();
    audioUnlocked = true;
  }catch{}
}
function playBeep(){
  if(!audioUnlocked || !audioCtx) return;
  try{
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type='square'; o.frequency.value=1600; g.gain.value=0.35;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime+0.12);
  }catch{}
}

/* ---------- PREMIUM SUCCESS FEEDBACK ---------- */
function premiumSuccess(){
  /* edge glow */
  document.body.classList.add('scan-glow');

  /* big tick */
  const tick = document.createElement('div');
  tick.className = 'scan-tick';
  tick.textContent = '✔';
  document.body.appendChild(tick);

  /* counter pulse */
  els.scanned.classList.add('pulse');

  /* vibration (iPhone only) */
  if (navigator.vibrate) {
    navigator.vibrate([30,20,30,20,30,60]);
  }

  playBeep();

  setTimeout(()=>{
    document.body.classList.remove('scan-glow');
    els.scanned.classList.remove('pulse');
    tick.remove();
  }, 420);
}

/* ---------- TOAST ---------- */
function toast(msg, ok=true){
  els.toast.textContent = msg;
  els.toast.className = 'toast ' + (ok?'good':'bad');
  setTimeout(()=>els.toast.textContent='',900);
}

/* ---------- STORAGE ---------- */
function save(){
  localStorage.setItem(STORAGE, JSON.stringify({
    rows: state.rows,
    scanned:[...state.scanned],
    make:state.make,
    model:state.model,
    last:state.last,
    startTime:state.startTime
  }));
}
function load(){
  const s=JSON.parse(localStorage.getItem(STORAGE)||'{}');
  state.rows=s.rows||[];
  state.scanned=new Set(s.scanned||[]);
  state.make=s.make||'';
  state.model=s.model||'';
  state.last=s.last||'';
  state.startTime=s.startTime||null;
}

/* ---------- CSV ---------- */
function splitCSV(l){
  const o=[],c=[];let q=false;
  for(let i=0;i<l.length;i++){
    const ch=l[i];
    if(ch==='"'){q=!q;continue;}
    if(ch===','&&!q){o.push(c.join(''));c.length=0;continue;}
    c.push(ch);
  }
  o.push(c.join(''));return o;
}
function findHeader(lines){
  const need=[['stock'],['make'],['model'],['condition']];
  for(let i=0;i<lines.length;i++){
    const cols=splitCSV(lines[i]).map(norm);
    if(need.every(g=>cols.some(c=>g.some(k=>c.includes(k))))) return i;
  }
  return -1;
}
function parseCSV(t){
  const lines=t.split(/\r?\n/).filter(l=>l.trim());
  const h=findHeader(lines); if(h<0) return [];
  const heads=splitCSV(lines[h]).map(h=>{
    const n=norm(h);
    if(n.includes('stock'))return'Stock';
    if(n==='make')return'Make';
    if(n==='model')return'Model';
    if(n==='condition')return'Condition';
    return h;
  });
  return lines.slice(h+1).map(l=>{
    const v=splitCSV(l),o={};
    heads.forEach((h,i)=>o[h]=(v[i]||'').trim());
    return o;
  }).filter(r=>r.Stock);
}

/* ---------- FILTER ---------- */
function filtered(){
  return state.rows.filter(r =>
    norm(r.Condition)==='new' &&
    (!state.make||r.Make===state.make) &&
    (!state.model||r.Model===state.model)
  );
}

/* ---------- UI ---------- */
function update(){
  if(!state.rows.length){
    els.heroTitle.textContent='Upload your CSV';
    els.heroSub.textContent='Header auto-detected';
    els.expected.textContent=els.scanned.textContent=els.remaining.textContent='0';
    els.pct.textContent='0%';
    els.ring.style.setProperty('--p',0);
    save();return;
  }

  const f=filtered();
  const s=f.filter(r=>state.scanned.has(r.Stock)).length;
  const r=f.length-s;
  const p=f.length?Math.round(s/f.length*100):0;

  els.expected.textContent=f.length;
  els.scanned.textContent=s;
  els.remaining.textContent=r;
  els.pct.textContent=p+'%';
  els.ring.style.setProperty('--p',p);
  els.lastCode.textContent=state.last||'—';

  if(state.startTime){
    const mins=(Date.now()-state.startTime)/60000;
    const rate=Math.round(s/Math.max(mins,0.1));
    els.heroSub.textContent=`Scanning • ${rate} items/min`;
  }else{
    els.heroSub.textContent='Ready to scan';
  }

  save();
}

/* ---------- SCAN ---------- */
function handleScan(code){
  const c=String(code||'').trim();
  if(!c) return;

  if(!filtered().some(r=>r.Stock===c)){
    toast('Not in NEW list',false);return;
  }
  if(state.scanned.has(c)){
    toast('Duplicate',false);return;
  }

  if(!state.startTime) state.startTime=Date.now();
  state.scanned.add(c);
  state.last=c;

  premiumSuccess();
  toast('Scanned',true);
  update();
}

/* ---------- BLUETOOTH ---------- */
let buf='',t=null;
document.addEventListener('keydown',e=>{
  if(e.key.length!==1)return;
  buf+=e.key;
  clearTimeout(t);
  t=setTimeout(()=>{handleScan(buf.trim());buf='';},55);
});

/* ---------- CAMERA ---------- */
let reader=null,stream=null,lastCam='',lastTime=0;
const COOLDOWN=800;

async function openCam(){
  unlockAudio();
  if(!state.rows.length){toast('Upload CSV first',false);return;}
  els.camModal.style.display='block';
  try{
    reader=new ZXing.BrowserMultiFormatReader();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    els.camVideo.srcObject=stream;
    await els.camVideo.play();
    reader.decodeFromVideoDevice(null,els.camVideo,res=>{
      if(!res)return;
      const c=res.getText(),n=Date.now();
      if(c===lastCam&&n-lastTime<COOLDOWN)return;
      lastCam=c;lastTime=n;
      handleScan(c);
    });
  }catch{els.camHint.textContent='Camera blocked';}
}
function closeCam(){
  try{reader?.reset();stream?.getTracks().forEach(t=>t.stop());}catch{}
  reader=null;stream=null;els.camModal.style.display='none';
}

/* ---------- EVENTS ---------- */
els.camBtn.onclick=()=>{unlockAudio();openCam();};
els.camClose.onclick=closeCam;
els.camModal.onclick=e=>{if(e.target===els.camModal)closeCam();};
els.upload.onclick=()=>{unlockAudio();els.file.value='';els.file.click();};

els.file.onchange=e=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    state.rows=parseCSV(r.result);
    state.scanned.clear();
    state.make='';state.model='';state.last='';state.startTime=null;
    els.make.innerHTML='<option value="">All</option>'+
      [...new Set(state.rows.map(r=>r.Make).filter(Boolean))].sort().map(m=>`<option>${m}</option>`).join('');
    els.model.innerHTML='<option value="">All</option>'+
      [...new Set(state.rows.map(r=>r.Model).filter(Boolean))].sort().map(m=>`<option>${m}</option>`).join('');
    update();toast('CSV loaded',true);
  };
  r.readAsText(f);
};

els.make.onchange=()=>{state.make=els.make.value;update();};
els.model.onchange=()=>{state.model=els.model.value;update();};
els.reset.onclick=()=>{state.scanned.clear();state.startTime=null;update();};

/* ---------- INIT ---------- */
load();update();
