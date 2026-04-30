async function doSearch(){
  const raw=document.getElementById('q').value.trim();if(!raw)return;
  saveSearchHistory(raw);
  if(isBlocked(raw)){
    showSection('search');document.getElementById('search-results-wrap').style.display='block';document.getElementById('home-feed-wrap').style.display='none';
    document.getElementById('search-status').textContent='';
    document.getElementById('search-results').innerHTML=`<div class="blocked-notice">
      <div class="blocked-notice-icon"><span class="ms">block</span></div>
      <div class="blocked-notice-heading">Content restricted</div>
      <div class="blocked-notice-sub">This search is outside the allowed content categories. Try searching for educational or informational topics instead.</div>
    </div>`;
    document.getElementById('search-more').style.display='none';
    
    return;
  }
  // Block search if query contains a blocked keyword
  if(matchesBlockedKeyword(raw)){
    showSection('search');document.getElementById('search-results-wrap').style.display='block';document.getElementById('home-feed-wrap').style.display='none';
    document.getElementById('search-status').textContent='';
    document.getElementById('search-results').innerHTML=`<div class="blocked-notice">
      <div class="blocked-notice-icon"><span class="ms">do_not_disturb_on</span></div>
      <div class="blocked-notice-heading">Search blocked</div>
      <div class="blocked-notice-sub">This search contains a blocked keyword and can't be shown. You can manage blocked keywords in <span style="color:var(--accent);cursor:pointer" onclick="openSettings()">Settings</span>.</div>
    </div>`;
    document.getElementById('search-more').style.display='none';
    
    return;
  }
  // Save to search history
  trackSearchHistory(raw);
  searchQuery=raw;searchNextTokenMap={};searchResults=[];searchPlaylists=[];searchChannelResults=[];searchFilter='all';
  window._searchChFilter=null;window._searchChFilterName='';
  document.querySelectorAll('.yt-filter-chip').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));
  const filterBar=document.getElementById('filter-bar');
  if(filterBar)filterBar.style.display='none';
  document.getElementById('search-results').innerHTML='';
  document.getElementById('search-more').style.display='none';
  
  document.getElementById('search-status').textContent='Searching…';
  // If currently on channel page, hide it and push to nav stack so back arrow works
  const chPage=document.getElementById('channel-page');
  if(chPage&&chPage.style.display!=='none'){
    navStack.push({type:'channel',name:currentChannelName});
    chPage.style.display='none';
  }
  // Show search results pane, hide home feed
  currentSection='search';
  document.getElementById('search-section').style.display='block';
  document.getElementById('search-results-wrap').style.display='block';
  document.getElementById('home-feed-wrap').style.display='none';
  // Show skeleton while loading
  document.getElementById('search-results').innerHTML=skelSearchGrid(6);
  ytLoadStart();
  try{
    await fetchSearchPage(false);
    const filterBar=document.getElementById('filter-bar');
    if(filterBar)filterBar.style.display='';
  }finally{ytLoadEnd();}
}
async function fetchSearchPage(isMore){
  try{
    const pageToken=isMore?searchNextTokenMap['_global']:null;

    // Read filter panel values
    const fpDate=(document.querySelector('input[name="fp-date"]:checked')||{}).value||'';
    const fpDur=(document.querySelector('input[name="fp-dur"]:checked')||{}).value||'';
    const fpSort=(document.querySelector('input[name="fp-sort"]:checked')||{}).value||'relevance';
    const fp4k=document.querySelector('input[name="fp-4k"]')?.checked||false;
    const fpHd=document.querySelector('input[name="fp-hd"]')?.checked||false;
    const fpCc=document.querySelector('input[name="fp-cc"]')?.checked||false;

    // Chip-level filter to API param mapping
    const order=searchSort==='date'?'date':searchSort==='views'?'viewCount':fpSort;
    let publishedAfter='';
    if(searchFilter==='recent'||fpDate==='today'){
      const d=new Date();d.setHours(0,0,0,0);publishedAfter=d.toISOString();
    } else if(fpDate==='week'){
      publishedAfter=new Date(Date.now()-7*864e5).toISOString();
    } else if(fpDate==='month'){
      publishedAfter=new Date(Date.now()-30*864e5).toISOString();
    } else if(fpDate==='year'){
      const y=new Date();y.setMonth(0);y.setDate(1);y.setHours(0,0,0,0);publishedAfter=y.toISOString();
    }
    const durParam=fpDur?`&videoDuration=${fpDur}`:'';
    const paParam=publishedAfter?`&publishedAfter=${encodeURIComponent(publishedAfter)}`:'';
    const hdParam=(fpHd||fp4k)?`&videoDefinition=high`:'';
    const ccParam=fpCc?`&videoCaption=closedCaption`:'';

    // ── CHANNELS filter: use YT channel search ──
    if(searchFilter==='channels'){
      // In focus mode, block channel discovery entirely
      if(isFocusModeActive()){
        const el=document.getElementById('search-results');
        el.innerHTML='<div style="color:var(--text3);padding:32px 0;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px"><span class="ms" style="font-size:40px;color:#4caf50">lock</span><div style="font-size:14px;font-weight:500;color:var(--text2)">Focus Mode is on</div><div style="font-size:13px">Channel discovery is disabled for the next '+formatFocusRemaining()+'.</div></div>';
        document.getElementById('search-status').textContent='';
        return;
      }
      if(!isMore){
        let url=`search?part=snippet&type=channel&q=${encodeURIComponent(searchQuery)}&maxResults=20&order=${order}`;
        if(pageToken)url+=`&pageToken=${pageToken}`;
        const d=await api(url);
        searchChannelResults=(d.items||[]);
        if(d.nextPageToken)searchNextTokenMap['_global']=d.nextPageToken;
        else delete searchNextTokenMap['_global'];
      }
      renderSearchResults();
      
      document.getElementById('search-more').style.display=searchNextTokenMap['_global']?'block':'none';
      return;
    }

    // ── LIVE filter ──
    const eventParam=searchFilter==='live'?`&eventType=live`:'';

    // ── Detect boosted channels ──
    const qLc=searchQuery.toLowerCase().trim();
    const matchedChannels=channels.filter(c=>{
      const name=c.toLowerCase();
      const title=(channelMeta[c]?.title||'').toLowerCase();
      const handle=(channelMeta[c]?.handle||'').toLowerCase().replace(/^@/,'');
      return name.includes(qLc)||qLc.includes(name)||title.includes(qLc)||qLc.includes(title)||(handle&&(handle.includes(qLc)||qLc.includes(handle)));
    });
    const boostedIds=matchedChannels.map(c=>channelIds[c]).filter(Boolean);

    // ── Determine if channel-specific filter is active ──
    const activeChFilter=window._searchChFilter||null;

    // ── Decide maxResults ──
    const isSpecificTopic=qLc.split(' ').length>=2||boostedIds.length>0||activeChFilter;
    const maxRes=isSpecificTopic?50:25;

    let allItems=[];
    let rawPl=[];

    if((deepSearch||isFocusModeActive())&&!activeChFilter&&channels.length){
      // ── DEEP / FOCUS SEARCH: fan out to subscribed channels only ──
      const subChIds=channels.map(c=>channelIds[c]).filter(Boolean);
      const BATCH=8;
      const pagedIds=isMore
        ? subChIds.filter(id=>searchNextTokenMap[id])
        : subChIds;
      const idsToFetch=pagedIds.slice(0,BATCH);
      const chPromises=idsToFetch.map(chId=>{
        let u=`search?part=snippet&type=video&channelId=${chId}&q=${encodeURIComponent(searchQuery)}&maxResults=15&order=${order}&safeSearch=none${paParam}${durParam}${hdParam}${ccParam}${eventParam}`;
        if(isMore&&searchNextTokenMap[chId])u+=`&pageToken=${searchNextTokenMap[chId]}`;
        return api(u).then(d=>{
          if(d.nextPageToken)searchNextTokenMap[chId]=d.nextPageToken;
          else delete searchNextTokenMap[chId];
          return (d.items||[]);
        }).catch(()=>[]);
      });
      const chResults=await Promise.all(chPromises);
      const seen=new Set(searchResults.map(i=>i.id?.videoId));
      allItems=chResults.flat().filter(i=>{
        const vid=i?.id?.videoId;
        if(!vid||seen.has(vid))return false;
        seen.add(vid);
        return !isShort(i.snippet?.title||'')&&!isBlockedContent(i.snippet?.title||'',i.snippet?.channelTitle||'');
      });
      const hasMore=subChIds.some(id=>searchNextTokenMap[id]);
      if(hasMore)searchNextTokenMap['_global']='deep';
      else delete searchNextTokenMap['_global'];

    } else {
      // ── NORMAL SEARCH: global YouTube search ──
      let url;
      if(activeChFilter){
        url=`search?part=snippet&type=video&channelId=${activeChFilter}&q=${encodeURIComponent(searchQuery)}&maxResults=${maxRes}&order=${order}&safeSearch=none${paParam}${durParam}${hdParam}${ccParam}${eventParam}`;
      } else {
        url=`search?part=snippet&type=video&q=${encodeURIComponent(searchQuery)}&maxResults=${maxRes}&order=${order}&safeSearch=none${paParam}${durParam}${hdParam}${ccParam}${eventParam}`;
      }
      if(pageToken)url+=`&pageToken=${pageToken}`;
      const globalPromise=api(url);
      const boostPromises=(!isMore&&boostedIds.length&&!activeChFilter)
        ? boostedIds.slice(0,3).map(chId=>
            api(`search?part=snippet&type=video&channelId=${chId}&q=${encodeURIComponent(searchQuery)}&maxResults=20&order=${order}${paParam}${durParam}`)
              .then(d=>d.items||[]).catch(()=>[])
          )
        : [];
      const wantPls=(searchFilter==='all'||searchFilter==='videos')&&!activeChFilter;
      const plPromise=(!isMore&&wantPls)
        ? api(`search?part=snippet&type=playlist&q=${encodeURIComponent(searchQuery)}&maxResults=10&order=relevance`)
            .then(d=>d.items||[]).catch(()=>[])
        : Promise.resolve([]);
      const [globalData,...rest]=await Promise.all([globalPromise,...boostPromises,plPromise]);
      const boostItems=rest.slice(0,boostPromises.length).flat();
      rawPl=rest[boostPromises.length]||[];
      if(globalData.nextPageToken)searchNextTokenMap['_global']=globalData.nextPageToken;
      else delete searchNextTokenMap['_global'];
      const seen=new Set(searchResults.map(i=>i.id?.videoId));
      boostItems.forEach(i=>{if(i)i._boosted=true});
      allItems=[...boostItems,...(globalData.items||[])].filter(i=>{
        const vid=i?.id?.videoId;
        if(!vid||seen.has(vid))return false;
        seen.add(vid);
        return !isShort(i.snippet?.title||'')&&!isBlockedContent(i.snippet?.title||'',i.snippet?.channelTitle||'');
      });
    }

    if(!allItems.length&&!isMore){
      const msg=(deepSearch||isFocusModeActive())?`No results in your subscribed channels for "${esc(searchQuery)}".`:`No results found.`;
      document.getElementById('search-status').textContent=msg;
      document.getElementById('search-results').innerHTML=`<div style="color:var(--text3);padding:24px 0;text-align:center">${msg}</div>`;
      return;
    }

    const vids=allItems.map(i=>i.id.videoId);
    const sm=await fetchVideoStats(vids);
    allItems=allItems.filter(i=>!isShortDuration(sm[i.id.videoId]?.dur||''));

    const qWords=searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const qFull=searchQuery.toLowerCase();
    allItems.forEach(item=>{
      const t=(item.snippet.title||'').toLowerCase();
      const ch=(item.snippet.channelTitle||'').toLowerCase();
      const desc=(item.snippet.description||'').toLowerCase();
      let score=0;
      // Title matching
      if(t===qFull)score+=20;
      else if(t.startsWith(qFull))score+=15;
      else if(t.includes(qFull))score+=10;
      else score+=qWords.filter(w=>t.includes(w)).length*3;
      // All query words match — big bonus
      const allWordsMatch=qWords.every(w=>t.includes(w));
      if(allWordsMatch&&qWords.length>1)score+=6;
      // Description bonus
      if(desc.includes(qFull))score+=3;
      else score+=qWords.filter(w=>desc.includes(w)).length;
      // Channel name match
      if(ch.includes(qFull))score+=5;
      // Boosted channel bonus
      if(item._boosted)score+=8;
      // Recency bonus
      const age=(Date.now()-new Date(item.snippet.publishedAt))/864e5;
      if(age<7)score+=4;else if(age<30)score+=2;else if(age<365)score+=1;
      // View count bonus — more granular
      const views=parseInt(sm[item.id.videoId]?.views||0);
      if(views>50e6)score+=6;
      else if(views>10e6)score+=5;
      else if(views>1e6)score+=3;
      else if(views>1e5)score+=2;
      else if(views>1e4)score+=1;
      item._score=score;
      item._date=new Date(item.snippet.publishedAt);
      item._views=views;
      item._dur=sm[item.id.videoId]?.dur||'';
    });

    searchResults=searchResults.concat(allItems);

    if(!isMore&&rawPl.length){
      const filtered=rawPl.filter(i=>!isBlockedContent(i.snippet?.title||'',i.snippet?.channelTitle||''));
      const plIds=filtered.map(i=>i.id?.playlistId).filter(Boolean).join(',');
      if(plIds){
        try{
          const pd=await api(`playlists?part=snippet,contentDetails&id=${plIds}`);
          searchPlaylists=(pd.items||[]).map(pl=>({
            id:pl.id,title:pl.snippet.title,
            thumb:pl.snippet.thumbnails?.medium?.url||'',
            count:pl.contentDetails?.itemCount||0,
            channelTitle:pl.snippet.channelTitle,
            channelId:pl.snippet.channelId,
            _score:qWords.filter(w=>(pl.snippet.title||'').toLowerCase().includes(w)).length+(
              (pl.snippet.title||'').toLowerCase().includes(qFull)?5:0)
          }));
        }catch(e){}
      }
    }

    renderSearchResults();
    
    document.getElementById('search-more').style.display=searchNextTokenMap['_global']?'block':'none';
  }catch(e){
    document.getElementById('search-status').textContent='Error: '+e.message;
    console.error(e);
  }
}

function renderSearchResults(){
  const el=document.getElementById('search-results');

  // ── Always update channel filter chips ──
  renderChFilterChips();

  // ── Channels filter: show YT channel cards ──
  if(searchFilter==='channels'){
    if(!searchChannelResults.length){
      el.innerHTML='<div style="color:var(--text3);padding:24px 0;text-align:center">No channels found.</div>';
      document.getElementById('search-status').textContent='';
      return;
    }
    const html=searchChannelResults.map(item=>{
      const sn=item.snippet||{};
      const chId=item.id?.channelId||'';
      const title=sn.title||'';
      const desc=sn.description||'';
      const thumb=sn.thumbnails?.high?.url||sn.thumbnails?.medium?.url||sn.thumbnails?.default?.url||'';
      const handle=sn.customUrl||'';
      const initials=title.slice(0,2).toUpperCase();
      const matchName=channels.find(c=>(channelMeta[c]?.title||'').toLowerCase()===title.toLowerCase()||channelIds[c]===chId)||null;
      const isSub=!!matchName;
      return`<div class="ch-search-card" onclick="${matchName?`openChannel('${esc(matchName||'').replace(/'/g,"\\'")}')`:''}" style="${matchName?'cursor:pointer':''}">
        <div class="ch-search-avatar">${thumb?`<img src="${esc(thumb)}" alt="" onerror="this.style.display='none'"/>`:''}
          <span style="${thumb?'display:none':''}">${esc(initials)}</span>
        </div>
        <div class="ch-search-info">
          <div class="ch-search-name-row"><span class="ch-search-name">${esc(title)}</span></div>
          ${handle?`<div class="ch-search-handle">${esc(handle)}</div>`:''}
          ${desc?`<div class="ch-search-meta" style="font-size:13px;color:var(--text3);margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(desc)}</div>`:''}
          ${isSub
            ?`<button class="ch-search-sub-btn subscribed" onclick="event.stopPropagation();toggleSearchChSub('${esc(matchName||'')}',this)">Subscribed</button>`
            :`<a href="https://www.youtube.com/channel/${esc(chId)}" target="_blank" rel="noopener" class="ch-search-sub-btn" style="text-decoration:none">View on YouTube</a>`}
        </div>
      </div>`;
    }).join('');
    el.innerHTML=html;
    document.getElementById('search-status').textContent=`${searchChannelResults.length} channel${searchChannelResults.length!==1?'s':''}`;
    return;
  }

  const sorted=[...searchResults];
  if(searchSort==='date')sorted.sort((a,b)=>b._date-a._date);
  else if(searchSort==='views')sorted.sort((a,b)=>b._views-a._views);
  else sorted.sort((a,b)=>b._score-a._score||b._date-a._date);

  const qWords=searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const qFull=searchQuery.toLowerCase();

  const _plBase=searchPlaylists.filter(pl=>!isBlockedContent(pl.title,pl.channelTitle));
  const _plFocused=isFocusModeActive()&&channels.length
    ? _plBase.filter(pl=>{
        const subChIds=new Set(channels.map(c=>channelIds[c]).filter(Boolean));
        const subTitles=new Set(channels.map(c=>(channelMeta[c]?.title||c).toLowerCase().trim()));
        if(subChIds.size&&subChIds.has(pl.channelId))return true;
        return subTitles.has((pl.channelTitle||'').toLowerCase().trim());
      })
    : _plBase;
  const scoredPls=_plFocused.map(pl=>{
    const score=pl._score||(qWords.filter(w=>(pl.title||'').toLowerCase().includes(w)).length+((pl.title||'').toLowerCase().includes(qFull)?5:0));
    return{pl,score};
  }).sort((a,b)=>b.score-a.score);

  let videoItems=sorted.filter(item=>!isBlockedContent(item.snippet.title,item.snippet.channelTitle));

  if(deepSearch&&channels.length){
    const subChIds=new Set(channels.map(c=>channelIds[c]).filter(Boolean));
    videoItems=videoItems.filter(i=>subChIds.has(i.snippet.channelId));
  }

  // ── Focus Mode: hard-filter to subscribed channels only ──
  if(isFocusModeActive()&&channels.length){
    const subChIds=new Set(channels.map(c=>channelIds[c]).filter(Boolean));
    // Also build a set of subscribed channel titles (lowercased) as fallback
    // in case channelId hasn't been resolved yet for some subscriptions
    const subTitles=new Set(channels.map(c=>(channelMeta[c]?.title||c).toLowerCase().trim()));
    videoItems=videoItems.filter(i=>{
      if(subChIds.size&&subChIds.has(i.snippet.channelId))return true;
      // Fallback: match by channel title
      const chTitle=(i.snippet.channelTitle||'').toLowerCase().trim();
      return subTitles.has(chTitle);
    });
  }

  // ── Apply channel-specific filter if active ──
  const activeChFilter=window._searchChFilter||null;
  if(activeChFilter){
    videoItems=videoItems.filter(i=>i.snippet.channelId===activeChFilter);
  }

  const showPlaylists=(searchFilter==='all')&&!activeChFilter;
  let html='';

  // ── Subscribed channel cards: show when search matches channel name ──
  if(searchFilter==='all'&&!activeChFilter){
    const qLower=searchQuery.toLowerCase().trim();
    // Find ALL matching subscribed channels (not just exact match)
    const matchedChs=channels.filter(c=>{
      const m=channelMeta[c];
      const title2=(m?.title||c).toLowerCase();
      const handle2=(m?.handle||'').toLowerCase().replace('@','');
      return title2.includes(qLower)||qLower.includes(title2)||handle2===qLower||handle2.includes(qLower);
    });
    if(matchedChs.length){
      // Show up to 2 matching channel cards at top
      matchedChs.slice(0,2).forEach(matchedCh=>{
        const m2=channelMeta[matchedCh]||{};
        html+=`<div onclick="openChannel('${esc(matchedCh).replace(/'/g,"\\'")}');" style="cursor:pointer">
          ${buildChannelSearchCard(matchedCh,m2,channelIds[matchedCh]||'')}
        </div>`;
      });
    }
  }

  let plIdx=0;
  for(let i=0;i<videoItems.length;i++){
    if(showPlaylists){
      while(plIdx<scoredPls.length&&scoredPls[plIdx].score>=videoItems[i]._score){
        const{pl}=scoredPls[plIdx];
        const chName=findChName(pl.channelId||'');const meta=channelMeta[chName]||null;
        html+=searchPlaylistCard(pl,chName,meta);plIdx++;
      }
    }
    const item=videoItems[i];
    const vid=item.id.videoId;const s=item.snippet;
    const thumb=bestThumb(s.thumbnails,vid);
    const chName=findChName(s.channelId||'');const meta=channelMeta[chName]||null;
    html+=searchCard(vid,s.title,s.channelTitle,thumb,s.publishedAt,item._views,item._dur,meta,s.channelId||'',chName,s.description||'',s.liveBroadcastContent==='live');
  }
  if(showPlaylists){
    while(plIdx<scoredPls.length){
      const{pl}=scoredPls[plIdx];
      const chName=findChName(pl.channelId||'');const meta=channelMeta[chName]||null;
      html+=searchPlaylistCard(pl,chName,meta);plIdx++;
    }
  }

  const emptyMsg=(!html&&isFocusModeActive()&&channels.length)
    ?`<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:48px 24px;text-align:center">
        <span class="ms" style="font-size:42px;color:#4caf50">lock</span>
        <div style="font-size:15px;font-weight:500;color:var(--text2)">Focus Mode is active</div>
        <div style="font-size:13px;color:var(--text3);max-width:340px;line-height:1.6">No results from your subscribed channels matched this search. Try a different query or search within a specific channel.</div>
        <div style="font-size:12px;color:#4caf50;margin-top:4px">${formatFocusRemaining()} remaining</div>
      </div>`
    :'<div style="color:var(--text3);padding:24px 0;text-align:center">No results found.</div>';
  el.innerHTML=html||emptyMsg;

  const unknownChIds=videoItems.map(i=>i.snippet?.channelId).concat(scoredPls.map(p=>p.pl?.channelId)).filter(id=>id&&!chAvatarCache[id]);
  if(unknownChIds.length)fetchAndCacheAvatars(unknownChIds);

  const hasMore=!!searchNextTokenMap['_global'];
  const count=videoItems.length+(showPlaylists?scoredPls.length:0);
  const countLabel=count>=50?`<span class="search-result-count-badge"><span class="ms" style="font-size:13px">local_fire_department</span>${count}+</span>`:
    count>25?`<span class="search-result-count-badge">${count}${hasMore?'+':''}</span>`:'';
  document.getElementById('search-status').innerHTML=count?`${count}${hasMore&&count<50?'+':''} result${count!==1?'s':''}${countLabel}`:'';
}

// ── CHANNEL FILTER CHIPS (sidebar channels shown as quick filters) ──
function renderChFilterChips(){
  const row=document.getElementById('ch-filter-chips-row');
  if(!row||!channels.length||!searchQuery){if(row)row.style.display='none';return;}
  const activeChFilter=window._searchChFilter||null;
  const html=channels.map(c=>{
    const meta=channelMeta[c]||{};
    const initials=(meta.title||c).slice(0,2).toUpperCase();
    const chId=channelIds[c]||'';
    const isActive=chId&&chId===activeChFilter;
    const avHtml=meta.thumb
      ?`<div class="ch-filter-chip-av"><img src="${esc(meta.thumb)}" alt="" onerror="this.parentElement.innerHTML='${esc(initials)}'"/></div>`
      :`<div class="ch-filter-chip-av">${esc(initials)}</div>`;
    const safeName=(meta.title||c).replace(/'/g,"\\'");
    return`<button class="ch-filter-chip${isActive?' active-ch':''}" onclick="toggleChFilter('${esc(chId)}','${esc(c).replace(/'/g,"\\'")}')">
      ${avHtml}<span>${esc(meta.title||c)}</span>${isActive?'<span class="ms sz16" style="margin-left:2px">close</span>':''}
    </button>`;
  }).join('');
  row.innerHTML=html;
  row.style.display='flex';
}

window._searchChFilter=null;
window._searchChFilterName='';
function toggleChFilter(chId,chName){
  if(window._searchChFilter===chId){
    window._searchChFilter=null;
    window._searchChFilterName='';
  } else {
    window._searchChFilter=chId;
    window._searchChFilterName=chName;
  }
  // Refetch with the filter
  searchResults=[];searchPlaylists=[];searchChannelResults=[];
  searchNextTokenMap={};
  document.getElementById('search-results').innerHTML=skelSearchGrid(5);
  document.getElementById('search-more').style.display='none';
  document.getElementById('search-status').textContent='Searching…';
  ytLoadStart();
  fetchSearchPage(false).finally(()=>ytLoadEnd());
}

async function loadMoreSearch(){
  const el=document.getElementById('search-results');
  el.insertAdjacentHTML('beforeend',skelSearchGrid(3));
  await fetchSearchPage(true);
}

// Navigate to a channel by its display title — tries to match against known channels first,
// otherwise does a YouTube channel search and opens the result
async function openChannelByTitle(title){
  if(!title)return;
  // Try to match against known channels
  const match=channels.find(c=>{
    const meta=channelMeta[c];
    return(meta?.title||'').toLowerCase()===title.toLowerCase()||c.toLowerCase()===title.toLowerCase();
  });
  if(match){openChannel(match);return;}
  // Not in sidebar — do a channel search and open the page dynamically
  try{
    showToast('Looking up channel…');
    const d=await api(`search?part=snippet&type=channel&q=${encodeURIComponent(title)}&maxResults=1`);
    const item=d.items?.[0];
    if(!item){showToast('Channel not found');return;}
    const chId=item.id.channelId||item.snippet.channelId;
    const chTitle=item.snippet.channelTitle;
    const thumb=item.snippet.thumbnails?.high?.url||item.snippet.thumbnails?.default?.url||'';
    // Fetch full channel data for banner, about, etc.
    const full=await api(`channels?part=snippet,brandingSettings,statistics,contentDetails&id=${chId}`);
    const ch=full.items?.[0];
    const bannerBase=ch?.brandingSettings?.image?.bannerExternalUrl||'';
    const subs=ch?.statistics?.subscriberCount||'';
    const handle=ch?.snippet?.customUrl||'';
    const verified=!!(ch?.statistics?.subscriberCount>100000);
    // Build a temporary channel entry and open it
    const tempKey='__tmp_'+chId;
    channelIds[tempKey]=chId;
    channelMeta[tempKey]={
      title:ch?.snippet?.title||chTitle,
      thumb:ch?.snippet?.thumbnails?.high?.url||thumb,
      subs,handle,
      banner:bannerBase?bannerBase+'=w2560-nd-v1':'',
      verified
    };
    // Cache upload playlist if available
    const uplId=ch?.contentDetails?.relatedPlaylists?.uploads;
    if(uplId)uploadCache[chId]=uplId;
    openChannel(tempKey);
  }catch(e){showToast('Could not open channel: '+e.message)}
}

// ── VIDEO CARD ──
function videoCard(vid,title,channel,thumb,published,views,dur,meta,chId){
  const link=ytLink(vid);
  const durStr=fmtDur(dur||'');
  const viewStr=views?fmtViews(views)+' views':'';
  const dateStr=fmtDate(published);
  const vd=JSON.stringify(vid);const vt=JSON.stringify(title);const vc=JSON.stringify(channel);
  const vth=JSON.stringify(thumb||'');const vdr=JSON.stringify(dur||'');
  // Check if already watched
  const isWatched=history_.some(h=>h.vid===vid);
  const watchedBar=isWatched?`<div class="vid-watched-bar"><div class="vid-watched-fill" style="width:85%"></div></div>`:'';
  // data-hv/ht/hc/hi used by mousedown handler for reliable history saving
  return`<div class="vid-card" data-vid="${esc(vid)}">
    <a href="${link}" target="_blank" rel="noopener noreferrer"
      data-hv="${esc(vid)}" data-ht="${esc(title)}" data-hc="${esc(channel)}" data-hi="${esc(chId||'')}"
      style="display:block;text-decoration:none;color:inherit">
      <div class="vid-thumb-wrap">
        <img src="${esc(thumb||'')}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault')){this.src=this.src.replace('maxresdefault','hqdefault')}else{this.src=''}"/>
        ${durStr?`<span class="vid-duration">${esc(durStr)}</span>`:''}
        ${watchedBar}
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

function searchCard(vid,title,channel,thumb,published,views,dur,meta,chId,chName,desc,isLive){
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
  // Description snippet
  const descHtml=desc
    ?`<div class="search-desc" onclick="event.stopPropagation();openDescPanel(${JSON.stringify(title)},${JSON.stringify(desc)},${JSON.stringify(vid)})">${esc(desc)}</div>`
    :'';
  // LIVE badge
  const liveBadge=isLive?`<div class="live-badge"><div class="live-dot"></div>LIVE</div>`:'';
  // Floating view count badge — show for videos with notable view counts
  const floatViewBadge=(()=>{
    const v=typeof views==='number'?views:parseInt(views||0);
    if(v>=50e6)return`<div class="vid-views-float viral"><span class="ms" style="font-size:11px">local_fire_department</span>${fmtViews(v)}</div>`;
    if(v>=5e6)return`<div class="vid-views-float popular">${fmtViews(v)}</div>`;
    if(v>=500e3)return`<div class="vid-views-float">${fmtViews(v)}</div>`;
    return'';
  })();
  return`<div class="search-card" data-vid="${esc(vid)}" data-fulldesc="${esc(desc||String()).replace(/"/g,'&quot;')}">
    <a href="${link}" target="_blank" rel="noopener noreferrer"
      data-hv="${esc(vid)}" data-ht="${esc(title)}" data-hc="${esc(channel)}" data-hi="${esc(chId||'')}"
      style="display:block;text-decoration:none;flex-shrink:0">
      <div class="search-thumb" style="position:relative">
        <img src="${esc(thumb||'')}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault')){this.src=this.src.replace('maxresdefault','hqdefault')}else{this.src=''}"/>
        ${isLive?liveBadge:(durStr?`<span class="search-dur">${esc(durStr)}</span>`:'')}
        ${floatViewBadge}
      </div>
    </a>
    <div class="search-info">
      <a href="${link}" target="_blank" rel="noopener noreferrer"
        data-hv="${esc(vid)}" data-ht="${esc(title)}" data-hc="${esc(channel)}" data-hi="${esc(chId||'')}"
        style="text-decoration:none;color:inherit;display:contents">
        <div class="search-title">${esc(title)}</div>
        <div class="search-meta">${[isLive?'<span style="color:#ff4444;font-weight:600">● LIVE</span>':null,viewStr,dateStr].filter(Boolean).join(' · ')}</div>
      </a>
      ${descHtml}
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
  openYtPlaylist(plId,plName,()=>{
    document.getElementById('channel-page').style.display='none';
    document.getElementById('search-section').style.display='block';
  });
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
  // Moves history to secret archive instead of deleting permanently
  const secretHist=JSON.parse(localStorage.getItem('yt_secret_hist')||'[]');
  const secretSearch=JSON.parse(localStorage.getItem('yt_secret_search')||'[]');
  const merged=[...history_,...secretHist];
  const mergedS=[...searchHistory_,...secretSearch];
  localStorage.setItem('yt_secret_hist',JSON.stringify(merged));
  localStorage.setItem('yt_secret_search',JSON.stringify(mergedS));
  history_=[];saveLS(LS_HISTORY,history_);
  searchHistory_=[];saveLS(LS_SEARCH_HIST,searchHistory_);
  renderHistory();renderSearchHistoryList();
  showToast('History cleared');
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

// ── CHANNEL PAGE SUBSCRIBE / NOTIF ──
function handleSubBtnClick(e){
  const name=currentChannelName;if(!name)return;
  if(channels.includes(name)){
    // Already subscribed — open dropdown like real YT
    toggleSubDropdown(e);
  } else {
    toggleSubscribeCurrentChannel();
  }
}
function toggleSubscribeCurrentChannel(){
  const name=currentChannelName;if(!name)return;
  // Focus Mode: block subscribing to NEW channels
  if(isFocusModeActive()&&!channels.includes(name)){
    showToast('🔒 Focus Mode: new subscriptions disabled for '+formatFocusRemaining());
    return;
  }
  const subBtn=document.getElementById('ch-subscribe-btn');
  const subLabel=document.getElementById('ch-subscribe-label');
  const notifBtn=document.getElementById('ch-notif-btn');
  if(channels.includes(name)){
    channels=channels.filter(c=>c!==name);
    saveLS(LS_CH,channels);
    subBtn.classList.remove('subscribed');
    subLabel.textContent='Subscribe';
    if(notifBtn)notifBtn.style.display='none';
  } else {
    channels.push(name);
    saveLS(LS_CH,channels);
    subBtn.classList.add('subscribed');
    subLabel.textContent='Subscribed';
    if(notifBtn)notifBtn.style.display='flex';
  }
  renderSidebarChannels();
}
function toggleSubDropdown(e){
  e.stopPropagation();
  const dd=document.getElementById('ch-sub-dropdown');
  if(!dd)return;
  const isOpen=dd.style.display!=='none';
  dd.style.display=isOpen?'none':'block';
  if(!isOpen){
    const close=()=>{dd.style.display='none';document.removeEventListener('click',close);};
    setTimeout(()=>document.addEventListener('click',close),0);
  }
}
function closeSubDropdown(){
  const dd=document.getElementById('ch-sub-dropdown');if(dd)dd.style.display='none';
}
function unsubFromDropdown(){
  const name=currentChannelName;if(!name)return;
  if(!channels.includes(name))return;
  channels=channels.filter(c=>c!==name);
  saveLS(LS_CH,channels);
  const subBtn=document.getElementById('ch-subscribe-btn');
  const subLabel=document.getElementById('ch-subscribe-label');
  const subIconSvg=document.getElementById('ch-subscribe-icon-svg');
  const arrowBtn=document.getElementById('ch-sub-arrow-btn');
  const notifBtn=document.getElementById('ch-notif-btn');
  const iconSubscribe='M10 20v-6l-2 2-1.41-1.41L10 11.17l3.41 3.42L12 16l2 2V20h-4zm4 0v-2l2-2-1.41-1.41L17 11.17l3.41 3.42L19 16l-2-2v6h-4zM12 4C9.24 4 7 6.24 7 9v1H5V9c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-2V9c0-2.76-2.24-5-5-5z';
  if(subBtn)subBtn.classList.remove('subscribed');
  if(subLabel)subLabel.textContent='Subscribe';
  if(subIconSvg)subIconSvg.querySelector('path').setAttribute('d',iconSubscribe);
  if(arrowBtn)arrowBtn.style.display='none';
  if(notifBtn)notifBtn.style.display='none';
  renderSidebarChannels();
}
function toggleChNotifCurrent(){
  const name=currentChannelName;if(!name)return;
  chNotifs[name]=!chNotifs[name];
  localStorage.setItem(LS_NOTIF,JSON.stringify(chNotifs));
  const on=chNotifs[name];
  const btn=document.getElementById('ch-notif-btn');
  const icon=document.getElementById('ch-notif-icon');
  if(btn)btn.classList.toggle('notif-on',on);
  if(icon)icon.textContent=on?'notifications':'notifications_none';
  renderSidebarChannels();
  showToast(on?'🔔 Notifications on for '+name:'🔕 Notifications off for '+name);
}

// ── CHANNEL CARD IN SEARCH RESULTS ──
function buildChannelSearchCard(name,meta,chId){
  const initials=(meta?.title||name).slice(0,2).toUpperCase();
  const isSubscribed=channels.includes(name);
  const subs=meta?.subs?fmtSubs(meta.subs):'';
  const vid=meta?.videoCount?parseInt(meta.videoCount).toLocaleString()+' videos':'';
  return`<div class="ch-search-card">
    <div class="ch-search-avatar">${meta?.thumb?`<img src="${esc(meta.thumb)}" alt="" onerror="this.style.display='none'"/>`:''}<span style="${meta?.thumb?'display:none':''}">${esc(initials)}</span></div>
    <div class="ch-search-info">
      <div class="ch-search-name-row">
        <span class="ch-search-name">${esc(meta?.title||name)}</span>
        ${meta?.verified?`<svg height="14" viewBox="0 0 24 24" width="14" style="fill:var(--text3);flex-shrink:0"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`:''}
      </div>
      ${meta?.handle?`<div class="ch-search-handle">@${esc(meta.handle.replace('@',''))}</div>`:''}
      <div class="ch-search-meta">
        ${subs?`<span>${esc(subs)} subscribers</span>`:''}
        ${vid?`<span>${esc(vid)}</span>`:''}
      </div>
      <button class="ch-search-sub-btn${isSubscribed?' subscribed':''}"
        onclick="toggleSearchChSub('${esc(name).replace(/'/g,"\\'")}',this)">
        ${isSubscribed?'Subscribed':'Subscribe'}
      </button>
    </div>
  </div>`;
}
window.toggleSearchChSub=function(name,btn){
  if(channels.includes(name)){
    // Show inline confirm instead of immediately unsubscribing
    if(btn.dataset.confirmPending==='1'){
      // Second click — actually unsubscribe
      channels=channels.filter(c=>c!==name);saveLS(LS_CH,channels);
      btn.classList.remove('subscribed');btn.textContent='Subscribe';
      btn.style.cssText='';
      delete btn.dataset.confirmPending;
      if(btn._resetTimeout)clearTimeout(btn._resetTimeout);
      renderSidebarChannels();
      showToast('Unsubscribed from '+name);
    } else {
      // First click — show confirm state, auto-reset after 2.5s
      if(btn._resetTimeout)clearTimeout(btn._resetTimeout);
      btn.dataset.confirmPending='1';
      btn.textContent='Unsubscribe?';
      btn.style.background='rgba(212,112,74,.2)';
      btn.style.color='var(--accent)';
      btn.style.borderColor='var(--accent)';
      btn._resetTimeout=setTimeout(()=>{
        if(btn.dataset.confirmPending==='1'){
          delete btn.dataset.confirmPending;
          btn.textContent='Subscribed';
          btn.style.cssText='';
        }
      },2500);
    }
  } else {
    if(btn._resetTimeout)clearTimeout(btn._resetTimeout);
    channels.push(name);saveLS(LS_CH,channels);
    btn.classList.add('subscribed');btn.textContent='Subscribed';
    btn.style.cssText='';
    delete btn.dataset.confirmPending;
    renderSidebarChannels();
    showToast('Subscribed to '+name);
  }
};

// ── DEEP SEARCH ──
let deepSearch=false;
function onDeepSearchToggle(on){
  deepSearch=on;
  renderSearchResults();
}

// ── DESCRIPTION PANEL ──
window.openDescPanel=async function(title,desc,vid){
  const body=document.getElementById('desc-panel-body');
  document.getElementById('desc-panel-title').textContent=title||'Description';
  body.innerHTML='<span style="opacity:.5;font-style:italic">Loading full description…</span>';
  document.getElementById('desc-panel-overlay').classList.add('open');
  document.addEventListener('keydown',_descPanelEsc);
  let fullDesc=desc||'';
  if(vid){
    try{
      const d=await api(`videos?part=snippet&id=${encodeURIComponent(vid)}`);
      const fd=d?.items?.[0]?.snippet?.description;
      if(fd)fullDesc=fd;
    }catch(e){}
  }
  const linked=esc(fullDesc||'No description available.').replace(
    /https?:\/\/[^\s&lt;&quot;]*/g,
    u=>`<a href="${u.replace(/&amp;/g,'&')}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);word-break:break-all">${u}</a>`
  );
  body.innerHTML=linked;
};
function closeDescPanel(){
  document.getElementById('desc-panel-overlay').classList.remove('open');
  document.removeEventListener('keydown',_descPanelEsc);
}
window.closeDescPanel=closeDescPanel;
function _descPanelEsc(e){if(e.key==='Escape')closeDescPanel();}

// ── GO HOME ──
