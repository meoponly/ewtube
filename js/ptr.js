
// ── PULL TO REFRESH ──
(function(){
  const PTR_THRESHOLD = 72; // px drag needed to trigger
  const PTR_MAX = 110;
  let startY=0, curY=0, isPulling=false, isRefreshing=false;
  const ind = document.getElementById('ptr-indicator');
  const arrow = document.getElementById('ptr-arrow');
  const main = document.getElementById('main');

  function canPull(){
    // Only on home feed, not mid-scroll
    return window.scrollY <= 0 &&
      document.getElementById('home-feed-wrap')?.style.display !== 'none' &&
      !isRefreshing;
  }

  document.addEventListener('touchstart', e=>{
    if(!canPull()) return;
    startY = e.touches[0].clientY;
    isPulling = true;
  }, {passive:true});

  document.addEventListener('touchmove', e=>{
    if(!isPulling || isRefreshing) return;
    curY = e.touches[0].clientY;
    const dist = Math.min(curY - startY, PTR_MAX);
    if(dist <= 0){ind.classList.remove('ptr-visible');return;}
    // Rotate arrow based on pull distance
    const pct = Math.min(dist / PTR_THRESHOLD, 1);
    arrow.style.transform = `rotate(${pct * 220}deg)`;
    ind.classList.add('ptr-visible');
    ind.classList.remove('ptr-refreshing');
  }, {passive:true});

  document.addEventListener('touchend', async ()=>{
    if(!isPulling) return;
    isPulling = false;
    const dist = curY - startY;
    if(dist >= PTR_THRESHOLD && !isRefreshing){
      isRefreshing = true;
      ind.classList.add('ptr-refreshing');
      arrow.style.transform = '';
      try{
        if(typeof renderHome === 'function') await renderHome();
      }finally{
        isRefreshing = false;
        ind.classList.remove('ptr-visible','ptr-refreshing');
      }
    } else {
      ind.classList.remove('ptr-visible');
    }
    startY = 0; curY = 0;
  }, {passive:true});
// ── BHRAM localStorage CONSOLE HELPER ──
window.bhram={
  keys(){
    const all=Object.keys(localStorage).filter(k=>k.startsWith('yt_')||k.startsWith('LS_')||k.startsWith('bhram_'));
    console.table(all.map(k=>({key:k,size:localStorage[k].length+' chars'})));
    return all;
  },
  clear(key){
    if(key){localStorage.removeItem(key);console.log('🗑 Removed:',key);}
    else{
      const all=this.keys();
      all.forEach(k=>localStorage.removeItem(k));
      console.log('🗑 Cleared',all.length,'bhram keys. Reload page.');
    }
  },
  clearAll(){
    const n=localStorage.length;
    localStorage.clear();
    console.log('🗑 Full localStorage cleared ('+n+' keys). Reload page.');
  },
  show(key){
    try{console.log(key,JSON.parse(localStorage.getItem(key)));}
    catch{console.log(key,localStorage.getItem(key));}
  },
  help(){
    console.log(`%cbhram localStorage console
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bhram.keys()         → list all bhram keys
bhram.show('key')    → print value of key
bhram.clear()        → clear all bhram keys
bhram.clear('key')   → remove one key
bhram.clearAll()     → wipe entire localStorage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,'color:#00c853;font-family:monospace;font-size:13px');
  }
};
})();
// ── BHRAM localStorage CONSOLE HELPER ──
window.bhram={
  keys(){
    const all=Object.keys(localStorage).filter(k=>k.startsWith('yt_')||k.startsWith('LS_')||k.startsWith('bhram_'));
    console.table(all.map(k=>({key:k,size:localStorage[k].length+' chars'})));
    return all;
  },
  clear(key){
    if(key){localStorage.removeItem(key);console.log('🗑 Removed:',key);}
    else{
      const all=this.keys();
      all.forEach(k=>localStorage.removeItem(k));
      console.log('🗑 Cleared',all.length,'bhram keys. Reload page.');
    }
  },
  clearAll(){
    const n=localStorage.length;
    localStorage.clear();
    console.log('🗑 Full localStorage cleared ('+n+' keys). Reload page.');
  },
  show(key){
    try{console.log(key,JSON.parse(localStorage.getItem(key)));}
    catch{console.log(key,localStorage.getItem(key));}
  },
  help(){
    console.log(`%cbhram localStorage console
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bhram.keys()         → list all bhram keys
bhram.show('key')    → print value of key
bhram.clear()        → clear all bhram keys
bhram.clear('key')   → remove one key
bhram.clearAll()     → wipe entire localStorage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,'color:#00c853;font-family:monospace;font-size:13px');
  }
};
console.log('%c[bhram] type bhram.help() for localStorage utils','color:#00c853;font-size:11px;font-family:monospace');
