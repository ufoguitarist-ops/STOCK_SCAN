const $ = id => document.getElementById(id);

/* ---------- DOM ---------- */
const els = {
  upload: $('btnUpload'),
  scan: $('btnScan'),
  reset: $('btnReset'),
  clear: $('btnClear'),
  exportS: $('btnExportScanned'),
  exportM: $('btnExportMissing'),
  file: $('file'),
  makeFilter: $('makeFilter'),

  expected: $('expected'),
  scanned: $('scanned'),
  remaining: $('remaining'),

  stock: $('dStock'),
  serial: $('dSerial'),
  meta: $('dMeta'),

  banner: $('banner'),
  flash: $('flash'),
  modelSummary: $('modelSummary'),

  cam: $('cam'),
  video: $('video')
};

/* ---------- CONFIRM ---------- */
const confirmEl = document.createElement('div');
confirmEl.className = 'scan-confirm';
document.body.appendChild(confirmEl);

/* ---------- STATE ---------- */
let rows = [];
let scanned = new Set();
let stream = null;
let lastText = '', lastTime = 0;

/* ---------- SCANNER ---------- */
const codeReader = new ZXing.BrowserMultiFormatReader();

/* ---------- HELPERS ---------- */
const clean = v =>
  String(v ?? '').replace(/\.0$/, '').replace(/\s+/g,'').trim();

const isNew = r =>
  String(r.Condition || '').toLowerCase().includes('new');

/* 🔒 MAKE NORMALISER (FIX) */
const normaliseMake = v =>
  String(v || '')
    .replace(/"/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();

/* ---------- UI FEEDBACK ---------- */
const vibrate = () => navigator.vibrate?.([120,40,120]);
const flash = () => {
  els.flash.classList.add('active');
  setTimeout(()=>els.flash.classList.remove('active'),150);
};
const confirm = t => {
  confirmEl.textContent = t;
  confirmEl.classList.add('show');
  setTimeout(()=>confirmEl.classList.remove('show'),450);
};

/* ---------- CSV PARSE ---------- */
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  const h = lines.findIndex(l=>/stock/i.test(l)&&/condition/i.test(l));
  if(h<0) return [];
  const heads = lines[h].split(',');

  return lines.slice(h+1).map(r=>{
    const v=r.split(','),o={};
    heads.forEach((x,i)=>{
      const n=x.toLowerCase();
      if(n.includes('stock')) o.Stock = clean(v[i]);
      if(n.includes('serial')) o.Serial = v[i]?.trim();
      if(n==='make') o.Make = normaliseMake(v[i]);   // ✅ FIX HERE
      if(n==='model') o.Model = v[i]?.trim();
      if(n.includes('cal')) o.Calibre = v[i]?.trim();
      if(n==='condition') o.Condition = v[i]?.trim();
    });
    return o;
  }).filter(r=>r.Stock);
}

/* ---------- DUPLICATE SERIAL CHECK ---------- */
function hasDuplicateSerials(data){
  const map = new Map();
  for(const r of data){
    if(!r.Serial) continue;
    if(!map.has(r.Serial)) map.set(r.Serial,new Set());
    map.get(r.Serial).add(r.Stock);
  }
  return [...map.values()].some(s=>s.size>1);
}

/* ---------- MAKE FILTER ---------- */
function buildMakeFilter(){
  const makes=[...new Set(rows.filter(isNew).map(r=>r.Make).filter(Boolean))];
  els.makeFilter.innerHTML =
    '<option value="">All Makes</option>' +
    makes.map(m=>`<option value="${m}">${m}</option>`).join('');
  els.makeFilter.value=localStorage.getItem('make')||'';
}

/* ---------- MODEL SUMMARY ---------- */
function baseModel(m){return (m||'Unknown').split(' ')[0].toUpperCase();}

function renderModelSummary(){
  const make=els.makeFilter.value;
  if(!make){
    els.modelSummary.classList.add('hidden');
    els.modelSummary.innerHTML='';
    return;
  }

  const g={};
  rows.forEach(r=>{
    if(!isNew(r) || r.Make !== make) return;
    const b=baseModel(r.Model);
    g[b]??={};
    g[b][r.Model]??={};
    g[b][r.Model][r.Calibre]=(g[b][r.Model][r.Calibre]||0)+1;
  });

  let html=`<h3>📦 STOCK BREAKDOWN — ${make.toUpperCase()}</h3>`;
  Object.keys(g).sort().forEach(b=>{
    html+=`<div class="model-block"><div class="model-name">${b}</div>`;
    Object.keys(g[b]).sort().forEach(m=>{
      html+=`<div style="padding-left:10px;font-weight:600">${m}</div>`;
      Object.keys(g[b][m]).sort().forEach(c=>{
        html+=`<div class="cal-line"><span>${c}</span><span>${g[b][m][c]} in stock</span></div>`;
      });
    });
    html+='</div>';
  });

  els.modelSummary.innerHTML=html;
  els.modelSummary.classList.remove('hidden');
}

/* ---------- STATS ---------- */
function filtered(){
  const mk=els.makeFilter.value.toLowerCase().trim();
  return rows.filter(r=>isNew(r)&&(!mk||r.Make.toLowerCase().trim()===mk));
}

function updateStats(){
  const f=filtered(),s=f.filter(r=>scanned.has(r.Stock));
  els.expected.textContent=f.length;
  els.scanned.textContent=s.length;
  els.remaining.textContent=f.length-s.length;
}

/* ---------- SAVE / LOAD ---------- */
function save(){
  localStorage.setItem('rows',JSON.stringify(rows));
  localStorage.setItem('scanned',JSON.stringify([...scanned]));
}
function load(){
  rows=JSON.parse(localStorage.getItem('rows')||'[]');
  scanned=new Set(JSON.parse(localStorage.getItem('scanned')||'[]'));
  buildMakeFilter();
  updateStats();
  renderModelSummary();
}

/* ---------- SCAN ---------- */
function handleScan(code){
  const c=clean(code);
  const r=rows.find(x=>clean(x.Stock)===c&&isNew(x));
  if(!r) return;

  if(scanned.has(r.Stock)){
    vibrate(); confirm('⚠ DUPLICATE'); return;
  }

  scanned.add(r.Stock); save();
  vibrate(); flash(); confirm('✔ SCANNED');

  els.stock.textContent=`STOCK: ${r.Stock}`;
  els.serial.textContent=`SERIAL: ${r.Serial||'—'}`;
  els.meta.textContent=`${r.Make} · ${r.Model} · ${r.Calibre}`;

  updateStats();
}

/* ---------- EVENTS ---------- */
els.upload.onclick=()=>{els.file.value='';els.file.click();};

els.file.onchange=e=>{
  const f=e.target.files[0];
  if(!f) return;

  const r=new FileReader();
  r.onload=()=>{
    rows=parseCSV(r.result);
    scanned.clear();
    save();
    buildMakeFilter();
    updateStats();
    renderModelSummary();

    els.banner.textContent = hasDuplicateSerials(rows)
      ? '⚠ DUPLICATE SERIAL NUMBERS FOUND'
      : 'NO DOUBLE BOOKINGS DETECTED';
    els.banner.classList.remove('hidden');
  };
  r.readAsText(f);
};

els.makeFilter.onchange=()=>{
  localStorage.setItem('make',els.makeFilter.value);
  updateStats();
  renderModelSummary();
};

/* ---------- CAMERA ---------- */
els.scan.onclick=async()=>{
  if(!rows.length) return alert('Upload CSV first');
  els.cam.style.display='block';
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
  els.video.srcObject=stream; await els.video.play();

  codeReader.decodeFromVideoDevice(null,els.video,res=>{
    if(!res) return;
    const t=res.getText(),n=Date.now();
    if(t===lastText&&n-lastTime<800) return;
    lastText=t; lastTime=n;
    handleScan(t);
  });
};

window.closeCam=()=>{
  codeReader.reset();
  stream?.getTracks().forEach(t=>t.stop());
  els.cam.style.display='none';
};

/* ---------- BLUETOOTH ---------- */
let buf='',timer=null;
document.addEventListener('keydown',e=>{
  if(e.key.length!==1) return;
  buf+=e.key; clearTimeout(timer);
  timer=setTimeout(()=>{handleScan(buf);buf='';},55);
});

/* ---------- EXPORT ---------- */
function exportCSV(list,name){
  if(!list.length) return alert('Nothing to export');
  const h=Object.keys(list[0]);
  const csv=h.join(',')+'\n'+list.map(o=>h.map(k=>o[k]??'').join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=name; a.click();
}

els.exportS.onclick=e=>{e.preventDefault();exportCSV(filtered().filter(r=>scanned.has(r.Stock)),'scanned_new.csv');};
els.exportM.onclick=e=>{e.preventDefault();exportCSV(filtered().filter(r=>!scanned.has(r.Stock)),'missing_new.csv');};

els.reset.onclick=()=>{scanned.clear();save();updateStats();};
els.clear.onclick=()=>{localStorage.clear();location.reload();};

/* ---------- INIT ---------- */
load();
