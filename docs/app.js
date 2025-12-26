const $=id=>document.getElementById(id);

const els={
  upload:$('btnUpload'),
  scan:$('btnScan'),
  reset:$('btnReset'),
  clear:$('btnClear'),
  exportS:$('btnExportScanned'),
  exportM:$('btnExportMissing'),
  file:$('file'),
  expected:$('expected'),
  scanned:$('scanned'),
  remaining:$('remaining'),
  stock:$('dStock'),
  serial:$('dSerial'),
  meta:$('dMeta'),
  banner:$('banner'),
  toast:$('toast'),
  flash:$('flash'),
  cam:$('cam'),
  video:$('video')
};

let rows=[], scanned=new Set();
let reader,stream,last='',lastT=0;

const clean=v=>String(v??'').replace(/\.0$/,'').trim();

function update(){
  const f=rows.filter(r=>r.Condition==='new');
  els.expected.textContent=f.length;
  els.scanned.textContent=scanned.size;
  els.remaining.textContent=f.length-scanned.size;
}

function toast(msg){
  els.toast.textContent=msg;
  els.toast.className='toast show';
  setTimeout(()=>els.toast.className='toast',800);
}

function flash(){
  els.flash.classList.add('show');
  setTimeout(()=>els.flash.classList.remove('show'),150);
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
      if(n==='condition')o.Condition=v[i].toLowerCase();
    });
    return o;
  }).filter(r=>r.Stock);
}

els.upload.onclick=()=>{els.file.value='';els.file.click()};
els.file.onchange=e=>{
  const f=e.target.files[0];
  if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    rows=parseCSV(r.result);
    scanned.clear();
    els.banner.textContent='NO DOUBLE BOOKINGS DETECTED';
    els.banner.classList.remove('hidden');
    update();
  };
  r.readAsText(f);
};

function handleScan(code){
  const r=rows.find(x=>x.Stock===clean(code)&&x.Condition==='new');
  if(!r||scanned.has(r.Stock))return;
  scanned.add(r.Stock);
  flash();
  els.stock.textContent='STOCK: '+r.Stock;
  els.serial.textContent='SERIAL: '+(r.Serial||'—');
  els.meta.textContent=`${r.Make} · ${r.Model} · ${r.Calibre}`;
  els.banner.classList.add('hidden');
  toast('Scanned');
  update();
}

els.scan.onclick=async()=>{
  if(!rows.length)return alert('Upload CSV first');
  els.cam.style.display='block';
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
  els.video.srcObject=stream;
  await els.video.play();
  reader=new ZXing.BrowserMultiFormatReader();
  reader.decodeFromVideoDevice(null,els.video,res=>{
    if(!res)return;
    const t=res.getText(),n=Date.now();
    if(t===last&&n-lastT<800)return;
    last=t;lastT=n;
    handleScan(t);
  });
};

window.closeCam=()=>{
  reader?.reset();
  stream?.getTracks().forEach(t=>t.stop());
  els.cam.style.display='none';
};

els.reset.onclick=()=>{scanned.clear();update();toast('Reset')};
els.clear.onclick=()=>{rows=[];scanned.clear();update();toast('Cleared')};

els.exportS.onclick=()=>exportCSV(rows.filter(r=>scanned.has(r.Stock)),'scanned.csv');
els.exportM.onclick=()=>exportCSV(rows.filter(r=>!scanned.has(r.Stock)),'missing.csv');

function exportCSV(list,name){
  if(!list.length)return;
  const csv=Object.keys(list[0]).join(',')+'\n'+
    list.map(o=>Object.values(o).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=name;
  a.click();
}

update();
