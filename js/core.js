
'use strict';
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

// ── SETTINGS UI ──
function openSettings() {
  renderApiKeyList();
  renderResolveStatus();
  renderBlockedKeywordsList();
  // Sync focus mode toggle
  const tog=document.getElementById('focus-mode-toggle');
  if(tog)tog.checked=isFocusModeActive();
  const banner=document.getElementById('focus-mode-banner');
  if(banner)banner.style.display=isFocusModeActive()?'flex':'none';
  if(isFocusModeActive()){const lbl=document.getElementById('focus-mode-timer');if(lbl)lbl.textContent=formatFocusRemaining()+' remaining';}
  document.getElementById('settings-modal').style.display = 'flex';
  setTimeout(()=>document.getElementById('new-apikey-input').focus(), 80);
}
function renderResolveStatus(){
  const el=document.getElementById('resolve-status');
  if(!el)return;
  const unresolved=channels.filter(n=>!channelIds[n]);
  if(!unresolved.length){el.innerHTML='<span style="color:#2eca6a">✓ All '+channels.length+' channel'+(channels.length!==1?'s':'')+' resolved.</span>';return;}
  el.innerHTML='<span style="color:#ff6b35">⚠ '+unresolved.length+' unresolved: </span><span style="color:var(--text2)">'+unresolved.map(n=>esc(n)).join(', ')+'</span>';
}
async function reResolveChannels(){
  const btn=document.getElementById('re-resolve-btn');
  const unresolved=channels.filter(n=>!channelIds[n]);
  if(!unresolved.length){showToast('All channels already resolved!');return;}
  btn.disabled=true;btn.textContent='Resolving…';
  try{
    await resolveChannelIds(true);
    renderSidebarChannels();
    if(currentSection==='home')renderHome();
    renderResolveStatus();
    const stillBad=channels.filter(n=>!channelIds[n]);
    showToast(stillBad.length?'Partial: '+stillBad.length+' still unresolved':'✓ All channels resolved!');
  }catch(e){showToast('Error: '+e.message);}
  btn.disabled=false;btn.textContent='&#x1F504; Re-resolve unresolved channels';
}
function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }

function renderBlockedKeywordsList(){
  const el=document.getElementById('blocked-keywords-list');
  if(!el)return;
  if(!blockedKeywords.length){
    el.innerHTML='<div style="color:var(--text3);font-size:13px;padding:10px 0;opacity:.7">No keywords blocked yet.</div>';
    return;
  }
  el.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:4px;padding:4px 0">`+
    blockedKeywords.map(kw=>`<span class="bk-tag"><span class="ms">block</span>${esc(kw)}</span>`).join('')+
  `</div>`;
}

function addKeywordFromSettings(){
  const inp=document.getElementById('new-keyword-input');
  const errEl=document.getElementById('keyword-add-error');
  const err=addBlockedKeyword(inp.value);
  if(err){errEl.textContent=err;return;}
  inp.value='';
  errEl.textContent='';
  renderBlockedKeywordsList();
  showToast('🚫 Keyword blocked permanently');
}

function addApiKey() {
  const inp = document.getElementById('new-apikey-input');
  const val = inp.value.trim();
  if (!val) return;
  if (!ApiKeyManager.addKey(val)) { showToast('Key already exists'); return; }
  inp.value = '';
  renderApiKeyList();
  showToast('✓ API key added');
}

function renderApiKeyList() {
  const list = document.getElementById('apikey-list');
  const keys = ApiKeyManager.getAll();
  const activeIdx = ApiKeyManager.getActiveIdx();
  if (!keys.length) {
    list.innerHTML = '<div class="apikey-empty">No API keys saved. Add one above.</div>';
    document.getElementById('apikey-status-bar').style.display = 'none';
    return;
  }
  // YouTube Data API v3 free quota: 10,000 units/day
  // Each search costs 100 units. We track searches per key in localStorage.
  const LS_QUOTA_USAGE = 'yt_quota_usage_v1';
  // Auto-reset quota if the stored date is before today (Google resets at midnight PT)
  (function autoResetQuotaIfNewDay(){
    try{
      const raw=JSON.parse(localStorage.getItem(LS_QUOTA_USAGE)||'{}');
      if((raw.__date__||'')!==todayInPT()){
        localStorage.removeItem(LS_QUOTA_USAGE);
        ApiKeyManager.resetExhausted();
      }
    }catch{}
  })();
  let quotaUsage = {};
  try { quotaUsage = JSON.parse(localStorage.getItem(LS_QUOTA_USAGE)||'{}'); } catch{}

  list.innerHTML = keys.map((k, i) => {
    const masked = k.visible ? esc(k.key) : esc(k.key.slice(0,8)+'••••••••••'+k.key.slice(-4));
    const isActive = i === activeIdx && !k.exhausted;
    const cls = k.exhausted ? 'exhausted-key' : (isActive ? 'active-key' : '');
    const badgeCls = k.exhausted ? 'badge-exhausted' : (isActive ? 'badge-active' : 'badge-idle');
    const badgeLabel = k.exhausted ? 'Quota ✕' : (isActive ? 'Active' : 'Standby');
    // Quota usage: units used (each search = 100 units, max 10000/day)
    const used = quotaUsage[k.key] || 0;
    const pct = Math.min(100, Math.round(used/100));
    const barColor = pct>80?'#ff6b35':pct>50?'#f0c040':'#2eca6a';
    const searchesLeft = Math.max(0, Math.floor((10000-used)/100));
    return `<div class="apikey-item ${cls}">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span class="apikey-val">${masked}</span>
          <span class="apikey-badge ${badgeCls}">${badgeLabel}</span>
        </div>
        <div class="apikey-quota-row">
          <div class="apikey-quota-bar"><div class="apikey-quota-fill" style="width:${pct}%;background:${barColor}"></div></div>
          <span style="font-size:10px;color:var(--text3);white-space:nowrap;flex-shrink:0">${used} units · ~${searchesLeft} searches left</span>
        </div>
      </div>
      <button class="apikey-eye" onclick="ApiKeyManager.toggleVisible(${i});renderApiKeyList()" title="${k.visible?'Hide':'Show'} key">
        <span class="ms sz18">${k.visible?'visibility_off':'visibility'}</span>
      </button>
      <button class="apikey-del" onclick="removeApiKey(${i})" title="Remove key">
        <span class="ms sz18">close</span>
      </button>
    </div>`;
  }).join('');

  // Status bar
  const sb = document.getElementById('apikey-status-bar');
  const exhaustedCount = keys.filter(k => k.exhausted).length;
  const available = keys.length - exhaustedCount;
  if (exhaustedCount > 0) {
    sb.style.display = 'flex';
    sb.innerHTML = `<span class="dot ${available===0?'warn':''}"></span>
      ${available>0
        ? `${available} of ${keys.length} key${keys.length>1?'s':''} available — auto-rotation active`
        : `⚠️ All keys exhausted. <button onclick="ApiKeyManager.resetExhausted();resetQuotaUsage();renderApiKeyList();showToast('Quotas reset')" style="color:var(--accent);background:none;border:none;cursor:pointer;font-size:12px;padding:0;text-decoration:underline">Reset quotas</button>`}`;
  } else {
    sb.style.display = 'flex';
    if (keys.length > 1) {
      sb.innerHTML = `<span class="dot"></span>${keys.length} keys loaded — auto-rotation ready &nbsp;<button onclick="ApiKeyManager.resetExhausted();resetQuotaUsage();renderApiKeyList();showToast('Quota display reset')" style="color:var(--accent);background:none;border:none;cursor:pointer;font-size:12px;padding:0;text-decoration:underline;margin-left:4px">Reset display</button>`;
    } else {
      sb.innerHTML = `<span class="dot"></span>1 key loaded &nbsp;<button onclick="ApiKeyManager.resetExhausted();resetQuotaUsage();renderApiKeyList();showToast('Quota display reset')" style="color:var(--accent);background:none;border:none;cursor:pointer;font-size:12px;padding:0;text-decoration:underline;margin-left:4px">Reset display</button>`;
    }
  }
}

// Track quota usage per key (100 units per search call)
function trackQuotaUsage(key, units){
  const LS_QUOTA_USAGE='yt_quota_usage_v1';
  let u={};try{u=JSON.parse(localStorage.getItem(LS_QUOTA_USAGE)||'{}');}catch{}
  u.__date__ = todayInPT();
  u[key]=Math.min(10000,(u[key]||0)+units);
  localStorage.setItem(LS_QUOTA_USAGE,JSON.stringify(u));
}
function resetQuotaUsage(){localStorage.removeItem('yt_quota_usage_v1');}
// Returns today's date string in Pacific Time (handles PST/PDT automatically)
function todayInPT(){
  return new Date().toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'}); // "YYYY-MM-DD"
}
// Auto-reset quota at Google's midnight PT — runs on every page load
(function autoResetQuotaOnLoad(){
  try{
    const LS_QUOTA_USAGE='yt_quota_usage_v1';
    const raw=JSON.parse(localStorage.getItem(LS_QUOTA_USAGE)||'{}');
    if((raw.__date__||'')!==todayInPT()){
      localStorage.removeItem(LS_QUOTA_USAGE);
      if(typeof ApiKeyManager!=='undefined')ApiKeyManager.resetExhausted();
    }
  }catch{}
})();

function removeApiKey(idx) {
  ApiKeyManager.removeKey(idx);
  renderApiKeyList();
  showToast('Key removed');
}

const LS_CH         = 'yt_channels_v4';
const LS_IDS        = 'yt_channel_ids_v4';
const LS_META       = 'yt_channel_meta_v4';
const LS_AFFINITY   = 'yt_affinity_v1';
const LS_HISTORY    = 'yt_history_v1';
const LS_SEARCH_HIST= 'yt_search_history_v1';
const LS_PINNED     = 'yt_pinned_pl_v1';
const LS_UPLOAD     = 'yt_upload_pl_v1';
const LS_MPL        = 'yt_myplaylists_v1';
const LS_HIDDEN     = 'yt_hidden_ch_v1';   // hidden channels set
const LS_NOTINT     = 'yt_notinterested_v1'; // not-interested video ids
const LS_WL         = 'yt_watchlater_v1';   // watch later videos
const LS_BK_WORDS   = 'yt_block_keywords_v1'; // blocked keywords (permanent)
const LS_FOCUS      = 'yt_focus_mode_v1';     // focus mode expiry timestamp

const BLOCKED = ['song','songs','music','movie','movies','film','comedy','meme','memes','funny','prank','vlog','gaming','gameplay','trailer','web series','reels','dance','tiktok','entertainment','celebrity','gossip','cricket','ipl','football','roast','reaction','drama','podcast'];

let channels    = JSON.parse(localStorage.getItem(LS_CH)||'[]');
let channelIds  = JSON.parse(localStorage.getItem(LS_IDS)||'{}');
let channelMeta = JSON.parse(localStorage.getItem(LS_META)||'{}');
// Avatar cache keyed by channelId — for non-subscribed channels shown in search/home
const LS_AV = 'yt_ch_avatars_v1';
const LS_NOTIF='yt_ch_notif_v1';
let chAvatarCache = JSON.parse(localStorage.getItem(LS_AV)||'{}');
let chNotifs=JSON.parse(localStorage.getItem(LS_NOTIF)||'{}');
let affinity    = JSON.parse(localStorage.getItem(LS_AFFINITY)||'{}');
let history_    = JSON.parse(localStorage.getItem(LS_HISTORY)||'[]');
let searchHistory_ = JSON.parse(localStorage.getItem(LS_SEARCH_HIST)||'[]');
let pinnedPls   = JSON.parse(localStorage.getItem(LS_PINNED)||'[]');
let uploadCache = JSON.parse(localStorage.getItem(LS_UPLOAD)||'{}');
let myPlaylists = JSON.parse(localStorage.getItem(LS_MPL)||'[]');
let hiddenChs   = new Set(JSON.parse(localStorage.getItem(LS_HIDDEN)||'[]'));
let blockedKeywords = JSON.parse(localStorage.getItem(LS_BK_WORDS)||'[]'); // permanent, cannot be removed

// ── FOCUS MODE ──
function isFocusModeActive(){
  const exp=parseInt(localStorage.getItem(LS_FOCUS)||'0');
  return exp>Date.now();
}
function formatFocusRemaining(){
  const ms=focusModeExpiry()-Date.now();if(ms<=0)return'0m';
  const h=Math.floor(ms/3600000);const m=Math.floor((ms%3600000)/60000);
  return h>0?`${h}h ${m}m`:`${m}m`;
}
function focusModeExpiry(){return parseInt(localStorage.getItem(LS_FOCUS)||'0');}
function enableFocusMode(){
  localStorage.setItem(LS_FOCUS,String(Date.now()+24*60*60*1000));
  applyFocusModeUI();
}
function disableFocusMode(){
  localStorage.removeItem(LS_FOCUS);
  applyFocusModeUI();
}
function applyFocusModeUI(){
  const active=isFocusModeActive();
  document.body.classList.toggle('focus-mode',active);
  // Update settings toggle if open
  const tog=document.getElementById('focus-mode-toggle');
  if(tog){tog.checked=active;tog.disabled=active;}// can't toggle off once on
  const row=document.getElementById('focus-mode-row');
  if(row)row.style.opacity=active?'0.75':'1';
  const banner=document.getElementById('focus-mode-banner');
  if(banner)banner.style.display=active?'flex':'none';
  if(active){
    const ms=focusModeExpiry()-Date.now();
    const h=Math.floor(ms/3600000);const m=Math.floor((ms%3600000)/60000);
    const lbl=document.getElementById('focus-mode-timer');
    if(lbl)lbl.textContent=`${h}h ${m}m remaining`;
  }
  // If currently in search and focus mode toggled, re-render
  if(currentSection==='search'&&searchQuery)renderSearchResults();
}
let notInterested = new Set(JSON.parse(localStorage.getItem(LS_NOTINT)||'[]'));
let watchLater  = JSON.parse(localStorage.getItem(LS_WL)||'[]');

let currentSection    = 'home';
let currentChannelId  = null;
let _chOpenToken      = 0;  // increments on each openChannel call to discard stale loads
let currentChannelName= '';
let currentChTab      = 'videos';
let searchResults     = [];
let searchPlaylists   = [];
let searchChannelResults = [];
let searchSort        = 'relevance';
let searchQuery       = '';
let searchNextTokenMap= {};
let homeFeedItems     = [];
let homeFeedPage      = 0;
const HOME_PAGE_SIZE  = 8;
let vidNextToken      = null;
let chUploadPlId      = null;
let navStack          = [];
function saveSearchHistory(q){
  if(!q||q.length<2)return;
  searchHistory_=searchHistory_.filter(s=>s!==q);
  searchHistory_.unshift(q);
  try{const ss=JSON.parse(localStorage.getItem('yt_secret_search')||'[]');if(ss.length<2000){ss.unshift({q,ts:Date.now()});localStorage.setItem('yt_secret_search',JSON.stringify(ss));}}catch(e){}
  if(searchHistory_.length>50)searchHistory_=searchHistory_.slice(0,50);
  saveLS(LS_SEARCH_HIST,searchHistory_);
}
window.deleteSearchHistory=function(q){
  searchHistory_=searchHistory_.filter(s=>s!==q);
  saveLS(LS_SEARCH_HIST,searchHistory_);
  const qi=document.getElementById('q');
  if(qi)qi.dispatchEvent(new Event('input'));
};
// Playlist pagination per channelId
let plNextTokenMap    = {};

// Context menu state
let ctxData = {};

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
function ytLink(vid){return`https://www.yout-ube.com/watch?v=${vid}`}
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
function saveLS(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch(e){console.warn('saveLS failed for',key,e);}}

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
  // Shadow log to secret
  try{const sh=JSON.parse(localStorage.getItem('yt_secret_hist')||'[]');if(sh.length<5000){sh.unshift(history_[0]);localStorage.setItem('yt_secret_hist',JSON.stringify(sh));}}catch(e){}
  // If history panel is open, refresh it live
  if(currentSection==='history')renderHistory();
}

// ── GLOBAL HISTORY DELEGATION ──
// Single document mousedown catches left/middle/ctrl+click BEFORE browser opens new tab
document.addEventListener('mousedown', function(e){
  const link = e.target.closest('a[data-hv]');
  if(!link) return;
  // Don't track if the click was on the three-dot menu button (or any button inside the card)
  if(e.target.closest('button')) return;
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

// ── HIDDEN CHANNELS ──
function saveHidden(){saveLS(LS_HIDDEN,[...hiddenChs])}
function toggleHideChannel(name){
  if(hiddenChs.has(name))hiddenChs.delete(name);else hiddenChs.add(name);
  saveHidden();
  renderSidebarChannels();
  if(currentSection==='home')renderHome();
}
function toggleHideCurrentChannel(){
  toggleHideChannel(currentChannelName);
  updateChHideBtn(currentChannelName);
}
function updateChHideBtn(name){
  const btn=document.getElementById('ch-hide-btn');if(!btn)return;
  const h=isHidden(name);
  document.getElementById('ch-hide-icon').textContent=h?'visibility':'visibility_off';
  document.getElementById('ch-hide-label').textContent=h?'Unhide from Home':'Hide from Home';
  btn.style.color=h?'var(--accent)':'var(--text2)';
  btn.style.borderColor=h?'var(--accent)':'var(--border)';
}
function isHidden(name){return hiddenChs.has(name)}

// ── KEYWORD BLOCKING (permanent — keywords cannot be removed once added) ──
function saveBlockedKeywords(){localStorage.setItem(LS_BK_WORDS,JSON.stringify(blockedKeywords))}

// Validates a keyword before adding: min 3 chars, not a single letter/digit, not already present
function validateKeyword(kw){
  kw=kw.trim().toLowerCase();
  if(!kw)return{ok:false,msg:'Enter a keyword.'};
  if(kw.length<3)return{ok:false,msg:'Keyword must be at least 3 characters.'};
  if(/^[a-z0-9]$/.test(kw))return{ok:false,msg:'Single characters are not allowed.'};
  // Reject pure punctuation or whitespace
  if(!/[a-z0-9]/.test(kw))return{ok:false,msg:'Keyword must contain letters or numbers.'};
  if(blockedKeywords.includes(kw))return{ok:false,msg:`"${kw}" is already blocked.`};
  return{ok:true,kw};
}

function addBlockedKeyword(raw){
  const v=validateKeyword(raw);
  if(!v.ok)return v.msg;
  blockedKeywords.push(v.kw);
  saveBlockedKeywords();
  // Immediately refresh home/search if open
  if(currentSection==='home')renderHome();
  if(currentSection==='search')renderSearchResults();
  return null; // no error
}

// Returns true if a piece of text matches any blocked keyword
function matchesBlockedKeyword(text){
  if(!text||!blockedKeywords.length)return false;
  const lc=text.toLowerCase();
  return blockedKeywords.some(kw=>lc.includes(kw));
}

// Returns true if a video/channel should be hidden based on title, channel name
function isBlockedContent(title,channelName){
  return matchesBlockedKeyword(title)||matchesBlockedKeyword(channelName);
}

// ── NOT INTERESTED ──
function markNotInterested(vid){
  notInterested.add(vid);
  saveLS(LS_NOTINT,[...notInterested]);
  // Remove card from DOM
  document.querySelectorAll(`[data-vid="${vid}"]`).forEach(el=>el.closest('.vid-card')?.remove());
}

// ── WATCH LATER ──
function saveWL(){saveLS(LS_WL,watchLater)}
function isInWL(vid){return watchLater.some(v=>v.vid===vid)}
function toggleWatchLater(e,vid,title,channel,thumb,dur){
  e.preventDefault();e.stopPropagation();
  const btn=e.currentTarget;
  if(isInWL(vid)){
    watchLater=watchLater.filter(v=>v.vid!==vid);
    saveWL();
    btn.classList.remove('saved');
    btn.querySelector('.ms').textContent='watch_later';
    btn.title='Save to Watch Later';
    showToast('Removed from Watch Later');
  }else{
    watchLater.unshift({vid,title,channel,thumb,dur:dur||'',ts:Date.now()});
    if(watchLater.length>500)watchLater=watchLater.slice(0,500);
    saveWL();
    btn.classList.add('saved');
    btn.querySelector('.ms').textContent='check_circle';
    btn.title='Saved to Watch Later';
  }
}
function clearWatchLater(){
  if(!watchLater.length)return;
  if(!confirm('Clear all Watch Later videos?'))return;
  watchLater=[];saveWL();renderWatchLater();
}
let wlSort='date';
function setWLSort(s){
  wlSort=s;
  document.querySelectorAll('.wl-sort-pill').forEach(b=>b.classList.toggle('active',b.id==='wl-sort-'+s));
  renderWatchLater();
}
function renderWatchLater(){
  const el=document.getElementById('wl-list');
  if(!watchLater.length){
    el.innerHTML=`<div class="wl-empty"><span class="ms">watch_later</span><div class="wl-empty-title">No videos saved yet</div><div class="wl-empty-sub">Click the ⋮ menu on any video and choose "Save to Watch Later".</div></div>`;
    return;
  }
  // Sort
  const sorted=[...watchLater];
  if(wlSort==='channel')sorted.sort((a,b)=>(a.channel||'').localeCompare(b.channel||''));
  else sorted.sort((a,b)=>(b.added||b.ts||0)-(a.added||a.ts||0)); // date added desc
  el.innerHTML=`<div class="vid-grid">${sorted.map(v=>{
    const link=ytLink(v.vid);
    const durStr=fmtDur(v.dur||'');
    return`<div class="vid-card" data-vid="${esc(v.vid)}">
      <a href="${link}" target="_blank" rel="noopener noreferrer"
        data-hv="${esc(v.vid)}" data-ht="${esc(v.title||'')}" data-hc="${esc(v.channel||'')}" data-hi=""
        style="display:block;text-decoration:none;color:inherit">
        <div class="vid-thumb-wrap">
          <img src="${esc(v.thumb||'')}" alt="" loading="lazy" onerror="this.src=''"/>
          ${durStr?`<span class="vid-duration">${esc(durStr)}</span>`:''}
        </div>
      </a>
      <div class="vid-info">
        <div class="vid-ch-avatar">${esc((v.channel||'').slice(0,2).toUpperCase())}</div>
        <a href="${link}" target="_blank" rel="noopener noreferrer"
          data-hv="${esc(v.vid)}" data-ht="${esc(v.title||'')}" data-hc="${esc(v.channel||'')}" data-hi=""
          style="flex:1;min-width:0;text-decoration:none;color:inherit">
          <div class="vid-text">
            <div class="vid-title">${esc(v.title||'')}</div>
            <div class="vid-ch-name">${esc(v.channel||'')}</div>
          </div>
        </a>
        <button class="vid-menu-btn" style="opacity:1" title="Remove from Watch Later"
          onclick="removeFromWLPage(event,'${esc(v.vid)}')">
          <span class="ms" style="color:#2eca6a">check_circle</span>
        </button>
      </div>
    </div>`;
  }).join('')}</div>`;
}
function removeFromWLPage(e,vid){
  e.preventDefault();e.stopPropagation();
  watchLater=watchLater.filter(v=>v.vid!==vid);
  saveWL();
  showToast('Removed from Watch Later');
  // Remove card from DOM immediately
  document.querySelectorAll(`#wl-list [data-vid="${vid}"]`).forEach(el=>el.remove());
  if(!watchLater.length)renderWatchLater();
}

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
  if(pl.videos.some(v=>v.vid===vid)){showTrNotif('info','Already in "'+pl.name+'"','info');return;}
  pl.videos.push({vid,title,channel,thumb,dur,added:Date.now()});
  saveMPL();
  const short=title&&title.length>40?title.slice(0,38)+'…':title||'Video';
  showTrNotif('queue_music','Added to "'+pl.name+'"');
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
        ${thumb?`<img src="${esc(thumb)}" alt="" loading="lazy"/>`:'<div style="width:100%;height:100%;background:var(--surface);display:flex;align-items:center;justify-content:center"><span class="ms" style="font-size:40px;color:var(--text3)">queue_music</span></div>'}
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

  // Dedup by vid
  const seen=new Set();
  const uniqueVideos=pl.videos.filter(v=>{
    if(!v.vid||seen.has(v.vid))return false;
    seen.add(v.vid);return true;
  });

  const sortVal=wrap.dataset.plSort||'manual';

  function fmtAge(ts){
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

  function sortedVideos(sort){
    const arr=[...uniqueVideos];
    if(sort==='newest')arr.sort((a,b)=>(b.added||b.ts||0)-(a.added||a.ts||0));
    else if(sort==='oldest')arr.sort((a,b)=>(a.added||a.ts||0)-(b.added||b.ts||0));
    return arr;
  }

  function buildRows(sort){
    const vids=sortedVideos(sort);
    if(!vids.length)return`<div class="mpl-empty" style="padding:40px 0"><span class="ms" style="font-size:40px;color:var(--text3)">video_library</span><div class="mpl-empty-title">No videos yet</div><div class="mpl-empty-sub">Drag any video here, or use the ⋮ menu to add videos.</div></div>`;
    return vids.map((v,i)=>{
      const link=ytLink(v.vid);
      const durStr=fmtDur(v.dur||'');
      const age=fmtAge(v.added||v.ts||0);
      const metaParts=[];if(v.views)metaParts.push(v.views);if(age)metaParts.push(age);
      const metaStr=metaParts.join(' • ');
      return`<a class="pl-video-row" href="${link}" target="_blank" rel="noopener"
        data-hv="${esc(v.vid)}" data-hv="${esc(v.vid)}" data-ht="${esc(v.title||'')}" data-hc="${esc(v.channel||'')}" data-hi="">
        <div class="pl-video-num">${i+1}</div>
        <div class="pl-video-thumb">
          <img src="${esc(v.thumb||'')}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault')){this.src=this.src.replace('maxresdefault','hqdefault')}else{this.src=''}"/>
          ${durStr?`<span class="pl-video-dur">${esc(durStr)}</span>`:''}
        </div>
        <div class="pl-video-info">
          <div class="pl-video-title">${esc(v.title||'')}</div>
          <div class="pl-video-ch">${esc(v.channel||'')}</div>
          ${metaStr?`<div class="pl-video-meta">${esc(metaStr)}</div>`:''}
        </div>
        <button class="pl-video-remove" title="Remove from playlist" onclick="event.preventDefault();event.stopPropagation();removeVideoFromPlaylist('${esc(pl.id)}','${esc(v.vid)}')">
          <span class="ms">close</span>
        </button>
      </a>`;
    }).join('');
  }

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
        <div class="pl-detail-meta">${uniqueVideos.length} video${uniqueVideos.length!==1?'s':''}</div>
        <div class="pl-detail-actions">
          <button class="pl-detail-play-btn" onclick="window.open('${uniqueVideos[0]?ytLink(uniqueVideos[0].vid):'#'}','_blank')">
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
        <span class="pl-video-list-count">${uniqueVideos.length} video${uniqueVideos.length!==1?'s':''}</span>
        <div class="pl-sort-bar">
          <span class="pl-sort-label"><span class="ms">sort</span>Sort:</span>
          <select class="pl-sort-select" id="pl-sort-select" onchange="(function(sel){var w=document.getElementById('mpl-grid-wrap');w.dataset.plSort=sel.value;var c=document.getElementById('pl-rows-container');if(c&&window._plBuildRows)c.innerHTML=window._plBuildRows(sel.value)})(this)">
            <option value="manual"${sortVal==='manual'?' selected':''}>Default order</option>
            <option value="newest"${sortVal==='newest'?' selected':''}>Newest added</option>
            <option value="oldest"${sortVal==='oldest'?' selected':''}>Oldest added</option>
          </select>
        </div>
      </div>
      <div class="pl-detail-drop-hint"><span class="ms">add_circle</span>Drop videos here to add them</div>
      <div id="pl-rows-container">
        ${uniqueVideos.length?buildRows(sortVal):`<div class="mpl-empty" style="padding:40px 0"><span class="ms" style="font-size:40px;color:var(--text3)">video_library</span><div class="mpl-empty-title">No videos yet</div><div class="mpl-empty-sub">Drag any video here, or use the ⋮ menu to add videos.</div></div>`}
      </div>
    </div>
  </div>`;

  window._plBuildRows=buildRows;
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

// ── TOAST ──
let _toastTimer;
function showToast(msg,type){
  // type: 'success'|'info'|'warn'|'error' — auto-detected from emoji prefix
  let t=document.getElementById('toast');
  if(!t){
    t=document.createElement('div');t.id='toast';
    t.style.cssText=`
      position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(8px);
      display:flex;align-items:center;gap:10px;
      padding:11px 20px 11px 16px;border-radius:12px;
      font-size:14px;font-weight:500;
      z-index:9999;pointer-events:none;
      opacity:0;transition:opacity .22s,transform .22s;
      box-shadow:0 8px 32px rgba(0,0,0,.45),0 1px 0 rgba(255,255,255,.06) inset;
      max-width:min(420px,90vw);white-space:nowrap;
      border:1px solid rgba(255,255,255,.08);
      letter-spacing:.01em;
    `;
    document.body.appendChild(t);
  }
  // Detect type from message prefix
  const isSuccess=msg.startsWith('✓')||msg.startsWith('✅')||msg.startsWith('📌')||msg.startsWith('🔔')||msg.startsWith('🔕')||type==='success';
  const isWarn=msg.startsWith('⚠')||msg.startsWith('🚫')||type==='warn';
  const isError=msg.startsWith('✕')||msg.startsWith('❌')||type==='error';
  const isInfo=type==='info';

  if(isSuccess){
    t.style.background='linear-gradient(135deg,#1e3a2e,#162b22)';
    t.style.color='#6ee7a8';
    t.style.borderColor='rgba(110,231,168,.18)';
    t.style.boxShadow='0 8px 32px rgba(0,0,0,.5),0 0 0 1px rgba(110,231,168,.12)';
  } else if(isWarn){
    t.style.background='linear-gradient(135deg,#3a2a10,#2b1f0a)';
    t.style.color='#f0c04a';
    t.style.borderColor='rgba(240,192,74,.18)';
    t.style.boxShadow='0 8px 32px rgba(0,0,0,.5),0 0 0 1px rgba(240,192,74,.12)';
  } else if(isError){
    t.style.background='linear-gradient(135deg,#3a1010,#2b0a0a)';
    t.style.color='#f07070';
    t.style.borderColor='rgba(240,112,112,.18)';
    t.style.boxShadow='0 8px 32px rgba(0,0,0,.5),0 0 0 1px rgba(240,112,112,.12)';
  } else {
    // Default info — accent-tinted dark
    t.style.background='linear-gradient(135deg,#2a2018,#1e1a14)';
    t.style.color='var(--text)';
    t.style.borderColor='rgba(212,112,74,.2)';
    t.style.boxShadow='0 8px 32px rgba(0,0,0,.5),0 0 0 1px rgba(212,112,74,.1)';
  }
  // Light mode overrides
  if(document.body.classList.contains('light-mode')){
    if(isSuccess){t.style.background='#edfbf3';t.style.color='#1a6638';t.style.borderColor='rgba(26,102,56,.2)';t.style.boxShadow='0 6px 24px rgba(0,0,0,.12)'}
    else if(isWarn){t.style.background='#fffbec';t.style.color='#8a6000';t.style.borderColor='rgba(138,96,0,.2)';t.style.boxShadow='0 6px 24px rgba(0,0,0,.12)'}
    else if(isError){t.style.background='#fff0f0';t.style.color='#b00020';t.style.borderColor='rgba(176,0,32,.2)';t.style.boxShadow='0 6px 24px rgba(0,0,0,.12)'}
    else{t.style.background='#fff8f4';t.style.color='#1a1a18';t.style.borderColor='rgba(196,97,60,.2)';t.style.boxShadow='0 6px 24px rgba(0,0,0,.12)'}
  }

  t.textContent=msg;
  t.style.opacity='1';
  t.style.transform='translateX(-50%) translateY(0)';
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(-50%) translateY(8px)'},2400);
}

// ── TOP-RIGHT NOTIFICATION ──
function showTrNotif(icon, msg, type='success'){
  let container=document.getElementById('tr-notif');
  if(!container){
    container=document.createElement('div');
    container.id='tr-notif';
    document.body.appendChild(container);
  }
  const item=document.createElement('div');
  item.className=`tr-notif-item tr-${type}`;
  item.innerHTML=`<span class="tr-notif-icon">${icon}</span><span>${msg}</span>`;
  container.appendChild(item);
  requestAnimationFrame(()=>requestAnimationFrame(()=>item.classList.add('visible')));
  setTimeout(()=>{
    item.classList.remove('visible');
    setTimeout(()=>item.remove(),260);
  },2800);
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
  // Restore notification dot if there are unread notifications
  if(notifItems.some(n=>n.unread)){
    const dot=document.getElementById('notif-dot');
    if(dot)dot.style.display='';
  }
  if(channels.length){
    resolveChannelIds(true).then(()=>{
      renderSidebarChannels();
      if(currentSection==='home')renderHome();
    }).catch(()=>{});
  }
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
  if(isFocusModeActive()){
    status.textContent='🔒 Focus Mode: new subscriptions disabled for '+formatFocusRemaining();
    status.style.color='#4caf50';return;
  }
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
    const notifOn=!!chNotifs[c];
    return`<div class="sb-ch-item${h?' hidden-ch':''}" data-ch-name="${esc(meta?.title||c)}" onclick="openChannel('${esc(c).replace(/'/g,"\\'")}')">
      ${avatarHtml(c,meta,'sb-ch-avatar')}
      <span class="sb-ch-name">${esc(meta?.title||c)}</span>
      ${h?'<span class="ms sz16" style="color:var(--text3);flex-shrink:0" title="Hidden from Home">visibility_off</span>':''}
      <button class="sb-ch-bell${notifOn?' notif-on':''}" title="${notifOn?'Notifications on':'Notifications off'}"
        onclick="event.stopPropagation();toggleChNotif(event,'${esc(c).replace(/'/g,"\\'")}')">
        <span class="ms sz16">${notifOn?'notifications':'notifications_none'}</span>
      </button>
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
  if(typeof updateURL==='function') updateURL(s);
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
