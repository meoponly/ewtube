// ── UTILS ──
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function fmtDate(iso){
  if(!iso)return'';
  const d=new Date(iso),now=new Date(),diff=Math.floor((now-d)/1000);
  if(diff<60)return'just now';
  if(diff<3600)return Math.floor(diff/60)+' min ago';
  if(diff<86400)return Math.floor(diff/3600)+' hours ago';
  if(diff<604800)return Math.floor(diff/86400)+' days ago';
  if(diff<2592000)return Math.floor(diff/604800)+' weeks ago';
  if(diff<31536000)return Math.floor(diff/2592000)+' months ago';
  return Math.floor(diff/31536000)+' years ago';
}
function fmtViews(n){n=parseInt(n)||0;if(n>=1e9)return(n/1e9).toFixed(1)+'B';if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return Math.round(n/1e3)+'K';return n+''}
function fmtSubs(n){n=parseInt(n)||0;if(n>=1e6)return(n/1e6).toFixed(1)+'M subscribers';if(n>=1e3)return Math.round(n/1e3)+'K subscribers';return n+' subscribers'}
function fmtDur(iso){
  if(!iso)return'';
  const m=iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if(!m)return'';
  const h=parseInt(m[1]||0),mn=parseInt(m[2]||0),s=parseInt(m[3]||0);
  if(h)return`${h}:${String(mn).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return`${mn}:${String(s).padStart(2,'0')}`;
}
const INVIDIOUS_BASE='https://inv.nadeko.net';
function ytLink(vid){return`${INVIDIOUS_BASE}/watch?v=${vid}`}
// Returns the highest-quality thumbnail URL for a given video ID or existing URL
function maxresThumbnail(vidOrUrl){
  // If it's already a YouTube thumbnail URL, extract the video ID and upgrade
  if(vidOrUrl&&vidOrUrl.includes('ytimg.com')){
    // Replace any quality variant with maxresdefault
    return vidOrUrl.replace(/\/(default|mqdefault|hqdefault|sddefault|maxresdefault)(\.\w+)?$/,'/maxresdefault.jpg');
  }
  // If it's a raw video ID
  if(vidOrUrl&&!vidOrUrl.includes('/')&&vidOrUrl.length>5){
    return`https://i.ytimg.com/vi/${vidOrUrl}/maxresdefault.jpg`;
  }
  return vidOrUrl||'';
}
// Pick the best thumbnail from a snippets.thumbnails object and upgrade to maxres
function bestThumb(thumbnails,videoId){
  if(videoId)return`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  const url=(thumbnails?.maxres?.url||thumbnails?.standard?.url||thumbnails?.high?.url||thumbnails?.medium?.url||thumbnails?.default?.url||'');
  return maxresThumbnail(url);
}
function isShort(title){return/(#shorts?|#short)\b/i.test(title)}
function isShortDuration(dur){
  if(!dur)return false;
  const m=dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if(!m)return false;
  return(parseInt(m[1]||0)*3600+parseInt(m[2]||0)*60+parseInt(m[3]||0))<65;
}
function isBlocked(q){return BLOCKED.some(w=>new RegExp(`\\b${w}\\b`,'i').test(q))}
async function api(path, _retryCount = 0) {
  const key = ApiKeyManager.currentKey();
  if (!key) throw new Error('No API key configured. Open Settings (⚙) to add one.');
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}${sep}key=${key}`);
  // Track quota: search=100 units, others=1-5 units
  const units = path.startsWith('search')?100:path.startsWith('videos')||path.startsWith('channels')?5:1;
  if(r.ok) try{trackQuotaUsage(key,units);}catch(e){}
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const reason = e?.error?.errors?.[0]?.reason || '';
    const isQuota = r.status === 403 && (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || (e?.error?.message || '').toLowerCase().includes('quota'));
    if (isQuota) {
      showToast(`⚠️ Key #${ApiKeyManager.getActiveIdx() + 1} quota exceeded — switching…`);
      const switched = ApiKeyManager.markExhausted(key);
      if (document.getElementById('settings-modal').style.display !== 'none') renderApiKeyList();
      if (switched && _retryCount < ApiKeyManager.getAll().length) {
        return api(path, _retryCount + 1);
      } else {
        throw new Error('All API keys have exceeded their quota. Add a new key in Settings.');
      }
    }
    throw new Error(e?.error?.message || r.statusText);
  }
  return r.json();
}
function avatarHtml(name,meta,cls='vid-ch-avatar',chId){
  const initials=(name||'').slice(0,2).toUpperCase();
  const thumb=meta?.thumb||(chId&&chAvatarCache[chId])||'';
  if(thumb)return`<div class="${cls}"><img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.style.display='none'"/></div>`;
  return`<div class="${cls}">${esc(initials)}</div>`;
}
function saveLS(key,val){localStorage.setItem(key,JSON.stringify(val))}

// Fetch avatars for channel IDs not yet in cache, then re-render cards that need them
async function fetchAndCacheAvatars(chIds){
  const missing=[...new Set(chIds)].filter(id=>id&&!chAvatarCache[id]);
  if(!missing.length)return;
  for(let i=0;i<missing.length;i+=50){
    try{
      const batch=missing.slice(i,i+50).join(',');
      const d=await api(`channels?part=snippet&id=${batch}`);
      (d.items||[]).forEach(ch=>{
        const thumb=ch.snippet?.thumbnails?.medium?.url||ch.snippet?.thumbnails?.default?.url||'';
        if(thumb)chAvatarCache[ch.id]=thumb;
      });
    }catch(e){/* non-critical */}
  }
  localStorage.setItem(LS_AV,JSON.stringify(chAvatarCache));
  // Refresh any visible avatar images that are still showing initials
  missing.forEach(id=>{
    const thumb=chAvatarCache[id];
    if(!thumb)return;
    // Update all avatar divs whose parent card has data matching this channelId
    document.querySelectorAll(`[data-hi="${CSS.escape(id)}"]`).forEach(link=>{
      const card=link.closest('.vid-card,.search-card,.search-pl-card');
      if(!card)return;
      const av=card.querySelector('.vid-ch-avatar,.search-ch-avatar');
      if(av&&!av.querySelector('img')){
        av.innerHTML=`<img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.style.display='none'"/>`;
      }
    });
  });
}

// ── AFFINITY / CLICK TRACKING ──
function trackClick(channelId,vid,title,channel,thumb){
  if(!vid)return;
  if(channelId)affinity[channelId]=(affinity[channelId]||0)+1,saveLS(LS_AFFINITY,affinity);
  // Always use maxres thumb in history
  const hiThumb=`https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`;
  history_=history_.filter(h=>h.vid!==vid);
  history_.unshift({vid,title,channel,thumb:hiThumb,ts:Date.now()});
  if(history_.length>500)history_=history_.slice(0,500);
  saveLS(LS_HISTORY,history_);
  // If history panel is open, refresh it live
  if(currentSection==='history')renderHistory();
}

// ── GLOBAL HISTORY DELEGATION ──
// Single document mousedown catches left/middle/ctrl+click BEFORE browser opens new tab
document.addEventListener('mousedown', function(e){
  const link = e.target.closest('a[data-hv]');
  if(!link) return;
  const vid=link.dataset.hv, title=link.dataset.ht||'', channel=link.dataset.hc||'', chId=link.dataset.hi||'';
  if(vid) trackClick(chId, vid, title, channel, '');
}, true); // capture phase = fires first
function scoreVideo(item,channelId){
  const clicks=affinity[channelId]||0;
  const age=(Date.now()-new Date(item.snippet?.publishedAt||0))/3600000;
  const recency=Math.exp(-age/(24*14));
  const affinityW=Math.log2(clicks+2);
  const unseen=history_.some(h=>h.vid===(item.id?.videoId||item.vid))?0.7:1.0;
  return recency*affinityW*unseen;
}
