
// ═══════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════
const LS_ADMIN_BLOCKED = 'yt_admin_blocked_v1';
const LS_API_CALLLOG   = 'yt_api_calllog_v1';

// Track every API call
(function(){
  const _origApi = window.api || null;
  // We'll patch after page loads in initAdmin
})();

function initAdmin(){
  // Patch api() to log calls
  const _realApi = window.api;
  window.api = async function(path, ...args){
    try{
      const log = JSON.parse(localStorage.getItem(LS_API_CALLLOG)||'[]');
      log.unshift({path, ts: Date.now()});
      if(log.length > 200) log.length = 200;
      localStorage.setItem(LS_API_CALLLOG, JSON.stringify(log));
    }catch(e){}
    return _realApi(path, ...args);
  };
}

function openAdmin(){
  document.getElementById('admin-overlay').classList.add('open');
  admTab('history');
  document.addEventListener('keydown', _adminEsc);
}
function closeAdmin(){
  document.getElementById('admin-overlay').classList.remove('open');
  document.removeEventListener('keydown', _adminEsc);
}
function _adminEsc(e){ if(e.key==='Escape') closeAdmin(); }

// Ctrl+X opens admin
document.addEventListener('keydown', e => {
  if(e.key==='x' && e.ctrlKey && !e.shiftKey){
    e.preventDefault();
    openAdmin();
  }
});

function admTab(name){
  document.querySelectorAll('.adm-tab').forEach((t,i)=>{
    const names=['history','searches','api','access'];
    t.classList.toggle('active', names[i]===name);
  });
  document.querySelectorAll('.adm-tab-content').forEach(c=>c.classList.remove('active'));
  document.getElementById('adm-tab-'+name).classList.add('active');
  if(name==='history') admRenderHistory();
  if(name==='searches') admRenderSearch();
  if(name==='api') admRenderApi();
  if(name==='access') admRenderAccess();
}

// ── HISTORY TAB ──
function admRenderHistory(){
  const secret = JSON.parse(localStorage.getItem('yt_secret_hist')||'[]');
  const live    = typeof history_ !== 'undefined' ? history_ : [];
  // Merge, dedupe by vid+ts
  const all = [...live, ...secret];
  const el = document.getElementById('adm-hist-list');
  if(!all.length){
    el.innerHTML='<div style="color:var(--text3);font-size:13px;padding:12px">No history archived yet.</div>';
    return;
  }
  el.innerHTML = all.slice(0,300).map(h=>`
    <div class="adm-hist-item">
      <img class="adm-hist-thumb" src="${esc(h.thumb||'')}" onerror="this.style.display='none'" />
      <div class="adm-hist-info">
        <div class="adm-hist-title">${esc(h.title||'Unknown')}</div>
        <div class="adm-hist-meta">${esc(h.channel||'')}${h.ts?' · '+new Date(h.ts).toLocaleString():''}</div>
      </div>
    </div>`).join('');
}
function admClearHistory(){
  if(!confirm('Permanently delete the secret history archive?')) return;
  localStorage.removeItem('yt_secret_hist');
  admRenderHistory();
  showToast('Secret history cleared');
}

// ── SEARCH TAB ──
function admRenderSearch(){
  const secret = JSON.parse(localStorage.getItem('yt_secret_search')||'[]');
  const live   = typeof searchHistory_ !== 'undefined' ? searchHistory_.map(q=>({q,ts:null})) : [];
  const all = [...live, ...secret];
  const el = document.getElementById('adm-search-list');
  if(!all.length){
    el.innerHTML='<div style="color:var(--text3);font-size:13px;padding:12px">No search history archived yet.</div>';
    return;
  }
  el.innerHTML = all.slice(0,300).map(s=>`
    <div class="adm-search-item">
      <span class="ms" style="font-size:16px;color:var(--text3)">search</span>
      <span style="flex:1">${esc(typeof s==='string'?s:s.q||'')}</span>
      ${(s.ts||s.ts===0)?`<span style="font-size:11px;color:var(--text3)">${new Date(s.ts).toLocaleString()}</span>`:''}
    </div>`).join('');
}
function admClearSearch(){
  if(!confirm('Permanently delete the secret search archive?')) return;
  localStorage.removeItem('yt_secret_search');
  admRenderSearch();
  showToast('Secret search history cleared');
}

// ── API TAB ──
function admRenderApi(){
  const keys = ApiKeyManager.getAll();
  const log  = JSON.parse(localStorage.getItem(LS_API_CALLLOG)||'[]');
  const quota= {};
  try{ Object.assign(quota, JSON.parse(localStorage.getItem('yt_quota_usage_v1')||'{}')); }catch(e){}

  const totalCalls = log.length;
  const todayCalls = log.filter(l => Date.now()-l.ts < 86400000).length;
  const totalUsed  = keys.reduce((s,k)=>s+(quota[k.key]||0),0);
  const activeKeys = keys.filter(k=>!k.exhausted).length;

  document.getElementById('adm-api-stats').innerHTML = `
    <div class="adm-stat"><div class="adm-stat-val">${totalCalls}</div><div class="adm-stat-lbl">Total Calls</div></div>
    <div class="adm-stat"><div class="adm-stat-val">${todayCalls}</div><div class="adm-stat-lbl">Today</div></div>
    <div class="adm-stat"><div class="adm-stat-val">${totalUsed.toLocaleString()}</div><div class="adm-stat-lbl">Quota Used</div></div>
    <div class="adm-stat"><div class="adm-stat-val">${activeKeys}/${keys.length}</div><div class="adm-stat-lbl">Active Keys</div></div>`;

  const keyLimit = 10000;
  document.getElementById('adm-key-list').innerHTML = keys.length ? keys.map((k,i)=>{
    const used = quota[k.key]||0;
    const pct  = Math.min(100, Math.round(used/keyLimit*100));
    const col  = pct>80?'#e53935':pct>50?'#ff9800':'#2eca6a';
    const masked = k.key.slice(0,8)+'…'+k.key.slice(-4);
    return `<div class="adm-key-row">
      <div class="adm-key-name" title="${esc(k.key)}">${masked}</div>
      <span style="font-size:12px;color:${col};font-weight:600">${used.toLocaleString()} / ${keyLimit.toLocaleString()}</span>
      <span style="font-size:11px;padding:2px 8px;border-radius:20px;background:${k.exhausted?'rgba(229,57,53,.15)':'rgba(46,202,106,.12)'};color:${k.exhausted?'#e57373':'#2eca6a'};font-weight:600">${k.exhausted?'Exhausted':'Active'}</span>
    </div>
    <div class="adm-key-bar-wrap" style="margin:-4px 0 10px">
      <div class="adm-key-bar" style="width:${pct}%;background:${col}"></div>
    </div>`;
  }).join('') : '<div style="color:var(--text3);font-size:13px">No API keys configured.</div>';

  // Mini sparkline chart
  const buckets = 50;
  const counts  = new Array(buckets).fill(0);
  const now     = Date.now();
  const window_ = 3600000 * 24; // last 24h
  log.forEach(l=>{
    const age = now - l.ts;
    if(age < window_){
      const idx = Math.floor((1 - age/window_) * (buckets-1));
      counts[Math.max(0,Math.min(buckets-1,idx))]++;
    }
  });
  const max = Math.max(...counts, 1);
  const W=500, H=80;
  const pts = counts.map((c,i)=>{
    const x = (i/(buckets-1))*W;
    const y = H - (c/max)*(H-6) - 2;
    return `${x},${y}`;
  }).join(' ');
  const fill_pts = `0,${H} ` + pts + ` ${W},${H}`;
  document.getElementById('adm-chart-svg').innerHTML = `
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity=".4"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${fill_pts}" fill="url(#cg)"/>
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`;
}

// ── CHANNEL ACCESS TAB ──
function admGetBlocked(){
  try{ return new Set(JSON.parse(localStorage.getItem(LS_ADMIN_BLOCKED)||'[]')); }catch(e){ return new Set(); }
}
function admSaveBlocked(s){
  localStorage.setItem(LS_ADMIN_BLOCKED, JSON.stringify([...s]));
}
function admRenderAccess(){
  const blocked  = admGetBlocked();
  const rawChs   = typeof channels !== 'undefined' ? channels : [];
  const el = document.getElementById('adm-ch-list');

  // channels[] stores strings (channel names) — normalize to name strings
  const subNames = rawChs.map(ch => {
    if(typeof ch === 'string') return ch;
    return ch.title || ch.name || ch.channelTitle || '';
  }).filter(Boolean);

  // Also include manually-blocked channels not yet subscribed (typed via input)
  const allNames = [...new Set([...subNames, ...blocked])];

  if(!allNames.length){
    el.innerHTML='<div style="color:var(--text3);font-size:13px">No channels yet. Add channels via the sidebar, then block/allow them here — or type a channel name above and press Block.</div>';
    return;
  }

  // Look up thumbnails from channelMeta (keyed by channel name)
  const meta = typeof channelMeta !== 'undefined' ? channelMeta : {};

  el.innerHTML = allNames.map(name=>{
    const isBlocked = blocked.has(name);
    const initials = name.slice(0,2).toUpperCase();
    const thumb = meta[name]?.thumb || '';
    const safeId = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return `<div class="adm-ch-row">
      ${thumb
        ? `<img class="adm-ch-avatar" src="${esc(thumb)}" onerror="this.style.display='none'">`
        : `<div class="adm-ch-avatar">${esc(initials)}</div>`}
      <div class="adm-ch-name">${esc(name)}</div>
      <span class="adm-ch-status ${isBlocked?'blocked':'allowed'}">${isBlocked?'Blocked':'Allowed'}</span>
      <button class="adm-toggle-btn" onclick="admToggleChannel('${safeId}')">
        ${isBlocked?'Allow':'Block'}
      </button>
    </div>`;
  }).join('');
}
function admBlockChannel(){
  const input = document.getElementById('adm-block-input');
  const name  = input.value.trim();
  if(!name) return;
  const blocked = admGetBlocked();
  blocked.add(name);
  admSaveBlocked(blocked);
  input.value = '';
  admRenderAccess();
  applyAdminBlocks();
  showToast(`"${name}" blocked`);
}
function admToggleChannel(name){
  const blocked = admGetBlocked();
  if(blocked.has(name)) blocked.delete(name);
  else blocked.add(name);
  admSaveBlocked(blocked);
  admRenderAccess();
  applyAdminBlocks();
  showToast(blocked.has(name) ? `"${name}" blocked` : `"${name}" allowed`);
}
function applyAdminBlocks(){
  // Hide/show sidebar channel items based on admin block list
  const blocked = admGetBlocked();
  document.querySelectorAll('.sb-ch-item').forEach(el=>{
    // Prefer data-ch-name attribute, then the span text, then data attribute
    const name = el.dataset.chName
      || el.querySelector('.sb-ch-name')?.textContent?.trim()
      || '';
    if(blocked.has(name)) el.style.display='none';
    else el.style.removeProperty('display');
  });
  // Also hide video cards from blocked channels in home feed
  document.querySelectorAll('.vid-card,.search-card').forEach(el=>{
    const ch = el.querySelector('.vid-ch-name,.search-ch-name')?.textContent?.trim()||'';
    if(blocked.has(ch)) el.style.display='none';
    else el.style.removeProperty('display');
  });
}
// Apply blocks on page load and after renders
document.addEventListener('DOMContentLoaded', ()=>{
  setTimeout(applyAdminBlocks, 800);
  setTimeout(applyAdminBlocks, 2500);
});
// Patch renderSidebar to re-apply after sidebar renders
const _origRenderSB = window.renderSidebar;
if(typeof _origRenderSB === 'function'){
  window.renderSidebar = function(...a){ const r=_origRenderSB(...a); setTimeout(applyAdminBlocks,50); return r; };
}

// Init on load
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initAdmin);
else initAdmin();
