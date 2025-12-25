/* ---------- LOGIN GUARD ---------- */
if (localStorage.getItem('stockscan_logged_in') !== 'yes') {
  location.href = 'login.html';
}

const STORE='stockscan_prod_final';
const $=id=>document.getElementById(id);

/* ---------- DOM ---------- */
const els={
  upload:$('btnUpload'),
  file:$('fileInput'),
  reset:$('btnResetScan'),
  clear:$('btnClearCSV'),
  exportS:$('btnExportScanned'),
  exportM:$('btnExportMissing'),

  expected:$('expected'),
  scanned:$('scanned'),
  remaining:$('remaining'),
  ring:$('ring'),
  pct:$('pct'),

  sdStock:document.querySelector('.sd-stock'),
  sdSerial:document.querySelector('.sd-serial'),
  sdMeta:document.querySelector('.sd-meta'),

  history:$('history'),
  toast:$('toast'),
  banner:$('statusBanner'),

  camBtn:$('btnCamera'),
  camModal:$('camModal'),
  camVideo:$('camVideo'),
  backMenu:$('btnBackMenu')
};

/* ---------- UTIL ---------- */
const clean=v=>String(v??'').replace(/\.0$/,'').replace(/\s+/g,'').trim();

/* ---------- STATE ---------- */
let state={
  rows:[],
  scanned:new Set(),
  bannerActive:false
};

/* ---------- TOAST ---------- */
function toast(msg,good=true){
  els.toast.textContent=msg;
  els.toast.className='toast '+(good?'good':'bad');
  setTimeout(()=>els.toast.className='toast',900);
}

/* ---------- BANNER ---------- */
function showBanner(msg){
  els.banner.textContent=msg;
  els.banner.classList.remove('hidden');
  state.bannerActive=true;
}
function clearBanner(){
  els.banner.classList.add('hidden');
  els.banner.textContent='';
  state.bannerActive=false;
}

/* ---------- CSV ---------- */
function parseCSV(t){
  const l=t.split(/\r?\n/).filter(x=>x.trim());
  const h=l.findIndex(x=>/stock/i.test(x)&&/condition/i.test(x));
  if(h<0)return[];
  const heads=l[h].split(',');
  return l.slice(h+1).map(r=>{
    const v=r.split(',');const o={};
    heads.forEach((x,i)=>{
      const n=x.toLowerCase();
      if(n.includes('stock'))o.Stock=clean(v[i]);
      if(n.includes('serial'))o.Serial=v[i]?.trim();
      if(n==='make')o.Make=v[i]?.trim();
      if(n==='model')o.Model=v[i]?.trim();
      if(n.includes('cal'))o.Calibre=v[i]?.trim();
      if(n==='condition')o.Condition=v[i]?.trim();
    });
    return o;
  }).filter(r=>r.Stock);
}

const filtered=()=>state.rows.filter(r=>(r.Condition||'').toLowerCase()==='new');

/* ---------- UPDATE ---------- */
function update(){
  const f=filtered();
  els.expected.textContent=f.length;
  els.scanned.textContent=state.scanned.size;
  els.remaining.textContent=f.length-state.scanned.size;
}

/* ---------- SCAN ---------- */
function handleScan(raw){
  const c=clean(raw);
  if(!c)return;
  const r=filtered().find(x=>x.Stock===c);
  if(!r||state.scanned.has(c)){
    toast('Invalid or duplicate',false);
    return;
  }
  if(state.bannerActive)clearBanner();

  state.scanned.add(c);

  els.sdStock.textContent=`STOCK: ${r.Stock}`;
  els.sdSerial.textContent=`SERIAL: ${r.Serial||'—'}`;
  els.sdMeta.textContent=
    `Make: ${r.Make||'—'} · Model: ${r.Model||'—'} · Calibre: ${r.Calibre||'—'}`;

  toast('Scanned',true);
  update();
}

/* ---------- BLUETOOTH ---------- */
let buf='',t=null;
document.addEventListener('keydown',e=>{
  if(e.key.length!==1)return;
  buf+=e.key;
  clearTimeout(t);
  t=setTimeout(()=>{handleScan(buf);buf='';},55);
});

/* ---------- CAMERA ---------- */
let reader=null,stream=null,last='',lastT=0;
const COOL=800;

async function openCamera(){
  if(!state.rows.length){toast('Upload CSV first',false);return;}

  els.camModal.style.display='block';
  els.camVideo.setAttribute('playsinline','');
  els.camVideo.muted=true;
  els.camVideo.autoplay=true;

  stream=await navigator.mediaDevices.getUserMedia({
    video:{facingMode:{ideal:'environment'}},audio:false
  });

  els.camVideo.srcObject=stream;
  await els.camVideo.play();

  reader=new ZXing.BrowserMultiFormatReader();
  reader.decodeFromVideoDevice(null,els.camVideo,res=>{
    if(!res)return;
    const txt=res.getText(),now=Date.now();
    if(txt===last&&now-lastT<COOL)return;
    last=txt;lastT=now;
    handleScan(txt);
  });
}

function closeCamera(){
  try{reader?.reset();}catch{}
  try{stream?.getTracks().forEach(t=>t.stop());}catch{}
  reader=null;stream=null;
  els.camModal.style.display='none';
}

els.camBtn.onclick=()=>{
  console.log('SCAN BUTTON PRESSED');
  openCamera();
};
els.backMenu.onclick=closeCamera;

/* ---------- FILE LOAD ---------- */
els.upload.onclick=()=>{els.file.value='';els.file.click();};

els.file.onchange=e=>{
  const f=e.target.files[0];
  if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    state.rows=parseCSV(r.result);
    state.scanned.clear();
    update();
    showBanner('NO DOUBLE BOOKINGS DETECTED');
  };
  r.readAsText(f);
};

/* ---------- INIT ---------- */
update();
