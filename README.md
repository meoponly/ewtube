# YouTube Clone — Multi-File Structure

Your project is now split into proper separate files!

## 📁 Project Structure

```
youtube-clone/
├── index.html              ← Main entry point (just loads everything)
├── youtube.png             ← Favicon
├── channels4_profile.jpg   ← Profile image
│
├── css/
│   └── main.css            ← All styles (split from inline <style>)
│
├── js/
│   ├── core.js             ← API keys, constants, utility functions, settings
│   ├── home.js             ← Home feed rendering
│   ├── channel.js          ← Channel page logic
│   ├── search.js           ← Search functionality
│   ├── navigation.js       ← Navigation, notifications, profile dropdown
│   ├── watchlater_playlists.js ← Watch Later & My Playlists
│   ├── admin.js            ← Admin panel
│   ├── ptr.js              ← Pull-to-refresh (mobile)
│   └── loader.js           ← Loads HTML partials and boots the app
│
└── pages/
    ├── header.html         ← Top header with search bar
    ├── notification.html   ← Notification panel
    ├── sidebar.html        ← Left sidebar navigation
    ├── main.html           ← Main content area (wraps all page sections)
    │   ├── channel-page    ← Channel page section
    │   ├── home-search     ← Home feed + search results
    │   ├── history         ← Watch history page
    │   ├── watchlater      ← Watch Later page
    │   └── myplaylists     ← My Playlists page
    └── modals.html         ← All modals (settings, new playlist, etc.)
```

## 🚀 How to Run (Local Hosting)

> ⚠️ You CANNOT just double-click index.html — browsers block `fetch()` for local files.
> You need a local server. Here are 3 easy ways:

---

### Option 1: VS Code Live Server (Easiest)
1. Install **Live Server** extension in VS Code
2. Right-click `index.html` → **Open with Live Server**
3. Opens at `http://localhost:5500`

---

### Option 2: Python (Built-in, No Install)
```bash
cd youtube-clone
python3 -m http.server 8080
```
Then open: **http://localhost:8080**

---

### Option 3: Node.js (npx serve)
```bash
cd youtube-clone
npx serve .
```
Then open the URL it shows (usually **http://localhost:3000**)

---

## 🌐 Hosting on the Internet (Free)

### Netlify Drop (Easiest — No account needed!)
1. Go to **https://app.netlify.com/drop**
2. Drag and drop your entire `youtube-clone/` folder
3. You get a live URL instantly! (e.g. `https://funny-name-123.netlify.app`)

### GitHub Pages (Free, permanent)
1. Push folder to a GitHub repo
2. Go to repo Settings → Pages → Source: `main` branch
3. Your site is live at `https://yourusername.github.io/repo-name`

### Vercel (Also free)
```bash
npm i -g vercel
cd youtube-clone
vercel
```
Follow the prompts — done!

---

## 💡 How the Multi-File Loading Works

`loader.js` uses `fetch()` to load the HTML partial files from `pages/` folder,
then injects them into the page and boots the app — just like how React/Vue work,
but without any build step needed.

```
index.html loads →
  css/main.css (styles)
  js/core.js + js/home.js + ... (logic)
  js/loader.js (last) →
    fetch pages/header.html
    fetch pages/sidebar.html
    fetch pages/main.html
    fetch pages/modals.html
    → inject all into DOM
    → call renderHome() to start the app
```
