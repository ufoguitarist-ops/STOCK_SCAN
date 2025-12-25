if (localStorage.getItem('stockscan_logged_in') !== 'yes') {
  location.href = 'login.html';
}

const STORE='stockscan_prod';
const $=id=>document.getElementById(id);

const els={
  upload:$('btnUpload'),file:$('fileInput'),
  reset:$('btnResetScan'),clear:$('btnClearCSV'),
  exportS:$('btnExportScanned'),exportM:$('btnExportMissing'),
  expected:$('expected'),scanned:$('scanned'),remaining:$('remaining'),
  ring:$('ring'),pct:$('pct'),
  sdStock:document.querySelector('.sd-stock'),
  sdSerial:document.querySelector('.sd-serial'),
  sdMeta:document.querySelector('.sd-meta'),
  history:$('history'),toast:$('toast'),
  banner:$('statusBanner'),
  camBtn:$('btnCamera'),camModal:$('camModal'),
  camVideo:$('camVideo'),backMenu:$('btnBackMenu')
};

const clean=v=>String(v??'').replace(/\.0$/,'').replace(/\s+/g,'').trim();

let state={rows:[],scanned:new Set(),history:[]};

const toast=(m,g=true)=>{
  els.toast.textContent=m;
  els.toast.className='toast '+(g?'good':'bad');
  setTimeout(()=>els.toast.className='toast',900);
};

const showBanner=m=>{
  els.banner.textContent=m;
  els.banner.classList.remove('hidden');
};
const clearBanner=()=>{
  els.banner.classList.add('hidden');
};

const parseCSV=t=>{
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
};

const findDupSerials=rows=>{
  const m=new Map();
  rows.forEach(r=>{
    if(!r.Serial||!r.Stock)return;
    if(!m.has(r.Serial))m.set(r.Serial,[]);
    m.get(r.Serial).push(r.Stock);
  });
  return [...m.entries()].filter(([_,s])=>new Set(s).size>1);
};

const filtered=()=>state.rows.filter(r=>(r.Condition||'').toLowerCase()==='new');

function update(){
  const f=filtered();
  els.expected.textContent=f.length;
  els.scanned.textContent=state.scanned.size;
  els.remaining.textContent=f.length-state.scanned.size;
}

function handleScan(raw){
  const c=clean(raw);
  const r=filtered().find(x=>x.Stock===c);
  if(!r||state.scanned.has(c)){toast('Invalid or duplicate',false);return;}
  clearBanner();
  state.scanned.add(c);
  els.sdStock.textContent=`STOCK: ${r.Stock}`;
  els.sdSerial.textContent=`SERIAL: ${r.Serial||'—'}`;
  els.sdMeta.textContent=`Make: ${r.Make||'—'} · Model: ${r.Model||'—'} · Calibre: ${r.Calibre||'—'}`;
  toast('Scanned',true);update();
}

els.upload.onclick=()=>{els.file.value='';els.file.click();};

els.file.onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    state.rows=parseCSV(r.result);
    state.scanned.clear();update();
    const d=findDupSerials(state.rows);
    if(d.length)alert('⚠️ DUPLICATE SERIALS FOUND');
    else showBanner('NO DOUBLE BOOKINGS DETECTED');
  };
  r.readAsText(f);
};

let buf='',t=null;
document.addEventListener('keydown',e=>{
  if(e.key.length!==1)return;
  buf+=e.key;clearTimeout(t);
  t=setTimeout(()=>{handleScan(buf);buf='';},55);
});
