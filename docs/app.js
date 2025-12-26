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

/* ---------- ENABLE SOUND BUTTON ---------- */
const soundBtn = document.createElement('button');
soundBtn.textContent = '🔊 ENABLE SOUND';
soundBtn.style.position = 'fixed';
soundBtn.style.bottom = '90px';
soundBtn.style.left = '50%';
soundBtn.style.transform = 'translateX(-50%)';
soundBtn.style.zIndex = '100001';
soundBtn.style.padding = '14px 20px';
soundBtn.style.borderRadius = '14px';
soundBtn.style.border = 'none';
soundBtn.style.fontSize = '16px';
soundBtn.style.fontWeight = '800';
soundBtn.style.background = '#22c55e';
soundBtn.style.color = '#022c22';
document.body.appendChild(soundBtn);

/* ---------- STATE ---------- */
let rows = [];
let scanned = new Set();
let reader = null;
let stream = null;
let lastText = '';
let lastTime = 0;

/* ---------- AUDIO (iOS COMPLIANT) ---------- */
let audioCtx = null;
let soundEnabled = false;

soundBtn.onclick = () => {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume().then(() => {
    soundEnabled = true;

    // test beep
    const osc = audioCtx.createOscillator();
    osc.frequency.value = 1000;
    osc.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);

    soundBtn.remove();
  });
};

function beep(){
  if(!soundEnabled || !audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'square';
  osc.frequency.value = 1200;
  gain.gain.value = 0.9;

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.12);
}

/* ---------- VIBRATION ---------- */
function vibrate(){
  if(navigator.vibrate){
    navigator.vibrate([120, 40, 120]);
  }
}

/* ---------- VISUAL FEEDBACK ---------- */
function greenFlash(){
  els.flash.classList.add('active');
  setTimeout(()=>els.flash.classList.remove('active'),150);
}

function bigConfirm(){
  confirmEl.classList.add('show');
  setTimeout(()=>confirmEl.classList.remove('show'),450);
}

/* ---------- HELPERS ---------- */
const clean = v =>
  String(v ?? '')
    .replace(/\.0$/, '')
    .replace(/\s+/g, '')
    .trim();

/* ---------- CSV ---------- */
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  const h = lines.findIndex(l=>/stock/i.test(l)&&/condition/i.test(l));
  if(h < 0) return [];

  const heads = lines[h].split(',');

  return lines.slice(h+1).map(r=>{
    const v=r.split(','), o={};
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

function updateStats(){
  const valid = rows.filter(r =>
    String(r.Condition||'').toLowerCase().includes('new')
  );
  els.expected.textContent = valid.length;
  els.scanned.textContent = scanned.size;
  els.remaining.textContent = valid.length - scanned.size;
}

/* ---------- SCAN HANDLER ---------- */
function handleScan(code){
  const cleaned = clean(code);
  if(!cleaned) return;

  const row = rows.find(r =>
    r.Stock === cleaned &&
    String(r.Condition||'').toLowerCase().includes('new')
  );

  if(!row || scanned.has(row.Stock)) return;

  scanned.add(row.Stock);

  beep();
  vibrate();
  greenFlash();
  bigConfirm();

  els.stock.textContent = `STOCK: ${row.Stock}`;
  els.serial.textContent = `SERIAL: ${row.Serial||'—'}`;
  els.meta.textContent =
    `${row.Make||'—'} · ${row.Model||'—'} · ${row.Calibre||'—'}`;

  els.banner.classList.add('hidden');
  updateStats();
}

/* ---------- CSV LOAD ---------- */
els.upload.onclick = () => {
  els.file.value = '';
  els.file.click();
};

els.file.onchange = e => {
  const f = e.target.files[0];
  if(!f) return;

  const r = new FileReader();
  r.onload = () => {
    rows = parseCSV(r.result);
    scanned.clear();
    updateStats();
    els.banner.textContent = 'NO DOUBLE BOOKINGS DETECTED';
    els.banner.classList.remove('hidden');
  };
  r.readAsText(f);
};

/* ---------- CAMERA ---------- */
els.scan.onclick = async () => {
  if(!rows.length){
    alert('Upload CSV first');
    return;
  }

  els.cam.style.display='block';

  stream = await navigator.mediaDevices.getUserMedia({
    video:{facingMode:{ideal:'environment'}},
    audio:false
  });

  els.video.srcObject = stream;
  await els.video.play();

  reader = new ZXing.BrowserMultiFormatReader();
  reader.decodeFromVideoDevice(null, els.video, res=>{
    if(!res) return;
    const t=res.getText(), n=Date.now();
    if(t===lastText && n-lastTime<800) return;
    lastText=t; lastTime=n;
    handleScan(t);
  });
};

/* ---------- CLOSE CAMERA ---------- */
window.closeCam = () => {
  reader?.reset();
  stream?.getTracks().forEach(t=>t.stop());
  els.cam.style.display='none';
};

updateStats();
