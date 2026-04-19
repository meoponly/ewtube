// ── HIDDEN CHANNELS ──
function saveHidden(){saveLS(LS_HIDDEN,[...hiddenChs])}
function toggleHideChannel(name){
  if(hiddenChs.has(name))hiddenChs.delete(name);else hiddenChs.add(name);
  saveHidden();
  renderSidebarChannels();
  if(currentSection==='home')renderHome();
}
function toggleHideCurrentChannel(){
  toggleHideChannel(currentChannelName);
  updateChHideBtn(currentChannelName);
}
function updateChHideBtn(name){
  const btn=document.getElementById('ch-hide-btn');if(!btn)return;
  const h=isHidden(name);
  document.getElementById('ch-hide-icon').textContent=h?'visibility':'visibility_off';
  document.getElementById('ch-hide-label').textContent=h?'Unhide from Home':'Hide from Home';
  btn.style.color=h?'var(--accent)':'var(--text2)';
  btn.style.borderColor=h?'var(--accent)':'var(--border)';
}
function isHidden(name){return hiddenChs.has(name)}

// ── KEYWORD BLOCKING (permanent — keywords cannot be removed once added) ──
function saveBlockedKeywords(){localStorage.setItem(LS_BK_WORDS,JSON.stringify(blockedKeywords))}

// Validates a keyword before adding: min 3 chars, not a single letter/digit, not already present
function validateKeyword(kw){
  kw=kw.trim().toLowerCase();
  if(!kw)return{ok:false,msg:'Enter a keyword.'};
  if(kw.length<3)return{ok:false,msg:'Keyword must be at least 3 characters.'};
  if(/^[a-z0-9]$/.test(kw))return{ok:false,msg:'Single characters are not allowed.'};
  // Reject pure punctuation or whitespace
  if(!/[a-z0-9]/.test(kw))return{ok:false,msg:'Keyword must contain letters or numbers.'};
  if(blockedKeywords.includes(kw))return{ok:false,msg:`"${kw}" is already blocked.`};
  return{ok:true,kw};
}

function addBlockedKeyword(raw){
  const v=validateKeyword(raw);
  if(!v.ok)return v.msg;
  blockedKeywords.push(v.kw);
  saveBlockedKeywords();
  // Immediately refresh home/search if open
  if(currentSection==='home')renderHome();
  if(currentSection==='search')renderSearchResults();
  return null; // no error
}

// Returns true if a piece of text matches any blocked keyword
function matchesBlockedKeyword(text){
  if(!text||!blockedKeywords.length)return false;
  const lc=text.toLowerCase();
  return blockedKeywords.some(kw=>lc.includes(kw));
}

// Returns true if a video/channel should be hidden based on title, channel name
function isBlockedContent(title,channelName){
  return matchesBlockedKeyword(title)||matchesBlockedKeyword(channelName);
}

// ── NOT INTERESTED ──
function markNotInterested(vid){
  notInterested.add(vid);
  saveLS(LS_NOTINT,[...notInterested]);
  // Remove card from DOM
  document.querySelectorAll(`[data-vid="${vid}"]`).forEach(el=>el.closest('.vid-card')?.remove());
}

// ── WATCH LATER ──
function saveWL(){saveLS(LS_WL,watchLater)}
function isInWL(vid){return watchLater.some(v=>v.vid===vid)}
function toggleWatchLater(e,vid,title,channel,thumb,dur){
  e.preventDefault();e.stopPropagation();
  const btn=e.currentTarget;
  if(isInWL(vid)){
    watchLater=watchLater.filter(v=>v.vid!==vid);
    saveWL();
    btn.classList.remove('saved');
    btn.querySelector('.ms').textContent='watch_later';
    btn.title='Save to Watch Later';
    showToast('Removed from Watch Later');
  }else{
    watchLater.unshift({vid,title,channel,thumb,dur:dur||'',ts:Date.now()});
    if(watchLater.length>500)watchLater=watchLater.slice(0,500);
    saveWL();
    btn.classList.add('saved');
    btn.querySelector('.ms').textContent='check_circle';
    btn.title='Saved to Watch Later';
    showToast('Saved to Watch Later');
  }
}
function clearWatchLater(){
  if(!watchLater.length)return;
  if(!confirm('Clear all Watch Later videos?'))return;
  watchLater=[];saveWL();renderWatchLater();
}
function renderWatchLater(){
  const el=document.getElementById('wl-list');
  if(!watchLater.length){
    el.innerHTML=`<div class="wl-empty"><span class="ms">watch_later</span><div class="wl-empty-title">No videos saved yet</div><div class="wl-empty-sub">Click the ⋮ menu on any video and choose "Save to Watch Later".</div></div>`;
    return;
  }
  el.innerHTML=`<div class="vid-grid">${watchLater.map(v=>{
    const link=ytLink(v.vid);
    const durStr=fmtDur(v.dur||'');
    return`<div class="vid-card" data-vid="${esc(v.vid)}">
      <a href="${link}" target="_blank" rel="noopener noreferrer"
        data-hv="${esc(v.vid)}" data-ht="${esc(v.title||'')}" data-hc="${esc(v.channel||'')}" data-hi=""
        style="display:block;text-decoration:none;color:inherit">
        <div class="vid-thumb-wrap">
          <img src="${esc(v.thumb||'')}" alt="" loading="lazy" onerror="this.src=''"/>
          ${durStr?`<span class="vid-duration">${esc(durStr)}</span>`:''}
        </div>
      </a>
      <div class="vid-info">
        <div class="vid-ch-avatar">${esc((v.channel||'').slice(0,2).toUpperCase())}</div>
        <a href="${link}" target="_blank" rel="noopener noreferrer"
          data-hv="${esc(v.vid)}" data-ht="${esc(v.title||'')}" data-hc="${esc(v.channel||'')}" data-hi=""
          style="flex:1;min-width:0;text-decoration:none;color:inherit">
          <div class="vid-text">
            <div class="vid-title">${esc(v.title||'')}</div>
            <div class="vid-ch-name">${esc(v.channel||'')}</div>
          </div>
        </a>
        <button class="vid-menu-btn" style="opacity:1" title="Remove from Watch Later"
          onclick="removeFromWLPage(event,'${esc(v.vid)}')">
          <span class="ms" style="color:#2eca6a">check_circle</span>
        </button>
      </div>
    </div>`;
  }).join('')}</div>`;
}
function removeFromWLPage(e,vid){
  e.preventDefault();e.stopPropagation();
  watchLater=watchLater.filter(v=>v.vid!==vid);
  saveWL();
  showToast('Removed from Watch Later');
  // Remove card from DOM immediately
  document.querySelectorAll(`#wl-list [data-vid="${vid}"]`).forEach(el=>el.remove());
  if(!watchLater.length)renderWatchLater();
}

