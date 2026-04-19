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
  searchHistory_=searchHistory_.filter(s=>s.toLowerCase()!==q.toLowerCase());
  searchHistory_.unshift(q);
  if(searchHistory_.length>50)searchHistory_=searchHistory_.slice(0,50);
  saveLS(LS_SEARCH_HIST,searchHistory_);
}
function renderSearchHistoryList(){
  const el=document.getElementById('search-history-list');
  if(!el)return;
  if(!searchHistory_.length){
    el.innerHTML='<div class="search-history-empty">No searches yet</div>';return;
  }
  el.innerHTML=searchHistory_.slice(0,15).map((q)=>`
    <div class="search-history-item" onclick="pickSearchHistory('${esc(q).replace(/'/g,"\\'")}')">
      <span class="ms">history</span>
      <span>${esc(q)}</span>
    </div>`).join('');
}
window.pickSearchHistory=function(q){
  const qi=document.getElementById('q');if(!qi)return;
  qi.value=q;
  const qc=document.getElementById('q-clear');if(qc)qc.style.display='flex';
  doSearch();
};
function removeSearchHistory(idx){
  searchHistory_.splice(idx,1);
  saveLS(LS_SEARCH_HIST,searchHistory_);
  renderSearchHistoryList();
}

// ── SKELETON ──
// Home/WatchLater/Channel Videos grid: real YT-size ~300px cards
function skelVidGrid(n){
  return`<div class="vid-grid">${Array(n).fill(0).map(()=>`<div class="vid-card" style="pointer-events:none">
    <div class="skeleton" style="aspect-ratio:16/9;border-radius:10px;width:100%"></div>
    <div class="vid-info" style="padding-top:10px">
      <div class="skeleton" style="width:36px;height:36px;min-width:36px;border-radius:50%;flex-shrink:0;margin-top:2px"></div>
      <div class="vid-text" style="flex:1;min-width:0">
        <div class="skeleton" style="height:14px;width:95%;border-radius:4px;margin-bottom:6px"></div>
        <div class="skeleton" style="height:14px;width:75%;border-radius:4px;margin-bottom:6px"></div>
        <div class="skeleton" style="height:13px;width:50%;border-radius:4px;margin-bottom:4px"></div>
        <div class="skeleton" style="height:13px;width:38%;border-radius:4px"></div>
      </div>
    </div>
  </div>`).join('')}</div>`;
}
// Search results: wide horizontal cards (thumb ~38vw, min 240px)
function skelSearchGrid(n){
  return Array(n).fill(0).map(()=>`<div class="search-skel-card">
    <div class="skeleton search-skel-thumb"></div>
    <div class="search-skel-info">
      <div class="skeleton search-skel-title"></div>
      <div class="skeleton search-skel-title2"></div>
      <div class="skeleton search-skel-meta"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
        <div class="skeleton" style="width:24px;height:24px;border-radius:50%;flex-shrink:0"></div>
        <div class="skeleton search-skel-ch"></div>
      </div>
    </div>
  </div>`).join('');
}
// History: wide horizontal cards same width as search
function skelHistoryList(n){
  return Array(n).fill(0).map(()=>`<div class="history-skel-item">
    <div class="skeleton history-skel-thumb"></div>
    <div class="history-skel-info">
      <div class="skeleton history-skel-title"></div>
      <div class="skeleton history-skel-title2"></div>
      <div class="skeleton history-skel-meta"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <div class="skeleton" style="width:24px;height:24px;border-radius:50%;flex-shrink:0"></div>
        <div class="skeleton history-skel-ch"></div>
      </div>
    </div>
  </div>`).join('');
}
// Playlist grid: ~220px cards
function skelPlaylistGrid(n){
  return`<div class="mpl-grid">${Array(n).fill(0).map(()=>`<div style="border-radius:12px;overflow:hidden;background:var(--surface);border:1px solid var(--border)">
    <div class="skeleton" style="aspect-ratio:16/9;width:100%;border-radius:0"></div>
    <div style="padding:10px 12px 14px;display:flex;flex-direction:column;gap:8px">
      <div class="skeleton" style="height:14px;width:80%;border-radius:4px"></div>
      <div class="skeleton" style="height:12px;width:45%;border-radius:4px"></div>
    </div>
  </div>`).join('')}</div>`;
}
// Channel playlist grid: ~230px cards
function skelChPlaylistGrid(n){
  return`<div class="pl-grid">${Array(n).fill(0).map(()=>`<div style="border-radius:12px;overflow:hidden">
    <div class="skeleton" style="aspect-ratio:16/9;width:100%;border-radius:12px 12px 0 0"></div>
    <div style="padding:10px 2px 4px;display:flex;flex-direction:column;gap:7px">
      <div class="skeleton" style="height:14px;width:85%;border-radius:4px"></div>
      <div class="skeleton" style="height:12px;width:50%;border-radius:4px"></div>
    </div>
  </div>`).join('')}</div>`;
}

// ── THEME TOGGLE ──
(function(){
  const LS_THEME='yt_theme_v1';
  function applyTheme(light){
    document.body.classList.toggle('light-mode',light);
    const icon=document.getElementById('theme-icon');
    if(icon)icon.textContent=light?'dark_mode':'light_mode';
    const lbl=document.getElementById('theme-label');
    if(lbl)lbl.textContent=light?'Switch to Dark mode':'Switch to Light mode';
  }
  const saved=localStorage.getItem(LS_THEME);
  if(saved==='light')applyTheme(true);
  window.toggleTheme=function(){
    const isLight=document.body.classList.toggle('light-mode');
    localStorage.setItem(LS_THEME,isLight?'light':'dark');
    applyTheme(isLight);
  };
})();

// ── PROFILE DROPDOWN ──
function toggleProfileDropdown(){
  const dd=document.getElementById('profile-dropdown');
  dd.classList.toggle('open');
  if(dd.classList.contains('open')){
    // Close when clicking outside
    setTimeout(()=>document.addEventListener('click',_closePDDOutside),0);
  }
}
function closeProfileDropdown(){
  document.getElementById('profile-dropdown').classList.remove('open');
  document.removeEventListener('click',_closePDDOutside);
}
function _closePDDOutside(e){
  const dd=document.getElementById('profile-dropdown');
  const btn=document.getElementById('profile-btn');
  if(!dd.contains(e.target)&&!btn.contains(e.target)){closeProfileDropdown();}
}

// ── SIDEBAR TOGGLE ──
(function(){
  const LS_SB='yt_sidebar_collapsed_v1';
  // Collapsed state is restored in initSetup after unlock check
  window._sbCollapsedPref = localStorage.getItem(LS_SB)==='1';
  window.toggleSidebar=function(){
    const collapsed=document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem(LS_SB,collapsed?'1':'0');
  };
})();

// ── YOU SECTION TOGGLE ──
function toggleYouSection(){
  const wrap=document.getElementById('you-section-wrap');
  const header=document.getElementById('you-header');
  const isExpanded=header.classList.toggle('expanded');
  wrap.style.display=isExpanded?'':'none';
}

// ── MANAGE CHANNELS PANEL ──
function openManageChannels(){
  const list=document.getElementById('mcp-list');
  if(!channels.length){
    list.innerHTML='<div class="mcp-empty">No subscriptions yet.<br>Use + to add channels.</div>';
  }else{
    list.innerHTML=channels.map(c=>{
      const meta=channelMeta[c];
      const initials=(meta?.title||c).split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      return`<div class="mcp-item">
        <div class="mcp-avatar">${meta?.thumb?`<img src="${esc(meta.thumb)}" alt="" onerror="this.style.display='none'"/><span style="display:none">${esc(initials)}</span>`:`<span>${esc(initials)}</span>`}</div>
        <div class="mcp-info">
          <div class="mcp-name">${esc(meta?.title||c)}</div>
          ${meta?.subs?`<div class="mcp-subs">${esc(meta.subs)} subscribers</div>`:''}
        </div>
        <button class="mcp-unsub-btn" onclick="unsubscribeChannel('${esc(c).replace(/'/g,"\\'")}',this)">Unsubscribe</button>
      </div>`;
    }).join('');
  }
  document.getElementById('manage-channels-panel').classList.add('open');
  document.getElementById('manage-channels-overlay').classList.add('open');
}
function closeManageChannels(){
  document.getElementById('manage-channels-panel').classList.remove('open');
  document.getElementById('manage-channels-overlay').classList.remove('open');
}

// ── UNSUBSCRIBE CHANNEL ──
function unsubscribeChannel(chName,btn){
  if(!confirm(`Unsubscribe from "${chName}"?`))return;
  channels=channels.filter(c=>c!==chName);
  delete channelMeta[chName];
  delete channelIds[chName];
  saveLS(LS_CH,channels);saveLS(LS_IDS,channelIds);saveLS(LS_META,channelMeta);
  renderSidebarChannels();
  if(document.getElementById('manage-channels-panel').classList.contains('open'))openManageChannels();
  showToast(`Unsubscribed from ${chName}`);
}

// ── INIT ──
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCtx();hideNewPlaylistModal();closeSettings()}});
initSetup();

// ── DRAG & DROP → Watch Later + Playlist ──
(function(){
  const sidebar=document.getElementById('sidebar');
  const wlItem=document.getElementById('nav-watchlater');
  const plItem=document.getElementById('nav-myplaylists');
  let dragData=null;

  function setupDraggable(card){
    if(card._dragReady)return;
    card._dragReady=true;
    card.setAttribute('draggable','true');

    card.addEventListener('dragstart',e=>{
      const vid=card.dataset.vid;
      if(!vid){e.preventDefault();return;}
      dragData={
        vid,
        title:card.querySelector('.vid-title,.search-title,.history-title')?.textContent?.trim()||'',
        channel:card.querySelector('.vid-ch-name,.search-ch-name,.history-ch')?.textContent?.trim()||'',
        thumb:card.querySelector('img')?.src||'',
        dur:card.querySelector('.vid-duration,.search-dur')?.textContent?.trim()||''
      };
      window._ytDragData=dragData;
      e.dataTransfer.effectAllowed='copy';
      e.dataTransfer.setData('text/plain',vid);
      card.classList.add('dragging');
      sidebar.classList.add('drag-active');
      wlItem.classList.add('wl-drop-target');
      plItem.classList.add('pl-drop-target');
      // Show inner playlist drop hint if we're inside a playlist view
      const inner=document.getElementById('mpl-grid-wrap');
      if(inner)inner.classList.add('pl-inner-drop-active');
    });

    card.addEventListener('dragend',()=>{
      card.classList.remove('dragging');
      sidebar.classList.remove('drag-active');
      wlItem.classList.remove('wl-drop-target','wl-drop-over');
      plItem.classList.remove('pl-drop-target','pl-drop-over');
      dragData=null;
      window._ytDragData=null;
      // Hide all playlist card targets
      document.querySelectorAll('.mpl-card.pl-card-drop-target').forEach(c=>c.classList.remove('pl-card-drop-target'));
      const inner=document.getElementById('mpl-grid-wrap');
      if(inner)inner.classList.remove('pl-inner-drop-active','pl-inner-drop-over');
    });
  }

  // Watch for new cards (vid-card, search-card, history-item with data-vid)
  const obs=new MutationObserver(muts=>{
    muts.forEach(m=>m.addedNodes.forEach(n=>{
      if(n.nodeType!==1)return;
      if(n.classList?.contains('vid-card')||n.classList?.contains('search-card'))setupDraggable(n);
      n.querySelectorAll?.('.vid-card,.search-card').forEach(setupDraggable);
      // Also handle history items that have data-vid
      if(n.dataset?.vid)setupDraggable(n);
      n.querySelectorAll?.('[data-vid]').forEach(el=>{
        if(!el.classList.contains('vid-card')&&!el.classList.contains('search-card'))setupDraggable(el);
      });
    }));
  });
  obs.observe(document.body,{childList:true,subtree:true});
  document.querySelectorAll('.vid-card,.search-card,[data-vid]').forEach(setupDraggable);

  // ── WATCH LATER drop ──
  wlItem.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';wlItem.classList.add('wl-drop-over');});
  wlItem.addEventListener('dragleave',()=>wlItem.classList.remove('wl-drop-over'));
  wlItem.addEventListener('drop',e=>{
    e.preventDefault();
    wlItem.classList.remove('wl-drop-over','wl-drop-target');
    sidebar.classList.remove('drag-active');
    if(!dragData)return;
    const {vid,title,channel,thumb,dur}=dragData;dragData=null;window._ytDragData=null;
    if(watchLater.some(v=>v.vid===vid)){showToast('Already in Watch Later');return;}
    watchLater.unshift({vid,title,channel,thumb,dur,added:Date.now()});
    saveWL();
    showToast('✓ Saved to Watch Later');
    wlItem.classList.add('wl-drop-saved');
    setTimeout(()=>wlItem.classList.remove('wl-drop-saved'),600);
    if(currentSection==='watchlater')renderWatchLater();
  });

  // ── PLAYLIST drop (sidebar nav item) ──
  plItem.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';plItem.classList.add('pl-drop-over');});
  plItem.addEventListener('dragleave',()=>plItem.classList.remove('pl-drop-over'));
  plItem.addEventListener('drop',e=>{
    e.preventDefault();
    plItem.classList.remove('pl-drop-over','pl-drop-target');
    sidebar.classList.remove('drag-active');
    if(!dragData)return;
    const data={...dragData};dragData=null;window._ytDragData=null;

    if(!myPlaylists.length){
      // No playlists — open a nice modal instead of prompt
      showNewPlaylistModalWithVideo(data);
    } else if(myPlaylists.length===1){
      // Exactly one playlist — add directly
      addVideoToPlaylist(myPlaylists[0].id,data.vid,data.title,data.channel,data.thumb,data.dur);
      plItem.classList.add('pl-drop-saved');
      setTimeout(()=>plItem.classList.remove('pl-drop-saved'),600);
    } else {
      // Multiple playlists — show picker near the sidebar item
      showPlPicker(data, plItem);
    }
  });
})();

// Show "New Playlist" modal pre-loaded with a pending video to add after creation
let _pendingVideoForNewPlaylist=null;
function showNewPlaylistModalWithVideo(videoData){
  _pendingVideoForNewPlaylist=videoData;
  document.getElementById('modal-pl-name').value='';
  document.getElementById('modal-overlay').style.display='flex';
  setTimeout(()=>document.getElementById('modal-pl-name').focus(),80);
}
// Patch createPlaylist to handle the pending video
const _origCreatePlaylist=window.createPlaylist||null;
function createPlaylist(){
  const name=document.getElementById('modal-pl-name').value.trim();
  if(!name)return;
  const newPl={id:'pl_'+Date.now(),name,videos:[],createdAt:Date.now()};
  myPlaylists.unshift(newPl);saveMPL();
  hideNewPlaylistModal();
  if(_pendingVideoForNewPlaylist){
    const d=_pendingVideoForNewPlaylist;_pendingVideoForNewPlaylist=null;
    addVideoToPlaylist(newPl.id,d.vid,d.title,d.channel,d.thumb,d.dur);
    document.getElementById('nav-myplaylists').classList.add('pl-drop-saved');
    setTimeout(()=>document.getElementById('nav-myplaylists').classList.remove('pl-drop-saved'),600);
  } else {
    if(currentSection==='myplaylists')renderMyPlaylists();
    showToast(`Playlist "${name}" created`);
  }
}

// ── PLAYLIST PICKER ──
let _plPickerData=null;
function showPlPicker(data, anchorEl){
  _plPickerData=data;
  const popup=document.getElementById('pl-picker-popup');
  const list=document.getElementById('pl-picker-list');
  list.innerHTML=myPlaylists.map(pl=>{
    const inPl=pl.videos.some(v=>v.vid===data.vid);
    return`<div class="pl-picker-item${inPl?' pl-picker-item--in':''}" onclick="pickPlaylist('${esc(pl.id)}')">
      <span class="ms">${inPl?'check_circle':'queue_music'}</span>
      <span>${esc(pl.name)}</span>
      ${inPl?'<span class="ms sz16" style="color:#2eca6a">done</span>':''}
    </div>`;
  }).join('')+`
  <div class="pl-picker-divider"></div>
  <div class="pl-picker-item pl-picker-new" onclick="pickPlaylistNew()">
    <span class="ms">add</span>
    <span>New playlist…</span>
  </div>`;
  // Position near the playlists sidebar item
  const rect=anchorEl?anchorEl.getBoundingClientRect():{left:240,bottom:200};
  popup.style.left=(rect.right+8)+'px';
  popup.style.top=Math.min(rect.top, window.innerHeight-280)+'px';
  popup.classList.add('open');
  // Close on outside click
  setTimeout(()=>document.addEventListener('click',_closePlPickerOutside),0);
}
function closePlPicker(){
  document.getElementById('pl-picker-popup').classList.remove('open');
  document.removeEventListener('click',_closePlPickerOutside);
  _plPickerData=null;
}
function _closePlPickerOutside(e){
  const popup=document.getElementById('pl-picker-popup');
  if(!popup.contains(e.target)){closePlPicker();}
}
window.pickPlaylist=function(plId){
  if(!_plPickerData)return;
  const d=_plPickerData;
  closePlPicker();
  addVideoToPlaylist(plId,d.vid,d.title,d.channel,d.thumb,d.dur);
  document.getElementById('nav-myplaylists').classList.add('pl-drop-saved');
  setTimeout(()=>document.getElementById('nav-myplaylists').classList.remove('pl-drop-saved'),600);
};
window.pickPlaylistNew=function(){
  if(!_plPickerData)return;
  const d=_plPickerData;
  closePlPicker();
  const name=prompt('New playlist name:');
  if(!name||!name.trim())return;
  const newPl={id:'pl_'+Date.now(),name:name.trim(),videos:[],createdAt:Date.now()};
  myPlaylists.unshift(newPl);saveMPL();
  addVideoToPlaylist(newPl.id,d.vid,d.title,d.channel,d.thumb,d.dur);
  document.getElementById('nav-myplaylists').classList.add('pl-drop-saved');
  setTimeout(()=>document.getElementById('nav-myplaylists').classList.remove('pl-drop-saved'),600);
};
</script>
