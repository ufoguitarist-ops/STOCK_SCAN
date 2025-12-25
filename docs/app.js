const STORE = 'stockscan_ultimate_v2';
const $ = id => document.getElementById(id);

const els = {
  upload: $('btnUpload'),
  file: $('fileInput'),
  reset: $('btnResetScan'),
  clear: $('btnClearCSV'),
  exportS: $('btnExportScanned'),
  exportM: $('btnExportMissing'),

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
  history: $('history'),

  camBtn: $('btnCamera'),
  camModal: $('camModal'),
  camVideo: $('camVideo'),
  camClose: $('btnCamClose')
};

let state = {
  rows: [],
  scanned: new Set(),
  history: [],
  locked: false
};

const norm = v => String(v || '').trim();

/* ---------- STORAGE ---------- */
function save() {
  localStorage.setItem(STORE, JSON.stringify({
    rows: state.rows,
    scanned: [...state.scanned],
    history: state.history,
    locked: state.locked
  }));
}

function load() {
  const s = JSON.parse(localStorage.getItem(STORE) || '{}');
  state.rows = s.rows || [];
  state.scanned = new Set(s.scanned || []);
  state.history = s.history || [];
  state.locked = s.locked || false;
}

/* ---------- FEEDBACK ---------- */
function flash(color) {
  const d = document.createElement('div');
  d.style.cssText = `
    position:fixed; inset:0;
    background:${color};
    z-index:9999;
    pointer-events:none;
  `;
  document.body.appendChild(d);
  d.offsetHeight;
  setTimeout(() => d.remove(), 200);
}

const ok = () => flash('rgba(40,220,120,.4)');
const bad = () => flash('rgba(220,40,40,.4)');

/* ---------- CSV ---------- */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headerIndex = lines.findIndex(l =>
    /stock/i.test(l) && /condition/i.test(l)
  );
  if (headerIndex < 0) return [];

  const headers = lines[headerIndex].split(',').map(h => h.trim());
  return lines.slice(headerIndex + 1).map(l => {
    const v = l.split(',');
    const o = {};
    headers.forEach((h, i) => {
      const n = h.toLowerCase();
      if (n.includes('stock')) o.Stock = v[i];
      if (n.includes('serial')) o.Serial = v[i];
      if (n === 'make') o.Make = v[i];
      if (n === 'model') o.Model = v[i];
      if (n.includes('cal')) o.Calibre = v[i];
      if (n === 'condition') o.Condition = v[i];
    });
    return o;
  }).filter(r => r.Stock);
}

/* ---------- FILTER ---------- */
function filtered() {
  return state.rows.filter(r =>
    String(r.Condition || '').toLowerCase() === 'new'
  );
}

/* ---------- UPDATE ---------- */
function update() {
  const f = filtered();
  const s = f.filter(r => state.scanned.has(norm(r.Stock))).length;
  const total = f.length;

  els.expected.textContent = total;
  els.scanned.textContent = s;
  els.remaining.textContent = total - s;

  const pct = total ? Math.round((s / total) * 100) : 0;
  els.pct.textContent = pct + '%';
  els.ring.style.setProperty('--p', pct);

  els.history.innerHTML = state.history
    .slice(0, 5)
    .map(h => `<li>${h.Stock} · ${h.Serial || ''}</li>`)
    .join('');

  if (total && s === total) {
    flash('rgba(40,220,120,.85)');
    setTimeout(() => alert('STOCK CHECK COMPLETE'), 50);
  }

  save();
}

/* ---------- SCAN (FIXED) ---------- */
function scan(rawCode) {
  const code = norm(rawCode);
  if (!code) return;

  const row = filtered().find(r => norm(r.Stock) === code);

  if (!row) {
    bad();
    return;
  }
  if (state.scanned.has(code)) {
    bad();
    return;
  }

  state.locked = true;
  state.scanned.add(code);
  state.history.unshift(row);

  els.sdStock.textContent = `STOCK: ${row.Stock}`;
  els.sdSerial.textContent = `SERIAL: ${row.Serial || '—'}`;
  els.sdMeta.textContent =
    `Make: ${row.Make || '—'} · Model: ${row.Model || '—'} · Calibre: ${row.Calibre || '—'}`;

  ok();
  update();
}

/* ---------- CAMERA ---------- */
let reader = null;

els.camBtn.onclick = async () => {
  els.camModal.style.display = 'block';
  reader = new ZXing.BrowserMultiFormatReader();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }
  });
  els.camVideo.srcObject = stream;
  await els.camVideo.play();

  reader.decodeFromVideoDevice(null, els.camVideo, res => {
    if (res) scan(res.getText());
  });
};

els.camClose.onclick = () => {
  reader?.reset();
  els.camVideo.srcObject?.getTracks().forEach(t => t.stop());
  els.camModal.style.display = 'none';
};

/* ---------- BLUETOOTH ---------- */
let buf = '', timer = null;
document.addEventListener('keydown', e => {
  if (e.key.length !== 1) return;
  buf += e.key;
  clearTimeout(timer);
  timer = setTimeout(() => {
    scan(buf);
    buf = '';
  }, 60);
});

/* ---------- BUTTONS ---------- */
els.upload.onclick = () => els.file.click();

els.file.onchange = e => {
  const r = new FileReader();
  r.onload = () => {
    state.rows = parseCSV(r.result);
    state.scanned.clear();
    state.history = [];
    state.locked = false;
    update();
  };
  r.readAsText(e.target.files[0]);
};

els.reset.onclick = () => {
  state.scanned.clear();
  state.history = [];
  state.locked = false;
  update();
};

els.clear.onclick = () => {
  localStorage.removeItem(STORE);
  location.reload();
};

els.exportS.onclick = () => exportCSV(
  state.rows.filter(r => state.scanned.has(norm(r.Stock))),
  'scanned.csv'
);

els.exportM.onclick = () => exportCSV(
  state.rows.filter(r => !state.scanned.has(norm(r.Stock))),
  'missing.csv'
);

function exportCSV(rows, name) {
  if (!rows.length) return;
  const csv =
    Object.keys(rows[0]).join(',') + '\n' +
    rows.map(r => Object.values(r).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
}

/* ---------- INIT ---------- */
load();
update();
