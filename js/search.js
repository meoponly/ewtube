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
  function showDd(items){
    if(!items.length){hideDd();return}
    ddActive=-1;
    dd.innerHTML=items.map((s,i)=>`
      <div class="search-drop-item" data-i="${i}" onmousedown="event.preventDefault()" onclick="pickSuggestion('${s.replace(/'/g,"\\'")}')" onmouseover="setDdActive(${i})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <span>${esc(s)}</span>
      </div>`).join('');
    dd.style.display='block';
  }

  function getSuggestions(q){
    if(!q.trim())return[];
    const lq=q.toLowerCase();
    // Pull from channelMeta titles + channel names
    const hits=new Set();
    channels.forEach(c=>{
      const title=(channelMeta[c]?.title||c).toLowerCase();
      if(title.includes(lq))hits.add(channelMeta[c]?.title||c);
    });
    // Pull from cached history titles matching query
    history_.forEach(h=>{
      if(h.title&&h.title.toLowerCase().includes(lq))hits.add(h.title);
    });
    return [...hits].slice(0,8);
  }

  qi.addEventListener('input',()=>{
    updateClear();
    showDd(getSuggestions(qi.value));
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

  qi.addEventListener('focus',()=>{if(qi.value)showDd(getSuggestions(qi.value))});
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
async function doSearch(){
  const raw=document.getElementById('q').value.trim();if(!raw)return;
  if(isBlocked(raw)){document.getElementById('search-status').textContent='🚫 Stay focused! Only educational searches allowed.';showSection('search');document.getElementById('search-results-wrap').style.display='block';document.getElementById('home-feed-wrap').style.display='none';return}
  // Block search if query contains a blocked keyword
  if(matchesBlockedKeyword(raw)){
    showSection('search');document.getElementById('search-results-wrap').style.display='block';document.getElementById('home-feed-wrap').style.display='none';
    document.getElementById('search-results').innerHTML='';
    document.getElementById('search-more').style.display='none';
    document.getElementById('sort-row').style.display='none';
    document.getElementById('search-status').textContent='🚫 This search is blocked.';
    return;
  }
  // Save to search history
  trackSearchHistory(raw);
  searchQuery=raw;searchNextTokenMap={};searchResults=[];searchPlaylists=[];
  document.getElementById('search-results').innerHTML='';
  document.getElementById('search-more').style.display='none';
  document.getElementById('sort-row').style.display='none';
  document.getElementById('search-status').textContent='Searching…';
  // Show search results pane, hide home feed
  currentSection='search';
  document.getElementById('search-section').style.display='block';
  document.getElementById('search-results-wrap').style.display='block';
  document.getElementById('home-feed-wrap').style.display='none';
  // Show skeleton while loading
  document.getElementById('search-results').innerHTML=skelSearchGrid(6);
  ytLoadStart();
  await fetchSearchPage(false);
}
async function fetchSearchPage(isMore){
  try{
    const pageToken=isMore?searchNextTokenMap['_global']:null;
    const order=searchSort==='date'?'date':searchSort==='views'?'viewCount':'relevance';

    // ── Detect if query matches an added channel name/handle ──
    const qLc=searchQuery.toLowerCase().trim();
    const matchedChannels=channels.filter(c=>{
      const name=c.toLowerCase();
      const title=(channelMeta[c]?.title||'').toLowerCase();
      const handle=(channelMeta[c]?.handle||'').toLowerCase().replace(/^@/,'');
      return name.includes(qLc)||qLc.includes(name)||title.includes(qLc)||qLc.includes(title)||(handle&&(handle.includes(qLc)||qLc.includes(handle)));
    });
    const boostedIds=matchedChannels.map(c=>channelIds[c]).filter(Boolean);

    // ── Global search ──
    let url=`search?part=snippet&type=video&q=${encodeURIComponent(searchQuery)}&maxResults=25&order=${order}&safeSearch=none&relevanceLanguage=en`;
    if(pageToken)url+=`&pageToken=${pageToken}`;
    const globalPromise=api(url);

    // ── Boosted channel-specific searches (parallel, only on first page) ──
    const boostPromises=(!isMore&&boostedIds.length)
      ? boostedIds.slice(0,3).map(chId=>
          api(`search?part=snippet&type=video&channelId=${chId}&q=${encodeURIComponent(searchQuery)}&maxResults=15&order=${order}`)
            .then(d=>d.items||[]).catch(()=>[])
        )
      : [];

    // ── Playlist search (only on first page) ──
    const plPromise=(!isMore)
      ? api(`search?part=snippet&type=playlist&q=${encodeURIComponent(searchQuery)}&maxResults=10&order=relevance`)
          .then(d=>d.items||[]).catch(()=>[])
      : Promise.resolve([]);

    const [globalData,...rest]=await Promise.all([globalPromise,...boostPromises,plPromise]);
    const boostItems=rest.slice(0,boostPromises.length).flat();
    const rawPl=rest[boostPromises.length]||[];

    if(globalData.nextPageToken)searchNextTokenMap['_global']=globalData.nextPageToken;
    else delete searchNextTokenMap['_global'];

    // ── Merge & deduplicate ──
    const seen=new Set(searchResults.map(i=>i.id?.videoId));
    // Boosted items tagged with high priority
    boostItems.forEach(i=>{if(i)i._boosted=true});
    let allItems=[...boostItems,...(globalData.items||[])].filter(i=>{
      const vid=i?.id?.videoId;
      if(!vid||seen.has(vid))return false;
      seen.add(vid);
      return!isShort(i.snippet?.title||'')&&!isBlockedContent(i.snippet?.title||'',i.snippet?.channelTitle||'');
    });

    if(!allItems.length&&!isMore){
      document.getElementById('search-status').textContent=`No results for "${esc(searchQuery)}".`;
      return;
    }

    // ── Fetch stats in one batch ──
    const vids=allItems.map(i=>i.id.videoId);
    const sm=await fetchVideoStats(vids);
    allItems=allItems.filter(i=>!isShortDuration(sm[i.id.videoId]?.dur||''));

    // ── Score each result (YouTube-style) ──
    const qWords=searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const qFull=searchQuery.toLowerCase();
    allItems.forEach(item=>{
      const t=(item.snippet.title||'').toLowerCase();
      const ch=(item.snippet.channelTitle||'').toLowerCase();
      const desc=(item.snippet.description||'').toLowerCase();
      // Title relevance
      let score=0;
      if(t===qFull)score+=20;
      else if(t.startsWith(qFull))score+=15;
      else if(t.includes(qFull))score+=10;
      else score+=qWords.filter(w=>t.includes(w)).length*3;
      // Description bonus
      if(desc.includes(qFull))score+=3;
      else score+=qWords.filter(w=>desc.includes(w)).length;
      // Channel name match bonus
      if(ch.includes(qFull))score+=5;
      // Boosted channel bonus (added channels get priority)
      if(item._boosted)score+=8;
      // Recency bonus (last 30 days)
      const age=(Date.now()-new Date(item.snippet.publishedAt))/864e5;
      if(age<7)score+=4;else if(age<30)score+=2;else if(age<365)score+=1;
      // View count bonus (log scale)
      const views=parseInt(sm[item.id.videoId]?.views||0);
      if(views>1e6)score+=3;else if(views>1e5)score+=2;else if(views>1e4)score+=1;

      item._score=score;
      item._date=new Date(item.snippet.publishedAt);
      item._views=views;
      item._dur=sm[item.id.videoId]?.dur||'';
    });

    searchResults=searchResults.concat(allItems);

    // ── Playlists ──
    if(!isMore&&rawPl.length){
      const filtered=rawPl.filter(i=>!isBlockedContent(i.snippet?.title||'',i.snippet?.channelTitle||''));
      const plIds=filtered.map(i=>i.id?.playlistId).filter(Boolean).join(',');
      if(plIds){
        try{
          const pd=await api(`playlists?part=snippet,contentDetails&id=${plIds}`);
          searchPlaylists=(pd.items||[]).map(pl=>({
            id:pl.id,
            title:pl.snippet.title,
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
    document.getElementById('sort-row').style.display='flex';
    document.getElementById('search-more').style.display=searchNextTokenMap['_global']?'block':'none';
  }catch(e){
    document.getElementById('search-status').textContent='Error: '+e.message;
    console.error(e);
  }finally{ytLoadEnd();}
}
function setSort(s){
  searchSort=s;
  document.querySelectorAll('.sort-pill').forEach(b=>{
    const m={relevance:'Relevance',date:'Upload date',views:'View count'};
    b.classList.toggle('active',b.textContent.trim()===m[s]);
  });
  renderSearchResults();
}
function renderSearchResults(){
  const el=document.getElementById('search-results');
  const sorted=[...searchResults];
  if(searchSort==='date')sorted.sort((a,b)=>b._date-a._date);
  else if(searchSort==='views')sorted.sort((a,b)=>b._views-a._views);
  else sorted.sort((a,b)=>b._score-a._score||b._date-a._date);

  const qWords=searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const qFull=searchQuery.toLowerCase();

  // Score playlists same way
  const scoredPls=searchPlaylists.filter(pl=>!isBlockedContent(pl.title,pl.channelTitle)).map(pl=>{
    const score=pl._score||(qWords.filter(w=>(pl.title||'').toLowerCase().includes(w)).length+(
      (pl.title||'').toLowerCase().includes(qFull)?5:0));
    return{pl,score};
  }).sort((a,b)=>b.score-a.score);

  const videoItems=sorted.filter(item=>!isBlockedContent(item.snippet.title,item.snippet.channelTitle));

  // Interleave playlists into video list by score — insert playlist when its score >= next video score
  let html='';
  let plIdx=0;
  for(let i=0;i<videoItems.length;i++){
    while(plIdx<scoredPls.length&&(searchSort==='relevance')&&scoredPls[plIdx].score>=videoItems[i]._score){
      const{pl}=scoredPls[plIdx];
      const chName=findChName(pl.channelId||'');const meta=channelMeta[chName]||null;
      html+=searchPlaylistCard(pl,chName,meta);
      plIdx++;
    }
    const item=videoItems[i];
    const vid=item.id.videoId;const s=item.snippet;
    const thumb=bestThumb(s.thumbnails,vid);
    const chName=findChName(s.channelId||'');const meta=channelMeta[chName]||null;
    html+=searchCard(vid,s.title,s.channelTitle,thumb,s.publishedAt,item._views,item._dur,meta,s.channelId||'',chName);
  }
  // Remaining playlists
  if(searchSort==='relevance'){
    while(plIdx<scoredPls.length){
      const{pl}=scoredPls[plIdx];
      const chName=findChName(pl.channelId||'');const meta=channelMeta[chName]||null;
      html+=searchPlaylistCard(pl,chName,meta);
      plIdx++;
    }
  }

  el.innerHTML=html||'<div style="color:var(--text3);padding:24px 0;text-align:center">No results found.</div>';

  // Fetch and cache avatars for any unknown channels in results
  const unknownChIds=videoItems.map(i=>i.snippet?.channelId).concat(scoredPls.map(p=>p.pl?.channelId)).filter(id=>id&&!chAvatarCache[id]);
  if(unknownChIds.length)fetchAndCacheAvatars(unknownChIds);

  // Floating result count — shows total with more if available
  const hasMore=!!searchNextTokenMap['_global'];
  const count=videoItems.length+scoredPls.length;
  document.getElementById('search-status').textContent=
    count?`${count}${hasMore?'+':''} result${count!==1?'s':''}`:'';
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
    const thumb=item.snippet.thumbnails?.default?.url||'';
    // Build a temporary channel entry and open it
    const tempKey='__tmp_'+chId;
    channelIds[tempKey]=chId;
    channelMeta[tempKey]={title:chTitle,thumb,subs:'',handle:''};
    openChannel(tempKey);
  }catch(e){showToast('Could not open channel: '+e.message)}
}

