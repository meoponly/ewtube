// ── HOME ──
async function renderHome(){
  ytLoadStart();
  const chipsWrap=document.getElementById('home-chips-wrap');
  const feed=document.getElementById('home-feed');
  const feedTitle=document.getElementById('home-feed-title');

  chipsWrap.innerHTML='';
  renderPinnedSection();

  // Non-hidden, non-blocked channels that have been resolved
  const activeChips=channels.filter(c=>!isHidden(c));
  const visibleIds=activeChips.map(c=>channelIds[c]).filter(Boolean);

  if(!visibleIds.length){
    feedTitle.style.display='none';
    feed.innerHTML=`<div style="text-align:center;padding:80px 0;color:var(--text3)">
      <span class="ms" style="font-size:64px;display:block;margin-bottom:16px">search</span>
      <div style="font-size:16px;font-weight:500;color:var(--text2);margin-bottom:8px">Search anything on YouTube</div>
      <div style="font-size:14px">Use the search bar above — all results are shown except blocked channels</div>
    </div>`;
    document.getElementById('home-load-more').style.display='none';
    ytLoadEnd();
    return;
  }

  feedTitle.style.display='block';
  feed.innerHTML=skelVidGrid(8);
  document.getElementById('home-load-more').style.display='none';

  try{
    let allItems=[];
    for(const chId of visibleIds){
      const items=await fetchUploads(chId,25);
      items.forEach(it=>{it._chId=chId});
      allItems=allItems.concat(items);
    }
    allItems=allItems.filter(i=>{
      const title=i.snippet?.title||'';
      const ch=i.snippet?.videoOwnerChannelTitle||i.snippet?.channelTitle||'';
      return!isShort(title)&&!notInterested.has(i.contentDetails?.videoId||i.snippet?.resourceId?.videoId)&&!isBlockedContent(title,ch);
    });
    if(!allItems.length){feed.innerHTML='<p style="color:var(--text3);padding:16px 0">No videos found.</p>';return}
    const vids=allItems.map(i=>i.contentDetails?.videoId||i.snippet?.resourceId?.videoId).filter(Boolean);
    const statsMap=await fetchVideoStats(vids);
    allItems=allItems.filter(i=>{
      const v=i.contentDetails?.videoId||i.snippet?.resourceId?.videoId;
      return!isShortDuration(statsMap[v]?.dur||'');
    });
    allItems.forEach(i=>{
      i._score=scoreVideo(i,i._chId);
      i._vid=i.contentDetails?.videoId||i.snippet?.resourceId?.videoId;
      i._stats=statsMap[i._vid]||{};
    });
    allItems.sort((a,b)=>b._score-a._score);
    homeFeedItems=allItems;homeFeedPage=0;feed.innerHTML='<div class="vid-grid"></div>';
    renderHomePage();
  }catch(e){feed.innerHTML=`<p style="color:var(--text3)">Error: ${esc(e.message)}</p>`}
  finally{ytLoadEnd();}
}

function renderHomePage(){
  const feed=document.getElementById('home-feed');
  const start=homeFeedPage*HOME_PAGE_SIZE;
  const slice=homeFeedItems.slice(start,start+HOME_PAGE_SIZE);
  if(!slice.length)return;
  let grid=feed.querySelector('.vid-grid');
  if(!grid){grid=document.createElement('div');grid.className='vid-grid';feed.appendChild(grid);}
  slice.forEach(item=>{
    const vid=item._vid;const s=item.snippet||{};const st=item._stats||{};
    const chName=findChName(item._chId||'');
    const meta=channelMeta[chName]||null;
    const thumb=bestThumb(s.thumbnails,vid);
    const title=s.title||'';
    const channel=s.videoOwnerChannelTitle||s.channelTitle||chName;
    grid.innerHTML+=videoCard(vid,title,channel,thumb,s.publishedAt,st.views,st.dur,meta,item._chId);
  });
  homeFeedPage++;
  document.getElementById('home-load-more').style.display=homeFeedItems.length>homeFeedPage*HOME_PAGE_SIZE?'block':'none';
  // Ensure avatars are cached for all channels in this page
  const pageChIds=slice.map(i=>i._chId).filter(id=>id&&!chAvatarCache[id]&&!channelMeta[findChName(id)]?.thumb);
  if(pageChIds.length)fetchAndCacheAvatars(pageChIds);
}
function loadMoreHome(){
  if(homeFeedItems.length>homeFeedPage*HOME_PAGE_SIZE){
    renderHomePage();
  } else {
    renderHome();
  }
}

// ── VIDEO CARD CONTEXT MENU (three-dot ⋮) ──
function openVideoCtx(e,vid,title,channel,thumb,dur){
  e.preventDefault();e.stopPropagation();
  ctxData={vid,title,channel,thumb,dur};
  const menu=document.getElementById('ctx-menu');
  const inWL=isInWL(vid);
  const vd=JSON.stringify(vid);const vt=JSON.stringify(title);const vc=JSON.stringify(channel);
  const vth=JSON.stringify(thumb||'');const vdr=JSON.stringify(dur||'');
  // Build playlist sub-items
  const plItems=myPlaylists.map(pl=>{
    const inPl=pl.videos.some(v=>v.vid===vid);
    return`<div class="ctx-pl-item" onclick="closeCtx();addVideoToPlaylist('${esc(pl.id)}',${vd},${vt},${vc},${vth},${vdr})">
      <div class="ctx-pl-check${inPl?' checked':''}"></div>
      <span>${esc(pl.name)}</span>
    </div>`;
  }).join('');
  menu.innerHTML=`
    <div class="ctx-item" onclick="toggleWatchLaterCtx(${vd},${vt},${vc},${vth},${vdr})">
      <span class="ms">${inWL?'check_circle':'watch_later'}</span>
      <span style="color:${inWL?'#2eca6a':'inherit'}">${inWL?'Saved to Watch Later':'Save to Watch Later'}</span>
    </div>
    <div class="ctx-divider"></div>
    ${myPlaylists.length?`
    <div class="ctx-sub">
      <div class="ctx-sub-title">Add to playlist</div>
      ${plItems}
    </div>
    <div class="ctx-divider"></div>`:''}
    <div class="ctx-item" onclick="closeCtx();markNotInterested(${vd})">
      <span class="ms">not_interested</span>Not interested
    </div>`;
  menu.style.display='block';
  const rect=e.currentTarget.getBoundingClientRect();
  let x=rect.left,y=rect.bottom+4;
  menu.style.left=x+'px';menu.style.top=y+'px';
  requestAnimationFrame(()=>{
    const r=menu.getBoundingClientRect();
    const vw=window.innerWidth,vh=window.innerHeight;
    if(r.right>vw-8)menu.style.left=(x-r.width+32)+'px';
    if(r.bottom>vh-8)menu.style.top=(rect.top-r.height-4)+'px';
  });
}
function toggleWatchLaterCtx(vid,title,channel,thumb,dur){
  const inWL=isInWL(vid);
  if(inWL){
    watchLater=watchLater.filter(v=>v.vid!==vid);
    saveWL();
    showToast('Removed from Watch Later');
  }else{
    watchLater.unshift({vid,title,channel,thumb,dur:dur||'',ts:Date.now()});
    if(watchLater.length>500)watchLater=watchLater.slice(0,500);
    saveWL();
    showToast('Saved to Watch Later ✓');
  }
  // Update any visible three-dot menu btn icons if menu still open
  closeCtx();
}

// Chip context menu (hide/show channel)
function openChipMenu(e,name){
  e.preventDefault();e.stopPropagation();
  const menu=document.getElementById('ctx-menu');
  const h=isHidden(name);
  menu.innerHTML=`
    <div class="ctx-item" onclick="closeCtx();openChannel('${esc(name).replace(/'/g,"\\'")}')"><span class="ms">open_in_new</span>Open channel</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" onclick="closeCtx();toggleHideChannel('${esc(name).replace(/'/g,"\\'")}')">
      <span class="ms">${h?'visibility':'visibility_off'}</span>
      ${h?'Show in Home feed':'Hide from Home feed'}
    </div>`;
  menu.style.display='block';
  let x=e.clientX,y=e.clientY;
  menu.style.left=x+'px';menu.style.top=y+'px';
  requestAnimationFrame(()=>{
    const r=menu.getBoundingClientRect();
    const vw=window.innerWidth,vh=window.innerHeight;
    if(r.right>vw-8)menu.style.left=(x-r.width)+'px';
    if(r.bottom>vh-8)menu.style.top=(y-r.height)+'px';
  });
}

// ── FETCH ──
async function fetchUploads(chId,maxItems=50){
  try{
    let uplId=uploadCache[chId];
    if(!uplId){
      const ch=await api(`channels?part=contentDetails&id=${chId}`);
      uplId=ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if(uplId){uploadCache[chId]=uplId;saveLS(LS_UPLOAD,uploadCache)}
    }
    if(!uplId)return[];
    const d=await api(`playlistItems?part=snippet,contentDetails&playlistId=${uplId}&maxResults=${Math.min(maxItems,50)}`);
    return d.items||[];
  }catch(e){console.warn('fetchUploads',chId,e);return[]}
}
async function fetchVideoStats(vidIds){
  const map={};
  const unique=[...new Set(vidIds)].filter(Boolean);
  for(let i=0;i<unique.length;i+=50){
    try{
      const d=await api(`videos?part=statistics,contentDetails&id=${unique.slice(i,i+50).join(',')}`);
      (d.items||[]).forEach(v=>{map[v.id]={views:v.statistics?.viewCount||0,dur:v.contentDetails?.duration||''}});
    }catch(e){console.warn('stats fetch',e)}
  }
  return map;
}
function findChName(chId){return Object.keys(channelIds).find(k=>channelIds[k]===chId)||''}

// ── PINNED PLAYLISTS ──
function renderPinnedSection(){
  const sec=document.getElementById('pinned-section-wrap');
  const row=document.getElementById('pinned-pl-row');
  if(!pinnedPls.length){sec.style.display='none';return}
  sec.style.display='block';
  row.innerHTML=pinnedPls.map((pl,idx)=>`
    <div class="pinned-pl-card" onclick="openPinnedPlaylist('${esc(pl.plId)}','${esc(pl.title)}','${esc(pl.chName)}')">
      <div class="pinned-pl-thumb">
        ${pl.thumb
          ?`<img src="${esc(pl.thumb)}" alt="" loading="lazy"/>`
          :`<div class="pinned-pl-thumb-empty"><span class="ms">queue_music</span></div>`}

// ── VIDEO CARD ──
function videoCard(vid,title,channel,thumb,published,views,dur,meta,chId){
  const link=ytLink(vid);
  const durStr=fmtDur(dur||'');
  const viewStr=views?fmtViews(views)+' views':'';
  const dateStr=fmtDate(published);
  const vd=JSON.stringify(vid);const vt=JSON.stringify(title);const vc=JSON.stringify(channel);
  const vth=JSON.stringify(thumb||'');const vdr=JSON.stringify(dur||'');
  // data-hv/ht/hc/hi used by mousedown handler for reliable history saving
  return`<div class="vid-card" data-vid="${esc(vid)}">
    <a href="${link}" target="_blank" rel="noopener noreferrer"
      data-hv="${esc(vid)}" data-ht="${esc(title)}" data-hc="${esc(channel)}" data-hi="${esc(chId||'')}"
      style="display:block;text-decoration:none;color:inherit">
      <div class="vid-thumb-wrap">
        <img src="${esc(thumb||'')}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault')){this.src=this.src.replace('maxresdefault','hqdefault')}else{this.src=''}"/>
        ${durStr?`<span class="vid-duration">${esc(durStr)}</span>`:''}
      </div>
    </a>
    <div class="vid-info">
      ${avatarHtml(channel,meta,'vid-ch-avatar',chId||'')}
      <a href="${link}" target="_blank" rel="noopener noreferrer"
        data-hv="${esc(vid)}" data-ht="${esc(title)}" data-hc="${esc(channel)}" data-hi="${esc(chId||'')}"
        style="flex:1;min-width:0;text-decoration:none;color:inherit">
        <div class="vid-text">
          <div class="vid-title">${esc(title)}</div>
          <div class="vid-ch-name">${esc(channel)}</div>
          <div class="vid-meta">${[viewStr,dateStr].filter(Boolean).join(' · ')}</div>
        </div>
      </a>
      <button class="vid-menu-btn" title="More options"
        onclick="openVideoCtx(event,${vd},${vt},${vc},${vth},${vdr})">
        <span class="ms">more_vert</span>
      </button>
    </div>
  </div>`;
}

function searchCard(vid,title,channel,thumb,published,views,dur,meta,chId,chName){
  const link=ytLink(vid);
  const durStr=fmtDur(dur||'');
  const viewStr=views?fmtViews(views)+' views':'';
  const dateStr=fmtDate(published);
  const vd=JSON.stringify(vid);const vt=JSON.stringify(title);const vc=JSON.stringify(channel);
  const vth=JSON.stringify(thumb||'');const vdr=JSON.stringify(dur||'');
  // Channel link: if we have a known channel name use openChannel, else try to navigate by title
  const chNav=chName
    ?`openChannel('${esc(chName).replace(/'/g,"\\'")}')`
    :`openChannelByTitle('${esc(channel).replace(/'/g,"\\'")}')`;
  return`<div class="search-card" data-vid="${esc(vid)}">
    <a href="${link}" target="_blank" rel="noopener noreferrer"
      data-hv="${esc(vid)}" data-ht="${esc(title)}" data-hc="${esc(channel)}" data-hi="${esc(chId||'')}"
      style="display:block;text-decoration:none;flex-shrink:0">
      <div class="search-thumb" style="position:relative">
        <img src="${esc(thumb||'')}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault')){this.src=this.src.replace('maxresdefault','hqdefault')}else{this.src=''}"/>
        ${durStr?`<span class="search-dur">${esc(durStr)}</span>`:''}
      </div>
    </a>
    <div class="search-info">
      <a href="${link}" target="_blank" rel="noopener noreferrer"
        data-hv="${esc(vid)}" data-ht="${esc(title)}" data-hc="${esc(channel)}" data-hi="${esc(chId||'')}"
        style="text-decoration:none;color:inherit;display:contents">
        <div class="search-title">${esc(title)}</div>
        <div class="search-meta">${[viewStr,dateStr].filter(Boolean).join(' · ')}</div>
      </a>
      <div class="search-ch-row">
        ${avatarHtml(channel,meta,'search-ch-avatar',chId||'')}
        <span class="search-ch-name search-ch-link" onclick="event.stopPropagation();${chNav}" title="Open channel">${esc(channel)}</span>
      </div>
      <button class="vid-menu-btn" style="margin-top:6px;align-self:flex-start" title="More options"
        onclick="openVideoCtx(event,${vd},${vt},${vc},${vth},${vdr})">
        <span class="ms">more_vert</span>
      </button>
    </div>
  </div>`;
}
function searchPlaylistCard(pl,chName,meta){
  const safeTitle=esc(pl.title||'');const safeChName=esc(chName||pl.channelTitle||'');
  const chKey=chName||Object.keys(channelIds).find(k=>channelIds[k]===pl.channelId)||'';
  const chNav=chKey
    ?`openChannel('${esc(chKey).replace(/'/g,"\\'")}')`
    :`openChannelByTitle('${esc(pl.channelTitle||'').replace(/'/g,"\\'")}')`;
  return`<div class="search-pl-card" onclick="openSearchPlaylist('${esc(pl.id)}','${safeTitle.replace(/'/g,"\\'")}','${esc(chKey).replace(/'/g,"\\'")}')">
    <div class="search-pl-thumb">
      ${pl.thumb?`<img src="${esc(pl.thumb)}" alt="" loading="lazy"/>`:''}
      <div class="search-pl-overlay"><span>${pl.count}</span><span>videos</span></div>
    </div>
    <div class="search-pl-info">
      <div class="search-pl-title">${safeTitle}</div>
      <div class="search-meta" style="font-size:12px;color:var(--text3)">${pl.count} videos</div>
      <div class="search-ch-row">
        ${avatarHtml(chName||pl.channelTitle,meta,'search-ch-avatar',pl.channelId||'')}
        <span class="search-ch-name search-ch-link" onclick="event.stopPropagation();${chNav}" title="Open channel">${safeChName}</span>
      </div>
      <div class="search-pl-badge"><span class="ms sz16">queue_music</span>Playlist</div>
    </div>
  </div>`;
}
async function openSearchPlaylist(plId,plName,chName){
  if(chName&&channelIds[chName]){await openChannel(chName);chTab('playlists');setTimeout(()=>openChPlaylist(plId,plName),800)}
  else{
    // Hide all sections, show channel-page for playlist view
    ['search-section','history-section','myplaylists-section','watchlater-section'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.style.display='none';
    });
    document.getElementById('channel-page').style.display='block';
    document.getElementById('ch-banner-img').style.display='none';
    document.getElementById('ch-page-name').textContent=plName;
    document.getElementById('ch-page-handle').textContent='';
    document.getElementById('ch-page-subs').textContent='';
    document.getElementById('ch-tabs').style.display='none';
    document.getElementById('ch-home-panel').style.display='none';
    document.getElementById('ch-videos-panel').style.display='block';
    document.getElementById('ch-videos-panel').innerHTML=`<div class="vid-grid" id="pl-vid-grid"></div>`;
    document.getElementById('ch-playlists-panel').style.display='none';
    await loadPlaylistVideos(plId,null);
  }
}

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
