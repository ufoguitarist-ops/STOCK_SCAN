/* ==================================================
   STOCK SCAN – FINAL STABLE BUILD
   Camera scan + Bluetooth scan + Persistent banner
   ================================================== */

/* ---------- LOGIN GUARD ---------- */
if (localStorage.getItem('stockscan_logged_in') !== 'yes') {
  location.href = 'login.html';
}

/* ---------- HELPERS ---------- */
const STORE = 'stockscan_prod_v6';
const $ = id => document.getElementById(id);

/* ---------- DOM ---------- */
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
  banner: $('statusBanner'),

  camBtn: $('btnCamera'),
  camModal: $('camModal'),
  camVideo: $('camVideo'),
  backMenu: $('btnBackMenu')
};

/* ---------- NORMALISE ---------- */
const clean = v =>
  String(v ?? '')
    .replace(/\.0$/, '')
    .replace(/\s+/g, '')
    .trim();

/* ---------- STATE ---------- */
let state = {
  rows: [],
  scanned: new Set(),
  history: [],
  bannerActive: false
};

/* ---------- TOAST ---------- */
function toast(msg, good=true){
  els.toast.textContent = msg;
  els.toast.className = 'toast ' + (good ? 'good' : 'bad');
  setTimeout(() => els.toast.className = 'toast', 900);
}

/* ---------- BANNER ---------- */
function showBanner(msg){
  els.banner.textContent = msg;
  els.banner.classList.remove('hidden');
  state.bannerActive = true;
}
function clearBanner(){
  els.banner.classList.add('hidden');
  els.banner.textContent = '';
  state.bannerActive = false;
}

/* ---------- CSV ---------- */
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const hi = lines.findIndex(l => /stock/i.test(l) && /condition/i.test(l));
  if (hi < 0) return [];

  const headers = lines[hi].split(',').map(h => h.trim());

  return lines.slice(hi+1).map(row => {
    const v = row.split(',');
    const o = {};
    headers.forEach((h,i)=>{
      const n=h.toLowerCase();
      if(n.includes('stock'))o.Stock=clean(v[i]);
      if(n.includes('serial'))o.Serial=v[i]?.trim();
      if(n==='make')o.Make=v[i]?.trim();
      if(n==='model')o.Model=v[i]?.trim();
      if(n.includes('cal'))o.Calibre=v[i]?.trim();
      if(n==='condition')o.Condition=v[i]?.trim();
    });
    return o;
  }).filter(r => r.Stock);
}

function findDuplicateSerials(rows){
  const map=new Map();
  rows.forEach(r=>{
    if(!r.Serial||!r.Stock)return;
    if(!map.has(r.Serial))map.set(r.Serial,[]);
    map.get(r.Serial).push(r.Stock);
  });
  return [...map.entries()].filter(([_,s])=>new Set(s).size>1);
}

const filtered = () =>
  state.rows.filter(r => (r.Condition||'').toLowerCase() === 'new');

/* ---------- UPDATE ---------- */
function update(){
  const f = filtered();
  els.expected.textContent = f.length;
  els.scanned.textContent = state.scanned.size;
  els.remaining.textContent = f.length - state.scanned.size;
}

/* ---------- HANDLE SCAN ---------- */
function handleScan(raw){
  const code = clean(raw);
  if(!code) return;

  const row = filtered().find(r => r.Stock === code);
  if(!row){
    toast('Not in NEW list', false);
    return;
  }
  if(state.scanned.has(code)){
    toast('Duplicate scan', false);
    return;
  }

  // FIRST VALID SCAN → CLEAR BANNER
  if(state.bannerActive){
    clearBanner();
  }

  state.scanned.add(code);
  state.history.unshift(row);

  els.sdStock.textContent  = `STOCK: ${row.Stock}`;
  els.sdSerial.textContent = `SERIAL: ${row.Serial || '—'}`;
  els.sdMeta.textContent   =
    `Make: ${row.Make||'—'} · Model: ${row.Model||'—'} · Calibre: ${row.Calibre||'—'}`;

  toast('Scanned', true);
  update();
}

/* ---------- BLUETOOTH SCANNER ---------- */
let kbBuf='', kbTimer=null;
document.addEventListener('keydown', e=>{
  if(e.key.length!==1) return;
  kbBuf+=e.key;
  clearTimeout(kbTimer);
  kbTimer=setTimeout(()=>{
    handleScan(kbBuf);
    kbBuf='';
  },55);
});

/* ---------- CAMERA (WORKING iPHONE PATH) ---------- */
let reader=null, stream=null;
let lastCam='', lastTime=0;
const COOLDOWN=800;

async function openCamera(){
  if(!state.rows.length){
    toast('Upload CSV first', false);
    return;
  }

  els.camModal.style.display='block';
  els.camVideo.setAttribute('playsinline','');
  els.camVideo.muted=true;
  els.camVideo.autoplay=true;

  stream = await navigator.mediaDevices.getUserMedia({
    video:{facingMode:{ideal:'environment'}},
    audio:false
  });

  els.camVideo.srcObject=stream;
  await els.camVideo.play();

  reader = new ZXing.BrowserMultiFormatReader();

  reader.decodeFromVideoDevice(null, els.camVideo, result=>{
    if(!result) return;
    const txt=result.getText();
    const now=Date.now();
    if(txt===lastCam && now-lastTime<COOLDOWN) return;
    lastCam=txt; lastTime=now;
    handleScan(txt);
  });
}

function closeCamera(){
  try{reader?.reset();}catch{}
  try{stream?.getTracks().forEach(t=>t.stop());}catch{}
  reader=null; stream=null;
  els.camModal.style.display='none';
}

els.camBtn.onclick=openCamera;
els.backMenu.onclick=closeCamera;

/* ---------- FILE LOAD ---------- */
els.upload.onclick=()=>{els.file.value=''; els.file.click();};

els.file.onchange=e=>{
  const f=e.target.files[0];
  if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    state.rows=parseCSV(r.result);
    state.scanned.clear();
    update();

    const dups=findDuplicateSerials(state.rows);
    if(dups.length){
      clearBanner();
      alert('⚠️ DUPLICATE SERIAL NUMBERS FOUND');
    } else {
      showBanner('NO DOUBLE BOOKINGS DETECTED');
    }
  };
  r.readAsText(f);
};

/* ---------- INIT ---------- */
update();
