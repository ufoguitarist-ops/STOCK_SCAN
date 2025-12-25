const STORAGE_KEY = 'stockscan_v1_premium';

const els = {
  btnUpload: document.getElementById('btnUpload'),
  fileInput: document.getElementById('fileInput'),
  makeFilter: document.getElementById('makeFilter'),
  modelFilter: document.getElementById('modelFilter'),
  btnReset: document.getElementById('btnReset'),
  pillState: document.getElementById('pillState'),

  expected: document.getElementById('expected'),
  scanned: document.getElementById('scanned'),
  remaining: document.getElementById('remaining'),

  heroTitle: document.getElementById('heroTitle'),
  heroSub: document.getElementById('heroSub'),
  ring: document.getElementById('ring'),
  pct: document.getElementById('pct'),
  lastCode: document.getElementById('lastCode'),
  toast: document.getElementById('toast'),

  btnCamera: document.getElementById('btnCamera'),
  camModal: document.getElementById('camModal'),
  btnCamClose: document.getElementById('btnCamClose'),
  camVideo: document.getElementById('camVideo'),
  camHint: document.getElementById('camHint'),
};

let state = {
  rows: [],                 // all parsed rows as objects (keys = headers)
  make: '',
  model: '',
  scannedSet: new Set(),    // scanned Stock # values
  lastScan: '',
};

function setPill(kind, text){
  els.pillState.className = 'pill' + (kind ? ` ${kind}` : '');
  els.pillState.textContent = text;
}
function setToast(kind, text){
  els.toast.className = 'toast' + (kind ? ` ${kind}` : '');
  els.toast.textContent = text || '';
  if (text){
    setTimeout(() => { els.toast.textContent = ''; els.toast.className='toast'; }, 900);
  }
}
function setRing(p){
  els.ring.style.setProperty('--p', String(p));
  els.pct.textContent = `${p}%`;
}
function save(){
  const payload = {
    rows: state.rows,
    make: state.make,
    model: state.model,
    scanned: Array.from(state.scannedSet),
    lastScan: state.lastScan,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try{
    const s = JSON.parse(raw);
    state.rows = Array.isArray(s.rows) ? s.rows : [];
    state.make = typeof s.make === 'string' ? s.make : '';
    state.model = typeof s.model === 'string' ? s.model : '';
    state.scannedSet = new Set(Array.isArray(s.scanned) ? s.scanned : []);
    state.lastScan = typeof s.lastScan === 'string' ? s.lastScan : '';
  }catch{}
}

function norm(x){ return String(x ?? '').trim().toLowerCase(); }

// --- CSV parsing with header row detection (wherever it is) ---
function splitCSVLine(line){
  const out=[]; let cur=''; let inQ=false;
  for (let i=0;i<line.length;i++){
    const ch=line[i];
    if (ch === '"'){
      if (inQ && line[i+1]==='"'){ cur+='"'; i++; }
      else inQ=!inQ;
      continue;
    }
    if (ch === ',' && !inQ){ out.push(cur); cur=''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function findHeaderIndex(lines){
  // We look for a row containing the required columns in any order:
  // stock number / stock #, make, model, condition
  const required = [
    ['stock #', 'stock number', 'stockno', 'stock', 'sku', 'item'],
    ['make'],
    ['model'],
    ['condition']
  ];

  for (let i=0;i<lines.length;i++){
    const cols = splitCSVLine(lines[i]).map(c => norm(c));
    if (cols.length < 3) continue;

    const ok = required.every(group => cols.some(c => group.includes(c)));
    if (ok) return i;
  }
  return -1;
}

function normalizeHeaders(headers){
  // Map variants to canonical names
  return headers.map(h => {
    const n = norm(h);
    if (['stock #','stock number','stockno','stock','sku','item','item number'].includes(n)) return 'Stock #';
    if (n === 'make') return 'Make';
    if (n === 'model') return 'Model';
    if (n === 'condition') return 'Condition';
    return h.trim();
  });
}

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  const hi = findHeaderIndex(lines);
  if (hi === -1) return { rows: [], error: 'Could not find header row (needs Stock #, Make, Model, Condition).' };

  const rawHeaders = splitCSVLine(lines[hi]).map(h => h.trim());
  const headers = normalizeHeaders(rawHeaders);

  const idxStock = headers.findIndex(h => h === 'Stock #');
  const idxMake = headers.findIndex(h => h === 'Make');
  const idxModel = headers.findIndex(h => h === 'Model');
  const idxCond = headers.findIndex(h => h === 'Condition');

  if (idxStock === -1 || idxMake === -1 || idxModel === -1 || idxCond === -1){
    return { rows: [], error: 'Header found but required columns missing after normalization.' };
  }

  const out = [];
  for (let i=hi+1;i<lines.length;i++){
    const vals = splitCSVLine(lines[i]);
    const stock = (vals[idxStock] ?? '').trim();
    if (!stock) continue; // skip junk/footer rows

    const row = {};
    for (let c=0;c<headers.length;c++){
      row[headers[c]] = (vals[c] ?? '').trim();
    }
    out.push(row);
  }
  return { rows: out, error: '' };
}

// --- Filters ---
function filteredRows(){
  // Condition NEW only
  const make = state.make;
  const model = state.model;

  return state.rows.filter(r => {
    const cond = norm(r['Condition']);
    if (cond !== 'new') return false;
    if (make && (r['Make'] ?? '').trim() !== make) return false;
    if (model && (r['Model'] ?? '').trim() !== model) return false;
    return true;
  });
}

function populateMakeModel(){
  const makes = Array.from(new Set(state.rows.map(r => (r['Make'] ?? '').trim()).filter(Boolean))).sort();
  const models = Array.from(new Set(state.rows.map(r => (r['Model'] ?? '').trim()).filter(Boolean))).sort();

  els.makeFilter.innerHTML = `<option value="">All</option>` + makes.map(m => `<option>${escapeHtml(m)}</option>`).join('');
  els.modelFilter.innerHTML = `<option value="">All</option>` + models.map(m => `<option>${escapeHtml(m)}</option>`).join('');

  els.makeFilter.value = state.make || '';
  els.modelFilter.value = state.model || '';
}

function escapeHtml(s){
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

// --- Counts + UI ---
function updateUI(){
  if (!state.rows.length){
    els.heroTitle.textContent = 'Upload your CSV to begin';
    els.heroSub.textContent = 'We’ll auto-detect the header row (no deleting extra rows). Then start scanning.';
    setPill('', 'No file loaded');
    els.lastCode.textContent = '—';
    els.expected.textContent = '0';
    els.scanned.textContent = '0';
    els.remaining.textContent = '0';
    setRing(0);
    return;
  }

  const f = filteredRows();
  const expected = f.length;

  let scannedInFiltered = 0;
  for (const r of f){
    const code = (r['Stock #'] ?? '').trim();
    if (code && state.scannedSet.has(code)) scannedInFiltered++;
  }

  const remaining = Math.max(expected - scannedInFiltered, 0);
  const pct = expected ? Math.round((scannedInFiltered / expected) * 100) : 0;

  els.expected.textContent = String(expected);
  els.scanned.textContent = String(scannedInFiltered);
  els.remaining.textContent = String(remaining);
  setRing(pct);

  els.lastCode.textContent = state.lastScan || '—';

  if (expected === 0){
    els.heroTitle.textContent = 'No NEW items in this filter';
    els.heroSub.textContent = 'Try changing Make/Model filters.';
    setPill('bad', 'No NEW items for filter');
  } else if (remaining === 0){
    els.heroTitle.textContent = 'Complete';
    els.heroSub.textContent = 'Everything in this NEW list has been scanned.';
    setPill('good', 'Complete');
  } else {
    els.heroTitle.textContent = 'READY TO SCAN';
    els.heroSub.textContent = 'Scan with Bluetooth. Use camera if needed.';
    setPill('', 'In progress');
  }
}

function handleScan(code, source){
  const raw = String(code ?? '').trim();
  if (!raw) return;

  if (!state.rows.length){
    setToast('bad', 'Upload CSV first');
    return;
  }

  const f = filteredRows();
  const found = f.some(r => (r['Stock #'] ?? '').trim() === raw);

  state.lastScan = raw;

  if (!found){
    setToast('bad', 'Not in NEW list');
    save(); updateUI();
    return;
  }

  if (state.scannedSet.has(raw)){
    setToast('bad', 'Duplicate ignored');
    save(); updateUI();
    return;
  }

  state.scannedSet.add(raw);
  setToast('good', source === 'camera' ? 'Scanned (camera)' : 'Scanned');
  save(); updateUI();
}

// --- Bluetooth scanner capture (no Enter) ---
let kbBuf = '';
let kbTimer = null;

document.addEventListener('keydown', (e) => {
  const a = document.activeElement;
  if (a && (a.tagName === 'SELECT' || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
  if (e.key.length !== 1) return;

  kbBuf += e.key;
  if (kbTimer) clearTimeout(kbTimer);

  kbTimer = setTimeout(() => {
    const code = kbBuf.trim();
    kbBuf = '';
    if (code) handleScan(code, 'bluetooth');
  }, 55);
});

// --- Upload flow ---
els.btnUpload.addEventListener('click', () => els.fileInput.click());

els.fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (state.rows.length){
    const ok = confirm('Start a new stock check? This clears current scans.');
    if (!ok){
      els.fileInput.value = '';
      return;
    }
  }

  const reader = new FileReader();
  reader.onload = () => {
    const { rows, error } = parseCSV(String(reader.result || ''));
    if (error){
      alert(error);
      return;
    }

    state.rows = rows;
    state.scannedSet = new Set();
    state.make = '';
    state.model = '';
    state.lastScan = '';

    populateMakeModel();
    save();
    updateUI();
    els.fileInput.value = '';
    setToast('good', 'CSV loaded');
  };
  reader.readAsText(file);
});

els.makeFilter.addEventListener('change', () => {
  state.make = els.makeFilter.value || '';
  save(); updateUI();
});

els.modelFilter.addEventListener('change', () => {
  state.model = els.modelFilter.value || '';
  save(); updateUI();
});

els.btnReset.addEventListener('click', () => {
  if (!state.rows.length) return;
  const ok = confirm('Clear scanned items? (CSV stays loaded)');
  if (!ok) return;
  state.scannedSet = new Set();
  state.lastScan = '';
  save(); updateUI();
  setToast('good', 'Reset');
});

// --- Camera scanning (BarcodeDetector) ---
let camStream = null;
let camDetector = null;
let camRaf = null;
let camRunning = false;

function openCam(){
  if (!state.rows.length){
    setToast('bad', 'Upload CSV first');
    return;
  }

  els.camModal.style.display = 'block';
  els.camModal.setAttribute('aria-hidden', 'false');

  if (!('BarcodeDetector' in window)){
    els.camHint.textContent = 'Camera scanning not supported on this iOS version. Use Bluetooth scanner.';
    return;
  }

  camDetector = new window.BarcodeDetector({
    formats: ['code_128','ean_13','ean_8','upc_a','upc_e','code_39','itf','qr_code']
  });

  navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' }, audio:false })
    .then(stream => {
      camStream = stream;
      els.camVideo.srcObject = stream;
      return els.camVideo.play();
    })
    .then(() => {
      camRunning = true;
      els.camHint.textContent = 'Point at the barcode. It will scan automatically.';
      camLoop();
    })
    .catch(() => {
      els.camHint.textContent = 'Camera blocked. Allow camera in Safari settings and try again.';
    });
}

function closeCam(){
  camRunning = false;
  if (camRaf) cancelAnimationFrame(camRaf);
  camRaf = null;

  try{
    if (camStream){
      for (const t of camStream.getTracks()) t.stop();
    }
  }catch{}
  camStream = null;
  camDetector = null;

  els.camModal.style.display = 'none';
  els.camModal.setAttribute('aria-hidden', 'true');
}

async function camLoop(){
  if (!camRunning) return;
  try{
    const codes = await camDetector.detect(els.camVideo);
    if (codes && codes.length){
      const val = String(codes[0].rawValue || '').trim();
      if (val){
        handleScan(val, 'camera');
        closeCam();
        return;
      }
    }
  }catch{}
  camRaf = requestAnimationFrame(camLoop);
}

els.btnCamera.addEventListener('click', openCam);
els.btnCamClose.addEventListener('click', closeCam);
els.camModal.addEventListener('click', (e) => {
  if (e.target === els.camModal) closeCam();
});

// --- Init ---
load();
if (state.rows.length) populateMakeModel();
updateUI();
