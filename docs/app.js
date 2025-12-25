/* =========================================
   MINIMAL iPHONE SAFARI SCANNER – WORKING
   ========================================= */

const $ = id => document.getElementById(id);

const els = {
  camBtn: $('btnCamera'),
  camModal: $('camModal'),
  camVideo: $('camVideo'),
  backMenu: $('btnBackMenu'),
  toast: $('toast')
};

/* ---------- FEEDBACK ---------- */
function toast(msg){
  els.toast.textContent = msg;
  els.toast.className = 'toast good';
  setTimeout(()=>els.toast.className='toast',800);
}

/* ---------- STATE ---------- */
let reader = null;
let stream = null;
let lastText = '';
let lastTime = 0;
const COOLDOWN = 800;

/* ---------- CAMERA OPEN ---------- */
async function openCamera(){
  toast('Opening camera');

  els.camModal.style.display = 'block';

  els.camVideo.setAttribute('playsinline','');
  els.camVideo.muted = true;
  els.camVideo.autoplay = true;

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false
  });

  els.camVideo.srcObject = stream;
  await els.camVideo.play();

  reader = new ZXing.BrowserMultiFormatReader();

  reader.decodeFromVideoDevice(
    null,
    els.camVideo,
    (result, err) => {
      if (result) {
        const text = result.getText();
        const now = Date.now();

        if (text === lastText && now - lastTime < COOLDOWN) return;
        lastText = text;
        lastTime = now;

        toast('SCANNED: ' + text);
        console.log('SCANNED:', text);
      }
      // IMPORTANT: ignore errors
    }
  );
}

/* ---------- CAMERA CLOSE ---------- */
function closeCamera(){
  try { reader?.reset(); } catch {}
  try { stream?.getTracks().forEach(t=>t.stop()); } catch {}
  reader = null;
  stream = null;
  els.camModal.style.display = 'none';
}

/* ---------- EVENTS ---------- */
els.camBtn.onclick = () => {
  console.log('SCAN BUTTON CLICKED');
  openCamera();
};

els.backMenu.onclick = closeCamera;
