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

/* ---------- HELPERS ---------- */
const clean = v =>
  String(v ?? '')
    .replace(/\.0$/, '')
    .replace(/\s+/g, '')
    .trim();

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

function bigConfirm(){
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

/* ---------- STATS ---------- */
function updateStats(){
  const valid = rows.filter(r =>
    String(r.Condition || '').toLowerCase().includes('new')
  );
  els.expected.textContent = valid.length;
  els.scanned.textContent = scanned.size;
  els.remaining.textContent = valid.length - scanned.size;
}

/* ---------- SAVE / LOAD STATE ---------- */
function saveState(){
  localStorage.setItem(LS_ROWS, JSON.stringify(rows));
  localStorage.setItem(LS_SCANNED, JSON.stringify([...scanned]));
}

function loadState(){
  const r = localStorage.getItem(LS_ROWS);
  const s = localStorage.getItem(LS_SCANNED);

  if (r) rows = JSON.parse(r);
  if (s) scanned = new Set(JSON.parse(s));

  if (rows.length) {
    els.banner.textContent = 'CSV RESTORED FROM PREVIOUS SESSION';
    els.banner.classList.remove('hidden');
  }

  updateStats();
}

/* ---------- SCAN HANDLER ---------- */
function handleScan(code){
  const cleaned = clean(code);
  if (!cleaned) return;

  const row = rows.find(r =>
    r.Stock === cleaned &&
    String(r.Condition || '').toLowerCase().includes('new')
  );

  if (!row || scanned.has(row.Stock)) return;

  scanned.add(row.Stock);

  vibrate();
  greenFlash();
  bigConfirm();

  els.stock.textContent = `STOCK: ${row.Stock}`;
  els.serial.textContent = `SERIAL: ${row.Serial || '—'}`;
  els.meta.textContent =
    `${row.Make || '—'} · ${row.Model || '—'} · ${row.Calibre || '—'}`;

  els.banner.classList.add('hidden');
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
    saveState();
    updateStats();

    els.banner.textContent = 'CSV LOADED';
    els.banner.classList.remove('hidden');
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

/* ---------- BUTTONS ---------- */
els.reset.onclick = () => {
  scanned.clear();
  saveState();
  updateStats();
};

els.clear.onclick = () => {
  rows = [];
  scanned.clear();
  localStorage.removeItem(LS_ROWS);
  localStorage.removeItem(LS_SCANNED);
  updateStats();
};

/* ---------- INIT ---------- */
loadState();
