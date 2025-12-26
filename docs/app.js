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

/* ---------- BIG CONFIRM ---------- */
const confirmEl = document.createElement('div');
confirmEl.className = 'scan-confirm';
confirmEl.textContent = '✔ SCANNED';
document.body.appendChild(confirmEl);

/* ---------- STATE ---------- */
let rows = [];
let scanned = new Set();
let reader = null;
let stream = null;
let lastText = '';
let lastTime = 0;

/* ---------- STORAGE KEYS ---------- */
const LS_ROWS = 'stockscan_rows';
const LS_SCANNED = 'stockscan_scanned';
const LS_LAST = 'stockscan_last';

/* ---------- HELPERS ---------- */
const clean = v =>
  String(v ?? '')
    .replace(/\.0$/, '')
    .replace(/\s+/g, '')
    .trim();

const isNew = r =>
  String(r.Condition || '').toLowerCase().includes('new');

/* ---------- VIBRATION ---------- */
function vibrate(){
  if (navigator.vibrate) {
    navigator.vibrate([120, 40, 120]);
  }
}

/* ---------- VISUAL FEEDBACK ---------- */
function greenFlash(){
  els.flash.classList.add('active');
  setTimeout(() => els.flash.classList.remove('active'), 150);
}

function bigConfirm(text = '✔ SCANNED'){
  confirmEl.textContent = text;
  confirmEl.classList.add('show');
  setTimeout(() => confirmEl.classList.remove('show'), 450);
}

/* ---------- CSV PARSE ---------- */
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const h = lines.findIndex(l => /stock/i.test(l) && /condition/i.test(l));
  if (h < 0) return [];

  const heads = lines[h].split(',');

  return lines.slice(h + 1).map(r => {
    const v = r.split(','), o = {};
    heads.forEach((x, i) => {
      const n = x.toLowerCase();
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

/* ---------- DUPLICATE SERIAL CHECK ---------- */
function hasDuplicateSerials(data){
  const map = new Map();
  for (const r of data) {
    if (!r.Serial) continue;
    if (!map.has(r.Serial)) map.set(r.Serial, new Set());
    map.get(r.Serial).add(r.Stock);
  }
  return [...map.values()].some(s => s.size > 1);
}

/* ---------- STATS ---------- */
function updateStats(){
  const valid = rows.filter(isNew);
  els.expected.textContent = valid.length;
  els.scanned.textContent = [...scanned].filter(s =>
    valid.some(r => r.Stock === s)
  ).length;
  els.remaining.textContent =
    valid.length - els.scanned.textContent;
}

/* ---------- SAVE / LOAD ---------- */
function saveState(){
  localStorage.setItem(LS_ROWS, JSON.stringify(rows));
  localStorage.setItem(LS_SCANNED, JSON.stringify([...scanned]));
}

function saveLast(row){
  localStorage.setItem(LS_LAST, row.Stock);
}

function restoreLast(){
  const stock = localStorage.getItem(LS_LAST);
  if (!stock || !rows.length) return;

  const row = rows.find(r => r.Stock === stock);
  if (!row) return;

  els.stock.textContent = `STOCK: ${row.Stock}`;
  els.serial.textContent = `SERIAL: ${row.Serial || '—'}`;
  els.meta.textContent =
    `${row.Make || '—'} · ${row.Model || '—'} · ${row.Calibre || '—'}`;
}

function loadState(){
  const r = localStorage.getItem(LS_ROWS);
  const s = localStorage.getItem(LS_SCANNED);

  if (r) rows = JSON.parse(r);
  if (s) scanned = new Set(JSON.parse(s));

  updateStats();
  restoreLast();
}

/* ---------- SCAN HANDLER ---------- */
function handleScan(code){
  const cleaned = clean(code);
  if (!cleaned) return;

  const row = rows.find(r =>
    r.Stock === cleaned && isNew(r)
  );

  if (!row) return;

  if (scanned.has(row.Stock)) {
    vibrate();
    bigConfirm('⚠ DUPLICATE');
    return;
  }

  scanned.add(row.Stock);
  saveLast(row);

  vibrate();
  greenFlash();
  bigConfirm('✔ SCANNED');

  els.stock.textContent = `STOCK: ${row.Stock}`;
  els.serial.textContent = `SERIAL: ${row.Serial || '—'}`;
  els.meta.textContent =
    `${row.Make || '—'} · ${row.Model || '—'} · ${row.Calibre || '—'}`;

  updateStats();
  saveState();
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
    localStorage.removeItem(LS_LAST);
    saveState();
    updateStats();

    els.banner.textContent = hasDuplicateSerials(rows)
      ? '⚠ DUPLICATE SERIAL NUMBERS FOUND'
      : 'NO DOUBLE BOOKINGS DETECTED';
    els.banner.classList.remove('hidden');

    els.stock.textContent = '';
    els.serial.textContent = '';
    els.meta.textContent = '';
  };
  r.readAsText(f);
};

/* ---------- CAMERA ---------- */
els.scan.onclick = async () => {
  if (!rows.length) {
    alert('Upload CSV first');
    return;
  }

  els.cam.style.display = 'block';

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false
  });

  els.video.srcObject = stream;
  await els.video.play();

  reader = new ZXing.BrowserMultiFormatReader();
  reader.decodeFromVideoDevice(null, els.video, res => {
    if (!res) return;
    const t = res.getText(), n = Date.now();
    if (t === lastText && n - lastTime < 800) return;
    lastText = t;
    lastTime = n;
    handleScan(t);
  });
};

/* ---------- CLOSE CAMERA ---------- */
window.closeCam = () => {
  try { reader?.reset(); } catch {}
  try { stream?.getTracks().forEach(t => t.stop()); } catch {}
  els.cam.style.display = 'none';
};

/* ---------- BLUETOOTH ---------- */
let buffer = '', timer = null;
document.addEventListener('keydown', e => {
  if (e.key.length !== 1) return;
  buffer += e.key;
  clearTimeout(timer);
  timer = setTimeout(() => {
    handleScan(buffer);
    buffer = '';
  }, 55);
});

/* ---------- EXPORTS (NEW ONLY) ---------- */
function exportCSV(list, filename){
  if (!list.length) return;

  const headers = Object.keys(list[0]);
  const csv =
    headers.join(',') + '\n' +
    list.map(o => headers.map(h => o[h] ?? '').join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

els.exportS.onclick = () => {
  exportCSV(
    rows.filter(r => isNew(r) && scanned.has(r.Stock)),
    'scanned_new.csv'
  );
};

els.exportM.onclick = () => {
  exportCSV(
    rows.filter(r => isNew(r) && !scanned.has(r.Stock)),
    'missing_new.csv'
  );
};

/* ---------- BUTTONS ---------- */
els.reset.onclick = () => {
  scanned.clear();
  localStorage.removeItem(LS_LAST);
  saveState();
  updateStats();

  els.stock.textContent = '';
  els.serial.textContent = '';
  els.meta.textContent = '';
};

els.clear.onclick = () => {
  rows = [];
  scanned.clear();
  localStorage.removeItem(LS_ROWS);
  localStorage.removeItem(LS_SCANNED);
  localStorage.removeItem(LS_LAST);
  updateStats();

  els.stock.textContent = '';
  els.serial.textContent = '';
  els.meta.textContent = '';
};

/* ---------- INIT ---------- */
loadState();
