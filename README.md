# AlgoCoach

A Chrome extension that gives AI-assisted hints while solving problems on LeetCode, with spaced-repetition reminders to revisit problems you haven't touched in a while.

Built as a personal practice tool — designed to nudge you toward the right approach, not hand you a full solution.

## Features

- **Context-aware hints** — extracts the current problem statement and your in-progress code, then asks Gemini for a short, targeted hint (not a full solution)
- **Markdown-formatted responses** — hints render with bold text, inline code, and lists instead of raw markdown syntax
- **Read-aloud hints** — uses the browser's built-in Web Speech API to read any hint out loud
- **Persistent hint history** — every hint is saved per problem, so reopening the popup on the same problem shows what you tried before
- **Spaced-repetition reminders** — a background service worker checks (via `chrome.alarms`) whether any problem hasn't been revisited in 3+ days, and fires a desktop notification if so

## Tech stack

- **Manifest V3** Chrome Extension
- **Content scripts** — one in the isolated world (DOM access + `chrome.runtime` messaging), one in the page's MAIN world (reads the Monaco editor's live code via `window.monaco`)
- **Service worker** (`background.js`) — `chrome.alarms` + `chrome.notifications`, runs independently of the popup
- **Gemini API** (`gemini-2.5-flash`) — called directly from the popup via `fetch`
- **`chrome.storage.local`** — stores the API key and per-problem hint history
- Custom lightweight Markdown renderer (no external library — only the handful of markdown features Gemini actually uses)

## Architecture notes

A couple of non-obvious design decisions worth knowing if you're reading the code:

**Why two content scripts?**
Chrome content scripts run in an "isolated world" by default — they can read the page's DOM, but can't see JavaScript variables the page itself defined (like LeetCode's `window.monaco` editor object). `world-main.js` is injected into the page's own JS context (`"world": "MAIN"` in the manifest) specifically to reach `window.monaco`, then hands that data back to `content.js` via a `CustomEvent` on `document` — the one channel both worlds can share.

**Why a service worker instead of just checking on popup open?**
Spaced-repetition reminders need to fire even when you haven't opened the extension in days. `chrome.alarms` lets Chrome wake the service worker on a schedule (here, hourly) regardless of whether the popup is open. Service workers have no persistent memory between wakeups, so all state (hint history, last-notified timestamps) lives in `chrome.storage`, not in-memory variables.

**Why fetch the Gemini API directly from the popup?**
Extension pages (popup, background) aren't bound by a website's CORS/CSP rules the way a regular webpage is, so a direct `fetch` call works without a separate backend server.

## Setup

1. Clone or download this repo
2. Get a free Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
3. Go to `chrome://extensions` in Chrome
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** and select this project's folder
6. Click the AlgoCoach icon in your toolbar → expand **API Key Settings** → paste your key → **Save key**
7. Open any LeetCode problem and click **Get AI Hint**

## File structure

```
algocoach/
├── manifest.json      # Extension config: permissions, content scripts, background worker
├── background.js      # Service worker: spaced-repetition checks via chrome.alarms
├── content.js         # Isolated-world content script: DOM parsing, message routing
├── world-main.js       # MAIN-world script: reads live code from window.monaco
├── markdown.js        # Tiny custom Markdown-to-HTML renderer
├── popup.html/css/js  # Extension popup UI and logic
└── icons/             # Toolbar icons
```

## Known limitations

- Currently scoped to LeetCode only (the original goal was multi-platform support across LeetCode, CodeChef, and Codeforces — DOM selectors for the other two aren't implemented yet)
- Relies on `meta[name="description"]` and text-based difficulty matching rather than hardcoded CSS classes, since LeetCode's class names are auto-generated and change frequently — but this means extraction quality depends on LeetCode keeping that meta tag populated
- The Monaco editor reader assumes `window.monaco.editor.getModels()[0]` is the active editor, which may not hold if LeetCode's page structure changes

## License

Personal project, built for learning and practice. Not affiliated with LeetCode or Google.
