/* ==================================================
   STOCK SCAN – FINAL iOS-SAFE AUDIO VERSION
   ================================================== */

const STORAGE = 'stockscan_camera_primary_v5';

const $ = id => document.getElementById(id);
const els = {
  upload: $('btnUpload'),
  file: $('fileInput'),
  make: $('makeFilter'),
  model: $('modelFilter'),
  reset: $('btnReset'),
  status: $('statusPill'),

  expected: $('expected'),
  scanned: $('scanned'),
  remaining: $('remaining'),

  ring: $('ring'),
  pct: $('pct'),

  heroTitle: $('heroTitle'),
  heroSub: $('heroSub'),

  lastCode: $('lastCode'),
  toast: $('toast'),

  camBtn: $('btnCamera'),
  camModal: $('camModal'),
  camClose: $('btnCamClose'),
  camVideo: $('camVideo'),
  camHint: $('camHint'),
};

let state = {
  rows: [],
  scanned: new Set(),
  make: '',
  model: '',
  last: ''
};

/* ---------- AUDIO (MAXIMUM POSSIBLE ON iOS WEB) ---------- */
let audioCtx = null;
let audioUnlocked = false;

function unlockAudio(){
  try{
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    audioCtx.resume();
    audioUnlocked = true;
  }catch{}
}

function playBeep(){
  if (!audioUnlocked || !audioCtx) return;

  try{
    // two oscillators = louder / more noticeable
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc1.type = 'square';
    osc2.type = 'square';

    osc1.frequency.value = 1800;
    osc2.frequency.value = 1200;

    gain.gain.value = 0.5;

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);

    osc1.start();
    osc2.start();

    osc1.stop(audioCtx.currentTime + 0.15);
    osc2.stop(audioCtx.currentTime + 0.15);
  }catch{}
}

/* ---------- feedback ---------- */
function toast(msg, ok = true){
  els.toast.textContent = msg;
  els.toast.className = 'toast ' + (ok ? 'good' : 'bad');
  setTimeout(() => {
    els.toast.textContent = '';
    els.toast.className = 'toast';
  }, 900);
}

function successFlash(){
  const flash = document.createElement('div');
  flash.style.position = 'fixed';
  flash.style.inset = '0';
  flash.style.background = 'rgba(40,220,120,.30)';
  flash.style.zIndex = '99999';
  flash.style.display = 'grid';
  flash.style.placeItems = 'center';
  flash.style.fontSize = '52px';
  flash.style.fontWeight = '900';
  flash.style.color = '#fff';
  flash.textContent = '✔ SCANNED';

  document.body.appendChild(flash);

  if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
  playBeep();

  setTimeout(() => flash.remove(), 220);
}

/* ---------- scan handling ---------- */
const norm = v => String(v ?? '').trim().toLowerCase();

function filtered(){
  return state.rows.filter(r =>
    norm(r.Condition)==='new' &&
    (!state.make || r.Make===state.make) &&
    (!state.model || r.Model===state.model)
  );
}

function handleScan(code){
  const c = String(code||'').trim();
  if (!c) return;

  if (!filtered().some(r => r.Stock === c)){
    toast('Not in NEW list', false);
    return;
  }
  if (state.scanned.has(c)){
    toast('Duplicate', false);
    return;
  }

  state.scanned.add(c);
  state.last = c;

  successFlash();
  toast('Scanned', true);
}

/* ---------- IMPORTANT: USER AUDIO UNLOCK ---------- */
// This guarantees audio is allowed *if iOS permits it*
els.camBtn.onclick = () => {
  unlockAudio();
  openCam();
};

els.upload.onclick = () => {
  unlockAudio();
  els.file.click();
};

/* ---------- Camera scanning (unchanged logic) ---------- */
let reader=null, stream=null;
let lastCam='', lastTime=0;
const COOLDOWN=900;

async function openCam(){
  if (!state.rows.length){
    toast('Upload CSV first', false);
    return;
  }

  els.camModal.style.display='block';

  try{
    reader = new ZXing.BrowserMultiFormatReader();
    stream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:'environment'} });

    els.camVideo.srcObject = stream;
    await els.camVideo.play();

    reader.decodeFromVideoDevice(null, els.camVideo, res => {
      if (!res) return;
      const code = res.getText();
      const now = Date.now();
      if (code === lastCam && now-lastTime < COOLDOWN) return;
      lastCam = code;
      lastTime = now;
      handleScan(code);
    });

  }catch{
    els.camHint.textContent='Camera permission blocked';
  }
}

/* ---------- Bluetooth scanning ---------- */
let buf='', t=null;
document.addEventListener('keydown', e=>{
  if (e.key.length!==1) return;
  buf+=e.key;
  clearTimeout(t);
  t=setTimeout(()=>{
    handleScan(buf.trim());
    buf='';
  },55);
});
