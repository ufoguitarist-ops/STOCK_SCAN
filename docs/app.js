/* ==================================================
   STOCK SCAN – iPHONE SAFE SCAN CORE
   ================================================== */

const STORE = 'stockscan_ios_safe';
const $ = id => document.getElementById(id);

/* ---------- DOM ---------- */
const els = {
  upload: $('btnUpload'),
  file: $('fileInput'),
  reset: $('btnResetScan'),
  clear: $('btnClearCSV'),
  exportS: $('btnExportScanned'),
  exportM: $('btnExportMissing'),

  expected: $('expected'),
  scanned: $('scanned'),
  remaining: $('remaining'),
  ring: $('ring'),
  pct: $('pct'),

  sdStock: document.querySelector('.sd-stock'),
  sdSerial: document.querySelector('.sd-serial'),
  sdMeta: document.querySelector('.sd-meta'),

  history: $('history'),
  toast: $('toast'),

  camBtn: $('btnCamera'),
  camModal: $('camModal'),
  camVideo: $('camVideo'),
  backMenu: $('btnBackMenu')
};

/* ---------- NORMALISE ---------- */
const clean = v =>
  String(v ?? '')
    .replace(/\.0$/, '')
    .replace(/\s+/g, '')
    .trim();

/* ---------- STATE ---------- */
let state = {
  rows: [],
  scanned: new Set(),
  history: []
};

/* ---------- STORAGE ---------- */
function save() {
  localStorage.setItem(STORE, JSON.stringify({
    rows: state.rows,
    scanned: [...state.scanned],
    history: state.history
  }));
}

function load() {
  const s = JSON.parse(localStorage.getItem(STORE) || '{}');
  state.rows = s.rows || [];
  state.scanned = new Set(s.scanned || []);
  state.history = s.history || [];
}

/* ---------- FEEDBACK ---------- */
function flash(color) {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;inset:0;background:${color};z-index:9999`;
  document.body.appendChild(d);
  d.offsetHeight;
  setTimeout(() => d.remove(), 200);
}

const ok = () => flash('rgba(40,220,120,.4)');
const bad = () => flash('rgba(220,40,40,.4)');

function toast(msg, okFlag=true){
  els.toast.textContent = msg;
  els.toast.className = 'toast ' + (okFlag?'good':'bad');
  setTimeout(()=>els.toast.className='toast',900);
}

/* ---------- CSV ---------- */
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  const hi = lines.findIndex(l=>/stock/i.test(l)&&/condition/i.test(l));
  if (hi < 0) return [];

  const headers = lines[hi].split(',').map(h=>h.trim());

  return lines.slice(hi+1).map(l=>{
    const v = l.split(',');
    const o = {};
    headers.forEach((h,i)=>{
      const n = h.toLowerCase();
      if (n.includes('stock')) o.Stock = clean(v[i]);
      if (n.includes('serial')) o.Serial = v[i]?.trim();
      if (n === 'make') o.Make = v[i]?.trim();
      if (n === 'model') o.Model = v[i]?.trim();
      if (n.includes('cal')) o.Calibre = v[i]?.trim();
      if (n === 'condition') o.Condition = v[i]?.trim();
    });
    return o;
  }).filter(r=>r.Stock);
}

const filtered = () =>
  state.rows.filter(r =>
    String(r.Condition||'').toLowerCase() === 'new'
  );

/* ---------- UPDATE ---------- */
function update(){
  const f = filtered();
  const s = f.filter(r=>state.scanned.has(r.Stock)).length;
  const total = f.length;

  els.expected.textContent = total;
  els.scanned.textContent = s;
  els.remaining.textContent = total - s;

  const pct = total ? Math.round(s/total*100) : 0;
  els.pct.textContent = pct + '%';
  els.ring.style.setProperty('--p', pct);

  els.history.innerHTML = state.history.slice(0,5)
    .map(h=>`<li>${h.Stock} · ${h.Serial||''}</li>`).join('');

  save();
}

/* ---------- SCAN (WORKING) ---------- */
function handleScan(raw){
  const code = clean(raw);
  if (!code) return;

  const row = filtered().find(r=>r.Stock === code);
  if (!row || state.scanned.has(code)){
    bad(); toast('Invalid or duplicate', false); return;
  }

  state.scanned.add(code);
  state.history.unshift(row);

  els.sdStock.textContent = `STOCK: ${row.Stock}`;
  els.sdSerial.textContent = `SERIAL: ${row.Serial||'—'}`;
  els.sdMeta.textContent =
    `Make: ${row.Make||'—'} · Model: ${row.Model||'—'} · Calibre: ${row.Calibre||'—'}`;

  ok(); toast('Scanned', true); update();
}

/* ---------- CAMERA (iOS SAFE PATTERN) ---------- */
let stream = null;
let reader = null;

els.camBtn.onclick = async () => {
  if (!state.rows.length){
    toast('Upload CSV first', false); return;
  }

  els.camModal.style.display = 'block';

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }
  });

  els.camVideo.srcObject = stream;
  await els.camVideo.play();

  reader = new ZXing.BrowserMultiFormatReader();
  reader.decodeFromVideoElement(els.camVideo, result => {
    if (result) handleScan(result.getText());
  });
};

els.backMenu.onclick = () => {
  try {
    reader?.reset();
    stream?.getTracks().forEach(t=>t.stop());
  } catch {}
  els.camModal.style.display = 'none';
};

/* ---------- BLUETOOTH (WORKING) ---------- */
let buf = '', timer = null;
document.addEventListener('keydown', e=>{
  if (e.key.length !== 1) return;
  buf += e.key;
  clearTimeout(timer);
  timer = setTimeout(()=>{
    handleScan(buf);
    buf = '';
  }, 50);
});

/* ---------- BUTTONS ---------- */
els.upload.onclick = ()=>els.file.click();

els.file.onchange = e=>{
  const r = new FileReader();
  r.onload = ()=>{
    state.rows = parseCSV(r.result);
    state.scanned.clear();
    state.history = [];
    update();
    toast('CSV loaded', true);
  };
  r.readAsText(e.target.files[0]);
};

els.reset.onclick = ()=>{
  state.scanned.clear();
  state.history = [];
  update();
  toast('Scan reset', true);
};

els.clear.onclick = ()=>{
  localStorage.removeItem(STORE);
  location.reload();
};

els.exportS.onclick = ()=>exportCSV(
  state.rows.filter(r=>state.scanned.has(r.Stock)), 'scanned.csv'
);

els.exportM.onclick = ()=>exportCSV(
  state.rows.filter(r=>!state.scanned.has(r.Stock)), 'missing.csv'
);

function exportCSV(rows,name){
  if (!rows.length) return;
  const csv = Object.keys(rows[0]).join(',')+'\n'+
    rows.map(r=>Object.values(r).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=name;
  a.click();
}

/* ---------- INIT ---------- */
load();
update();
