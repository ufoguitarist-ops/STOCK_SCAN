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

  expected: $('expected'),
  scanned: $('scanned'),
  remaining: $('remaining'),

  stock: $('dStock'),
  serial: $('dSerial'),
  meta: $('dMeta'),

  banner: $('banner'),
  toast: $('toast'),
  flash: $('flash'),

  cam: $('cam'),
  video: $('video')
};

/* ---------- STATE ---------- */
let rows = [];
let scanned = new Set();
let reader = null;
let stream = null;
let lastText = '';
let lastTime = 0;

/* ---------- HELPERS ---------- */
const clean = v =>
  String(v ?? '')
    .replace(/\.0$/, '')
    .replace(/\s+/g, '')
    .trim();

/* ---------- VISUAL FEEDBACK (FORCED) ---------- */
function showToast(msg){
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  setTimeout(()=>els.toast.classList.remove('show'),900);
}

function greenFlash(){
  els.flash.classList.add('active');
  els.flash.style.opacity = '1';

  setTimeout(()=>{
    els.flash.style.opacity = '0';
    els.flash.classList.remove('active');
  },150);
}

/* ---------- CSV ---------- */
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  const h = lines.findIndex(l=>/stock/i.test(l)&&/condition/i.test(l));
  if(h<0) return [];

  const heads = lines[h].split(',');

  return lines.slice(h+1).map(r=>{
    const v=r.split(','),o={};
    heads.forEach((x,i)=>{
      const n=x.toLowerCase();
      if(n.includes('stock')) o.Stock=clean(v[i]);
      if(n.includes('serial')) o.Serial=v[i]?.trim();
      if(n==='make') o.Make=v[i]?.trim();
      if(n==='model') o.Model=v[i]?.trim();
      if(n.includes('cal')) o.Calibre=v[i]?.trim();
      if(n==='condition') o.Condition=v[i]?.trim();
    });
    return o;
  }).filter(r=>r.Stock);
}

function updateStats(){
  const valid = rows.filter(r =>
    String(r.Condition||'').toLowerCase().includes('new')
  );
  els.expected.textContent = valid.length;
  els.scanned.textContent = scanned.size;
  els.remaining.textContent = valid.length - scanned.size;
}

/* ---------- DUPLICATES ---------- */
function hasDuplicateSerials(data){
  const map=new Map();
  for(const r of data){
    if(!r.Serial||!r.Stock) continue;
    if(!map.has(r.Serial)) map.set(r.Serial,new Set());
    map.get(r.Serial).add(r.Stock);
  }
  return [...map.values()].some(s=>s.size>1);
}

/* ---------- SCAN HANDLER ---------- */
function handleScan(code){
  const cleaned = clean(code);
  if(!cleaned) return;

  const row = rows.find(r =>
    r.Stock === cleaned &&
    String(r.Condition||'').toLowerCase().includes('new')
  );

  if(!row){
    showToast('NOT IN NEW STOCK');
    return;
  }

  if(scanned.has(row.Stock)){
    showToast('ALREADY SCANNED');
    return;
  }

  scanned.add(row.Stock);

  greenFlash();
  showToast('SCANNED');

  els.stock.textContent = `STOCK: ${row.Stock}`;
  els.serial.textContent = `SERIAL: ${row.Serial||'—'}`;
  els.meta.textContent =
    `${row.Make||'—'} · ${row.Model||'—'} · ${row.Calibre||'—'}`;

  els.banner.classList.add('hidden');
  updateStats();
}

/* ---------- CSV LOAD ---------- */
els.upload.onclick=()=>{
  els.file.value='';
  els.file.click();
};

els.file.onchange=e=>{
  const f=e.target.files[0];
  if(!f) return;

  const r=new FileReader();
  r.onload=()=>{
    rows=parseCSV(r.result);
    scanned.clear();
    updateStats();

    els.banner.textContent =
      hasDuplicateSerials(rows)
        ? '⚠️ DUPLICATE SERIAL NUMBERS FOUND'
        : 'NO DOUBLE BOOKINGS DETECTED';

    els.banner.classList.remove('hidden');
  };
  r.readAsText(f);
};

/* ---------- CAMERA ---------- */
els.scan.onclick=async()=>{
  if(!rows.length){
    alert('Upload CSV first');
    return;
  }

  els.cam.style.display='block';

  stream = await navigator.mediaDevices.getUserMedia({
    video:{facingMode:{ideal:'environment'}},
    audio:false
  });

  els.video.srcObject = stream;
  await els.video.play();

  reader = new ZXing.BrowserMultiFormatReader();

  reader.decodeFromVideoDevice(null, els.video, res=>{
    if(!res) return;

    const text=res.getText();
    const now=Date.now();
    if(text===lastText && now-lastTime<800) return;

    lastText=text;
    lastTime=now;
    handleScan(text);
  });
};

window.closeCam=()=>{
  try{reader?.reset();}catch{}
  try{stream?.getTracks().forEach(t=>t.stop());}catch{}
  reader=null;
  stream=null;
  els.cam.style.display='none';
};

/* ---------- BLUETOOTH ---------- */
let buffer='',timer=null;
document.addEventListener('keydown',e=>{
  if(e.key.length!==1) return;
  buffer+=e.key;
  clearTimeout(timer);
  timer=setTimeout(()=>{
    handleScan(buffer);
    buffer='';
  },55);
});

/* ---------- BUTTONS ---------- */
els.reset.onclick=()=>{
  scanned.clear();
  updateStats();
  showToast('SCAN RESET');
};

els.clear.onclick=()=>{
  rows=[];
  scanned.clear();
  updateStats();
  showToast('CSV CLEARED');
};

els.exportS.onclick=()=>exportCSV(
  rows.filter(r=>scanned.has(r.Stock)),
  'scanned.csv'
);

els.exportM.onclick=()=>exportCSV(
  rows.filter(r=>!scanned.has(r.Stock)),
  'missing.csv'
);

function exportCSV(list,name){
  if(!list.length) return;
  const csv =
    Object.keys(list[0]).join(',')+'\n'+
    list.map(o=>Object.values(o).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=name;
  a.click();
}

/* ---------- INIT ---------- */
updateStats();
