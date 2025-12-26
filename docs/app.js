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
  modelSummary: $('modelSummary'),

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

/* ---------- HELPERS ---------- */
const clean = v =>
  String(v ?? '')
    .replace(/\.0$/, '')
    .replace(/\s+/g, '')   // 👈 IMPORTANT: restore strict cleaning
    .trim();

const isNew = r =>
  String(r.Condition || '').toLowerCase().includes('new');

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

/* ---------- MAKE FILTER ---------- */
function buildMakeFilter(){
  const makes = [...new Set(rows.filter(isNew).map(r => r.Make).filter(Boolean))];
  els.makeFilter.innerHTML =
    '<option value="">All Makes</option>' +
    makes.map(m => `<option value="${m}">${m}</option>`).join('');
  els.makeFilter.value = localStorage.getItem('make') || '';
}

/* ---------- MODEL SUMMARY (GROUPED) ---------- */
function baseModel(model){
  return (model || 'Unknown').split(' ')[0].toUpperCase();
}

function renderModelSummary(){
  const make = activeMake();
  if (!make){
    els.modelSummary.classList.add('hidden');
    els.modelSummary.innerHTML = '';
    return;
  }

  const groups = {};

  rows.forEach(r => {
    if (!isNew(r) || r.Make !== make) return;

    const base = baseModel(r.Model);
    const model = r.Model || 'Unknown Model';
    const cal = r.Calibre || 'Unknown';

    groups[base] ??= {};
    groups[base][model] ??= {};
    groups[base][model][cal] = (groups[base][model][cal] || 0) + 1;
  });

  let html = `<h3>📦 STOCK BREAKDOWN — ${make.toUpperCase()}</h3>`;

  Object.keys(groups).sort().forEach(base => {
    html += `<div class="model-block"><div class="model-name">${base}</div>`;
    Object.keys(groups[base]).sort().forEach(model => {
      html += `<div style="padding-left:10px;font-weight:600">${model}</div>`;
      Object.keys(groups[base][model]).sort().forEach(cal => {
        html += `
          <div class="cal-line">
            <span>${cal}</span>
            <span>${groups[base][model][cal]} in stock</span>
          </div>`;
      });
    });
    html += `</div>`;
  });

  els.modelSummary.innerHTML = html;
  els.modelSummary.classList.remove('hidden');
}

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
  localStorage.setItem('rows', JSON.stringify(rows));
  localStorage.setItem('scanned', JSON.stringify([...scanned]));
}

function load(){
  rows = JSON.parse(localStorage.getItem('rows') || '[]');
  scanned = new Set(JSON.parse(localStorage.getItem('scanned') || '[]'));
  buildMakeFilter();
  updateStats();
  renderModelSummary();
}

/* ---------- SCAN (FIXED) ---------- */
function handleScan(code){
  const c = clean(code);
  if (!c) return;

  const r = rows.find(x =>
    clean(x.Stock) === c &&
    isNew(x) &&
    (!activeMake() || x.Make === activeMake())
  );

  if (!r) return;

  if (scanned.has(r.Stock)){
    vibrate();
    confirm('⚠ DUPLICATE');
    return;
  }

  scanned.add(r.Stock);
  save();

  vibrate();
  flash();
  confirm('✔ SCANNED');

  els.stock.textContent = `STOCK: ${r.Stock}`;
  els.serial.textContent = `SERIAL: ${r.Serial || '—'}`;
  els.meta.textContent = `${r.Make} · ${r.Model} · ${r.Calibre}`;

  updateStats();
}

/* ---------- EVENTS ---------- */
els.upload.onclick = () => { els.file.value=''; els.file.click(); };

els.file.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    rows = parseCSV(r.result);
    scanned.clear();
    save();
    buildMakeFilter();
    updateStats();
    renderModelSummary();
  };
  r.readAsText(f);
};

els.makeFilter.onchange = () => {
  localStorage.setItem('make', activeMake());
  updateStats();
  renderModelSummary();
};

els.scan.onclick = async () => {
  if (!rows.length) return alert('Upload CSV first');
  els.cam.style.display = 'block';
  stream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:'environment'} });
  els.video.srcObject = stream;
  await els.video.play();
  reader = new ZXing.BrowserMultiFormatReader();
  reader.decodeFromVideoDevice(null, els.video, res => {
    if (!res) return;
    const t = res.getText(), n = Date.now();
    if (t === lastText && n - lastTime < 800) return;
    lastText = t; lastTime = n;
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
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
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

els.reset.onclick = () => { scanned.clear(); save(); updateStats(); };
els.clear.onclick = () => { localStorage.clear(); location.reload(); };

/* ---------- INIT ---------- */
load();
