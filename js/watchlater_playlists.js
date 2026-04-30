function renderContinueWatching(){
  const wrap=document.getElementById('cw-section-wrap');
  if(!wrap)return;
  // Take up to 5 most recent unique history items
  const recent=history_.filter((v,i,a)=>v&&v.vid&&a.findIndex(x=>x.vid===v.vid)===i).slice(0,5);
  if(!recent.length){wrap.style.display='none';return;}
  // Assign varied progress values based on position (simulated)
  const progressValues=[72,45,88,31,60];
  wrap.style.display='';
  const cards=recent.map((item,idx)=>{
    const progress=progressValues[idx]||40;
    return`<a class="cw-card" href="${ytLink(item.vid)}" target="_blank" rel="noopener"
      data-hv="${esc(item.vid)}" data-ht="${esc(item.title||'')}" data-hc="${esc(item.channel||'')}" data-hi="">
      <div class="cw-thumb-wrap">
        <img src="https://i.ytimg.com/vi/${esc(item.vid)}/hqdefault.jpg" alt="" loading="lazy"
          onerror="this.src='https://i.ytimg.com/vi/${esc(item.vid)}/mqdefault.jpg'"/>
        <div class="cw-progress-bar"><div class="cw-progress-fill" style="width:${progress}%"></div></div>
      </div>
      <div class="cw-info">
        <div class="cw-vid-title">${esc(item.title||'')}</div>
        <div class="cw-ch">${esc(item.channel||'')}</div>
      </div>
    </a>`;
  }).join('');
  wrap.innerHTML=`<div class="cw-title"><span class="ms">play_circle</span>Continue Watching</div>
  <div class="cw-strip">${cards}</div>`;
}

// ── SEARCH FILTER CHIPS ──
let searchFilter='all';
function setSearchFilter(f){
  searchFilter=f;
  document.querySelectorAll('.yt-filter-chip').forEach(b=>{
    b.classList.toggle('active',b.dataset.filter===f);
  });
  renderSearchResults();
}

// ── NOTIFICATION BELL ──
function toggleChNotif(e,chName){
  e.preventDefault();e.stopPropagation();
  chNotifs[chName]=!chNotifs[chName];
  localStorage.setItem(LS_NOTIF,JSON.stringify(chNotifs));
  renderSidebarChannels();
  showToast(chNotifs[chName]?'🔔 Notifications on for '+chName:'🔕 Notifications off for '+chName);
}

// ── INIT ──
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCtx();hideNewPlaylistModal();closeSettings();closeShortcuts()}})
initSetup();;

// Ctrl+B → open description panel for the card under the pointer
let _hoveredCard=null;
document.addEventListener('mousemove',e=>{
  const card=e.target.closest('.search-card,.vid-card,.search-pl-card,.history-item,.mpl-card,.ch-search-card,.pl-video-row');
  _hoveredCard=card||null;
},true);
document.addEventListener('keydown',e=>{
  if(e.key==='b'&&e.ctrlKey&&!e.shiftKey){
    e.preventDefault();
    if(!_hoveredCard)return;
    const titleEl=_hoveredCard.querySelector('.search-title,.vid-title,.pl-title,.history-title,.mpl-title');
    const title=titleEl?titleEl.textContent.trim():'';
    const descEl=_hoveredCard.querySelector('.search-desc');
    const desc=_hoveredCard.dataset.fulldesc||(descEl?descEl.textContent.trim():'');
    const vid2=_hoveredCard.dataset.vid||'';
    if(!desc&&!vid2){showToast('No description available');return;}
    openDescPanel(title,desc,vid2);
  }
});

// ── KEYBOARD SHORTCUTS MODAL ──
function openShortcuts(){
  const m=document.getElementById('shortcuts-modal');
  if(m){m.style.display='flex';}
}
function closeShortcuts(){
  const m=document.getElementById('shortcuts-modal');
  if(m){m.style.display='none';}
}
document.addEventListener('keydown',e=>{
  if(e.key==='m'&&e.ctrlKey&&!e.shiftKey){
    e.preventDefault();
    const m=document.getElementById('shortcuts-modal');
    if(m&&m.style.display==='flex')closeShortcuts();
    else openShortcuts();
  }
});
// Close shortcuts on Esc
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeShortcuts();}
});
// Close on backdrop click
document.addEventListener('click',e=>{
  const m=document.getElementById('shortcuts-modal');
  if(m&&e.target===m)closeShortcuts();
});

// Ctrl+I → open Settings only when pointer is on the settings item
let _hoveringSettingsItem=false;
document.addEventListener('DOMContentLoaded',()=>{
  const el=document.getElementById('settings-dd-item');
  if(!el)return;
  el.addEventListener('mouseenter',()=>_hoveringSettingsItem=true);
  el.addEventListener('mouseleave',()=>_hoveringSettingsItem=false);
});
document.addEventListener('keydown',e=>{
  if(e.key==='i'&&e.ctrlKey&&!e.shiftKey&&_hoveringSettingsItem){
    e.preventDefault();
    openSettings();
    closeProfileDropdown();
  }
});
const _tickedVids=new Set();
document.addEventListener('keydown',e=>{
  if(e.key==='y'&&e.ctrlKey&&!e.shiftKey){
    e.preventDefault();
    if(!_hoveredCard)return;
    const vid=_hoveredCard.dataset.vid||_hoveredCard.dataset.hv||'';
    // Find the thumb wrap — vid-card, search-card, search-pl-card, pl-video-row
    const thumbWrap=_hoveredCard.querySelector('.vid-thumb-wrap,.search-thumb,.search-pl-thumb,.pl-video-thumb');
    if(!thumbWrap)return;
    const existing=thumbWrap.querySelector('.vid-tick-overlay');
    if(existing){
      existing.remove();
      _tickedVids.delete(vid);
    } else {
      const tick=document.createElement('div');
      tick.className='vid-tick-overlay';
      tick.innerHTML=`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      thumbWrap.appendChild(tick);
      if(vid)_tickedVids.add(vid);
    }
  }
});

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
      // Support both vid-card (data-vid) and pl-video-row / search-card (data-hv)
      const vid=card.dataset.vid||card.dataset.hv;
      if(!vid){e.preventDefault();return;}
      // For pl-video-row, read from data-h* attributes directly (more reliable than DOM query)
      const isPlRow=card.classList.contains('pl-video-row');
      dragData={
        vid,
        title: isPlRow
          ? (card.dataset.ht||card.querySelector('.pl-video-title')?.textContent?.trim()||'')
          : (card.dataset.ht||card.querySelector('.vid-title,.search-title,.history-title')?.textContent?.trim()||''),
        channel: isPlRow
          ? (card.dataset.hc||card.querySelector('.pl-video-ch')?.textContent?.trim()||'')
          : (card.dataset.hc||card.querySelector('.vid-ch-name,.search-ch-name,.history-ch')?.textContent?.trim()||''),
        thumb: card.querySelector('img')?.src||'',
        dur: isPlRow
          ? (card.querySelector('.pl-video-dur')?.textContent?.trim()||'')
          : (card.querySelector('.vid-duration,.search-dur,.pl-video-dur')?.textContent?.trim()||'')
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

  // Watch for new cards (vid-card, search-card, pl-video-row, history items)
  const obs=new MutationObserver(muts=>{
    muts.forEach(m=>m.addedNodes.forEach(n=>{
      if(n.nodeType!==1)return;
      if(n.classList?.contains('vid-card')||n.classList?.contains('search-card')||n.classList?.contains('pl-video-row'))setupDraggable(n);
      n.querySelectorAll?.('.vid-card,.search-card,.pl-video-row').forEach(setupDraggable);
      // Also handle history items that have data-vid
      if(n.dataset?.vid)setupDraggable(n);
      n.querySelectorAll?.('[data-vid]').forEach(el=>{
        if(!el.classList.contains('vid-card')&&!el.classList.contains('search-card')&&!el.classList.contains('pl-video-row'))setupDraggable(el);
      });
    }));
  });
  obs.observe(document.body,{childList:true,subtree:true});
  document.querySelectorAll('.vid-card,.search-card,.pl-video-row,[data-vid]').forEach(setupDraggable);

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
    showTrNotif('watch_later','Saved to Watch Later');
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
