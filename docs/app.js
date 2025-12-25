const $=id=>document.getElementById(id);

const els={
  upload:$('btnUpload'),
  file:$('fileInput'),
  camBtn:$('btnCamera'),
  camModal:$('camModal'),
  camVideo:$('camVideo'),
  backMenu:$('btnBackMenu'),
  banner:$('statusBanner'),
  toast:$('toast'),
  expected:$('expected'),
  scanned:$('scanned'),
  remaining:$('remaining'),
  sdStock:document.querySelector('.sd-stock'),
  sdSerial:document.querySelector('.sd-serial'),
  sdMeta:document.querySelector('.sd-meta')
};

let rows=[], scanned=new Set(), bannerActive=false;

const clean=v=>String(v??'').replace(/\.0$/,'').replace(/\s+/g,'').trim();

function toast(msg,ok=true){
  els.toast.textContent=msg;
  els.toast.className='toast '+(ok?'good':'bad');
  setTimeout(()=>els.toast.className='toast',900);
}

function showBanner(msg){
  els.banner.textContent=msg;
  els.banner.classList.remove('hidden');
  bannerActive=true;
}
function clearBanner(){
  els.banner.classList.add('hidden');
  bannerActive=false;
}

function parseCSV(t){
  const l=t.split(/\r?\n/).filter(x=>x.trim());
  const h=l.findIndex(x=>/stock/i.test(x)&&/condition/i.test(x));
  if(h<0)return[];
  const heads=l[h].split(',');
  return l.slice(h+1).map(r=>{
    const v=r.split(','),o={};
    heads.forEach((x,i)=>{
      const n=x.toLowerCase();
      if(n.includes('stock'))o.Stock=clean(v[i]);
      if(n.includes('serial'))o.Serial=v[i];
      if(n==='make')o.Make=v[i];
      if(n==='model')o.Model=v[i];
      if(n.includes('cal'))o.Calibre=v[i];
      if(n==='condition')o.Condition=v[i];
    });
    return o;
  }).filter(r=>r.Stock);
}

const filtered=()=>rows.filter(r=>(r.Condition||'').toLowerCase()==='new');

function update(){
  const f=filtered();
  els.expected.textContent=f.length;
  els.scanned.textContent=scanned.size;
  els.remaining.textContent=f.length-scanned.size;
}

function handleScan(code){
  code=clean(code);
  const r=filtered().find(x=>x.Stock===code);
  if(!r||scanned.has(code)){toast('Invalid',false);return;}
  if(bannerActive)clearBanner();
  scanned.add(code);
  els.sdStock.textContent=`STOCK: ${r.Stock}`;
  els.sdSerial.textContent=`SERIAL: ${r.Serial||'—'}`;
  els.sdMeta.textContent=`${r.Make||''} ${r.Model||''} ${r.Calibre||''}`;
  toast('Scanned',true);
  update();
}

/* CSV */
els.upload.onclick=()=>{els.file.value='';els.file.click();};
els.file.onchange=e=>{
  const f=e.target.files[0];
  if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    rows=parseCSV(r.result);
    scanned.clear();
    update();
    showBanner('NO DOUBLE BOOKINGS DETECTED');
  };
  r.readAsText(f);
};

/* Bluetooth */
let buf='',t=null;
document.addEventListener('keydown',e=>{
  if(e.key.length!==1)return;
  buf+=e.key;
  clearTimeout(t);
  t=setTimeout(()=>{handleScan(buf);buf='';},55);
});

/* Camera */
let reader=null,stream=null,last='',lastT=0;
async function openCamera(){
  if(!rows.length){toast('Upload CSV first',false);return;}
  els.camModal.style.display='block';
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
  els.camVideo.srcObject=stream;
  await els.camVideo.play();
  reader=new ZXing.BrowserMultiFormatReader();
  reader.decodeFromVideoDevice(null,els.camVideo,res=>{
    if(!res)return;
    const txt=res.getText(),now=Date.now();
    if(txt===last&&now-lastT<800)return;
    last=txt;lastT=now;
    handleScan(txt);
  });
}
function closeCamera(){
  try{reader?.reset();}catch{}
  try{stream?.getTracks().forEach(t=>t.stop());}catch{}
  els.camModal.style.display='none';
}
els.camBtn.onclick=openCamera;
els.backMenu.onclick=closeCamera;

update();
