const $ = id => document.getElementById(id);

/* ---------- DOM ---------- */
const els = {
  upload: $('btnUpload'),
  file: $('fileInput'),
  camBtn: $('btnCamera'),
  camModal: $('camModal'),
  camVideo: $('camVideo'),
  back: $('btnBack'),

  reset: $('btnReset'),
  clear: $('btnClear'),
  exportS: $('btnExportScanned'),
  exportM: $('btnExportMissing'),

  expected: $('expected'),
  scanned: $('scanned'),
  remaining: $('remaining'),

  sdStock: document.querySelector('.sd-stock'),
  sdSerial: document.querySelector('.sd-serial'),
  sdMeta: document.querySelector('.sd-meta'),

  toast: $('toast'),
  banner: $('statusBanner'),
  flash: $('flash')
};

/* ---------- STATE ---------- */
let rows = [];
let scanned = new Set();
let bannerLocked = false;

/* ---------- HELPERS ---------- */
const clean = v =>
  String(v ?? '')
    .replace(/\.0$/, '')
    .replace(/\s+/g, '')
    .trim();

function toast(msg, ok = true) {
  els.toast.textContent = msg;
  els.toast.className = 'toast ' + (ok ? 'good' : 'bad');
  setTimeout(() => (els.toast.className = 'toast'), 900);
}

function flashGreen() {
  els.flash.classList.add('show');
  setTimeout(() => els.flash.classList.remove('show'), 150);
}

function showBanner(msg) {
  els.banner.textContent = msg;
  els.banner.classList.remove('hidden');
  bannerLocked = true;
}

function clearBanner() {
  if (!bannerLocked) return;
  els.banner.classList.add('hidden');
  bannerLocked = false;
}

/* ---------- CSV ---------- */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headerIndex = lines.findIndex(
    l => /stock/i.test(l) && /condition/i.test(l)
  );
  if (headerIndex < 0) return [];

  const headers = lines[headerIndex].split(',');

  return lines.slice(headerIndex + 1).map(r => {
    const v = r.split(',');
    const o = {};
    headers.forEach((h, i) => {
      const n = h.toLowerCase();
      if (n.includes('stock')) o.Stock = clean(v[i]);
      if (n.includes('serial')) o.Serial = v[i]?.trim();
      if (n === 'make') o.Make = v[i]?.trim();
      if (n === 'model') o.Model = v[i]?.trim();
      if (n.includes('cal')) o.Calibre = v[i]?.trim();
      if (n === 'condition') o.Condition = v[i]?.trim();
    });
    return o;
  }).filter(r => r.Stock);
}

const filtered = () =>
  rows.filter(r => (r.Condition || '').toLowerCase() === 'new');

function updateStats() {
  const f = filtered();
  els.expected.textContent = f.length;
  els.scanned.textContent = scanned.size;
  els.remaining.textContent = f.length - scanned.size;
}

/* ---------- DUPLICATE SERIAL CHECK ---------- */
function checkDuplicateSerials(data) {
  const map = new Map();
  for (const r of data) {
    if (!r.Serial || !r.Stock) continue;
    if (!map.has(r.Serial)) map.set(r.Serial, new Set());
    map.get(r.Serial).add(r.Stock);
  }
  return [...map.values()].some(s => s.size > 1);
}

/* ---------- HANDLE SCAN ---------- */
function handleScan(code) {
  code = clean(code);
  if (!code) return;

  const row = filtered().find(r => r.Stock === code);
  if (!row) {
    toast('Not in NEW stock', false);
    return;
  }
  if (scanned.has(code)) {
    toast('Already scanned', false);
    return;
  }

  scanned.add(code);
  flashGreen();
  clearBanner();

  els.sdStock.textContent = `STOCK: ${row.Stock}`;
  els.sdSerial.textContent = `SERIAL: ${row.Serial || '—'}`;
  els.sdMeta.textContent =
    `Make: ${row.Make || '—'} · Model: ${row.Model || '—'} · Calibre: ${row.Calibre || '—'}`;

  toast('Scan OK', true);
  updateStats();
}

/* ---------- CSV LOAD ---------- */
els.upload.onclick = () => {
  els.file.value = '';
  els.file.click();
};

els.file.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    rows = parseCSV(r.result);
    scanned.clear();
    updateStats();

    if (checkDuplicateSerials(rows)) {
      showBanner('⚠️ DUPLICATE SERIAL NUMBERS FOUND');
    } else {
      showBanner('NO DOUBLE BOOKINGS DETECTED');
    }
  };
  r.readAsText(f);
};

/* ---------- BLUETOOTH ---------- */
let buffer = '';
let keyTimer = null;
document.addEventListener('keydown', e => {
  if (e.key.length !== 1) return;
  buffer += e.key;
  clearTimeout(keyTimer);
  keyTimer = setTimeout(() => {
    handleScan(buffer);
    buffer = '';
  }, 55);
});

/* ---------- CAMERA (FIXED & STABLE) ---------- */
let reader = null;
let stream = null;
let last = '';
let lastTime = 0;
const COOLDOWN = 800;

els.camBtn.onclick = async () => {
  if (!rows.length) {
    toast('Upload CSV first', false);
    return;
  }

  els.camModal.style.display = 'block';

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false
  });

  els.camVideo.srcObject = stream;
  await els.camVideo.play();

  reader = new ZXing.BrowserMultiFormatReader();

  reader.decodeFromVideoDevice(null, els.camVideo, (result, err) => {
    if (!result) return;
    const text = result.getText();
    const now = Date.now();
    if (text === last && now - lastTime < COOLDOWN) return;
    last = text;
    lastTime = now;
    handleScan(text);
  });
};

els.back.onclick = () => {
  try { reader?.reset(); } catch {}
  try { stream?.getTracks().forEach(t => t.stop()); } catch {}
  reader = null;
  stream = null;
  els.camModal.style.display = 'none';
};

/* ---------- RESET / CLEAR ---------- */
els.reset.onclick = () => {
  scanned.clear();
  updateStats();
  toast('Scan reset');
};

els.clear.onclick = () => {
  rows = [];
  scanned.clear();
  updateStats();
  toast('CSV cleared');
};

updateStats();
