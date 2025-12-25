const $=id=>document.getElementById(id);

/* DOM */
const els={
  upload:$('btnUpload'),
  file:$('fileInput'),
  camBtn:$('btnCamera'),
  camModal:$('camModal'),
  camVideo:$('camVideo'),
  back:$('btnBack'),

  reset:$('btnReset'),
  clear:$('btnClear'),
  exportS:$('btnExportScanned'),
  exportM:$('btnExportMissing'),

  expected:$('expected'),
  scanned:$('scanned'),
  remaining:$('remaining'),

  sdStock:document.querySelector('.sd-stock'),
  sdSerial:document.querySelector('.sd-serial'),
  sdMeta:document.querySelector('.sd-meta'),

  toast:$('toast'),
  banner:$('statusBanner'),
  flash:$('flash')
};

/* STATE */
let rows=[], scanned=new Set();

/* UTILS */
const clean=v=>String(v??'').replace(/\.0$/,'').replace(/\s+/g,'').trim();

function toast(msg,ok=true){
  els.toast.textContent=msg;
  els.toast.className='toast '+(ok?'good':'bad');
  setTimeout(()=>els.toast.className='toast',900);
}

function flashGreen(){
  els.flash.classList.add('show');
  setTimeout(()=>els.flash.classList.remove('show'),150);
}

/* CSV */
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

/* SCAN */
function handleScan(code){
  code=clean(code);
  const r=filtered().find(x=>x.Stock===code);
  if(!r||scanned.has(code)){
    toast('Invalid or duplicate',false);
    return;
  }
  scanned.add(code);
  flashGreen();

  els.sdStock.textContent=`STOCK: ${r.Stock}`;
  els.sdSerial.textContent=`SERIAL: ${r.Serial||'—'}`;
  els.sdMeta.textContent=`${r.Make||''} ${r.Model||''} ${r.Calibre||''}`;

  toast('Scanned',true);
  update();
}

/* CSV LOAD */
els.upload.onclick=()=>{els.file.value='';els.file.click();};
els.file.onchange=e=>{
  const f=e.target.files[0];
  if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    rows=parseCSV(r.result);
    scanned.clear();
    update();
    els.banner.textContent='CSV LOADED';
    els.banner.classList.remove('hidden');
  };
  r.readAsText(f);
};

/* EXPORTS */
function exportCSV(list,name){
  if(!list.length){toast('Nothing to export',false);return;}
  const csv=Object.keys(list[0]).join(',')+'\n'+
    list.map(o=>Object.values(o).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=name;
  a.click();
}

els.exportS.onclick=()=>exportCSV(
  rows.filter(r=>scanned.has(r.Stock)),'scanned.csv'
);
els.exportM.onclick=()=>exportCSV(
  rows.filter(r=>!scanned.has(r.Stock)),'missing.csv'
);

/* RESET / CLEAR */
els.reset.onclick=()=>{
  scanned.clear();update();toast('Scan reset');
};
els.clear.onclick=()=>{
  rows=[];scanned.clear();update();toast('CSV cleared');
};

/* BLUETOOTH */
let buf='',t=null;
document.addEventListener('keydown',e=>{
  if(e.key.length!==1)return;
  buf+=e.key;
  clearTimeout(t);
  t=setTimeout(()=>{handleScan(buf);buf='';},55);
});

/* CAMERA */
let reader=null,stream=null,last='',lastT=0;
els.camBtn.onclick=async()=>{
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
};

els.back.onclick=()=>{
  try{reader?.reset();}catch{}
  try{stream?.getTracks().forEach(t=>t.stop());}catch{}
  els.camModal.style.display='none';
};

update();
