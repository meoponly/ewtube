/**
 * loader.js — Fetches all HTML partials from pages/ folder
 * and injects them into #app-root, then boots the app.
 *
 * This is what replaces the giant single index.html.
 * Each page section lives in its own file under pages/.
 */

'use strict';

// Pages to load in order (they'll be injected sequentially into #app-root)
const PAGES = [
  'pages/header.html',
  'pages/notification.html',
  'pages/sidebar.html',
  'pages/main.html',   // wraps: channel-page, home-search, history, watchlater, myplaylists
  'pages/modals.html',
];

async function fetchPartial(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.text();
}

async function loadApp() {
  const root = document.getElementById('app-root');

  try {
    // Load all partials in parallel for speed
    const htmlParts = await Promise.all(PAGES.map(fetchPartial));

    // Inject into DOM
    root.innerHTML = htmlParts.join('\n');

    // After DOM is ready, boot the app
    bootApp();

  } catch (err) {
    root.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;color:#ede8e3;font-family:sans-serif">
        <span style="font-size:48px">⚠️</span>
        <h2>Failed to load app</h2>
        <p style="color:#a09080;font-size:14px">${err.message}</p>
        <p style="color:#6b5e52;font-size:13px">Make sure you're running a local server (see README.md)</p>
      </div>
    `;
    console.error('[loader] App load failed:', err);
  }
}

function bootApp() {
  // Core app boot — same as what was at the bottom of the old index.html
  if (typeof initAdmin === 'function') initAdmin();
  if (typeof applyFocusModeUI === 'function') applyFocusModeUI();

  // Theme
  const light = localStorage.getItem('yt_light_mode') === '1';
  if (light) document.body.classList.add('light-mode');

  // Render home feed
  if (typeof renderHome === 'function') renderHome();

  // Set up search input listeners
  if (typeof setupSearchInput === 'function') setupSearchInput();

  // Render history
  if (typeof renderHistory === 'function') {
    const saved = JSON.parse(localStorage.getItem('yt_history_v1') || '[]');
    renderHistory(saved);
  }

  // Render watch later
  if (typeof renderWatchLater === 'function') renderWatchLater();

  // Render my playlists
  if (typeof renderMyPlaylists === 'function') renderMyPlaylists();

  // Apply sidebar collapse state
  const collapsed = localStorage.getItem('yt_sidebar_collapsed') === '1';
  if (collapsed) document.body.classList.add('sidebar-collapsed');

  console.log('[loader] ✅ App booted successfully');
}

// Start loading when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadApp);
} else {
  loadApp();
}
