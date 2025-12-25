/* =================================================
   STOCK SCAN – FINAL MERGED BUILD (STABLE)
   CSV upload + iPhone scan + banner
   ================================================= */

const $ = id => document.getElementById(id);

/* ---------- DOM ---------- */
const els = {
  upload: $('btnUpload'),
  file: $('fileInput'),
  camBtn: $('btnCamera'),
  camModal: $('camModal'),
  camVideo: $('camVideo'),
  backMenu: $('btnBackMenu'),
  banner: $('statusBanner'),
  toast: $('toast'),

  expected: $('expected'),
  scanned: $('scanned'),
  remaining: $('remaining'),

  sdStock: document.querySelector('.sd-stock'),
  sdSerial: document.querySelector('.sd-serial'),
  sdMeta: document.querySelector('.sd-meta')
};

/* ---------- STATE ---------- */
let rows = [];
let scanned = new Set();
let bannerActive = false;

/* ---------- FEEDBACK ---------- */
function toast(msg, ok=true){
  els.toast.textContent = msg;
  els.toast.className = 'toast ' + (ok?'good':'bad');
  setTimeout(()=>els.toast.className='toast',900);
}

function showBanner(msg){
  els.banner.textContent = msg;
  els.banner.classList.remove('hidden');
  bannerActive = true;
}
function clearBanner(){
  els.banner.classList.add('hidden');
  bannerActive = false;
}

/* ---------- CSV ---------- */
const clean = v => String(v ?? '').replace(/\.0$/,'').replace(/\s+/g,'').trim();

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  const hi = lines.findIndex(l=>/stock/i.test(l)&&/condition/i.test(l));
  if(hi<0) return [];

  const heads = lines[hi].split(',');

  return lines.slice(hi+1).map(r=>{
    const v=r.split(','), o={};
    heads.forEach((h,i)=>{
      const n=h.toLowerCase();
      if(n.includes('stock')) o.Stock=clean(v[i]);
      if(n.includes('serial')) o.Serial=v[i]?.trim();
      if(n==='make') o.Make=v[i]?.trim();
      if(n==='model') o.Model=v[i]?.trim();
      if(n.includes('cal')) o.Calibre=v[i]?.trim();
      if(n==='condition') o.Condition=v[i]?.trim();
    });
    return o;
  }).filter(r=>r.Stock);
}

const filtered = () =>
  rows.filter(r => (r.Condition||'').toLowerCase()==='new');

function update(){
  const f = filtered();
  els.expected.textContent = f.length;
  els.scanned.textContent = scanned.size;
  els.remaining.textContent = f.length - scanned.size;
}

/* ---------- DUPLICATE SERIAL CHECK ---------- */
function hasDuplicateSerials(rows){
  const map=new Map();
  rows.forEach(r=>{
    if(!r.Serial||!r.Stock) return;
    if(!map.has(r.Serial)) map.set(r.Serial,new Set());
    map.get(r.Serial).add(r.Stock);
  });
  return [...map.values()].some(s=>s.size>1);
}

/* ---------- HANDLE SCAN ---------- */
function handleScan(code){
  code = clean(code);
  if(!code) return;

  const row = filtered().find(r=>r.Stock===code);
  if(!row){
    toast('Not in NEW list',false);
    return;
  }
  if(scanned.has(code)){
    toast('Duplicate scan',false);
    return;
  }

  if(bannerActive) clearBanner();

  scanned.add(code);

  els.sdStock.textContent = `STOCK: ${row.Stock}`;
  els.sdSerial.textContent = `SERIAL: ${row.Serial||'—'}`;
  els.sdMeta.textContent =
    `Make: ${row.Make||'—'} · Model: ${row.Model||'—'} · Calibre: ${row.Calibre||'—'}`;

  toast('Scanned',true);
  update();
}

/* ---------- BLUETOOTH ---------- */
let buf='', t=null;
document.addEventListener('keydown',e=>{
  if(e.key.length!==1) return;
  buf+=e.key;
  clearTimeout(t);
  t=setTimeout(()=>{
    handleScan(buf);
    buf='';
  },55);
});

/* ---------- CAMERA (PROVEN WORKING) ---------- */
let reader=null, stream=null;
let last='', lastT=0;
const COOL=800;

async function openCamera(){
  if(!rows.length){
    toast('Upload CSV first',false);
    return;
  }

  els.camModal.style.display='block';
  els.camVideo.setAttribute('playsinline','');
  els.camVideo.muted=true;
  els.camVideo.autoplay=true;

  stream = await navigator.mediaDevices.getUserMedia({
    video:{facingMode:{ideal:'environment'}}, audio:false
  });

  els.camVideo.srcObject=stream;
  await els.camVideo.play();

  reader = new ZXing.BrowserMultiFormatReader();
  reader.decodeFromVideoDevice(null, els.camVideo, res=>{
    if(!res) return;
    const txt=res.getText(), now=Date.now();
    if(txt===last && now-lastT<COOL) return;
    last=txt; lastT=now;
    handleScan(txt);
  });
}

function closeCamera(){
  try{reader?.reset();}catch{}
  try{stream?.getTracks().forEach(t=>t.stop());}catch{}
  reader=null; stream=null;
  els.camModal.style.display='none';
}

/* ---------- EVENTS ---------- */
els.camBtn.onclick = openCamera;
els.backMenu.onclick = closeCamera;

els.upload.onclick = ()=>{
  els.file.value='';
  els.file.click();
};

els.file.onchange = e=>{
  const f=e.target.files[0];
  if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    rows=parseCSV(r.result);
    scanned.clear();
    update();

    if(hasDuplicateSerials(rows)){
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
