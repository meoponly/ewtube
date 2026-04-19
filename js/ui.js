// ── TOAST ──
let _toastTimer;
function showToast(msg){
  let t=document.getElementById('toast');
  if(!t){t=document.createElement('div');t.id='toast';t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#282828;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;pointer-events:none;opacity:0;transition:opacity .2s;box-shadow:0 4px 16px rgba(0,0,0,.5)';document.body.appendChild(t);}
  t.textContent=msg;t.style.opacity='1';
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{t.style.opacity='0'},2200);
}

// ── CONTEXT MENU ──
function closeCtx(){document.getElementById('ctx-menu').style.display='none';ctxData={}}
document.addEventListener('click',e=>{if(!e.target.closest('#ctx-menu'))closeCtx()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCtx()});



// ── SETUP ──
function initSetup(){
  document.body.classList.add('sb-unlocked');
  if(window._sbCollapsedPref)document.body.classList.add('sidebar-collapsed');
  renderSidebarChannels();
  showSection('home');
}
function addChannel(){
  const inp=document.getElementById('ch-input');
  if(!inp)return;
  const name=inp.value.trim();
  if(!name||channels.map(c=>c.toLowerCase()).includes(name.toLowerCase())){inp.value='';return}
  channels.push(name);saveLS(LS_CH,channels);inp.value='';
}
function removeChannel(i){channels.splice(i,1);saveLS(LS_CH,channels);}

function openAddChannelModal(){
  document.getElementById('add-channel-input').value='';
  document.getElementById('add-channel-status').textContent='';
  document.getElementById('add-channel-btn').disabled=false;
  document.getElementById('add-channel-btn').textContent='Add';
  document.getElementById('add-channel-modal').style.display='flex';
  setTimeout(()=>document.getElementById('add-channel-input').focus(),80);
}
function closeAddChannelModal(){document.getElementById('add-channel-modal').style.display='none'}
async function addChannelFromModal(){
  const inp=document.getElementById('add-channel-input');
  const status=document.getElementById('add-channel-status');
  const btn=document.getElementById('add-channel-btn');
  const name=inp.value.trim();
  if(!name)return;
  if(matchesBlockedKeyword(name)){
    status.textContent='🚫 This channel is blocked by a keyword.';status.style.color='#f44';return;
  }
  if(channels.map(c=>c.toLowerCase()).includes(name.toLowerCase())){
    status.textContent='Channel already added.';status.style.color='var(--text3)';return;
  }
  btn.disabled=true;btn.textContent='Resolving…';status.textContent='Looking up channel…';status.style.color='var(--text3)';
  channels.push(name);saveLS(LS_CH,channels);
  try{
    await resolveChannelIds(true);
    // After resolve, check if the resolved title is also blocked
    const resolvedTitle=channelMeta[name]?.title||'';
    if(matchesBlockedKeyword(resolvedTitle)){
      channels=channels.filter(c=>c!==name);saveLS(LS_CH,channels);
      closeAddChannelModal();
      showToast('🚫 This channel is blocked by a keyword.');
      return;
    }
    renderSidebarChannels();
    if(currentSection==='home')renderHome();
    closeAddChannelModal();
    showToast(`✓ "${name}" added to sidebar`);
  }catch(e){
    renderSidebarChannels();
    closeAddChannelModal();
    showToast(`Added "${name}" (resolve failed — add API key in Settings)`);
  }
}
async function resolveChannelIds(onlyUnresolved=false){
  const toResolve=onlyUnresolved?channels.filter(n=>!channelIds[n]):channels;
  for(const name of toResolve){
    try{
      let chId;
      // If the user typed a raw Channel ID (starts with UC and ~24 chars), use it directly
      if(/^UC[\w-]{20,}$/.test(name.trim())){
        chId=name.trim();
      }else{
        const d=await api(`search?part=snippet&type=channel&q=${encodeURIComponent(name)}&maxResults=1`);
        if(d.items?.[0]){
          chId=d.items[0].snippet.channelId||d.items[0].id.channelId;
        }
      }
      if(!chId){console.warn('resolve: no channel found for',name);continue;}
      channelIds[name]=chId;
      const full=await api(`channels?part=snippet,brandingSettings,statistics,contentDetails&id=${chId}`);
      if(full.items?.[0]){
        const ch=full.items[0];
        const bannerBase=ch.brandingSettings?.image?.bannerExternalUrl||'';
        channelMeta[name]={
          thumb:ch.snippet.thumbnails.high?.url||ch.snippet.thumbnails.medium?.url||ch.snippet.thumbnails.default?.url||'',
          subs:ch.statistics.subscriberCount||'0',handle:ch.snippet.customUrl||'',
          banner:bannerBase?bannerBase+'=w2560-nd-v1':'',
          title:ch.snippet.title||name
        };
        const uplId=ch.contentDetails?.relatedPlaylists?.uploads;
        if(uplId)uploadCache[chId]=uplId;
      }
    }catch(e){console.warn('resolve failed:',name,e)}
  }
  saveLS(LS_IDS,channelIds);saveLS(LS_META,channelMeta);saveLS(LS_UPLOAD,uploadCache);
}

// ── SIDEBAR ──
function renderSidebarChannels(){
  const el=document.getElementById('sb-channels');
  // Active channels sorted by affinity (most used first), hidden at the end
  const active=channels.filter(c=>!isHidden(c)).sort((a,b)=>(affinity[channelIds[b]]||0)-(affinity[channelIds[a]]||0));
  const hidden=channels.filter(c=>isHidden(c));
  const all=[...active,...hidden];
  el.innerHTML=all.map(c=>{
    const meta=channelMeta[c];
    const h=isHidden(c);
    return`<div class="sb-ch-item${h?' hidden-ch':''}" onclick="openChannel('${esc(c).replace(/'/g,"\\'")}')">
      ${avatarHtml(c,meta,'sb-ch-avatar')}
      <span class="sb-ch-name">${esc(meta?.title||c)}</span>
      ${h?'<span class="ms sz16" style="color:var(--text3);flex-shrink:0" title="Hidden from Home">visibility_off</span>':''}
      <button class="sb-ch-unsub-btn" onclick="event.stopPropagation();unsubscribeChannel('${esc(c).replace(/'/g,"\\'")}',this)" title="Unsubscribe">
        <span class="ms">do_not_disturb_on</span>
      </button>
    </div>`;
  }).join('');
}

// ── NAV ──
function showSection(s){
  const displaySection=s==='home'?'search':s;
  currentSection=displaySection;
  ['search-section','history-section','myplaylists-section','watchlater-section'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  document.getElementById('channel-page').style.display='none';
  document.querySelectorAll('.sb-item').forEach(el=>{
    const navId=el.id;
    const isActive=
      (navId==='nav-home'&&(s==='home'||s==='search'))||
      (navId==='nav-'+displaySection&&navId!=='nav-home');
    el.classList.toggle('active',isActive);
    const ms=el.querySelector('.ms');
    if(ms){if(isActive)ms.classList.add('filled');else ms.classList.remove('filled');}
  });
  if(displaySection==='search'){
    document.getElementById('search-section').style.display='block';
    if(s==='home'){
      // Show home feed, hide search results
      document.getElementById('home-feed-wrap').style.display='block';
      document.getElementById('search-results-wrap').style.display='none';
      renderHome();
    }else{
      // s==='search' — show search results, hide home feed
      document.getElementById('home-feed-wrap').style.display='none';
      document.getElementById('search-results-wrap').style.display='block';
      setTimeout(()=>document.getElementById('q')?.focus(),50);
    }
  }
  else if(displaySection==='history'){document.getElementById('history-section').style.display='block';renderHistory();renderSearchHistoryList();}
  else if(displaySection==='myplaylists'){document.getElementById('myplaylists-section').style.display='block';renderMyPlaylists();}
  else if(displaySection==='watchlater'){document.getElementById('watchlater-section').style.display='block';renderWatchLater();}
}

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
