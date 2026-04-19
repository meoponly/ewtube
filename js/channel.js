// ── CHANNEL PAGE ──
async function openChannel(name){
  ytLoadStart();
  navStack.push({type:'section',section:currentSection});
  currentChannelName=name;currentChTab='home';
  ['search-section','history-section','myplaylists-section','watchlater-section'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none'});
  document.getElementById('channel-page').style.display='block';
  document.querySelectorAll('.sb-item').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.ch-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
  document.getElementById('ch-home-panel').style.display='none';
  document.getElementById('ch-videos-panel').style.display='block';
  document.getElementById('ch-videos-panel').innerHTML='';
  document.getElementById('ch-playlists-panel').style.display='none';
  document.getElementById('ch-playlists-panel').innerHTML='';
  delete document.getElementById('ch-playlists-panel').dataset.loaded;
  plNextTokenMap[name]=null;

  const chId=channelIds[name];const meta=channelMeta[name]||{};
  const bannerImg=document.getElementById('ch-banner-img');
  if(meta.banner){bannerImg.src=meta.banner;bannerImg.style.display='block'}else bannerImg.style.display='none';
  const pfpImg=document.getElementById('ch-page-pfp-img');const initEl=document.getElementById('ch-page-initials');
  if(meta.thumb){pfpImg.src=meta.thumb;pfpImg.style.display='block';initEl.style.display='none'}
  else{pfpImg.style.display='none';initEl.style.display='';initEl.textContent=name.slice(0,2).toUpperCase()}
  document.getElementById('ch-page-name').textContent=meta.title||name;
  document.getElementById('ch-page-handle').textContent=meta.handle?`@${meta.handle.replace('@','')}`:''
  document.getElementById('ch-page-subs').textContent=meta.subs?fmtSubs(meta.subs):'';
  document.getElementById('ch-tabs').style.display='flex';
  // Update hide button state
  updateChHideBtn(name);
  if(!chId){document.getElementById('ch-home-panel').innerHTML='<p style="color:var(--text3);text-align:center;padding:40px">Channel ID not resolved.</p>';return}
  currentChannelId=chId;vidNextToken=null;chUploadPlId=null;
  loadChannelVideos(true);
}
async function loadChannelVideos(fresh){
  const panel=document.getElementById('ch-videos-panel');
  if(fresh)panel.innerHTML=skelVidGrid(8);
  try{
    if(!chUploadPlId){
      let uplId=uploadCache[currentChannelId];
      if(!uplId){
        const ch=await api(`channels?part=contentDetails&id=${currentChannelId}`);
        uplId=ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        if(uplId){uploadCache[currentChannelId]=uplId;saveLS(LS_UPLOAD,uploadCache)}
      }
      chUploadPlId=uplId;
    }
    if(!chUploadPlId){panel.innerHTML='<p style="color:var(--text3);text-align:center;padding:40px">Could not load videos.</p>';return}
    let url=`playlistItems?part=snippet,contentDetails&playlistId=${chUploadPlId}&maxResults=50`;
    if(vidNextToken&&!fresh)url+=`&pageToken=${vidNextToken}`;
    const d=await api(url);vidNextToken=d.nextPageToken||null;
    const items=(d.items||[]).filter(i=>i.snippet.title!=='Private video'&&i.snippet.title!=='Deleted video'&&!isShort(i.snippet.title));
    if(!items.length&&fresh){panel.innerHTML='<p style="color:var(--text3);text-align:center;padding:40px">No videos found.</p>';return}
    const vids=items.map(i=>i.contentDetails.videoId).filter(Boolean).join(',');
    if(!vids){if(fresh)panel.innerHTML='';return}
    const stats=await api(`videos?part=statistics,contentDetails&id=${vids}`);
    const sm={};(stats.items||[]).forEach(v=>sm[v.id]={views:v.statistics?.viewCount||0,dur:v.contentDetails?.duration||''});
    const filtered=items.filter(i=>!isShortDuration(sm[i.contentDetails.videoId]?.dur||''));
    if(fresh)panel.innerHTML=`<div class="vid-grid" id="ch-vid-grid"></div>`;
    else if(!document.getElementById('ch-vid-grid'))panel.insertAdjacentHTML('afterbegin','<div class="vid-grid" id="ch-vid-grid"></div>');
    const grid=document.getElementById('ch-vid-grid')||panel;
    filtered.forEach(item=>{
      const vid=item.contentDetails.videoId;const s=item.snippet;const st=sm[vid]||{};
      const meta=channelMeta[currentChannelName]||null;
      const thumb=bestThumb(s.thumbnails,vid);
      grid.innerHTML+=videoCard(vid,s.title,s.videoOwnerChannelTitle||currentChannelName,thumb,s.publishedAt,st.views,st.dur,meta,currentChannelId);
    });
    const existingMore=panel.querySelector('.load-more-wrap');if(existingMore)existingMore.remove();
    if(vidNextToken){
      const w=document.createElement('div');w.className='load-more-wrap';
      w.innerHTML=`<button class="load-more-btn" onclick="loadChannelVideos(false)">Load more</button>`;
      panel.appendChild(w);
    }
  }catch(e){if(fresh)panel.innerHTML=`<p style="color:var(--text3);text-align:center;padding:40px">Error: ${esc(e.message)}</p>`;console.error(e)}
  finally{ytLoadEnd();}
}
function chTab(tab){
  currentChTab=tab;
  const tabs=['videos','playlists'];
  document.querySelectorAll('.ch-tab').forEach((b,i)=>b.classList.toggle('active',tabs[i]===tab));
  document.getElementById('ch-home-panel').style.display='none';
  document.getElementById('ch-videos-panel').style.display=tab==='videos'?'':'none';
  document.getElementById('ch-playlists-panel').style.display=tab==='playlists'?'':'none';
  if(tab==='videos'&&!document.getElementById('ch-vid-grid')){
    vidNextToken=null;chUploadPlId=null;loadChannelVideos(true);
  }
  if(tab==='playlists'&&!document.getElementById('ch-playlists-panel').dataset.loaded){
    loadPlaylists(false);
  }
}
// Paginated playlists — load 50 at a time
async function loadPlaylists(append){
  const panel=document.getElementById('ch-playlists-panel');
  if(!append){panel.innerHTML=skelChPlaylistGrid(6);plNextTokenMap[currentChannelName]=null}
  const token=plNextTokenMap[currentChannelName]||null;
  try{
    let url=`playlists?part=snippet,contentDetails&channelId=${currentChannelId}&maxResults=50`;
    if(token)url+=`&pageToken=${token}`;
    const d=await api(url);
    plNextTokenMap[currentChannelName]=d.nextPageToken||null;
    const items=d.items||[];
    if(!items.length&&!append){panel.innerHTML='<p style="color:var(--text3);text-align:center;padding:40px;font-size:14px">No playlists found.</p>';panel.dataset.loaded='1';return}
    if(!append)panel.innerHTML=`<div class="pl-grid" id="pl-grid-inner"></div>`;
    else{
      const oldBtn=panel.querySelector('.load-more-wrap');if(oldBtn)oldBtn.remove();
      if(!document.getElementById('pl-grid-inner'))panel.insertAdjacentHTML('afterbegin','<div class="pl-grid" id="pl-grid-inner"></div>');
    }
    const grid=document.getElementById('pl-grid-inner');
    items.forEach(pl=>{
      const thumb=pl.snippet.thumbnails.medium?.url||pl.snippet.thumbnails.default?.url||'';
      const count=pl.contentDetails?.itemCount||0;
      const safeTitle=esc(pl.snippet.title);
      const isPinned=pinnedPls.some(p=>p.plId===pl.id);
      grid.innerHTML+=`<div class="pl-card" onclick="openChPlaylist('${pl.id}','${safeTitle.replace(/'/g,"\\'")}')">
        <div class="pl-thumb-wrap">
          ${thumb?`<img src="${thumb}" alt="" loading="lazy"/>`:''}
          <div class="pl-count-badge"><span>${count}</span><span>videos</span></div>
          <button class="pl-pin-btn ${isPinned?'pinned':''}" data-plid="${pl.id}"
            onclick="event.stopPropagation();togglePin('${pl.id}','${safeTitle.replace(/'/g,"\\'")}','${esc(thumb)}','${esc(currentChannelName)}')"
          >${isPinned?'📌 Pinned':'📌 Pin'}</button>
        </div>
        <div class="pl-info">
          <div class="pl-title">${safeTitle}</div>
          <div class="pl-sub">Playlist · ${count} videos</div>
        </div>
      </div>`;
    });
    if(plNextTokenMap[currentChannelName]){
      const w=document.createElement('div');w.className='load-more-wrap';
      w.innerHTML=`<button class="load-more-btn" onclick="loadPlaylists(true)">Load more playlists</button>`;
      panel.appendChild(w);
    }
    panel.dataset.loaded='1';
  }catch(e){if(!append)panel.innerHTML=`<p style="color:var(--text3);text-align:center;padding:40px">${esc(e.message)}</p>`;console.error(e)}
}

async function openChPlaylist(plId,plName){
  const panel=document.getElementById('ch-playlists-panel');
  panel.innerHTML=`<button class="load-more-btn" style="margin-bottom:14px" onclick="loadPlaylists(false)">← All Playlists</button>
    <div class="section-title" style="margin-bottom:14px">${esc(plName)}</div>
    <div class="vid-grid" id="pl-vid-grid"></div>`;
  await loadPlaylistVideos(plId,null);
}
async function loadPlaylistVideos(plId,token){
  const grid=document.getElementById('pl-vid-grid');if(!grid)return;
  let url=`playlistItems?part=snippet,contentDetails&playlistId=${plId}&maxResults=50`;
  if(token)url+=`&pageToken=${token}`;
  const d=await api(url);
  const items=(d.items||[]).filter(i=>i.snippet.title!=='Private video'&&i.snippet.title!=='Deleted video');
  if(!items.length)return;
  const vids=items.map(i=>i.contentDetails.videoId).filter(Boolean).join(',');if(!vids)return;
  const stats=await api(`videos?part=statistics,contentDetails&id=${vids}`);
  const sm={};(stats.items||[]).forEach(v=>sm[v.id]={views:v.statistics?.viewCount||0,dur:v.contentDetails?.duration||''});
  items.forEach(item=>{
    const vid=item.contentDetails.videoId;const s=item.snippet;const st=sm[vid]||{};
    if(!isShortDuration(st.dur||'')){
      const meta=channelMeta[currentChannelName]||null;
      const thumb=bestThumb(s.thumbnails,vid);
      grid.innerHTML+=videoCard(vid,s.title,s.videoOwnerChannelTitle||currentChannelName,thumb,s.publishedAt,st.views,st.dur,meta,currentChannelId);
    }
  });
  if(d.nextPageToken){
    const panel=document.getElementById('ch-playlists-panel');
    const old=panel.querySelector('.pl-load-more');if(old)old.remove();
    const w=document.createElement('div');w.className='load-more-wrap pl-load-more';
    w.innerHTML=`<button class="load-more-btn" onclick="this.parentElement.remove();loadPlaylistVideos('${plId}','${d.nextPageToken}')">Load more videos</button>`;
    panel.appendChild(w);
  }
}

// ── BACK ──
function goBack(){
  const prev=navStack.pop();
  document.getElementById('channel-page').style.display='none';
  showSection(prev?.section||'home');
}

