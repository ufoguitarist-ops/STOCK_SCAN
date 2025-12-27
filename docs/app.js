/* ---------- SMART SEARCH ---------- */
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchBody = document.getElementById('searchBody');
const searchToggle = document.getElementById('searchToggle');
const btnVoice = document.getElementById('btnVoice');

function toggleSearchPanel(){
  searchBody.classList.toggle('hidden');
  searchToggle.textContent =
    searchBody.classList.contains('hidden') ? '▼' : '▲';
}

function normSearch(v){
  return String(v||'')
    .toLowerCase()
    .replace(/[\s\-_.]/g,'')
    .replace(/\u00A0/g,'');
}

function renderSearchResults(term){
  searchResults.innerHTML='';
  if(!term) return;

  const key = normSearch(term);
  const out = {};

  rows.forEach(r=>{
    if(!isNew(r)||!r.Model) return;
    if(normSearch(r.Model).includes(key)){
      out[r.Model] ??= {};
      out[r.Model][r.Calibre] =
        (out[r.Model][r.Calibre]||0)+1;
    }
  });

  Object.keys(out).sort().forEach(m=>{
    let h=`<div class="model-block">
      <div class="model-name">${m}</div>`;
    Object.keys(out[m]).sort().forEach(c=>{
      h+=`<div class="cal-line"><span>${c}</span><span>${out[m][c]} in stock</span></div>`;
    });
    h+='</div>';
    searchResults.innerHTML+=h;
  });
}

searchInput?.addEventListener('input',e=>{
  renderSearchResults(e.target.value);
});

btnVoice?.addEventListener('click',()=>{
  if(!('webkitSpeechRecognition'in window))
    return alert('Voice not supported');
  const r=new webkitSpeechRecognition();
  r.lang='en-GB';
  r.onresult=e=>{
    const t=e.results[0][0].transcript;
    searchInput.value=t;
    renderSearchResults(t);
  };
  r.start();
});
