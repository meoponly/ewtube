// ── API KEY MANAGER ──
const LS_APIKEYS = 'yt_apikeys_v1';
const ApiKeyManager = (() => {
  let keys = [];         // [{key, masked, exhausted, visible}]
  let activeIdx = 0;

  function load() {
    try { keys = JSON.parse(localStorage.getItem(LS_APIKEYS) || '[]'); } catch { keys = []; }
    // Remove the old hardcoded legacy key if it's still in the list
    const legacy = 'AIzaSyDlIZqkSeSyxScDv2lqm5wL6kYbcbsVGHQ';
    keys = keys.filter(k => k.key !== legacy);
    save();
    activeIdx = keys.findIndex(k => !k.exhausted);
    if (activeIdx < 0) activeIdx = 0;
  }

  function save() { localStorage.setItem(LS_APIKEYS, JSON.stringify(keys)); }

  function currentKey() {
    // Always prefer a non-exhausted key
    const available = keys.find((k, i) => i === activeIdx && !k.exhausted);
    if (available) return available.key;
    // activeIdx is exhausted — find any available key
    const any = keys.find(k => !k.exhausted);
    if (any) return any.key;
    // All exhausted — return activeIdx key so the quota error surfaces properly
    return keys[activeIdx]?.key || '';
  }

  function markExhausted(key) {
    const k = keys.find(k => k.key === key);
    if (k) { k.exhausted = true; save(); }
    // Find next available
    const next = keys.findIndex((k, i) => i > activeIdx && !k.exhausted);
    if (next >= 0) { activeIdx = next; return true; }
    // Wrap around
    const any = keys.findIndex(k => !k.exhausted);
    if (any >= 0) { activeIdx = any; return true; }
    return false; // all exhausted
  }

  function addKey(rawKey) {
    rawKey = rawKey.trim();
    if (!rawKey || keys.some(k => k.key === rawKey)) return false;
    keys.push({ key: rawKey, exhausted: false, visible: false });
    // If no active non-exhausted key exists, point to the new one
    const anyActive = keys.findIndex(k => !k.exhausted);
    activeIdx = anyActive >= 0 ? anyActive : keys.length - 1;
    save();
    return true;
  }

  function removeKey(idx) {
    keys.splice(idx, 1);
    if (activeIdx >= keys.length) activeIdx = Math.max(0, keys.length - 1);
    save();
  }

  function toggleVisible(idx) { keys[idx].visible = !keys[idx].visible; save(); }

  function getAll() { return keys; }
  function getActiveIdx() { return activeIdx; }
  function resetExhausted() { keys.forEach(k => k.exhausted = false); save(); }

  load();
  return { currentKey, markExhausted, addKey, removeKey, toggleVisible, getAll, getActiveIdx, resetExhausted, save };
})();


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
async function openPinnedPlaylist(plId,plName,chName){
  if(chName&&channelIds[chName]){await openChannel(chName);chTab('playlists');setTimeout(()=>openChPlaylist(plId,plName),800)}
}

