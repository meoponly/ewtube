/**
 * router.js — Full URL routing for all pages
 * Makes URLs work like real YouTube:
 *
 * /                          → Home
 * /history                   → Watch History
 * /watchlater                → Watch Later
 * /playlists                 → My Playlists
 * /search?q=ioqm             → Search results for "ioqm"
 * /channel?c=MrBeast         → Channel page
 * /playlist?id=PLxxx&name=X  → Playlist page
 */

'use strict';

// ── UPDATE URL ──
// Call this whenever the user navigates somewhere

function updateURL(section, params = {}) {
  let path = '/';
  const query = new URLSearchParams();

  switch (section) {
    case 'home':
      path = '/';
      break;
    case 'history':
      path = '/history';
      break;
    case 'watchlater':
      path = '/watchlater';
      break;
    case 'myplaylists':
      path = '/playlists';
      break;
    case 'search':
      path = '/search';
      if (params.q) query.set('q', params.q);
      break;
    case 'channel':
      path = '/channel';
      if (params.name) query.set('c', params.name);
      break;
    case 'playlist':
      path = '/playlist';
      if (params.id)   query.set('id', params.id);
      if (params.name) query.set('name', params.name);
      if (params.ch)   query.set('ch', params.ch);
      break;
    default:
      path = '/' + section;
  }

  const qs = query.toString();
  const fullPath = qs ? `${path}?${qs}` : path;

  if (window.location.pathname + window.location.search !== fullPath) {
    history.pushState({ section, params }, '', fullPath);
  }
}

// ── READ URL & NAVIGATE ──
// Called on page load to go to the right section

function handleInitialURL() {
  const path = window.location.pathname.replace(/^\//, '');
  const params = new URLSearchParams(window.location.search);

  // GitHub Pages 404 redirect — /?r=/history
  const redirect = params.get('r');
  if (redirect) {
    history.replaceState(null, '', redirect);
    handleInitialURL();
    return;
  }

  switch (path) {
    case '':
    case 'index.html':
      // Home — default, do nothing
      break;

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
          if (input) {
            input.value = q;
            doSearch();
          }
        });
      }
      break;

    case 'channel':
      const chName = params.get('c');
      if (chName) {
        waitForApp(() => openChannel(chName));
      }
      break;

    case 'playlist':
      const plId   = params.get('id');
      const plName = params.get('name') || 'Playlist';
      const plCh   = params.get('ch') || '';
      if (plId) {
        waitForApp(() => openSearchPlaylist(plId, plName, plCh));
      }
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

// ── HELPER: wait for app to be ready ──
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
