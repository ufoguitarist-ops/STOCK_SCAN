/* ==================================================
   STOCK SCAN – iPHONE SAFARI CAMERA FIX (B-case)
   Camera opens but no decode => use decodeFromVideoDevice + hints + cooldown
   ================================================== */

const STORE = 'stockscan_final_working_cam_v1';
const $ = id => document.getElementById(id);

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
  backMenu: $('btnBackMenu'),
};

/* ---------- NORMALISE ---------- */
const clean = v =>
  String(v ?? '')
    .replace(/\.0$/, '')     // Excel numbers
    .replace(/\s+/g, '')     // whitespace/newlines
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
  d.style.cssText = `position:fixed;inset:0;background:${color};z-index:999999;pointer-events:none`;
  document.body.appendChild(d);
  d.offsetHeight; // force paint on iOS
  setTimeout(() => d.remove(), 180);
}
const okFlash = () => flash('rgba(40,220,120,.45)');
const badFlash = () => flash('rgba(220,40,40,.45)');

function toast(msg, ok=true){
  els.toast.textContent = msg;
  els.toast.className = 'toast ' + (ok ? 'good' : 'bad');
  setTimeout(() => els.toast.className = 'toast', 900);
}

/* ---------- CSV (simple) ---------- */
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const hi = lines.findIndex(l => /stock/i.test(l) && /condition/i.test(l));
  if (hi < 0) return [];

  const headers = lines[hi].split(',').map(h => h.trim());

  return lines.slice(hi + 1).map(line => {
    const v = line.split(',');
    const o = {};
    headers.forEach((h, i) => {
      const n = h.toLowerCase();
      if (n.includes('stock'))   o.Stock = clean(v[i]);
      if (n.includes('serial'))  o.Serial = v[i]?.trim();
      if (n === 'make')          o.Make = v[i]?.trim();
      if (n === 'model')         o.Model = v[i]?.trim();
      if (n.includes('cal'))     o.Calibre = v[i]?.trim();
      if (n === 'condition')     o.Condition = v[i]?.trim();
    });
    return o;
  }).filter(r => r.Stock);
}

const filtered = () =>
  state.rows.filter(r => String(r.Condition || '').toLowerCase() === 'new');

/* ---------- UPDATE ---------- */
function update(){
  const f = filtered();
  const s = f.filter(r => state.scanned.has(r.Stock)).length;
  const total = f.length;

  els.expected.textContent = total;
  els.scanned.textContent = s;
  els.remaining.textContent = total - s;

  const pct = total ? Math.round((s / total) * 100) : 0;
  els.pct.textContent = pct + '%';
  els.ring.style.setProperty('--p', pct);

  els.history.innerHTML = state.history.slice(0,5)
    .map(h => `<li>${h.Stock} · ${h.Serial || ''}</li>`)
    .join('');

  save();
}

/* ---------- SCAN ---------- */
function handleScan(raw){
  const code = clean(raw);
  if (!code) return;

  const row = filtered().find(r => r.Stock === code);

  if (!row) {
    badFlash();
    toast('Not in NEW list', false);
    return;
  }
  if (state.scanned.has(code)) {
    badFlash();
    toast('Duplicate', false);
    return;
  }

  state.scanned.add(code);
  state.history.unshift(row);

  els.sdStock.textContent = `STOCK: ${row.Stock}`;
  els.sdSerial.textContent = `SERIAL: ${row.Serial || '—'}`;
  els.sdMeta.textContent = `Make: ${row.Make || '—'} · Model: ${row.Model || '—'} · Calibre: ${row.Calibre || '—'}`;

  okFlash();
  toast('Scanned', true);
  update();
}

/* ---------- BLUETOOTH ---------- */
let kbBuf = '', kbTimer = null;
document.addEventListener('keydown', e => {
  if (e.key.length !== 1) return;
  kbBuf += e.key;
  clearTimeout(kbTimer);
  kbTimer = setTimeout(() => {
    handleScan(kbBuf);
    kbBuf = '';
  }, 55);
});

/* ---------- CAMERA (FIX FOR B) ---------- */
let reader = null;
let stream = null;
let lastCam = '';
let lastCamTime = 0;
const COOLDOWN_MS = 800;

function closeCamera(){
  try { reader?.reset(); } catch {}
  try { stream?.getTracks().forEach(t => t.stop()); } catch {}
  reader = null;
  stream = null;
  els.camModal.style.display = 'none';
}

async function openCamera(){
  if (!state.rows.length) {
    toast('Upload CSV first', false);
    return;
  }

  els.camModal.style.display = 'block';

  // Ensure video element is in a good state for iOS
  els.camVideo.setAttribute('playsinline', '');
  els.camVideo.muted = true;
  els.camVideo.autoplay = true;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });

    els.camVideo.srcObject = stream;
    await els.camVideo.play();

    // Strong hints: CODE_128/EAN are common on stock labels
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.CODE_128,
      ZXing.BarcodeFormat.CODE_39,
      ZXing.BarcodeFormat.EAN_13,
      ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A,
      ZXing.BarcodeFormat.UPC_E,
      ZXing.BarcodeFormat.ITF,
      ZXing.BarcodeFormat.QR_CODE
    ]);

    reader = new ZXing.BrowserMultiFormatReader(hints, 300);

    // This is the reliable iOS path
    reader.decodeFromVideoDevice(null, els.camVideo, (result, err) => {
      if (result) {
        const text = result.getText();
        const now = Date.now();
        if (text === lastCam && (now - lastCamTime) < COOLDOWN_MS) return;
        lastCam = text; lastCamTime = now;
        handleScan(text);
      }
      // ignore errors (NotFoundException happens constantly between frames)
    });

  } catch (e) {
    closeCamera();
    toast('Camera blocked / unavailable', false);
  }
}

els.camBtn.onclick = openCamera;
els.backMenu.onclick = closeCamera;

/* ---------- EXPORTS ---------- */
function exportCSV(rows, name){
  if (!rows.length) { toast('Nothing to export', false); return; }
  const csv =
    Object.keys(rows[0]).join(',') + '\n' +
    rows.map(r => Object.values(r).join(',')).join('\n');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
  a.download = name;
  a.click();
}

els.exportS.onclick = () => exportCSV(
  state.rows.filter(r => state.scanned.has(r.Stock)),
  'scanned.csv'
);

els.exportM.onclick = () => exportCSV(
  state.rows.filter(r => !state.scanned.has(r.Stock)),
  'missing.csv'
);

/* ---------- BUTTONS ---------- */
els.upload.onclick = () => { els.file.value=''; els.file.click(); };

els.file.onchange = e => {
  const f = e.target.files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    state.rows = parseCSV(r.result);
    state.scanned.clear();
    state.history = [];
    update();
    toast('CSV loaded', true);
  };
  r.readAsText(f);
};

els.reset.onclick = () => {
  state.scanned.clear();
  state.history = [];
  update();
  toast('Scan reset', true);
};

els.clear.onclick = () => {
  localStorage.removeItem(STORE);
  closeCamera();
  location.reload();
};

/* ---------- INIT ---------- */
load();
update();
