async function renderHome(){
  ytLoadStart();
  const chipsWrap=document.getElementById('home-chips-wrap');
  const feed=document.getElementById('home-feed');
  const feedTitle=document.getElementById('home-feed-title');

  chipsWrap.innerHTML='';
  renderPinnedSection();
  renderContinueWatching();

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
    // Fetch all channels in parallel instead of sequentially
    const results=await Promise.all(visibleIds.map(chId=>
      fetchUploads(chId,50).then(items=>{items.forEach(it=>{it._chId=chId});return items;}).catch(()=>[])
    ));
    allItems=results.flat();
    allItems=allItems.filter(i=>{
      const title=i.snippet?.title||'';
      const ch=i.snippet?.videoOwnerChannelTitle||i.snippet?.channelTitle||'';
      return!isShort(title)&&!notInterested.has(i.contentDetails?.videoId||i.snippet?.resourceId?.videoId)&&!isBlockedContent(title,ch);
    });
    if(!allItems.length){feed.innerHTML='<p style="color:var(--text3);padding:16px 0">No videos found.</p>';ytLoadEnd();return}
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
    if(homeFeedItems.length>HOME_PAGE_SIZE)document.getElementById('home-load-more').style.display='block';
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
  let batchHtml='';
  slice.forEach(item=>{
    const vid=item._vid;const s=item.snippet||{};const st=item._stats||{};
    const chName=findChName(item._chId||'');
    const meta=channelMeta[chName]||null;
    const thumb=bestThumb(s.thumbnails,vid);
    const title=s.title||'';
    const channel=s.videoOwnerChannelTitle||s.channelTitle||chName;
    batchHtml+=videoCard(vid,title,channel,thumb,s.publishedAt,st.views,st.dur,meta,item._chId);
    // Push notification if bell is on for this channel
    if(chName&&chNotifs[chName]){
      pushNotifFromFeed(vid,title,channel,thumb,meta?.thumb||'',new Date(s.publishedAt||Date.now()).getTime());
    }
  });
  grid.insertAdjacentHTML('beforeend',batchHtml);
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
    showTrNotif('watch_later','Saved to Watch Later');
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
        <div class="pinned-pl-count-badge">
          <span class="ms" style="font-size:18px;color:#fff">play_arrow</span>
          <span style="font-size:9px;color:#ccc">Play all</span>
        </div>
      </div>
      <div class="pinned-pl-info">
        <div class="pinned-pl-text">
          <div class="pinned-pl-title">${esc(pl.title)}</div>
          <div class="pinned-pl-ch">${esc(pl.chName)}</div>
        </div>
        <button class="pinned-pl-unpin" title="Unpin" onclick="event.stopPropagation();unpinPlaylist(${idx})">
          <span class="ms">close</span>
        </button>
      </div>
    </div>`).join('');
}
function togglePin(plId,title,thumb,chName){
  const idx=pinnedPls.findIndex(p=>p.plId===plId);
  if(idx>=0){pinnedPls.splice(idx,1);showToast('Playlist unpinned')}
  else{pinnedPls.push({plId,title,thumb,chName});showToast('Playlist pinned')}
  saveLS(LS_PINNED,pinnedPls);refreshPinBtns();renderPinnedSection();
}
function unpinPlaylist(idx){pinnedPls.splice(idx,1);saveLS(LS_PINNED,pinnedPls);renderPinnedSection();refreshPinBtns()}
function refreshPinBtns(){
  document.querySelectorAll('.pl-pin-btn').forEach(btn=>{
    const id=btn.dataset.plid;
    const p=pinnedPls.some(p=>p.plId===id);
    btn.classList.toggle('pinned',p);btn.textContent=p?'📌 Pinned':'📌 Pin';
  });
}
// ── STANDALONE YT-STYLE PLAYLIST VIEW ──
async function openYtPlaylist(plId,plName,backFn){
  navStack.push({type:'section',section:currentSection});
  ['search-section','history-section','myplaylists-section','watchlater-section'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  const cp=document.getElementById('channel-page');cp.style.display='block';
  // ── Hide all channel-specific UI — this page is a playlist, not a channel ──
  document.getElementById('ch-banner').style.display='none';
  document.getElementById('ch-banner-img').style.display='none';
  document.getElementById('ch-page-pfp').style.display='none';
  document.getElementById('ch-verified-badge').style.display='none';
  const subWrap=document.getElementById('ch-sub-wrap');if(subWrap)subWrap.style.display='none';
  const notifBtn=document.getElementById('ch-notif-btn');if(notifBtn)notifBtn.style.display='none';
  const hideBtn=document.getElementById('ch-hide-btn');if(hideBtn)hideBtn.style.display='none';
  document.getElementById('ch-page-handle').textContent='';
  document.getElementById('ch-page-subs').textContent='';
  document.getElementById('ch-page-vidcount').textContent='';
  document.getElementById('ch-page-name').textContent=plName||'Playlist';
  document.getElementById('ch-tabs').style.display='none';
  document.getElementById('ch-home-panel').style.display='none';
  document.getElementById('ch-playlists-panel').style.display='none';
  const panel=document.getElementById('ch-videos-panel');
  panel.style.display='block';
  panel.innerHTML=`<div style="color:var(--text3);text-align:center;padding:40px">Loading playlist…</div>`;
  cp.dataset.backFn='__ytpl_back__';
  window.__ytpl_backFn=backFn||function(){document.getElementById('channel-page').style.display='none';showSection(currentSection||'home');};
  ytLoadStart();
  try{
    const plData=await api(`playlists?part=snippet,contentDetails&id=${plId}`);
    const plInfo=plData.items?.[0];
    const thumb=plInfo?.snippet?.thumbnails?.maxres?.url||plInfo?.snippet?.thumbnails?.high?.url||plInfo?.snippet?.thumbnails?.medium?.url||'';
    const totalCount=plInfo?.contentDetails?.itemCount||0;
    const chTitle=plInfo?.snippet?.channelTitle||'';
    const resolvedName=plName||plInfo?.snippet?.title||'Playlist';
    document.getElementById('ch-page-name').textContent=resolvedName;
    panel.innerHTML=`
    <div class="pl-detail-wrap">
      <div class="pl-detail-sidebar">
        <div class="pl-detail-cover">
          ${thumb?`<img src="${esc(thumb)}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault')){this.src=this.src.replace('maxresdefault','hqdefault')}else{this.src=''}"/>`
            :`<div class="pl-detail-cover-empty"><span class="ms">queue_music</span></div>`}
        </div>
        <div class="pl-detail-info">
          <div class="pl-detail-name">${esc(resolvedName)}</div>
          <div class="pl-detail-meta">${esc(chTitle)}${totalCount?` · ${totalCount} videos`:''}</div>
          <div class="pl-detail-actions">
            <button class="pl-detail-play-btn" id="ytpl-play-btn"><span class="ms">play_arrow</span>Play all</button>
            <button class="pl-detail-shuffle-btn" id="ytpl-shuffle-btn"><span class="ms">shuffle</span></button>
          </div>
        </div>
      </div>
      <div class="pl-video-list">
        <div class="pl-video-list-header">
          <span class="pl-video-list-count">${totalCount?totalCount+' videos':'Loading…'}</span>
          <div class="pl-sort-bar">
            <span class="pl-sort-label"><span class="ms">sort</span>Sort:</span>
            <select class="pl-sort-select" id="ytpl-sort-select" onchange="sortYtPlaylistRows(this.value)">
              <option value="default" selected>Default order</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="views">Most viewed</option>
            </select>
          </div>
        </div>
        <div id="ytpl-video-rows"></div>
      </div>
    </div>`;
    await loadYtPlaylistVideos(plId,null,true);
  }catch(e){
    panel.innerHTML=`<p style="color:var(--text3);text-align:center;padding:40px">Error: ${esc(e.message)}</p>`;
    console.error(e);
  }finally{ytLoadEnd();}
}
async function loadYtPlaylistVideos(plId,token,fresh){
  const list=document.getElementById('ytpl-video-rows');if(!list)return;
  let url=`playlistItems?part=snippet,contentDetails&playlistId=${plId}&maxResults=50`;
  if(token)url+=`&pageToken=${token}`;
  const d=await api(url);
  const items=(d.items||[]).filter(i=>i.snippet.title!=='Private video'&&i.snippet.title!=='Deleted video');
  if(!items.length)return;
  const vids=items.map(i=>i.contentDetails.videoId).filter(Boolean).join(',');if(!vids)return;
  const stats=await api(`videos?part=statistics,contentDetails&id=${vids}`);
  const sm={};(stats.items||[]).forEach(v=>sm[v.id]={views:parseInt(v.statistics?.viewCount||0),dur:v.contentDetails?.duration||''});

  if(!list._ytplData)list._ytplData=[];
  let firstVid=null;

  items.forEach(item=>{
    const vid=item.contentDetails.videoId;const s=item.snippet;const st=sm[vid]||{};
    if(isShortDuration(st.dur||''))return;
    if(!firstVid)firstVid=vid;
    const thumb=bestThumb(s.thumbnails,vid);
    const pub=s.publishedAt?new Date(s.publishedAt).getTime():0;
    list._ytplData.push({vid,title:s.title||'',channel:s.videoOwnerChannelTitle||'',thumb,dur:st.dur||'',views:st.views||0,published:pub});
  });

  const sortSel=document.getElementById('ytpl-sort-select');
  renderYtPlaylistRows(list,sortSel?sortSel.value:'default');

  if(fresh&&firstVid){
    const playBtn=document.getElementById('ytpl-play-btn');
    if(playBtn)playBtn.onclick=()=>window.open(ytLink(firstVid),'_blank');
    const shuffleBtn=document.getElementById('ytpl-shuffle-btn');
    if(shuffleBtn)shuffleBtn.onclick=()=>{
      const data=list._ytplData||[];
      if(data.length){const r=data[Math.floor(Math.random()*data.length)];window.open(ytLink(r.vid),'_blank');}
    };
  }
  if(d.nextPageToken){
    const panel=document.getElementById('ch-videos-panel');
    const old=panel.querySelector('.ytpl-load-more');if(old)old.remove();
    const w=document.createElement('div');w.className='load-more-wrap ytpl-load-more';
    w.innerHTML=`<button class="load-more-btn" onclick="this.parentElement.remove();loadYtPlaylistVideos('${plId}','${d.nextPageToken}',false)">Load more videos</button>`;
    panel.appendChild(w);
  }
}

function fmtViewCount(n){
  if(!n)return'';
  if(n>=1000000)return(n/1000000).toFixed(1).replace(/\.0$/,'')+'M views';
  if(n>=1000)return(n/1000).toFixed(1).replace(/\.0$/,'')+'K views';
  return n+' views';
}
function fmtPublishedAge(ts){
  if(!ts)return'';
  const sec=Math.floor((Date.now()-ts)/1000);
  if(sec<60)return'just now';
  if(sec<3600)return Math.floor(sec/60)+' min ago';
  if(sec<86400)return Math.floor(sec/3600)+' hour'+(Math.floor(sec/3600)===1?'':'s')+' ago';
  const d=Math.floor(sec/86400);
  if(d<7)return d+' day'+(d===1?'':'s')+' ago';
  if(d<30)return Math.floor(d/7)+' week'+(Math.floor(d/7)===1?'':'s')+' ago';
  if(d<365)return Math.floor(d/30)+' month'+(Math.floor(d/30)===1?'':'s')+' ago';
  return Math.floor(d/365)+' year'+(Math.floor(d/365)===1?'':'s')+' ago';
}
function renderYtPlaylistRows(list,sort){
  if(!list)return;
  const data=[...(list._ytplData||[])];
  if(sort==='newest')data.sort((a,b)=>b.published-a.published);
  else if(sort==='oldest')data.sort((a,b)=>a.published-b.published);
  else if(sort==='views')data.sort((a,b)=>b.views-a.views);
  let html='';
  data.forEach((v,i)=>{
    const durStr=fmtDur(v.dur);
    const viewStr=fmtViewCount(v.views);
    const ageStr=fmtPublishedAge(v.published);
    const metaParts=[];if(viewStr)metaParts.push(viewStr);if(ageStr)metaParts.push(ageStr);
    const metaStr=metaParts.join(' • ');
    html+=`<a class="pl-video-row" href="${ytLink(v.vid)}" target="_blank" rel="noopener"
      data-hv="${esc(v.vid)}" data-ht="${esc(v.title)}" data-hc="${esc(v.channel)}" data-hi="">
      <div class="pl-video-num">${i+1}</div>
      <div class="pl-video-thumb">
        <img src="${esc(v.thumb)}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault')){this.src=this.src.replace('maxresdefault','hqdefault')}else{this.src=''}"/>
        ${durStr?`<span class="pl-video-dur">${esc(durStr)}</span>`:''}
      </div>
      <div class="pl-video-info">
        <div class="pl-video-title">${esc(v.title)}</div>
        <div class="pl-video-ch">${esc(v.channel)}</div>
        ${metaStr?`<div class="pl-video-meta">${esc(metaStr)}</div>`:''}
      </div>
    </a>`;
  });
  list.innerHTML=html;
}
function sortYtPlaylistRows(sort){
  renderYtPlaylistRows(document.getElementById('ytpl-video-rows'),sort);
}
async function openPinnedPlaylist(plId,plName,chName){
  openYtPlaylist(plId,plName,()=>showSection(currentSection||'home'));
}

// ── CHANNEL PAGE ──
