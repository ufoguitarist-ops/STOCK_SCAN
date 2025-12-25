const STORE='stockscan_ultimate_v1';
const $=id=>document.getElementById(id);
const els={
upload: $('btnUpload'), file:$('fileInput'),
reset:$('btnResetScan'), clear:$('btnClearCSV'),
exportS:$('btnExportScanned'), exportM:$('btnExportMissing'),
make:$('makeFilter'), model:$('modelFilter'),
expected:$('expected'), scanned:$('scanned'), remaining:$('remaining'),
ring:$('ring'), pct:$('pct'),
sdStock:document.querySelector('.sd-stock'),
sdSerial:document.querySelector('.sd-serial'),
sdMeta:document.querySelector('.sd-meta'),
toast:$('toast'), history:$('history'),
camBtn:$('btnCamera'), camModal:$('camModal'),
camVideo:$('camVideo'), camClose:$('btnCamClose')
};

let state={rows:[],scanned:new Set(),locked:false,history:[]};
const norm=v=>String(v||'').trim().toLowerCase();

/* ---------- PERSIST ---------- */
function save(){localStorage.setItem(STORE,JSON.stringify({
rows:state.rows, scanned:[...state.scanned],
locked:state.locked, history:state.history
}))}
function load(){
const s=JSON.parse(localStorage.getItem(STORE)||'{}');
state.rows=s.rows||[]; state.scanned=new Set(s.scanned||[]);
state.locked=s.locked||false; state.history=s.history||[];
}

/* ---------- FEEDBACK ---------- */
function flash(color){
const d=document.createElement('div');
d.style=`position:fixed;inset:0;background:${color};z-index:9999`;
document.body.appendChild(d); setTimeout(()=>d.remove(),200);
}
function ok(){flash('rgba(40,220,120,.4)')}
function bad(){flash('rgba(220,40,40,.4)')}

/* ---------- CSV ---------- */
function parseCSV(t){
const l=t.split(/\r?\n/).filter(x=>x.trim());
const h=l.findIndex(r=>/stock/i.test(r)&&/condition/i.test(r));
const heads=l[h].split(',').map(x=>x.trim());
return l.slice(h+1).map(r=>{
const v=r.split(','),o={};
heads.forEach((h,i)=>{
const n=norm(h);
if(n.includes('stock'))o.Stock=v[i];
if(n.includes('serial'))o.Serial=v[i];
if(n==='make')o.Make=v[i];
if(n==='model')o.Model=v[i];
if(n.includes('cal'))o.Calibre=v[i];
if(n==='condition')o.Condition=v[i];
});
return o;
}).filter(r=>r.Stock);
}

/* ---------- FILTER ---------- */
const filtered=()=>state.rows.filter(r=>norm(r.Condition)==='new');

/* ---------- UPDATE ---------- */
function update(){
const f=filtered();
const s=f.filter(r=>state.scanned.has(r.Stock)).length;
els.expected.textContent=f.length;
els.scanned.textContent=s;
els.remaining.textContent=f.length-s;
els.pct.textContent=Math.round(s/f.length*100||0)+'%';
els.ring.style.setProperty('--p',Math.round(s/f.length*100||0));
els.history.innerHTML=state.history.slice(0,5)
.map(h=>`<li>${h.Stock} · ${h.Serial||''}</li>`).join('');
if(f.length&&s===f.length){
flash('rgba(40,220,120,.8)');
alert('STOCK CHECK COMPLETE');
}
save();
}

/* ---------- SCAN ---------- */
function scan(code){
const r=filtered().find(x=>x.Stock===code);
if(!r){bad();return}
if(state.scanned.has(code)){bad();return}
state.locked=true;
state.scanned.add(code);
state.history.unshift(r);
els.sdStock.textContent=`STOCK: ${r.Stock}`;
els.sdSerial.textContent=`SERIAL: ${r.Serial||'—'}`;
els.sdMeta.textContent=`Make: ${r.Make||'—'} · Model: ${r.Model||'—'} · Calibre: ${r.Calibre||'—'}`;
ok(); update();
}

/* ---------- CAMERA ---------- */
let reader=null;
els.camBtn.onclick=async()=>{
els.camModal.style.display='block';
reader=new ZXing.BrowserMultiFormatReader();
const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
els.camVideo.srcObject=s; els.camVideo.play();
reader.decodeFromVideoDevice(null,els.camVideo,res=>{
if(res)scan(res.getText());
});
};
els.camClose.onclick=()=>{
reader?.reset();
els.camVideo.srcObject.getTracks().forEach(t=>t.stop());
els.camModal.style.display='none';
};

/* ---------- BLUETOOTH ---------- */
let buf='',t=null;
document.addEventListener('keydown',e=>{
if(e.key.length!==1)return;
buf+=e.key; clearTimeout(t);
t=setTimeout(()=>{scan(buf.trim());buf='';},55);
});

/* ---------- BUTTONS ---------- */
els.upload.onclick=()=>els.file.click();
els.file.onchange=e=>{
const r=new FileReader();
r.onload=()=>{
state.rows=parseCSV(r.result);
state.scanned.clear(); state.locked=false; state.history=[];
update();
};
r.readAsText(e.target.files[0]);
};
els.reset.onclick=()=>{state.scanned.clear();state.locked=false;state.history=[];update();}
els.clear.onclick=()=>{localStorage.removeItem(STORE);location.reload();}

els.exportS.onclick=()=>{
const rows=state.rows.filter(r=>state.scanned.has(r.Stock));
download(rows,'scanned.csv');
};
els.exportM.onclick=()=>{
const rows=state.rows.filter(r=>!state.scanned.has(r.Stock));
download(rows,'missing.csv');
};

function download(rows,name){
const csv=Object.keys(rows[0]||{}).join(',')+'\n'+
rows.map(r=>Object.values(r).join(',')).join('\n');
const a=document.createElement('a');
a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
a.download=name; a.click();
}

load(); update();
