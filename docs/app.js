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
let reader, stream;
let lastText = '', lastTime = 0;

/* ---------- STORAGE ---------- */
const LS_ROWS = 'rows';
const LS_SCANNED = 'scanned';
const LS_LAST = 'last';
const LS_MAKE = 'make';

/* ---------- HELPERS ---------- */
const clean = v => String(v ?? '').replace(/\.0$/, '').trim();
const isNew = r => String(r.Condition || '').toLowerCase().includes('new');
const activeMake = () => els.makeFilter.value;

/* ---------- UI FEEDBACK ---------- */
const vibrate = () => navigator.vibrate?.([120, 40, 120]);
const flash = () => {
  els.flash.classList.add('active');
  setTimeout(() => els.flash.classList.remove('active'), 150);
};
const confirm = t => {
  confirmEl.textContent = t;
  confirmEl.classList.add('show');
  setTimeout(() => confirmEl.classList.remove('show'), 450);
};

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

/* ---------- MAKE FILTER ---------- */
function buildMakeFilter(){
  const makes = [...new Set(rows.filter(isNew).map(r => r.Make).filter(Boolean))];
  els.makeFilter.innerHTML =
    '<option value="">All Makes</option>' +
    makes.map(m => `<option value="${m}">${m}</option>`).join('');

  els.makeFilter.value = localStorage.getItem(LS_MAKE) || '';
}

els.makeFilter.onchange = () => {
  localStorage.setItem(LS_MAKE, activeMake());
  updateStats();
  restoreLast(); // 👈 keep details visible
};

/* ---------- STATS ---------- */
function filtered(){
  return rows.filter(r =>
    isNew(r) &&
    (!activeMake() || r.Make === activeMake())
  );
}

function updateStats(){
  const f = filtered();
  const s = f.filter(r => scanned.has(r.Stock));
  els.expected.textContent = f.length;
  els.scanned.textContent = s.length;
  els.remaining.textContent = f.length - s.length;
}

/* ---------- SAVE / LOAD ---------- */
function save(){
  localStorage.setItem(LS_ROWS, JSON.stringify(rows));
  localStorage.setItem(LS_SCANNED, JSON.stringify([...scanned]));
}

function restoreLast(){
  const last = localStorage.getItem(LS_LAST);
  if (!last) return;

  const row = rows.find(r => r.Stock === last);
  if (!row) return;

  els.stock.textContent = `STOCK: ${row.Stock}`;
  els.serial.textContent = `SERIAL: ${row.Serial || '—'}`;
  els.meta.textContent =
    `${row.Make || '—'} · ${row.Model || '—'} · ${row.Calibre || '—'}`;
}

function load(){
  rows = JSON.parse(localStorage.getItem(LS_ROWS) || '[]');
  scanned = new Set(JSON.parse(localStorage.getItem(LS_SCANNED) || '[]'));

  buildMakeFilter();
  updateStats();
  restoreLast(); // 👈 restore AFTER filter + stats
}

/* ---------- SCAN ---------- */
function handleScan(code){
  const c = clean(code);
  const r = rows.find(x =>
    x.Stock === c &&
    isNew(x) &&
    (!activeMake() || x.Make === activeMake())
  );
  if (!r) return;

  if (scanned.has(r.Stock)) {
    vibrate();
    confirm('⚠ DUPLICATE');
    return;
  }

  scanned.add(r.Stock);
  localStorage.setItem(LS_LAST, r.Stock);
  save();

  vibrate();
  flash();
  confirm('✔ SCANNED');

  els.stock.textContent = `STOCK: ${r.Stock}`;
  els.serial.textContent = `SERIAL: ${r.Serial || '—'}`;
  els.meta.textContent =
    `${r.Make || '—'} · ${r.Model || '—'} · ${r.Calibre || '—'}`;

  updateStats();
}

/* ---------- CSV LOAD ---------- */
els.upload.onclick = () => { els.file.value = ''; els.file.click(); };

els.file.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;

  const r = new FileReader();
  r.onload = () => {
    rows = parseCSV(r.result);
    scanned.clear();
    localStorage.removeItem(LS_LAST);
    save();

    buildMakeFilter();
    updateStats();

    // ✅ DUPLICATE MESSAGE RESTORED
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
  if (!rows.length) return alert('Upload CSV first');

  els.cam.style.display = 'block';
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }
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

window.closeCam = () => {
  reader?.reset();
  stream?.getTracks().forEach(t => t.stop());
  els.cam.style.display = 'none';
};

/* ---------- BLUETOOTH ---------- */
let buf = '', timer = null;
document.addEventListener('keydown', e => {
  if (e.key.length !== 1) return;
  buf += e.key;
  clearTimeout(timer);
  timer = setTimeout(() => {
    handleScan(buf);
    buf = '';
  }, 55);
});

/* ---------- EXPORT ---------- */
function exportCSV(list, name){
  if (!list.length) return alert('Nothing to export');
  const h = Object.keys(list[0]);
  const csv = h.join(',') + '\n' +
    list.map(o => h.map(k => o[k] ?? '').join(',')).join('\n');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
  a.download = name;
  a.click();
}

els.exportS.onclick = e => {
  e.preventDefault();
  exportCSV(filtered().filter(r => scanned.has(r.Stock)), 'scanned_new.csv');
};

els.exportM.onclick = e => {
  e.preventDefault();
  exportCSV(filtered().filter(r => !scanned.has(r.Stock)), 'missing_new.csv');
};

els.reset.onclick = () => {
  scanned.clear();
  save();
  updateStats();
};

els.clear.onclick = () => {
  localStorage.clear();
  location.reload();
};

/* ---------- INIT ---------- */
load();
