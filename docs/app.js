const upload = document.getElementById('upload');
const file = document.getElementById('file');
const scanBtn = document.getElementById('scan');
const video = document.getElementById('video');
const cam = document.getElementById('cam');
const status = document.getElementById('status');

let rows = [];
let reader, stream;
let last='', lastT=0;

upload.onclick = ()=>file.click();

file.onchange = e=>{
  const f=e.target.files[0];
  if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    rows = r.result.split(/\r?\n/);
    status.textContent = 'CSV LOADED';
  };
  r.readAsText(f);
};

scanBtn.onclick = async ()=>{
  if(!rows.length){
    alert('Upload CSV first');
    return;
  }

  cam.style.display='block';

  stream = await navigator.mediaDevices.getUserMedia({
    video:{facingMode:'environment'}
  });

  video.srcObject = stream;
  await video.play();

  reader = new ZXing.BrowserMultiFormatReader();
  reader.decodeFromVideoDevice(null, video, res=>{
    if(!res) return;
    const txt=res.getText(), now=Date.now();
    if(txt===last && now-lastT<800) return;
    last=txt; lastT=now;
    alert('SCANNED: '+txt);
  });
};

window.closeCam = ()=>{
  try{reader.reset();}catch{}
  try{stream.getTracks().forEach(t=>t.stop());}catch{}
  cam.style.display='none';
};
