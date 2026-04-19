// ── MY PLAYLISTS ──
function saveMPL(){saveLS(LS_MPL,myPlaylists)}
function showNewPlaylistModal(){
  document.getElementById('modal-pl-name').value='';
  document.getElementById('modal-overlay').style.display='flex';
  setTimeout(()=>document.getElementById('modal-pl-name').focus(),80);
}
function hideNewPlaylistModal(){document.getElementById('modal-overlay').style.display='none'}
function _baseCreatePlaylist_unused(){
  const name=document.getElementById('modal-pl-name').value.trim();
  if(!name)return;
  myPlaylists.unshift({id:'pl_'+Date.now(),name,videos:[],createdAt:Date.now()});
  saveMPL();
  hideNewPlaylistModal();
  if(currentSection==='myplaylists')renderMyPlaylists();
  showToast(`Playlist "${name}" created`);
}
function deletePlaylist(id){
  if(!confirm('Delete this playlist?'))return;
  myPlaylists=myPlaylists.filter(p=>p.id!==id);
  saveMPL();
  if(currentSection==='myplaylists')renderMyPlaylists();
}
function addVideoToPlaylist(plId,vid,title,channel,thumb,dur){
  const pl=myPlaylists.find(p=>p.id===plId);
  if(!pl)return;
  if(pl.videos.some(v=>v.vid===vid)){showToast('Already in playlist');return;}
  pl.videos.push({vid,title,channel,thumb,dur});
  saveMPL();
  showToast(`Added to "${pl.name}"`);
}
function removeVideoFromPlaylist(plId,vid){
  const pl=myPlaylists.find(p=>p.id===plId);
  if(!pl)return;
  pl.videos=pl.videos.filter(v=>v.vid!==vid);
  saveMPL();
  showToast('Removed from playlist');
  // If we're inside the playlist detail view, re-render it
  if(document.getElementById('pl-inner-grid'))openMyPlaylist(plId);
  else renderMyPlaylists();
}
function renderMyPlaylists(){
  const wrap=document.getElementById('mpl-grid-wrap');
  // Show skeleton briefly
  wrap.innerHTML=skelPlaylistGrid(6);
  setTimeout(()=>{
  if(!myPlaylists.length){
    wrap.innerHTML=`<div class="mpl-empty"><span class="ms" style="font-size:64px">queue_music</span><div class="mpl-empty-title">No playlists yet</div><div class="mpl-empty-sub">Click "New playlist" to create one.</div></div>`;
    return;
  }
  wrap.innerHTML=`<div class="mpl-grid">${myPlaylists.map(pl=>{
    const thumb=pl.videos[0]?.thumb||'';
    return`<div class="mpl-card" data-plid="${esc(pl.id)}" onclick="openMyPlaylist('${esc(pl.id)}')">
      <div class="mpl-thumb">
        ${thumb?`<img src="${esc(thumb)}" alt="" loading="lazy"/>`:'<div style="width:100%;height:100%;background:#222;display:flex;align-items:center;justify-content:center"><span class="ms" style="font-size:40px;color:var(--text3)">queue_music</span></div>'}
        <div class="mpl-count"><span>${pl.videos.length}</span><span>videos</span></div>
      </div>
      <div class="mpl-info">
        <div class="mpl-title">${esc(pl.name)}</div>
        <div class="mpl-sub">${pl.videos.length} video${pl.videos.length!==1?'s':''}</div>
      </div>
      <button class="mpl-del-btn" title="Delete" onclick="event.stopPropagation();deletePlaylist('${esc(pl.id)}')">
        <span class="ms">delete</span>
      </button>
    </div>`;
  }).join('')}</div>`;
  setupPlaylistGridDropZones();
  },80);
}
function openMyPlaylist(plId){
  const pl=myPlaylists.find(p=>p.id===plId);
  if(!pl)return;
  const wrap=document.getElementById('mpl-grid-wrap');
  const thumb=pl.videos[0]?.thumb||'';
  const videoRows=pl.videos.map((v,i)=>{
    const link=ytLink(v.vid);
    const durStr=fmtDur(v.dur||'');
    return`<a class="pl-video-row" href="${link}" target="_blank" rel="noopener"
      data-hv="${esc(v.vid)}" data-ht="${esc(v.title||'')}" data-hc="${esc(v.channel||'')}" data-hi="">
      <div class="pl-video-num">${i+1}</div>
      <div class="pl-video-thumb">
        <img src="${esc(v.thumb||'')}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault')){this.src=this.src.replace('maxresdefault','hqdefault')}else{this.src=''}"/>
        ${durStr?`<span class="pl-video-dur">${esc(durStr)}</span>`:''}
      </div>
      <div class="pl-video-info">
        <div class="pl-video-title">${esc(v.title||'')}</div>
        <div class="pl-video-ch">${esc(v.channel||'')}</div>
      </div>
      <button class="pl-video-remove" title="Remove from playlist" onclick="event.preventDefault();event.stopPropagation();removeVideoFromPlaylist('${esc(pl.id)}','${esc(v.vid)}')">
        <span class="ms">close</span>
      </button>
    </a>`;
  }).join('');

  wrap.innerHTML=`
  <button class="load-more-btn" style="margin-bottom:18px;display:inline-flex;align-items:center;gap:6px" onclick="renderMyPlaylists()">
    <span class="ms" style="font-size:18px">arrow_back</span> All Playlists
  </button>
  <div class="pl-detail-wrap">
    <div class="pl-detail-sidebar">
      <div class="pl-detail-cover">
        ${thumb
          ?`<img src="${esc(thumb)}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault')){this.src=this.src.replace('maxresdefault','hqdefault')}else{this.src=''}"/>`
          :`<div class="pl-detail-cover-empty"><span class="ms">queue_music</span></div>`}
      </div>
      <div class="pl-detail-info">
        <div class="pl-detail-name">${esc(pl.name)}</div>
        <div class="pl-detail-meta">${pl.videos.length} video${pl.videos.length!==1?'s':''}</div>
        <div class="pl-detail-actions">
          <button class="pl-detail-play-btn" onclick="window.open('${pl.videos[0]?ytLink(pl.videos[0].vid):'#'}','_blank')">
            <span class="ms">play_arrow</span>Play all
          </button>
          <button class="pl-detail-shuffle-btn">
            <span class="ms">shuffle</span>
          </button>
        </div>
      </div>
    </div>
    <div class="pl-video-list" id="pl-inner-grid">
      <div class="pl-video-list-header">
        <span class="pl-video-list-count">${pl.videos.length} video${pl.videos.length!==1?'s':''}</span>
      </div>
      <div class="pl-detail-drop-hint"><span class="ms">add_circle</span>Drop videos here to add them</div>
      ${pl.videos.length
        ? videoRows
        : `<div class="mpl-empty" style="padding:40px 0"><span class="ms" style="font-size:40px;color:var(--text3)">video_library</span><div class="mpl-empty-title">No videos yet</div><div class="mpl-empty-sub">Drag any video here, or use the ⋮ menu to add videos.</div></div>`}
    </div>
  </div>`;
  setupInnerPlaylistDropZone(plId,wrap);
}

// ── PLAYLIST INNER DROP ZONE ──
// Allows dragging videos INTO an open playlist view
function setupInnerPlaylistDropZone(plId, wrap){
  wrap.addEventListener('dragover',e=>{
    if(!window._ytDragData)return;
    e.preventDefault();e.dataTransfer.dropEffect='copy';
    wrap.classList.add('pl-inner-drop-active','pl-inner-drop-over');
  });
  wrap.addEventListener('dragleave',e=>{
    if(!wrap.contains(e.relatedTarget))wrap.classList.remove('pl-inner-drop-active','pl-inner-drop-over');
  });
  wrap.addEventListener('drop',e=>{
    e.preventDefault();
    wrap.classList.remove('pl-inner-drop-active','pl-inner-drop-over');
    const d=window._ytDragData;
    if(!d)return;
    addVideoToPlaylist(plId,d.vid,d.title,d.channel,d.thumb,d.dur);
    setTimeout(()=>openMyPlaylist(plId),80);
  });
}

// Allows dragging videos onto playlist cards in the grid view
function setupPlaylistGridDropZones(){
  document.querySelectorAll('.mpl-card[data-plid]').forEach(card=>{
    if(card._plDropReady)return;
    card._plDropReady=true;
    const plId=card.dataset.plid;
    card.addEventListener('dragover',e=>{
      if(!window._ytDragData)return;
      e.preventDefault();e.dataTransfer.dropEffect='copy';
      card.classList.add('pl-card-drop-target');
    });
    card.addEventListener('dragleave',e=>{
      if(!card.contains(e.relatedTarget))card.classList.remove('pl-card-drop-target');
    });
    card.addEventListener('drop',e=>{
      e.preventDefault();e.stopPropagation();
      card.classList.remove('pl-card-drop-target');
      const d=window._ytDragData;
      if(!d)return;
      addVideoToPlaylist(plId,d.vid,d.title,d.channel,d.thumb,d.dur);
      card.classList.add('pl-card-drop-saved');
      setTimeout(()=>card.classList.remove('pl-card-drop-saved'),550);
    });
  });
}

