function goHome(){
  document.getElementById('channel-page').style.display='none';
  const qi=document.getElementById('q');
  if(qi){qi.value='';const qc=document.getElementById('q-clear');if(qc)qc.style.display='none';}
  const dd=document.getElementById('search-dropdown');if(dd)dd.style.display='none';
  searchResults=[];searchPlaylists=[];searchQuery='';
  const sr=document.getElementById('search-results');if(sr)sr.innerHTML='';
  const ss=document.getElementById('search-status');if(ss)ss.textContent='';
  const sm=document.getElementById('search-more');if(sm)sm.style.display='none';
  navStack=[];
  showSection('home');
  updateURL('home');
}

// ── SEARCH HISTORY ──
function trackSearchHistory(q){
  if(!q||q.length<2)return;
  searchHistory_=searchHistory_.filter(s=>s.toLowerCase()!==q.toLowerCase());
  searchHistory_.unshift(q);
  if(searchHistory_.length>50)searchHistory_=searchHistory_.slice(0,50);
  saveLS(LS_SEARCH_HIST,searchHistory_);
}
function renderSearchHistoryList(){
  const el=document.getElementById('search-history-list');
  if(!el)return;
  if(!searchHistory_.length){
    el.innerHTML='<div class="search-history-empty">No searches yet</div>';return;
  }
  el.innerHTML=searchHistory_.slice(0,15).map((q)=>`
    <div class="search-history-item" onclick="pickSearchHistory('${esc(q).replace(/'/g,"\\'")}')">
      <span class="ms">history</span>
      <span>${esc(q)}</span>
    </div>`).join('');
}
window.pickSearchHistory=function(q){
  const qi=document.getElementById('q');if(!qi)return;
  qi.value=q;
  const qc=document.getElementById('q-clear');if(qc)qc.style.display='flex';
  doSearch();
};
function removeSearchHistory(idx){
  searchHistory_.splice(idx,1);
  saveLS(LS_SEARCH_HIST,searchHistory_);
  renderSearchHistoryList();
}

// ── SKELETON ──
function skelVidGrid(n){
  return`<div class="vid-grid">${Array(n).fill(0).map(()=>`<div class="vid-card" style="pointer-events:none">
    <div class="skeleton" style="aspect-ratio:16/9;border-radius:10px;width:100%"></div>
    <div class="vid-info" style="padding-top:10px">
      <div class="skeleton" style="width:36px;height:36px;min-width:36px;border-radius:50%;flex-shrink:0;margin-top:2px"></div>
      <div class="vid-text" style="flex:1;min-width:0">
        <div class="skeleton" style="height:14px;width:95%;border-radius:4px;margin-bottom:6px"></div>
        <div class="skeleton" style="height:14px;width:75%;border-radius:4px;margin-bottom:6px"></div>
        <div class="skeleton" style="height:13px;width:50%;border-radius:4px;margin-bottom:4px"></div>
        <div class="skeleton" style="height:13px;width:38%;border-radius:4px"></div>
      </div>
    </div>
  </div>`).join('')}</div>`;
}
function skelSearchGrid(n){
  return Array(n).fill(0).map(()=>`<div class="search-skel-card">
    <div class="skeleton search-skel-thumb"></div>
    <div class="search-skel-info">
      <div class="skeleton search-skel-title"></div>
      <div class="skeleton search-skel-title2"></div>
      <div class="skeleton search-skel-meta"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
        <div class="skeleton" style="width:24px;height:24px;border-radius:50%;flex-shrink:0"></div>
        <div class="skeleton search-skel-ch"></div>
      </div>
    </div>
  </div>`).join('');
}
function skelHistoryList(n){
  return Array(n).fill(0).map(()=>`<div class="history-skel-item">
    <div class="skeleton history-skel-thumb"></div>
    <div class="history-skel-info">
      <div class="skeleton history-skel-title"></div>
      <div class="skeleton history-skel-title2"></div>
      <div class="skeleton history-skel-meta"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <div class="skeleton" style="width:24px;height:24px;border-radius:50%;flex-shrink:0"></div>
        <div class="skeleton history-skel-ch"></div>
      </div>
    </div>
  </div>`).join('');
}
function skelPlaylistGrid(n){
  return`<div class="mpl-grid">${Array(n).fill(0).map(()=>`<div style="border-radius:12px;overflow:hidden;background:var(--surface);border:1px solid var(--border)">
    <div class="skeleton" style="aspect-ratio:16/9;width:100%;border-radius:0"></div>
    <div style="padding:10px 12px 14px;display:flex;flex-direction:column;gap:8px">
      <div class="skeleton" style="height:14px;width:80%;border-radius:4px"></div>
      <div class="skeleton" style="height:12px;width:45%;border-radius:4px"></div>
    </div>
  </div>`).join('')}</div>`;
}
function skelChPlaylistGrid(n){
  return`<div class="pl-grid">${Array(n).fill(0).map(()=>`<div style="border-radius:12px;overflow:hidden">
    <div class="skeleton" style="aspect-ratio:16/9;width:100%;border-radius:12px 12px 0 0"></div>
    <div style="padding:10px 2px 4px;display:flex;flex-direction:column;gap:7px">
      <div class="skeleton" style="height:14px;width:85%;border-radius:4px"></div>
      <div class="skeleton" style="height:12px;width:50%;border-radius:4px"></div>
    </div>
  </div>`).join('')}</div>`;
}

// ── THEME TOGGLE ──
(function(){
  const LS_THEME='yt_theme_v1';
  function applyTheme(light){
    document.body.classList.toggle('light-mode',light);
    const icon=document.getElementById('theme-icon');
    if(icon)icon.textContent=light?'dark_mode':'light_mode';
    const lbl=document.getElementById('theme-label');
    if(lbl)lbl.textContent=light?'Switch to Dark mode':'Switch to Light mode';
  }
  const saved=localStorage.getItem(LS_THEME);
  if(saved==='light')applyTheme(true);
  window.toggleTheme=function(){
    const isLight=document.body.classList.toggle('light-mode');
    localStorage.setItem(LS_THEME,isLight?'light':'dark');
    applyTheme(isLight);
  };
  if(typeof applyFocusModeUI==='function')applyFocusModeUI();
})();

// ── NOTIFICATION PANEL ──
const LS_NOTIF_ITEMS='yt_notif_items_v1';let notifItems=JSON.parse(localStorage.getItem(LS_NOTIF_ITEMS)||'[]');
function saveNotifItems(){localStorage.setItem(LS_NOTIF_ITEMS,JSON.stringify(notifItems))}
function toggleNotifPanel(){
  const panel=document.getElementById('notif-panel');
  const overlay=document.getElementById('notif-overlay');
  const btn=document.getElementById('notif-bell-btn');
  if(panel.classList.contains('open')){
    closeNotifPanel();
  }else{
    closeProfileDropdown();
    renderNotifPanel();
    panel.classList.add('open');
    overlay.classList.add('open');
    btn.classList.add('active');
    notifItems.forEach(n=>n.unread=false);
    saveNotifItems();
    document.getElementById('notif-dot').style.display='none';
  }
}
function closeNotifPanel(){
  document.getElementById('notif-panel').classList.remove('open');
  document.getElementById('notif-overlay').classList.remove('open');
  document.getElementById('notif-bell-btn').classList.remove('active');
}
window.closeNotifPanel=closeNotifPanel;
function renderNotifPanel(){
  const body=document.getElementById('notif-panel-body');
  if(!notifItems.length){
    body.innerHTML=`<div class="notif-empty">
      <svg height="56" viewBox="0 0 24 24" width="56" style="fill:var(--text3);margin-bottom:12px">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
      </svg>
      <div class="notif-empty-title">Your notifications live here</div>
      <div class="notif-empty-sub">Subscribe to channels to start seeing their latest videos</div>
    </div>`;
    return;
  }
  const todayStart=new Date();todayStart.setHours(0,0,0,0);
  const todayItems=notifItems.filter(n=>new Date(n.ts)>=todayStart);
  const olderItems=notifItems.filter(n=>new Date(n.ts)<todayStart);
  let html='';
  if(todayItems.length){html+=`<div class="notif-section-label">Today</div>${todayItems.map(notifItemHtml).join('')}`;}
  if(olderItems.length){html+=`<div class="notif-section-label">Earlier</div>${olderItems.map(notifItemHtml).join('')}`;}
  body.innerHTML=html;
}
function notifItemHtml(n){
  const initials=(n.channel||'?').slice(0,2).toUpperCase();
  const avatarHtmlStr=n.avatar
    ?`<img src="${esc(n.avatar)}" alt="" onerror="this.style.display='none'"/>`
    :`${esc(initials)}`;
  const timeStr=fmtDate(new Date(n.ts).toISOString());
  return`<a class="notif-item" href="${n.vid?ytLink(n.vid):'#'}" target="_blank" rel="noopener"
    ${n.vid?`data-hv="${esc(n.vid)}" data-ht="${esc(n.title||'')}" data-hc="${esc(n.channel||'')}" data-hi=""`:''}
    onclick="closeNotifPanel()">
    <div class="notif-avatar">${avatarHtmlStr}</div>
    <div class="notif-text">
      <div class="notif-msg"><strong>${esc(n.channel)}</strong> posted: ${esc(n.title)}</div>
      <div class="notif-time">${esc(timeStr)}</div>
    </div>
    ${n.thumb?`<div class="notif-thumb"><img src="${esc(n.thumb)}" alt="" loading="lazy"/></div>`:''}
    ${n.unread?'<div class="notif-unread-dot"></div>':''}
  </a>`;
}
function pushNotifFromFeed(vid,title,channel,thumb,avatar,ts){
  if(notifItems.some(n=>n.vid===vid))return;
  notifItems.unshift({vid,title,channel,thumb,avatar,ts:ts||Date.now(),unread:true});
  if(notifItems.length>50)notifItems=notifItems.slice(0,50);
  saveNotifItems();
  document.getElementById('notif-dot').style.display='';
}

// ── PROFILE DROPDOWN ──
function toggleProfileDropdown(){
  const dd=document.getElementById('profile-dropdown');
  dd.classList.toggle('open');
  if(dd.classList.contains('open')){
    setTimeout(()=>document.addEventListener('click',_closePDDOutside),0);
  }
}
function closeProfileDropdown(){
  document.getElementById('profile-dropdown').classList.remove('open');
  document.removeEventListener('click',_closePDDOutside);
}
function _closePDDOutside(e){
  const dd=document.getElementById('profile-dropdown');
  const btn=document.getElementById('profile-btn');
  if(!dd.contains(e.target)&&!btn.contains(e.target)){closeProfileDropdown();}
}

// ── SIDEBAR TOGGLE ──
(function(){
  const LS_SB='yt_sidebar_collapsed_v1';
  window._sbCollapsedPref = localStorage.getItem(LS_SB)==='1';
  window.toggleSidebar=function(){
    const collapsed=document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem(LS_SB,collapsed?'1':'0');
    const sidebar=document.getElementById('sidebar');
    const main=document.getElementById('main');
    sidebar.style.willChange='width,opacity,transform';
    main.style.willChange='margin-left';
    setTimeout(()=>{
      sidebar.style.willChange='';
      main.style.willChange='';
    },400);
  };
})();

// ── YOU SECTION TOGGLE ──
function toggleYouSection(){
  const wrap=document.getElementById('you-section-wrap');
  const header=document.getElementById('you-header');
  const isExpanded=header.classList.toggle('expanded');
  wrap.style.display=isExpanded?'':'none';
}

// ── MANAGE CHANNELS PANEL ──
function openManageChannels(){
  const list=document.getElementById('mcp-list');
  if(!channels.length){
    list.innerHTML='<div class="mcp-empty">No subscriptions yet.<br>Use + to add channels.</div>';
  }else{
    list.innerHTML=channels.map(c=>{
      const meta=channelMeta[c];
      const initials=(meta?.title||c).split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      return`<div class="mcp-item" onclick="closeManageChannels();openChannel('${esc(c).replace(/'/g,"\\'")}')}" style="cursor:pointer">
        <div class="mcp-avatar">${meta?.thumb?`<img src="${esc(meta.thumb)}" alt="" onerror="this.style.display='none'"/><span style="display:none">${esc(initials)}</span>`:`<span>${esc(initials)}</span>`}</div>
        <div class="mcp-info">
          <div class="mcp-name">${esc(meta?.title||c)}</div>
          ${meta?.subs?`<div class="mcp-subs">${esc(fmtSubs(meta.subs))}</div>`:'<div class="mcp-subs" style="color:var(--text3)">Subscribers hidden</div>'}
        </div>
        <button class="mcp-unsub-btn" onclick="event.stopPropagation();unsubscribeChannel('${esc(c).replace(/'/g,"\\'")}',this)">Unsubscribe</button>
      </div>`;
    }).join('');
  }
  document.getElementById('manage-channels-panel').classList.add('open');
  document.getElementById('manage-channels-overlay').classList.add('open');
}
function closeManageChannels(){
  document.getElementById('manage-channels-panel').classList.remove('open');
  document.getElementById('manage-channels-overlay').classList.remove('open');
}

// ── UNSUBSCRIBE CHANNEL ──
function unsubscribeChannel(chName,btn){
  if(!confirm(`Unsubscribe from "${chName}"?`))return;
  channels=channels.filter(c=>c!==chName);
  delete channelMeta[chName];
  delete channelIds[chName];
  saveLS(LS_CH,channels);saveLS(LS_IDS,channelIds);saveLS(LS_META,channelMeta);
  renderSidebarChannels();
  if(document.getElementById('manage-channels-panel').classList.contains('open'))openManageChannels();
  showToast(`Unsubscribed from ${chName}`);
}

// ── CONTINUE WATCHING ──
