const STORAGE = 'stockscan_premium_v2';

const el = id => document.getElementById(id);
const els = {
  upload: el('btnUpload'),
  file: el('fileInput'),
  make: el('makeFilter'),
  model: el('modelFilter'),
  reset: el('btnReset'),
  status: el('statusPill'),
  expected: el('expected'),
  scanned: el('scanned'),
  remaining: el('remaining'),
  ring: el('ring'),
  pct: el('pct'),
  heroTitle: el('heroTitle'),
  heroSub: el('heroSub'),
  lastCode: el('lastCode'),
  toast: el('toast'),
  camBtn: el('btnCamera'),
  camModal: el('camModal'),
  camClose: el('btnCamClose'),
  camVideo: el('camVideo'),
  camHint: el('camHint')
};

let state = {
  rows: [],
  scanned: new Set(),
  make: '',
  model: '',
  last: ''
};

/* ---------------- CSV ---------------- */

const norm = v => String(v||'').trim().toLowerCase();

function splitCSV(line){
  const out=[], cur=[];
  let q=false;
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
    if(need.every(n=>cols.some(c=>n.includes(c)))) return i;
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

/* ---------------- UI ---------------- */

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
  const s=JSON.parse(localStorage.getItem(STORAGE)||'{}');
  state.rows=s.rows||[];
  state.scanned=new Set(s.scanned||[]);
  state.make=s.make||'';
  state.model=s.model||'';
  state.last=s.last||'';
}

function filtered(){
  return state.rows.filter(r =>
    norm(r.Condition)==='new' &&
    (!state.make || r.Make===state.make) &&
    (!state.model || r.Model===state.model)
  );
}

function update(){
  const f=filtered();
  const scanned=f.filter(r=>state.scanned.has(r.Stock)).length;
  const remain=f.length-scanned;
  const pct=f.length?Math.round(scanned/f.length*100):0;

  els.expected.textContent=f.length;
  els.scanned.textContent=scanned;
  els.remaining.textContent=remain;
  els.pct.textContent=pct+'%';
  els.ring.style.setProperty('--p',pct);
  els.lastCode.textContent=state.last||'—';

  els.heroTitle.textContent=f.length?'READY TO SCAN':'Upload your CSV';
  els.heroSub.textContent=f.length?'Scan with Bluetooth or Camera':'';

  els.status.textContent=f.length?'In progress':'No file loaded';
  save();
}

function toast(t,good=true){
  els.toast.textContent=t;
  els.toast.className='toast '+(good?'good':'bad');
  setTimeout(()=>els.toast.textContent='',900);
}

/* ---------------- Scanning ---------------- */

function handleScan(code){
  if(!code) return;
  if(!filtered().some(r=>r.Stock===code)){
    toast('Not in NEW list',false); return;
  }
  if(state.scanned.has(code)){
    toast('Duplicate',false); return;
  }
  state.scanned.add(code);
  state.last=code;
  toast('Scanned');
  update();
}

/* Bluetooth (keyboard wedge) */
let buf='', t=null;
document.addEventListener('keydown',e=>{
  if(e.key.length!==1) return;
  buf+=e.key;
  clearTimeout(t);
  t=setTimeout(()=>{
    handleScan(buf.trim());
    buf='';
  },60);
});

/* ---------------- Camera (ZXing) ---------------- */

let reader=null, stream=null;

async function openCam(){
  els.camModal.style.display='block';
  try{
    reader=new ZXing.BrowserMultiFormatReader();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    els.camVideo.srcObject=stream;
    await els.camVideo.play();
    reader.decodeFromVideoElement(els.camVideo,(res)=>{
      if(res){
        handleScan(res.getText());
        closeCam();
      }
    });
  }catch{
    els.camHint.textContent='Camera permission denied';
  }
}

function closeCam(){
  reader?.reset();
  stream?.getTracks().forEach(t=>t.stop());
  els.camModal.style.display='none';
}

/* ---------------- Events ---------------- */

els.upload.onclick=()=>els.file.click();
els.file.onchange=e=>{
  const f=e.target.files[0];
  if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    state.rows=parseCSV(r.result);
    state.scanned.clear();
    const makes=[...new Set(state.rows.map(r=>r.Make))];
    els.make.innerHTML='<option value="">All</option>'+makes.map(m=>`<option>${m}</option>`).join('');
    update();
  };
  r.readAsText(f);
};

els.make.onchange=()=>{state.make=els.make.value;update();};
els.model.onchange=()=>{state.model=els.model.value;update();};
els.reset.onclick=()=>{state.scanned.clear();update();};

els.camBtn.onclick=openCam;
els.camClose.onclick=closeCam;

/* ---------------- Init ---------------- */
load();
update();
