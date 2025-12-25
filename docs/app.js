/* ===============================
   STOCK SCAN – PREMIUM STABLE
   Bluetooth first, Camera backup
   =============================== */

const STORAGE = 'stockscan_premium_v3';

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

/* ---------- Helpers ---------- */
const norm = v => String(v ?? '').trim().toLowerCase();

function toast(msg, ok = true) {
  els.toast.textContent = msg;
  els.toast.className = 'toast ' + (ok ? 'good' : 'bad');
  setTimeout(() => {
    els.toast.textContent = '';
    els.toast.className = 'toast';
  }, 900);
}

/* ---------- Persistence ---------- */
function save() {
  localStorage.setItem(STORAGE, JSON.stringify({
    rows: state.rows,
    scanned: [...state.scanned],
    make: state.make,
    model: state.model,
    last: state.last
  }));
}

function load() {
  const s = JSON.parse(localStorage.getItem(STORAGE) || '{}');
  state.rows = s.rows || [];
  state.scanned = new Set(s.scanned || []);
  state.make = s.make || '';
  state.model = s.model || '';
  state.last = s.last || '';
}

/* ---------- CSV Parsing ---------- */
function splitCSV(line) {
  const out = [], cur = [];
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { q = !q; continue; }
    if (c === ',' && !q) {
      out.push(cur.join('')); cur.length = 0; continue;
    }
    cur.push(c);
  }
  out.push(cur.join(''));
  return out;
}

function findHeader(lines) {
  const need = [
    ['stock', 'stock #', 'stock number'],
    ['make'],
    ['model'],
    ['condition']
  ];
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCSV(lines[i]).map(norm);
    if (need.every(g => cols.some(c => g.includes(c)))) return i;
  }
  return -1;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const h = findHeader(lines);
  if (h < 0) return [];

  const headers = splitCSV(lines[h]).map(h => {
    const n = norm(h);
    if (n.includes('stock')) return 'Stock';
    if (n === 'make') return 'Make';
    if (n === 'model') return 'Model';
    if (n === 'condition') return 'Condition';
    return h.trim();
  });

  return lines.slice(h + 1).map(l => {
    const v = splitCSV(l);
    const o = {};
    headers.forEach((h, i) => o[h] = v[i]?.trim());
    return o;
  }).filter(r => r.Stock);
}

/* ---------- Filters ---------- */
function filtered() {
  return state.rows.filter(r =>
    norm(r.Condition) === 'new' &&
    (!state.make || r.Make === state.make) &&
    (!state.model || r.Model === state.model)
  );
}

/* ---------- UI Update ---------- */
function update() {
  if (!state.rows.length) {
    els.heroTitle.textContent = 'Upload your CSV';
    els.heroSub.textContent = 'Header row is detected automatically';
    els.status.textContent = 'No file loaded';
    els.expected.textContent = els.scanned.textContent = els.remaining.textContent = '0';
    els.lastCode.textContent = '—';
    els.pct.textContent = '0%';
    els.ring.style.setProperty('--p', 0);
    save();
    return;
  }

  const f = filtered();
  const scanned = f.filter(r => state.scanned.has(r.Stock)).length;
  const remaining = f.length - scanned;
  const pct = f.length ? Math.round(scanned / f.length * 100) : 0;

  els.expected.textContent = f.length;
  els.scanned.textContent = scanned;
  els.remaining.textContent = remaining;
  els.pct.textContent = pct + '%';
  els.ring.style.setProperty('--p', pct);
  els.lastCode.textContent = state.last || '—';

  if (remaining === 0 && f.length) {
    els.heroTitle.textContent = 'Complete';
    els.heroSub.textContent = 'All NEW items scanned';
    els.status.textContent = 'Complete';
  } else {
    els.heroTitle.textContent = 'READY TO SCAN';
    els.heroSub.textContent = 'Bluetooth scanner or camera';
    els.status.textContent = 'In progress';
  }

  save();
}

/* ---------- Scan Handling ---------- */
function handleScan(code) {
  const c = String(code || '').trim();
  if (!c) return;

  if (!filtered().some(r => r.Stock === c)) {
    toast('Not in NEW list', false);
    return;
  }
  if (state.scanned.has(c)) {
    toast('Duplicate', false);
    return;
  }

  state.scanned.add(c);
  state.last = c;
  toast('Scanned', true);
  update();
}

/* ---------- Bluetooth Scanner ---------- */
let buf = '', t = null;
document.addEventListener('keydown', e => {
  if (e.key.length !== 1) return;
  buf += e.key;
  clearTimeout(t);
  t = setTimeout(() => {
    handleScan(buf.trim());
    buf = '';
  }, 55);
});

/* ---------- Camera Scanning (ZXing – FIXED) ---------- */
let reader = null;
let stream = null;

async function openCam() {
  if (!state.rows.length) {
    toast('Upload CSV first', false);
    return;
  }

  els.camModal.style.display = 'block';
  els.camHint.textContent = 'Starting camera…';

  try {
    reader = new ZXing.BrowserMultiFormatReader();

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });

    els.camVideo.srcObject = stream;
    await els.camVideo.play();

    els.camHint.textContent = 'Point at the barcode';

    reader.decodeFromVideoDevice(null, els.camVideo, (result, err) => {
      if (result) {
        handleScan(result.getText());
        closeCam();
      }
    });

  } catch (e) {
    els.camHint.textContent = 'Camera access blocked';
  }
}

function closeCam() {
  try {
    reader?.reset();
    reader = null;
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
  } catch {}

  els.camModal.style.display = 'none';
}

els.camBtn.onclick = openCam;
els.camClose.onclick = closeCam;
els.camModal.onclick = e => { if (e.target === els.camModal) closeCam(); };

/* ---------- Events ---------- */
els.upload.onclick = () => els.file.click();

els.file.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;

  const r = new FileReader();
  r.onload = () => {
    state.rows = parseCSV(r.result);
    state.scanned.clear();
    state.make = '';
    state.model = '';
    const makes = [...new Set(state.rows.map(r => r.Make).filter(Boolean))];
    els.make.innerHTML = '<option value="">All</option>' + makes.map(m => `<option>${m}</option>`).join('');
    update();
  };
  r.readAsText(f);
};

els.make.onchange = () => { state.make = els.make.value; update(); };
els.model.onchange = () => { state.model = els.model.value; update(); };
els.reset.onclick = () => { state.scanned.clear(); state.last=''; update(); };

/* ---------- Init ---------- */
load();
update();
