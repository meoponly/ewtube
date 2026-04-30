/**
 * router.js — Full URL routing for all pages
 * Works correctly for GitHub Pages subfolder: /ewtube/
 *
 * /ewtube/                        → Home
 * /ewtube/history                 → Watch History
 * /ewtube/watchlater              → Watch Later
 * /ewtube/playlists               → My Playlists
 * /ewtube/search?q=ioqm           → Search
 * /ewtube/channel?c=MrBeast       → Channel page
 * /ewtube/playlist?id=PLxxx       → Playlist page
 */

'use strict';

// ── AUTO DETECT BASE PATH ──
// Works for both local (/) and GitHub Pages (/ewtube/)
const BASE = (() => {
  const path = window.location.pathname;
  // Find the base by looking for index.html or the repo folder
  const match = path.match(/^(\/[^/]+\/)/);
  // If we're at root or just /ewtube/ return that
  if (path === '/' || path === '/index.html') return '/';
  if (match) return match[1]; // e.g. "/ewtube/"
  return '/';
})();

// ── UPDATE URL ──
function updateURL(section, params = {}) {
  let path = BASE;
  const query = new URLSearchParams();

  switch (section) {
    case 'home':
      path = BASE;
      break;
    case 'history':
      path = BASE + 'history';
      break;
    case 'watchlater':
      path = BASE + 'watchlater';
      break;
    case 'myplaylists':
      path = BASE + 'playlists';
      break;
    case 'search':
      path = BASE + 'search';
      if (params.q) query.set('q', params.q);
      break;
    case 'channel':
      path = BASE + 'channel';
      if (params.name) query.set('c', params.name);
      break;
    case 'playlist':
      path = BASE + 'playlist';
      if (params.id)   query.set('id', params.id);
      if (params.name) query.set('name', params.name);
      if (params.ch)   query.set('ch', params.ch);
      break;
    default:
      path = BASE + section;
  }

  const qs = query.toString();
  const fullPath = qs ? `${path}?${qs}` : path;

  if (window.location.pathname + window.location.search !== fullPath) {
    history.pushState({ section, params }, '', fullPath);
  }
}

// ── READ URL & NAVIGATE ON PAGE LOAD ──
function handleInitialURL() {
  // Strip base from pathname to get the "section" part
  // e.g. /ewtube/history → history
  const rawPath = window.location.pathname;
  const stripped = rawPath.replace(BASE, '').replace(/^\//, '').replace(/\/$/, '');
  const params = new URLSearchParams(window.location.search);

  // GitHub Pages 404 redirect — ?r=/ewtube/history
  const redirect = params.get('r');
  if (redirect) {
    history.replaceState(null, '', redirect);
    handleInitialURL();
    return;
  }

  switch (stripped) {
    case '':
    case 'index.html':
      break; // Home, do nothing

    case 'history':
      waitForApp(() => showSection('history'));
      break;

    case 'watchlater':
      waitForApp(() => showSection('watchlater'));
      break;

    case 'playlists':
      waitForApp(() => showSection('myplaylists'));
      break;

    case 'search':
      const q = params.get('q');
      if (q) {
        waitForApp(() => {
          const input = document.getElementById('q');
          if (input) { input.value = q; doSearch(); }
        });
      }
      break;

    case 'channel':
      const chName = params.get('c');
      if (chName) waitForApp(() => openChannel(chName));
      break;

    case 'playlist':
      const plId   = params.get('id');
      const plName = params.get('name') || 'Playlist';
      const plCh   = params.get('ch') || '';
      if (plId) waitForApp(() => openSearchPlaylist(plId, plName, plCh));
      break;
  }
}

// ── BROWSER BACK / FORWARD ──
window.addEventListener('popstate', (e) => {
  const { section, params = {} } = e.state || {};

  if (!section || section === 'home') {
    goHome();
    return;
  }

  switch (section) {
    case 'search':
      if (params.q) {
        const input = document.getElementById('q');
        if (input) { input.value = params.q; doSearch(); }
      }
      break;
    case 'channel':
      if (params.name) openChannel(params.name);
      break;
    case 'playlist':
      if (params.id) openSearchPlaylist(params.id, params.name || '', params.ch || '');
      break;
    default:
      showSection(section);
  }
});

// ── HELPER: wait for app DOM to be ready ──
function waitForApp(fn) {
  if (document.getElementById('search-section')) {
    fn();
  } else {
    window.addEventListener('app-ready', fn, { once: true });
  }
}

// ── RUN ON LOAD ──
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', handleInitialURL);
} else {
  handleInitialURL();
}
