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
let stream = null;
let lastText = '', lastTime = 0;

/* ---------- SCANNER ---------- */
const codeReader = new ZXing.BrowserMultiFormatReader();

/* ---------- HELPERS ---------- */
const clean = v =>
  String(v ?? '').replace(/\.0$/, '').replace(/\s+/g,'').trim();

const isNew = r =>
  String(r.Condition || '').toLowerCase().includes('new');

/* ---------- UI FEEDBACK ---------- */
const vibrate = () => navigator.vibrate?.([120,40,120]);
const flash = () => {
  els.flash.classList.add('active');
  setTimeout(()=>els.flash.classList.remove('active'),150);
};
const confirm = t => {
  confirmEl.textContent = t;
  confirmEl.classList.add('show');
  setTimeout(()=>confirmEl.classList.remove('show'),450);
};

/* ---------- CSV PARSE ---------- */
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  const h = lines.findIndex(l=>/stock/i.test(l)&&/condition/i.test(l));
  if(h<0) return [];
  const heads = lines[h].split(',');

  return lines.slice(h+1).map(r=>{
    const v=r.split(','),o={};
    heads.forEach((x,i)=>{
      const n=x.toLowerCase();
      if(n.includes('stock')) o.Stock = clean(v[i]);
      if(n.includes('serial')) o.Serial = v[i]?.trim();
      if(n==='make') o.Make = v[i]?.trim();
      if(n==='model') o.Model = v[i]?.trim();
      if(n.includes('cal')) o.Calibre = v[i]?.trim();
      if(n==='condition') o.Condition = v[i]?.trim();
    });
    return o;
  }).filter(r=>r.Stock);
}

/* ---------- SMART SEARCH ---------- */
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchBody = document.getElementById('searchBody');
const searchToggle = document.getElementById('searchToggle');

function toggleSearchPanel(){
  searchBody.classList.toggle('hidden');
  searchToggle.textContent =
    searchBody.classList.contains('hidden') ? '▼' : '▲';
}

function normSearch(v){
  return String(v||'')
    .toLowerCase()
    .replace(/[\s\-_.]/g,'')
    .replace(/\u00A0/g,'');
}

function renderSearchResults(term){
  searchResults.innerHTML='';
  if(!term) return;

  const key = normSearch(term);
  const out = {};

  rows.forEach(r=>{
    if(!isNew(r) || !r.Model) return;
    if(normSearch(r.Model).includes(key)){
      out[r.Model] ??= {};
      out[r.Model][r.Calibre] =
        (out[r.Model][r.Calibre] || 0) + 1;
    }
  });

  Object.keys(out).sort().forEach(m=>{
    let h = `<div class="model-block">
      <div class="model-name">${m}</div>`;
    Object.keys(out[m]).sort().forEach(c=>{
      h += `<div class="cal-line">
        <span>${c}</span>
        <span>${out[m][c]} in stock</span>
      </div>`;
    });
    h += `</div>`;
    searchResults.innerHTML += h;
  });
}

searchInput?.addEventListener('input', e=>{
  renderSearchResults(e.target.value);
});

/* ---------- INIT ---------- */
load();
