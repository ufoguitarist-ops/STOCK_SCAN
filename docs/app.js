/* ==================================================
   STOCK SCAN – CAMERA-FIRST + STRONG FEEDBACK
   ================================================== */

const STORAGE = 'stockscan_camera_primary_v3';

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

let state = {
  rows: [],
  scanned: new Set(),
  make: '',
  model: '',
  last: ''
};

/* ---------- helpers ---------- */
const norm = v => String(v ?? '').trim().toLowerCase();

/* ---------- LOUD BEEP (iOS SAFE) ---------- */
let audioCtx = null;
function playBeep() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'square';           // harsher = more noticeable
    osc.frequency.value = 1800;    // high pitch
    gain.gain.value = 0.35;        // loud but safe

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch {}
}

function toast(msg, ok = true){
  els.toast.textContent = msg;
  els.toast.className = 'toast ' + (ok ? 'good' : 'bad');
  setTimeout(() => {
    els.toast.textContent = '';
    els.toast.className = 'toast';
  }, 800);
}

/* ---------- SUCCESS FLASH ---------- */
function successFlash(){
  const flash = document.createElement('div');
  flash.style.position = 'fixed';
  flash.style.inset = '0';
  flash.style.background = 'rgba(40, 220, 120, 0.28)';
  flash.style.zIndex = '99999';
  flash.style.display = 'grid';
  flash.style.placeItems = 'center';
  flash.style.fontSize = '52px';
  flash.style.fontWeight = '900';
  flash.style.color = '#ffffff';
  flash.style.backdropFilter = 'blur(2px)';
  flash.textContent = '✔ SCANNED';

  document.body.appendChild(flash);

  if (navigator.vibrate) navigator.vibrate(50);
  playBeep();                      // <<< LOUD BEEP HERE

  setTimeout(() => flash.remove(), 220);
}

/* ---------- persistence ---------- */
function save(){
  localStorage.setItem(STORAGE, JSON.stringify({
    rows: state.rows,
    scanned: [...state.scanned],
    make: state.make,
    model: state.model,
    last: state.last
  }));
}
function load(){
  const s = JSON.parse(localStorage.getItem(STORAGE) || '{}');
  state.rows = s.rows || [];
  state.scanned = new Set(s.scanned || []);
  state.make = s.make || '';
  state.model = s.model || '';
  state.last = s.last || '';
}

/* ---------- CSV parsing ---------- */
function splitCSV(line){
  const out=[], cur=[]; let q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){ q=!q; continue; }
    if(c===',' && !q){ out.push(cur.join('')); cur.length=0; continue; }
    cur.push(c);
  }
  out.push(cur.join(''));
  return out;
}

function findHeader(lines){
  const need=[['stock','stock #','stock number'],['make'],['model'],['condition']];
  for(let i=0;i<lines.length;i++){
    const cols=splitCSV(lines[i]).map(norm);
    if(need.every(g=>cols.some(c=>g.includes(c)))) return i;
  }
  return -1;
}

function parseCSV(text){
  const lines=text.split(/\r?\n/).filter(l=>l.trim());
  const h=findHeader(lines);
  if(h<0) return [];

  const headers=splitCSV(lines[h]).map(h=>{
    const n=norm(h);
    if(n.includes('stock')) return 'Stock';
    if(n==='make') return 'Make';
    if(n==='model') return 'Model';
    if(n==='condition') return 'Condition';
    return h;
  });

  return lines.slice(h+1).map(l=>{
    const v=splitCSV(l);
    const o={};
    headers.forEach((h,i)=>o[h]=v[i]?.trim());
    return o;
  }).filter(r=>r.Stock);
}

/* ---------- filtering ---------- */
function filtered(){
  return state.rows.filter(r =>
    norm(r.Condition)==='new' &&
    (!state.make || r.Make===state.make) &&
    (!state.model || r.Model===state.model)
  );
}

/* ---------- UI ---------- */
function update(){
  if(!state.rows.length){
    els.heroTitle.textContent='Upload your CSV';
    els.heroSub.textContent='Header row detected automatically';
    els.status.textContent='No file loaded';
    els.expected.textContent=els.scanned.textContent=els.remaining.textContent='0';
    els.pct.textContent='0%';
    els.ring.style.setProperty('--p',0);
    els.lastCode.textContent='—';
    save(); return;
  }

  const f=filtered();
  const scanned=f.filter(r=>state.scanned.has(r.Stock)).length;
  const remaining=f.length-scanned;
  const pct=f.length?Math.round(scanned/f.length*100):0;

  els.expected.textContent=f.length;
  els.scanned.textContent=scanned;
  els.remaining.textContent=remaining;
  els.pct.textContent=pct+'%';
  els.ring.style.setProperty('--p',pct);
  els.lastCode.textContent=state.last||'—';

  els.heroTitle.textContent = remaining===0 && f.length ? 'Complete' : 'READY TO SCAN';
  els.heroSub.textContent = 'Camera continuous • Bluetooth supported';
  els.status.textContent = remaining===0 && f.length ? 'Complete' : 'In progress';

  save();
}

/* ---------- scan handling ---------- */
function handleScan(code){
  const c=String(code||'').trim();
  if(!c) return;

  if(!filtered().some(r=>r.Stock===c)){
    toast('Not in NEW list',false); return;
  }
  if(state.scanned.has(c)){
    toast('Duplicate',false); return;
  }

  state.scanned.add(c);
  state.last=c;

  successFlash();
  toast('Scanned',true);
  update();
}

/* ---------- Bluetooth ---------- */
let kbBuf='', kbTimer=null;
document.addEventListener('keydown',e=>{
  if(e.key.length!==1) return;
  kbBuf+=e.key;
  clearTimeout(kbTimer);
  kbTimer=setTimeout(()=>{
    handleScan(kbBuf.trim());
    kbBuf='';
  },55);
});

/* ---------- Camera (ZXing continuous) ---------- */
let reader=null, stream=null;
let lastCamCode='', lastCamTime=0;
const CAM_COOLDOWN=900;

async function openCam(){
  if(!state.rows.length){
    toast('Upload CSV first',false); return;
  }

  els.camModal.style.display='block';
  els.camHint.textContent='Scan continuously';

  try{
    reader=new ZXing.BrowserMultiFormatReader();
    stream=await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:'environment' },
      audio:false
    });

    els.camVideo.srcObject=stream;
    await els.camVideo.play();

    reader.decodeFromVideoDevice(null, els.camVideo, (res)=>{
      if(!res) return;
      const code=res.getText();
      const now=Date.now();
      if(code===lastCamCode && now-lastCamTime<CAM_COOLDOWN) return;
      lastCamCode=code;
      lastCamTime=now;
      handleScan(code);
    });

  }catch{
    els.camHint.textContent='Camera permission blocked';
  }
}

function closeCam(){
  try{
    reader?.reset();
    reader=null;
    stream?.getTracks().forEach(t=>t.stop());
    stream=null;
  }catch{}
  els.camModal.style.display='none';
}

els.camBtn.onclick=openCam;
els.camClose.onclick=closeCam;
els.camModal.onclick=e=>{ if(e.target===els.camModal) closeCam(); };

/* ---------- events ---------- */
els.upload.onclick=()=>els.file.click();

els.file.onchange=e=>{
  const f=e.target.files[0];
  if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    state.rows=parseCSV(r.result);
    state.scanned.clear();
    state.make=''; state.model='';
    const makes=[...new Set(state.rows.map(r=>r.Make).filter(Boolean))];
    const models=[...new Set(state.rows.map(r=>r.Model).filter(Boolean))];
    els.make.innerHTML='<option value="">All</option>'+makes.map(m=>`<option>${m}</option>`).join('');
    els.model.innerHTML='<option value="">All</option>'+models.map(m=>`<option>${m}</option>`).join('');
    update();
  };
  r.readAsText(f);
};

els.make.onchange=()=>{ state.make=els.make.value; update(); };
els.model.onchange=()=>{ state.model=els.model.value; update(); };
els.reset.onclick=()=>{ state.scanned.clear(); state.last=''; update(); };

/* ---------- init ---------- */
load();
update();
