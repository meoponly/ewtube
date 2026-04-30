async function openChannel(name){
  // Focus Mode: block viewing non-subscribed channels
  if(isFocusModeActive()&&!channels.includes(name)){
    showToast('🔒 Focus Mode: only subscribed channels visible');
    return;
  }
  ytLoadStart();
  navStack.push({type:'section',section:currentSection});
  currentChannelName=name;currentChTab='home';
  if(typeof updateURL==='function') updateURL('channel', {name});
  ['search-section','history-section','myplaylists-section','watchlater-section'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none'});
  document.getElementById('channel-page').style.display='block';
  document.querySelectorAll('.sb-item').forEach(el=>el.classList.remove('active'));

  // Reset all panels
  ['home','videos','playlists','featured','about'].forEach(p=>{
    const el=document.getElementById('ch-'+p+'-panel');
    if(el){el.innerHTML='';delete el.dataset.loaded;el.style.display=p==='home'?'':'none';}
  });
  plNextTokenMap[name]=null;

  const chId=channelIds[name];const meta=channelMeta[name]||{};
  // Restore elements that playlist view may have hidden
  const chPagePfp=document.getElementById('ch-page-pfp');if(chPagePfp)chPagePfp.style.display='';
  const subWrapEl=document.getElementById('ch-sub-wrap');if(subWrapEl)subWrapEl.style.display='';
  // Banner — show for ALL channels (subscribed + unsubscribed temp)
  const bannerImg=document.getElementById('ch-banner-img');
  const chBanner=document.getElementById('ch-banner');
  chBanner.style.display='';
  if(meta.banner){
    bannerImg.src=meta.banner;bannerImg.style.display='block';
    chBanner.style.background='none';
  } else {
    bannerImg.style.display='none';
    // Gradient fallback based on channel initials color
    chBanner.style.background='linear-gradient(135deg,var(--surface2),var(--surface))';
  }
  const pfpImg=document.getElementById('ch-page-pfp-img');const initEl=document.getElementById('ch-page-initials');
  if(meta.thumb){pfpImg.src=meta.thumb;pfpImg.style.display='block';initEl.style.display='none'}
  else{pfpImg.style.display='none';initEl.style.display='';initEl.textContent=(meta.title||name).slice(0,2).toUpperCase()}
  document.getElementById('ch-page-name').textContent=meta.title||name;
  document.getElementById('ch-page-handle').textContent=meta.handle?`@${meta.handle.replace('@','')}`:''
  document.getElementById('ch-page-subs').textContent=meta.subs?fmtSubs(meta.subs):'';
  document.getElementById('ch-page-vidcount').textContent='';

  // Verified badge
  const verBadge=document.getElementById('ch-verified-badge');
  if(verBadge)verBadge.style.display=meta.verified?'flex':'none';

  // Subscribe button
  const isSubscribed=channels.includes(name);
  const subBtn=document.getElementById('ch-subscribe-btn');
  const subLabel=document.getElementById('ch-subscribe-label');
  if(subBtn){
    subBtn.classList.toggle('subscribed',isSubscribed);
    subLabel.textContent=isSubscribed?'Subscribed':'Subscribe';
    subBtn.style.display='';
  }
  // Notif bell on channel page
  const notifBtn=document.getElementById('ch-notif-btn');
  const notifIcon=document.getElementById('ch-notif-icon');
  if(notifBtn){
    notifBtn.style.display=isSubscribed?'flex':'none';
    const on=!!chNotifs[name];
    notifBtn.classList.toggle('notif-on',on);
    if(notifIcon)notifIcon.textContent=on?'notifications':'notifications_none';
  }

  document.getElementById('ch-tabs').style.display='flex';
  // Reset all tabs to Home
  document.querySelectorAll('.ch-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='home'));
  currentChTab='home';
  updateChHideBtn(name);
  if(!chId){document.getElementById('ch-home-panel').innerHTML='<p style="color:var(--text3);text-align:center;padding:40px">Channel ID not resolved. Add an API key in Settings.</p>';ytLoadEnd();return}
  currentChannelId=chId;vidNextToken=null;chUploadPlId=null;
  const _openToken=++_chOpenToken;
  window._chOpenToken=_openToken;
  loadChHomeTab(_openToken);
}
async function loadChannelVideos(fresh){
  ytLoadStart();
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
    let batchHtml='';
    filtered.forEach(item=>{
      const vid=item.contentDetails.videoId;const s=item.snippet;const st=sm[vid]||{};
      const meta=channelMeta[currentChannelName]||null;
      const thumb=bestThumb(s.thumbnails,vid);
      batchHtml+=videoCard(vid,s.title,s.videoOwnerChannelTitle||currentChannelName,thumb,s.publishedAt,st.views,st.dur,meta,currentChannelId);
    });
    grid.insertAdjacentHTML('beforeend',batchHtml);
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
  document.querySelectorAll('.ch-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  const panels=['home','videos','playlists','about'];
  panels.forEach(p=>{ const el=document.getElementById('ch-'+p+'-panel'); if(el)el.style.display=p===tab?'':'none'; });

  if(tab==='videos'&&!document.getElementById('ch-vid-grid')){
    vidNextToken=null;chUploadPlId=null;loadChannelVideos(true);
  }
  if(tab==='playlists'&&!document.getElementById('ch-playlists-panel').dataset.loaded){
    loadPlaylists(false);
  }
  if(tab==='about'&&!document.getElementById('ch-about-panel').dataset.loaded){
    loadChAbout();
  }
  if(tab==='home'&&!document.getElementById('ch-home-panel').dataset.loaded){
    loadChHomeTab();
  }
}

async function loadChHomeTab(loadToken){
  if(loadToken!==undefined&&loadToken!==window._chOpenToken)return; // stale — a newer channel was opened
  const panel=document.getElementById('ch-home-panel');
  panel.dataset.loaded='1';
  panel.innerHTML=`<div class="ch-home-loading">
    <span class="ms" style="font-size:36px;animation:spin 1s linear infinite;color:var(--accent)">progress_activity</span>
    <span>Loading channel…</span>
  </div>`;

  try{
    // ── 1. Fetch all channel data in parallel ──
    const [chData, plData] = await Promise.all([
      api(`channels?part=snippet,statistics,brandingSettings,contentDetails&id=${currentChannelId}`),
      api(`playlists?part=snippet,contentDetails&channelId=${currentChannelId}&maxResults=8`).catch(()=>({items:[]}))
    ]);

    const ch=chData.items?.[0]||{};
    const sn=ch.snippet||{};
    const st=ch.statistics||{};
    const br=ch.brandingSettings?.channel||{};
    const meta=channelMeta[currentChannelName]||{};

    // Cache upload playlist ID
    const uplId=ch.contentDetails?.relatedPlaylists?.uploads;
    if(uplId){uploadCache[currentChannelId]=uplId;chUploadPlId=uplId;saveLS(LS_UPLOAD,uploadCache);}

    // Update header stats from fresh API data
    const freshSubs=st.subscriberCount&&!st.hiddenSubscriberCount?fmtSubs(st.subscriberCount):'';
    const freshVids=st.videoCount?parseInt(st.videoCount).toLocaleString()+' videos':'';
    if(freshSubs)document.getElementById('ch-page-subs').textContent=freshSubs;
    if(freshVids)document.getElementById('ch-page-vidcount').textContent=freshVids;

    // Trailer video ID (from brandingSettings)
    const trailerId=br.unsubscribedTrailer||meta.trailer||'';
    // Description
    const desc=sn.description||'';
    // Country / joined
    const country=sn.country||'';
    const joined=sn.publishedAt?new Date(sn.publishedAt).toLocaleDateString('en-US',{year:'numeric',month:'long'}):'';
    // Featured channels IDs from brandingSettings
    const featuredIds=br.featuredChannelsUrls||[];
    // Keywords
    const kws=(br.keywords||'').replace(/"/g,'').split(/\s+/).filter(Boolean).slice(0,8);

    let html='';

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION B — Featured Video / Trailer
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if(trailerId){
      html+=`<div class="ch-home-section">
        <div class="ch-home-section-hdr">
          <span class="ms ch-home-section-icon">play_circle</span>
          <span class="ch-home-section-title">Featured Video</span>
        </div>
        <div class="ch-trailer-card" onclick="window.open('https://www.youtube.com/watch?v=${esc(trailerId)}','_blank')">
          <div class="ch-trailer-card-thumb">
            <img src="https://i.ytimg.com/vi/${esc(trailerId)}/mqdefault.jpg" alt="" onerror="this.src='https://i.ytimg.com/vi/${esc(trailerId)}/hqdefault.jpg'"/>
            <div class="ch-trailer-card-play"><span class="ms">play_circle</span></div>
          </div>
          <div class="ch-trailer-card-info" id="ch-trailer-aside">
            <div class="ch-trailer-aside-loading"><span class="ms" style="font-size:20px;color:var(--text3)">hourglass_empty</span><span style="font-size:13px;color:var(--text3)">Loading…</span></div>
          </div>
        </div>
      </div>`;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION C — Latest Videos (first 6)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    html+=`<div class="ch-home-section">
      <div class="ch-home-section-hdr">
        <span class="ms ch-home-section-icon">video_library</span>
        <span class="ch-home-section-title">Latest Videos</span>
        <button class="ch-section-see-all" onclick="chTab('videos')">See all <span class="ms sz16">chevron_right</span></button>
      </div>
      <div id="ch-home-vids" class="ch-home-vids-grid skeleton-fade">${skelVidGrid(6)}</div>
    </div>`;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION D — Playlists preview
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const plItems=(plData.items||[]).filter(pl=>pl.snippet?.title&&pl.contentDetails?.itemCount>0);
    if(plItems.length){
      const plCards=plItems.slice(0,4).map(pl=>{
        const thumb=pl.snippet.thumbnails?.medium?.url||pl.snippet.thumbnails?.default?.url||'';
        const count=pl.contentDetails?.itemCount||0;
        const safePlTitle=esc(pl.snippet.title);
        return`<div class="ch-home-pl-card" onclick="chTab('playlists');setTimeout(()=>openChPlaylist('${esc(pl.id)}','${safePlTitle.replace(/'/g,"\\'")}'),120)">
          <div class="ch-home-pl-thumb">
            ${thumb?`<img src="${esc(thumb)}" alt="" loading="lazy"/>`:'<div class="ch-home-pl-thumb-blank"></div>'}
            <div class="ch-home-pl-count"><span class="ms sz14">queue_play_next</span>${count}</div>
          </div>
          <div class="ch-home-pl-info">
            <div class="ch-home-pl-title">${safePlTitle}</div>
            <div class="ch-home-pl-sub">${count} video${count!==1?'s':''}</div>
          </div>
        </div>`;
      }).join('');
      html+=`<div class="ch-home-section">
        <div class="ch-home-section-hdr">
          <span class="ms ch-home-section-icon">playlist_play</span>
          <span class="ch-home-section-title">Playlists</span>
          <button class="ch-section-see-all" onclick="chTab('playlists')">See all <span class="ms sz16">chevron_right</span></button>
        </div>
        <div class="ch-home-pl-row">${plCards}</div>
      </div>`;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION E — Featured Channels preview (up to 6)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if(featuredIds.length){
      html+=`<div class="ch-home-section">
        <div class="ch-home-section-hdr">
          <span class="ms ch-home-section-icon">group</span>
          <span class="ch-home-section-title">Featured Channels</span>

        </div>
        <div class="ch-home-feat-ch-row" id="ch-home-feat-ch-row">
          ${featuredIds.slice(0,12).map(()=>`<div class="ch-home-feat-ch-skel"></div>`).join('')}
        </div>
      </div>`;
    }

    panel.innerHTML=html;

    // ── Now load async data ──

    // Load trailer video details
    if(trailerId){
      api(`videos?part=snippet,statistics&id=${trailerId}`).then(vd=>{
        const v=vd.items?.[0];const aside=document.getElementById('ch-trailer-aside');
        if(!v||!aside)return;
        const vs=v.snippet||{};const vst=v.statistics||{};
        aside.innerHTML=`<div class="ch-trailer-aside-info">
          <div class="ch-trailer-aside-title">${esc(vs.title||'')}</div>
          <div class="ch-trailer-aside-meta">
            ${vst.viewCount?`<span><span class="ms sz14">visibility</span>${fmtViews(vst.viewCount)} views</span>`:''}
            ${vs.publishedAt?`<span><span class="ms sz14">calendar_today</span>${new Date(vs.publishedAt).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</span>`:''}
          </div>
          ${vs.description?`<div class="ch-trailer-aside-desc">${esc(vs.description.slice(0,220))}${vs.description.length>220?'…':''}</div>`:''}
        </div>`;
      }).catch(()=>{const a=document.getElementById('ch-trailer-aside');if(a)a.innerHTML='';});
    }

    // Load latest videos
    if(chUploadPlId){
      api(`playlistItems?part=snippet,contentDetails&playlistId=${chUploadPlId}&maxResults=12`).then(async d=>{
        const items=(d.items||[]).filter(i=>i.snippet.title!=='Private video'&&i.snippet.title!=='Deleted video');
        const vids=items.map(i=>i.contentDetails.videoId).filter(Boolean).join(',');
        if(!vids)return;
        const stats=await api(`videos?part=statistics,contentDetails&id=${vids}`);
        const sm={};(stats.items||[]).forEach(v=>sm[v.id]={views:v.statistics?.viewCount||0,dur:v.contentDetails?.duration||''});
        const grid=document.getElementById('ch-home-vids');
        if(!grid)return;
        const filtered=items.filter(i=>!isShortDuration(sm[i.contentDetails.videoId]?.dur||'')).slice(0,6);
        grid.classList.remove('skeleton-fade');
        if(!filtered.length){grid.innerHTML='<p style="color:var(--text3);font-size:14px">No videos found.</p>';return;}
        const meta2=channelMeta[currentChannelName]||null;
        grid.innerHTML=`<div class="vid-grid">${filtered.map(item=>{
          const vid=item.contentDetails.videoId;const s=item.snippet;const st=sm[vid]||{};
          return videoCard(vid,s.title,s.videoOwnerChannelTitle||currentChannelName,bestThumb(s.thumbnails,vid),s.publishedAt,st.views,st.dur,meta2,currentChannelId);
        }).join('')}</div>`;
      }).catch(e=>console.error(e));
    }

    // Load featured channel avatars
    if(featuredIds.length){
      api(`channels?part=snippet,statistics&id=${featuredIds.slice(0,12).join(',')}`).then(fd=>{
        const fcRow=document.getElementById('ch-home-feat-ch-row');if(!fcRow)return;
        const fcItems=fd.items||[];
        fcRow.innerHTML=fcItems.map(fc=>{
          const fcsn=fc.snippet||{};const fcst=fc.statistics||{};
          const fcId=fc.id;const fcTitle=fcsn.title||'';
          const fcThumb=fcsn.thumbnails?.high?.url||fcsn.thumbnails?.medium?.url||fcsn.thumbnails?.default?.url||'';
          const fcSubs=fcst.subscriberCount&&!fcst.hiddenSubscriberCount?fmtSubs(fcst.subscriberCount):'';
          const fcInit=fcTitle.slice(0,2).toUpperCase();
          const matchName=channels.find(c=>channelIds[c]===fcId)||null;
          const onclick=matchName?`openChannel('${esc(matchName).replace(/'/g,"\\'")}')`:
            `openChannelByTitle('${esc(fcTitle).replace(/'/g,"\\'")}')`;
          return`<div class="ch-home-feat-ch-card" onclick="${onclick}">
            <div class="ch-home-feat-ch-av">${fcThumb?`<img src="${esc(fcThumb)}" alt="" onerror="this.style.display='none'"/>`:''}<span style="${fcThumb?'display:none':''}">${esc(fcInit)}</span></div>
            <div class="ch-home-feat-ch-name">${esc(fcTitle)}</div>
            ${fcSubs?`<div class="ch-home-feat-ch-subs">${esc(fcSubs)}</div>`:''}
          </div>`;
        }).join('');
      }).catch(()=>{});
    }

  }catch(e){
    panel.innerHTML=`<div class="ch-home-loading" style="color:var(--text3)"><span class="ms" style="font-size:32px">error_outline</span><span>${esc(e.message)}</span></div>`;
    console.error(e);
  }
  ytLoadEnd();
}

// ── FEATURED CHANNELS TAB ──
async function loadChFeatured(){
  const panel=document.getElementById('ch-featured-panel');
  panel.dataset.loaded='1';
  const meta=channelMeta[currentChannelName]||{};

  // Show channels already in meta.featuredChannels (from resolve)
  if(meta.featuredChannels&&meta.featuredChannels.length){
    renderFeaturedChannels(panel,meta.featuredChannels);
    return;
  }

  // Try to fetch featured channels from brandingSettings
  panel.innerHTML=`<div style="color:var(--text3);text-align:center;padding:48px;display:flex;flex-direction:column;align-items:center;gap:10px">
    <span class="ms" style="font-size:36px">group</span>
    <span style="font-size:14px">Loading featured channels…</span>
  </div>`;
  try{
    const d=await api(`channels?part=brandingSettings&id=${currentChannelId}`);
    const featured=d.items?.[0]?.brandingSettings?.channel?.featuredChannelsUrls||[];
    if(!featured.length){
      panel.innerHTML=`<div class="ch-community-empty">
        <span class="ms" style="font-size:56px;color:var(--text3)">group</span>
        <div class="ch-community-empty-title">No featured channels</div>
        <div style="font-size:13px;color:var(--text3);margin-top:4px">This channel hasn't featured any channels yet.</div>
      </div>`;
      return;
    }
    // Fetch details for each featured channel
    const chunks=[];for(let i=0;i<featured.length;i+=50)chunks.push(featured.slice(i,i+50));
    let chItems=[];
    for(const chunk of chunks){
      const r=await api(`channels?part=snippet,statistics&id=${chunk.join(',')}`);
      chItems=chItems.concat(r.items||[]);
    }
    renderFeaturedChannelItems(panel,chItems);
  }catch(e){
    panel.innerHTML=`<div class="ch-community-empty">
      <span class="ms" style="font-size:56px;color:var(--text3)">group_off</span>
      <div class="ch-community-empty-title">Couldn't load featured channels</div>
      <div style="font-size:13px;color:var(--text3);margin-top:4px">${esc(e.message)}</div>
    </div>`;
  }
}

function renderFeaturedChannelItems(panel,items){
  if(!items.length){
    panel.innerHTML=`<div class="ch-community-empty">
      <span class="ms" style="font-size:56px;color:var(--text3)">group</span>
      <div class="ch-community-empty-title">No featured channels</div>
    </div>`;return;
  }
  const cards=items.map(ch=>{
    const sn=ch.snippet||{};const st=ch.statistics||{};
    const chId=ch.id||'';
    const title=sn.title||'';
    const thumb=sn.thumbnails?.high?.url||sn.thumbnails?.medium?.url||sn.thumbnails?.default?.url||'';
    const subs=st.subscriberCount?fmtSubs(st.subscriberCount):'';
    const vidCount=st.videoCount?parseInt(st.videoCount).toLocaleString()+' videos':'';
    const initials=title.slice(0,2).toUpperCase();
    // Try to match to a subscribed channel
    const matchName=channels.find(c=>channelIds[c]===chId)||null;
    const isSub=!!matchName;
    return`<div class="ch-feat-full-card" onclick="${matchName?`openChannel('${esc(matchName).replace(/'/g,"\\'")}')`:''}" style="${matchName?'cursor:pointer':''}">
      <div class="ch-feat-full-av">${thumb?`<img src="${esc(thumb)}" alt="" onerror="this.style.display='none'"/>`:''}
        <span style="${thumb?'display:none':''}">${esc(initials)}</span>
      </div>
      <div class="ch-feat-full-info">
        <div class="ch-feat-full-name">${esc(title)}</div>
        <div class="ch-feat-full-meta">${[subs?subs+' subscribers':'',vidCount].filter(Boolean).join(' · ')}</div>
      </div>
      ${isSub
        ?`<button class="ch-search-sub-btn subscribed" style="flex-shrink:0" onclick="event.stopPropagation();toggleSearchChSub('${esc(matchName||'')}',this)">Subscribed</button>`
        :`<a href="https://www.youtube.com/channel/${esc(chId)}" target="_blank" rel="noopener" class="ch-search-sub-btn" style="text-decoration:none;flex-shrink:0">View</a>`}
    </div>`;
  }).join('');
  panel.innerHTML=`<div class="ch-feat-full-grid">${cards}</div>`;
}

function renderFeaturedChannels(panel,chKeys){
  const items=chKeys.map(k=>{
    const m=channelMeta[k]||{};
    return{id:channelIds[k]||'',snippet:{title:m.title||k,thumbnails:{high:{url:m.thumb||''}}},statistics:{subscriberCount:m.subs||''},_key:k};
  });
  renderFeaturedChannelItems(panel,items);
}

async function loadChAbout(){
  const panel=document.getElementById('ch-about-panel');
  panel.dataset.loaded='1';
  panel.innerHTML=`<div style="color:var(--text3);text-align:center;padding:48px;display:flex;flex-direction:column;align-items:center;gap:10px">
    <span class="ms" style="font-size:36px">info</span>
    <span style="font-size:14px">Loading about…</span>
  </div>`;
  try{
    const d=await api(`channels?part=snippet,statistics,brandingSettings,topicDetails&id=${currentChannelId}`);
    const ch=d.items?.[0];if(!ch){panel.innerHTML='<p style="color:var(--text3);padding:24px">No info available.</p>';return;}
    const sn=ch.snippet||{};const st=ch.statistics||{};const br=ch.brandingSettings?.channel||{};
    const desc=sn.description||'';
    const country=sn.country||'';
    const joined=sn.publishedAt?new Date(sn.publishedAt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}):'';
    const totalViews=st.viewCount?parseInt(st.viewCount).toLocaleString():'';
    const subs=st.subscriberCount?fmtSubs(st.subscriberCount):'';
    const hideSubs=st.hiddenSubscriberCount;
    const vidCount=st.videoCount?parseInt(st.videoCount).toLocaleString():'';
    const kws=(br.keywords||'').replace(/"/g,'').split(/\s+/).filter(Boolean);
    const links=(br.unsubscribedTrailer)?[]:([]); // placeholder
    // Update page meta with fresh data
    if(subs&&!hideSubs){document.getElementById('ch-page-subs').textContent=subs+' subscribers';}
    if(vidCount){document.getElementById('ch-page-vidcount').textContent=vidCount+' videos';}

    panel.innerHTML=`<div class="ch-about-wrap">
      ${desc?`<div class="ch-about-section">
        <div class="ch-about-label">Description</div>
        <div class="ch-about-text ch-about-desc" id="ch-about-desc-text">${esc(desc)}</div>
        ${desc.length>300?`<button class="ch-about-expand-btn" onclick="this.previousElementSibling.classList.toggle('expanded');this.textContent=this.previousElementSibling.classList.contains('expanded')?'Show less':'Show more'">Show more</button>`:''}
      </div>`:''}
      <div class="ch-about-section">
        <div class="ch-about-label">Stats</div>
        <div class="ch-about-stats-grid">
          ${joined?`<div class="ch-about-stat-card"><span class="ms">calendar_today</span><div><div class="ch-stat-value">${esc(joined)}</div><div class="ch-stat-label">Joined</div></div></div>`:''}
          ${totalViews?`<div class="ch-about-stat-card"><span class="ms">visibility</span><div><div class="ch-stat-value">${esc(totalViews)}</div><div class="ch-stat-label">Total views</div></div></div>`:''}
          ${!hideSubs&&subs?`<div class="ch-about-stat-card"><span class="ms">people</span><div><div class="ch-stat-value">${esc(subs)}</div><div class="ch-stat-label">Subscribers</div></div></div>`:''}
          ${vidCount?`<div class="ch-about-stat-card"><span class="ms">play_circle</span><div><div class="ch-stat-value">${esc(vidCount)}</div><div class="ch-stat-label">Videos</div></div></div>`:''}
          ${country?`<div class="ch-about-stat-card"><span class="ms">location_on</span><div><div class="ch-stat-value">${esc(country)}</div><div class="ch-stat-label">Country</div></div></div>`:''}
        </div>
      </div>
      ${kws.length?`<div class="ch-about-section">
        <div class="ch-about-label">Keywords</div>
        <div class="ch-about-keywords">${kws.slice(0,20).map(k=>`<span class="ch-kw-chip">${esc(k)}</span>`).join('')}</div>
      </div>`:''}
      <div class="ch-about-section">
        <div class="ch-about-label">Links</div>
        <a href="https://www.youtube.com/channel/${esc(currentChannelId)}" target="_blank" rel="noopener" class="ch-about-link">
          <span class="ms sz16">open_in_new</span>View on YouTube
        </a>
      </div>
    </div>`;
  }catch(e){panel.innerHTML=`<p style="color:var(--text3);padding:24px">Failed to load: ${esc(e.message)}</p>`;}
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
    let batchPls='';
    items.forEach(pl=>{
      const thumb=pl.snippet.thumbnails.medium?.url||pl.snippet.thumbnails.default?.url||'';
      const count=pl.contentDetails?.itemCount||0;
      const safeTitle=esc(pl.snippet.title);
      const isPinned=pinnedPls.some(p=>p.plId===pl.id);
      batchPls+=`<div class="pl-card" onclick="openChPlaylist('${pl.id}','${safeTitle.replace(/'/g,"\'")}')">
        <div class="pl-thumb-wrap">
          ${thumb?`<img src="${thumb}" alt="" loading="lazy"/>`:''}
          <div class="pl-count-badge"><span>${count}</span><span>videos</span></div>
          <button class="pl-pin-btn ${isPinned?'pinned':''}" data-plid="${pl.id}"
            onclick="event.stopPropagation();togglePin('${pl.id}','${safeTitle.replace(/'/g,"\'")}','${esc(thumb)}','${esc(currentChannelName)}')"
          >${isPinned?'📌 Pinned':'📌 Pin'}</button>
        </div>
        <div class="pl-info">
          <div class="pl-title">${safeTitle}</div>
          <div class="pl-sub">Playlist · ${count} videos</div>
        </div>
      </div>`;
    });
    grid.insertAdjacentHTML('beforeend',batchPls);
    if(plNextTokenMap[currentChannelName]){
      const w=document.createElement('div');w.className='load-more-wrap';
      w.innerHTML=`<button class="load-more-btn" onclick="loadPlaylists(true)">Load more playlists</button>`;
      panel.appendChild(w);
    }
    panel.dataset.loaded='1';
  }catch(e){if(!append)panel.innerHTML=`<p style="color:var(--text3);text-align:center;padding:40px">${esc(e.message)}</p>`;console.error(e)}
}

async function openChPlaylist(plId,plName){
  if(typeof updateURL==='function') updateURL('playlist', {id:plId, name:plName, ch:currentChannelName});
  const panel=document.getElementById('ch-playlists-panel');
  panel.innerHTML=`<button class="load-more-btn" style="margin-bottom:18px;display:inline-flex;align-items:center;gap:6px" onclick="loadPlaylists(false)"><span class="ms" style="font-size:18px">arrow_back</span> All Playlists</button>
    <div id="ch-pl-detail-wrap"><div style="color:var(--text3);text-align:center;padding:40px">Loading playlist…</div></div>`;
  ytLoadStart();
  try{
    const plData=await api(`playlists?part=snippet,contentDetails&id=${plId}`);
    const plInfo=plData.items?.[0];
    const thumb=plInfo?.snippet?.thumbnails?.maxres?.url||plInfo?.snippet?.thumbnails?.high?.url||plInfo?.snippet?.thumbnails?.medium?.url||'';
    const totalCount=plInfo?.contentDetails?.itemCount||0;
    const chTitle=plInfo?.snippet?.channelTitle||plName||'';
    const resolvedName=plName||plInfo?.snippet?.title||'Playlist';
    const detailWrap=document.getElementById('ch-pl-detail-wrap');
    detailWrap.innerHTML=`
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
            <button class="pl-detail-play-btn" id="ch-pl-play-btn"><span class="ms">play_arrow</span>Play all</button>
            <button class="pl-detail-shuffle-btn" id="ch-pl-shuffle-btn"><span class="ms">shuffle</span></button>
          </div>
        </div>
      </div>
      <div class="pl-video-list" id="ch-pl-video-list">
        <div class="pl-video-list-header">
          <span class="pl-video-list-count">${totalCount?totalCount+' videos':'Loading…'}</span>
        </div>
        <div id="pl-vid-rows"></div>
      </div>
    </div>`;
    await loadPlaylistVideos(plId,null,true);
  }catch(e){
    const w=document.getElementById('ch-pl-detail-wrap');
    if(w)w.innerHTML=`<p style="color:var(--text3);text-align:center;padding:40px">Error: ${esc(e.message)}</p>`;
    console.error(e);
  }finally{ytLoadEnd();}
}
async function loadPlaylistVideos(plId,token,fresh){
  const list=document.getElementById('pl-vid-rows');if(!list)return;
  let url=`playlistItems?part=snippet,contentDetails&playlistId=${plId}&maxResults=50`;
  if(token)url+=`&pageToken=${token}`;
  const d=await api(url);
  const items=(d.items||[]).filter(i=>i.snippet.title!=='Private video'&&i.snippet.title!=='Deleted video');
  if(!items.length)return;
  const vids=items.map(i=>i.contentDetails.videoId).filter(Boolean).join(',');if(!vids)return;
  const stats=await api(`videos?part=statistics,contentDetails&id=${vids}`);
  const sm={};(stats.items||[]).forEach(v=>sm[v.id]={views:v.statistics?.viewCount||0,dur:v.contentDetails?.duration||''});
  let rowNum=list.querySelectorAll('.pl-video-row').length;
  let firstVid=null;
  let batchRows2='';
  items.forEach(item=>{
    const vid=item.contentDetails.videoId;const s=item.snippet;const st=sm[vid]||{};
    if(isShortDuration(st.dur||''))return;
    rowNum++;
    if(!firstVid)firstVid=vid;
    const thumb=bestThumb(s.thumbnails,vid);
    const durStr=fmtDur(st.dur||'');
    batchRows2+=`<a class="pl-video-row" href="${ytLink(vid)}" target="_blank" rel="noopener"
      data-hv="${esc(vid)}" data-ht="${esc(s.title||'')}" data-hc="${esc(s.videoOwnerChannelTitle||currentChannelName||'')}" data-hi="">
      <div class="pl-video-num">${rowNum}</div>
      <div class="pl-video-thumb">
        <img src="${esc(thumb)}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault')){this.src=this.src.replace('maxresdefault','hqdefault')}else{this.src=''}"/>
        ${durStr?`<span class="pl-video-dur">${esc(durStr)}</span>`:''}
      </div>
      <div class="pl-video-info">
        <div class="pl-video-title">${esc(s.title||'')}</div>
        <div class="pl-video-ch">${esc(s.videoOwnerChannelTitle||currentChannelName||'')}</div>
      </div>
    </a>`;
  });
  list.insertAdjacentHTML('beforeend',batchRows2);
  if(fresh&&firstVid){
    const playBtn=document.getElementById('ch-pl-play-btn');
    if(playBtn)playBtn.onclick=()=>window.open(ytLink(firstVid),'_blank');
    const shuffleBtn=document.getElementById('ch-pl-shuffle-btn');
    if(shuffleBtn)shuffleBtn.onclick=()=>{
      const rows=[...list.querySelectorAll('.pl-video-row')];
      if(rows.length){const r=rows[Math.floor(Math.random()*rows.length)];window.open(r.href,'_blank');}
    };
  }
  if(d.nextPageToken){
    const panel=document.getElementById('ch-playlists-panel');
    const old=panel.querySelector('.pl-load-more');if(old)old.remove();
    const w=document.createElement('div');w.className='load-more-wrap pl-load-more';
    w.innerHTML=`<button class="load-more-btn" onclick="this.parentElement.remove();loadPlaylistVideos('${plId}','${d.nextPageToken}',false)">Load more videos</button>`;
    panel.appendChild(w);
  }
}

// ── BACK ──
function goBack(){
  const cp=document.getElementById('channel-page');
  if(cp.dataset.backFn==='__ytpl_back__'){
    cp.dataset.backFn='';
    cp.style.display='none';
    if(typeof window.__ytpl_backFn==='function'){window.__ytpl_backFn();window.__ytpl_backFn=null;return;}
  }
  const prev=navStack.pop();
  cp.style.display='none';
  if(prev?.type==='channel'&&prev.name){
    openChannel(prev.name);
  } else {
    showSection(prev?.section||'home');
  }
}

// ── SEARCH ──
// ── SEARCH INPUT — clear btn, recommendations, keyboard nav ──
document.addEventListener('DOMContentLoaded',()=>{
  const qi=document.getElementById('q');
  const qc=document.getElementById('q-clear');
  const dd=document.getElementById('search-dropdown');
  if(!qi)return;

  let ddActive=-1;

  function updateClear(){qc.style.display=qi.value?'flex':'none'}
  function hideDd(){dd.style.display='none';ddActive=-1}
  // ── AUTOCOMPLETE ──
  let acController=null;
  let acTimer=null;

  async function fetchSuggestions(q){
    if(acController)acController.abort();
    acController=new AbortController();
    try{
      const r=await fetch(`https://suggestqueries-clients6.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}&callback=?`,{signal:acController.signal});
      // JSONP — won't work directly, fallback to local
    }catch(e){}
    // Use local suggestions only (CORS blocks Google suggest in local files)
    return getLocalSuggestions(q);
  }

  function getLocalSuggestions(q){
    if(!q.trim())return{history:[],suggest:[]};
    const lq=q.toLowerCase();
    const histSet=new Set();
    // From search history
    searchHistory_.filter(s=>s.toLowerCase().includes(lq)).slice(0,4).forEach(s=>histSet.add(s));
    const suggest=new Set();
    // From channel titles
    channels.forEach(c=>{
      const t=(channelMeta[c]?.title||c);
      if(t.toLowerCase().includes(lq))suggest.add(t);
    });
    // From watch history titles
    history_.forEach(h=>{
      if(h.title&&h.title.toLowerCase().includes(lq))suggest.add(h.title);
    });
    return{history:[...histSet],suggest:[...suggest].slice(0,8-histSet.size)};
  }

  function showDd(q){
    if(!q.trim()){
      // Show recent searches only
      if(!searchHistory_.length){hideDd();return}
      ddActive=-1;
      dd.innerHTML=`
        <div class="search-drop-label">Recent searches</div>
        ${searchHistory_.slice(0,8).map((s,i)=>`
          <div class="search-drop-item" data-i="${i}" onmousedown="event.preventDefault()" onclick="pickSuggestion('${s.replace(/'/g,"\\'")}')" onmouseover="setDdActive(${i})">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="opacity:.5;flex-shrink:0"><path d="M13 3a9 9 0 1 0 .001 18.001A9 9 0 0 0 13 3zm-1 14v-5H8l5-8v5h4l-5 8z"/><path d="M13 3a9 9 0 1 0 0 18A9 9 0 0 0 13 3zm-1 5h2v5h3l-4 6-4-6h3V8z" style="display:none"/></svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="opacity:.5;flex-shrink:0"><path d="M13 3C8.03 3 4 7.03 4 12H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
            <span style="flex:1">${esc(s)}</span>
            <button class="search-drop-del" onmousedown="event.preventDefault();event.stopPropagation()" onclick="event.stopPropagation();deleteSearchHistory('${s.replace(/'/g,"\\'")}')" title="Remove">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>`).join('')}`;
      // fix icons — use clock svg
      dd.querySelectorAll('.search-drop-item svg:first-child').forEach(el=>el.style.display='none');
      dd.querySelectorAll('.search-drop-item svg:nth-child(2)').forEach(el=>el.style.display='');
      dd.style.display='block';
      return;
    }
    const {history,suggest}=getLocalSuggestions(q);
    const all=[
      ...history.map(s=>({s,isHist:true})),
      ...suggest.filter(s=>!history.includes(s)).map(s=>({s,isHist:false}))
    ];
    if(!all.length){hideDd();return}
    ddActive=-1;
    dd.innerHTML=all.map(({s,isHist},i)=>`
      <div class="search-drop-item" data-i="${i}" onmousedown="event.preventDefault()" onclick="pickSuggestion('${s.replace(/'/g,"\\'")}')" onmouseover="setDdActive(${i})">
        ${isHist
          ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="opacity:.5;flex-shrink:0"><path d="M13 3C8.03 3 4 7.03 4 12H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>`
          : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="opacity:.5;flex-shrink:0"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`
        }
        <span style="flex:1">${esc(s)}</span>
        ${isHist?`<button class="search-drop-del" onmousedown="event.preventDefault();event.stopPropagation()" onclick="event.stopPropagation();deleteSearchHistory('${s.replace(/'/g,"\\'")}')" title="Remove"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>`:''}
      </div>`).join('');
    dd.style.display='block';
  }

  qi.addEventListener('input',()=>{
    updateClear();
    showDd(qi.value);
  });

  qi.addEventListener('keydown',e=>{
    const items=dd.querySelectorAll('.search-drop-item');
    if(e.key==='Enter'){hideDd();doSearch();return}
    if(e.key==='ArrowDown'){
      e.preventDefault();
      ddActive=Math.min(ddActive+1,items.length-1);
      setDdActive(ddActive);
      if(items[ddActive])qi.value=items[ddActive].querySelector('span').textContent;
      updateClear();
    } else if(e.key==='ArrowUp'){
      e.preventDefault();
      ddActive=Math.max(ddActive-1,-1);
      setDdActive(ddActive);
      if(ddActive>=0&&items[ddActive])qi.value=items[ddActive].querySelector('span').textContent;
      updateClear();
    } else if(e.key==='Escape'){hideDd()}
  });

  qi.addEventListener('focus',()=>showDd(qi.value));
  qi.addEventListener('blur',()=>setTimeout(hideDd,150));
});
window.setDdActive=function(i){
  document.querySelectorAll('.search-drop-item').forEach((el,j)=>el.classList.toggle('active',j===i));
}
window.pickSuggestion=function(s){
  const qi=document.getElementById('q');
  qi.value=s;
  document.getElementById('q-clear').style.display='flex';
  document.getElementById('search-dropdown').style.display='none';
  doSearch();
}
window.clearSearch=function(){
  const qi=document.getElementById('q');
  qi.value='';
  document.getElementById('q-clear').style.display='none';
  document.getElementById('search-dropdown').style.display='none';
  qi.focus();
}
