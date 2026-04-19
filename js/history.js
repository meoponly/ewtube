// ── HISTORY ──
function historyCardHtml(h){
  const timeAgo=fmtDate(new Date(h.ts).toISOString());
  const viewStr=h.views?fmtViews(h.views)+' views':'';
  const meta=[viewStr,timeAgo].filter(Boolean).join(' · ');
  const initials=(h.channel||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const vd=JSON.stringify(h.vid);const vt=JSON.stringify(h.title||'');const vc=JSON.stringify(h.channel||'');
  const vth=JSON.stringify(h.thumb||'');const vdr=JSON.stringify(h.dur||'');
  return`<a class="history-item" href="${ytLink(h.vid)}" target="_blank" rel="noopener"
    data-vid="${esc(h.vid)}" data-hv="${esc(h.vid)}" data-ht="${esc(h.title||'')}" data-hc="${esc(h.channel||'')}" data-hi=""
    style="position:relative">
    <div class="history-thumb">
      ${h.thumb?`<img src="${esc(maxresThumbnail(h.thumb))}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault')){this.src=this.src.replace('maxresdefault','hqdefault')}else{this.src=''}"/>`:''}
    </div>
    <div class="history-info">
      <div class="history-title">${esc(h.title||'')}</div>
      <div class="history-meta">${esc(meta)}</div>
      <div class="history-ch-row">
        <div class="history-ch-avatar"><span>${esc(initials)}</span></div>
        <span class="history-ch">${esc(h.channel||'')}</span>
      </div>
    </div>
    <button class="history-menu-btn" onclick="event.preventDefault();event.stopPropagation();openVideoCtx(event,${vd},${vt},${vc},${vth},${vdr})" title="More options">
      <span class="ms">more_vert</span>
    </button>
  </a>`;
}
function renderHistory(items){
  const list=document.getElementById('history-list');
  if(!items){
    // Show skeleton briefly before rendering
    list.innerHTML=skelHistoryList(5);
    setTimeout(()=>{
      const src=history_;
      if(!src.length){list.innerHTML='<div class="history-empty">No watch history yet.<br>Videos you click will appear here.</div>';return}
      list.innerHTML=src.map(historyCardHtml).join('');
    },120);
    return;
  }
  if(!items.length){list.innerHTML='<div class="history-empty">No results found.</div>';return}
  list.innerHTML=items.map(historyCardHtml).join('');
}
function filterHistory(q){
  if(!q.trim()){renderHistory();return}
  const lq=q.toLowerCase();
  const filtered=history_.filter(h=>(h.title||'').toLowerCase().includes(lq)||(h.channel||'').toLowerCase().includes(lq));
  renderHistory(filtered);
}
function clearHistory(){
  const pwd=prompt('Enter password to clear history:');
  if(pwd===null)return;
  if(pwd!=='ioqmpro'){alert('Incorrect password.');return;}
  if(!confirm('Clear all watch history and search history?'))return;
  history_=[];saveLS(LS_HISTORY,history_);
  searchHistory_=[];saveLS(LS_SEARCH_HIST,searchHistory_);
  renderHistory();renderSearchHistoryList();
}

// ── YT LOADING BAR ──
(function(){
  let _bar=null,_rafId=null,_timer=null,_prog=0,_running=false,_pendingEnd=false;
  function bar(){return _bar||(_bar=document.getElementById('yt-loading-bar'))}
  function setWidth(w,dur){
    const b=bar();
    b.style.transition=dur>0?`width ${dur}ms linear`:'none';
    b.style.width=w+'%';
  }
  function startLoad(){
    cancelAnimationFrame(_rafId);clearTimeout(_timer);
    _running=true;_pendingEnd=false;_prog=0;
    const b=bar();
    b.style.transition='none';b.style.width='0%';b.style.opacity='1';
    void b.offsetWidth;
    // Quick jump to 20% instantly, then ease up
    setWidth(20,200);
    _prog=20;
    // Incrementally creep toward 90%
    function creep(){
      if(!_running)return;
      const remaining=90-_prog;
      const step=remaining*0.10+0.5;
      _prog=Math.min(_prog+step,90);
      setWidth(_prog,300);
      if(_prog<90){_rafId=setTimeout(creep,350);}
      else if(_pendingEnd){doEnd();}
    }
    _rafId=setTimeout(creep,250);
  }
  function doEnd(){
    _running=false;
    clearTimeout(_rafId);
    const b=bar();
    b.style.transition='width 0.2s ease';
    b.style.width='100%';
    _timer=setTimeout(()=>{
      b.style.transition='opacity 0.35s ease';
      b.style.opacity='0';
      setTimeout(()=>{b.style.transition='none';b.style.width='0%';b.style.opacity='0';},380);
    },220);
  }
  function endLoad(){
    if(_running){_pendingEnd=true;}
    else{doEnd();}
  }
  window.ytLoadStart=startLoad;
  window.ytLoadEnd=endLoad;
})();

// ── GO HOME ──
function goHome(){
  document.getElementById('channel-page').style.display='none';
  const qi=document.getElementById('q');
  if(qi){qi.value='';const qc=document.getElementById('q-clear');if(qc)qc.style.display='none';}
  const dd=document.getElementById('search-dropdown');if(dd)dd.style.display='none';
  searchResults=[];searchPlaylists=[];searchQuery='';
  const sr=document.getElementById('search-results');if(sr)sr.innerHTML='';
  const ss=document.getElementById('search-status');if(ss)ss.textContent='';
  const sm=document.getElementById('search-more');if(sm)sm.style.display='none';
  const sortRow=document.getElementById('sort-row');if(sortRow)sortRow.style.display='none';
  navStack=[];
  showSection('home');
}

// ── SEARCH HISTORY ──
function trackSearchHistory(q){
  if(!q||q.length<2)return;
