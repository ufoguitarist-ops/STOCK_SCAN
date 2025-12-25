/* ==================================================
   STOCK SCAN – FINAL COMPLETE BUILD
   ================================================== */

const STORAGE = 'stockscan_final_full_v1';

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const els = {
  upload: $('btnUpload'),
  file: $('fileInput'),
  make: $('makeFilter'),
  model: $('modelFilter'),

  expected: $('expected'),
  scanned: $('scanned'),
  remaining: $('remaining'),
  ring: $('ring'),
  pct: $('pct'),

  sdStock: document.querySelector('.sd-stock'),
  sdSerial: document.querySelector('.sd-serial'),
  sdMeta: document.querySelector('.sd-meta'),

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
  startTime: null
};

const norm = v => String(v ?? '').trim().toLowerCase();

/* ---------- VISUAL FEEDBACK ---------- */
function scanFlash() {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position:fixed; inset:0;
    background:rgba(40,220,120,.35);
    z-index:9998;
  `;
  const tick = document.createElement('div');
  tick.textContent = '✔';
  tick.style.cssText = `
    position:fixed; inset:0;
    display:grid; place-items:center;
    font-size:110px; font-weight:900;
    color:#3cff8f;
    z-index:9999;
  `;
  document.body.appendChild(flash);
  document.body.appendChild(tick);

  if (navigator.vibrate) navigator.vibrate([30,20,30,20,30,60]);

  setTimeout(() => {
    flash.remove();
    tick.remove();
  }, 300);
}

/* ---------- TOAST ---------- */
function toast(msg, ok=true){
  els.toast.textContent = msg;
  els.toast.className = 'toast ' + (ok?'good':'bad');
  setTimeout(()=>els.toast.className='toast',900);
}

/* ---------- CSV ---------- */
function splitCSV(line){
  const out=[], cur=[]; let q=false;
  for(let c of line){
    if(c==='"'){q=!q; continue;}
    if(c===',' && !q){ out.push(cur.join('')); cur.length=0; continue; }
    cur.push(c);
  }
  out.push(cur.join(''));
  return out;
}

function findHeader(lines){
  const need=[['stock'],['make'],['model'],['condition']];
  for(let i=0;i<lines.length;i++){
    const cols=splitCSV(lines[i]).map(norm);
    if(need.every(g=>cols.some(c=>g.some(k=>c.includes(k))))) return i;
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
    if(n.includes('serial')) return 'Serial';
    if(n==='make') return 'Make';
    if(n==='model') return 'Model';
    if(n.includes('cal')) return 'Calibre';
    if(n==='condition') return 'Condition';
    return h;
  });

  return lines.slice(h+1).map(l=>{
    const v=splitCSV(l);
    const o={};
    headers.forEach((h,i)=>o[h]=(v[i]||'').trim());
    return o;
  }).filter(r=>r.Stock);
}

/* ---------- FILTER ---------- */
function filtered(){
  return state.rows.filter(r =>
    norm(r.Condition)==='new' &&
    (!state.make || r.Make===state.make) &&
    (!state.model || r.Model===state.model)
  );
}

/* ---------- UPDATE UI ---------- */
function update(){
  const f=filtered();
  const s=f.filter(r=>state.scanned.has(r.Stock)).length;
  const r=f.length-s;
  const p=f.length?Math.round(s/f.length*100):0;

  els.expected.textContent=f.length;
  els.scanned.textContent=s;
  els.remaining.textContent=r;
  els.pct.textContent=p+'%';
  els.ring.style.setProperty('--p',p);
}

/* ---------- SCAN ---------- */
function handleScan(code){
  const c=String(code||'').trim();
  if(!c) return;

  const row=filtered().find(r=>r.Stock===c);
  if(!row){ toast('Not in NEW list',false); return; }
  if(state.scanned.has(c)){ toast('Duplicate',false); return; }

  state.scanned.add(c);

  els.sdStock.textContent = `STOCK: ${row.Stock}`;
  els.sdSerial.textContent = `SERIAL: ${row.Serial || '—'}`;
  els.sdMeta.textContent =
    `Make: ${row.Make||'—'} · Model: ${row.Model||'—'} · Calibre: ${row.Calibre||'—'}`;

  scanFlash();
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
  if(!state.rows.length){toast('Upload CSV first',false);return;}
  els.camModal.style.display='block';
  reader=new ZXing.BrowserMultiFormatReader();
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
  els.camVideo.srcObject=stream;
  await els.camVideo.play();
  reader.decodeFromVideoDevice(null,els.camVideo,res=>{
    if(!res)return;
    const c=res.getText(),n=Date.now();
    if(c===lastCam&&n-lastTime<COOLDOWN)return;
    lastCam=c; lastTime=n;
    handleScan(c);
  });
}

els.camBtn.onclick=openCam;
els.camClose.onclick=()=>{
  reader?.reset();
  stream?.getTracks().forEach(t=>t.stop());
  els.camModal.style.display='none';
};

/* ---------- CSV LOAD ---------- */
els.upload.onclick=()=>{els.file.value='';els.file.click();};
els.file.onchange=e=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    state.rows=parseCSV(r.result);
    state.scanned.clear();

    els.make.innerHTML='<option value="">All</option>'+
      [...new Set(state.rows.map(r=>r.Make).filter(Boolean))].map(m=>`<option>${m}</option>`).join('');
    els.model.innerHTML='<option value="">All</option>'+
      [...new Set(state.rows.map(r=>r.Model).filter(Boolean))].map(m=>`<option>${m}</option>`).join('');

    update();
    toast('CSV loaded',true);
  };
  r.readAsText(f);
};

els.make.onchange=()=>{state.make=els.make.value;update();};
els.model.onchange=()=>{state.model=els.model.value;update();};
