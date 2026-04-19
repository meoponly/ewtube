// ── SETTINGS UI ──
function openSettings() {
  renderApiKeyList();
  renderResolveStatus();
  renderBlockedKeywordsList();
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
    sb.style.display = keys.length > 1 ? 'flex' : 'none';
    if (keys.length > 1) sb.innerHTML = `<span class="dot"></span>${keys.length} keys loaded — auto-rotation ready`;
  }
}

// Track quota usage per key (100 units per search call)
function trackQuotaUsage(key, units){
  const LS_QUOTA_USAGE='yt_quota_usage_v1';
  let u={};try{u=JSON.parse(localStorage.getItem(LS_QUOTA_USAGE)||'{}');}catch{}
  u[key]=(u[key]||0)+units;
  localStorage.setItem(LS_QUOTA_USAGE,JSON.stringify(u));
}
function resetQuotaUsage(){localStorage.removeItem('yt_quota_usage_v1');}

function removeApiKey(idx) {
