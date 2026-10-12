// background.js
// This is a SERVICE WORKER (Manifest V3's replacement for old "background pages").
// Key difference from popup.js: this file has NO access to the DOM, and Chrome
// can shut it down and restart it at any time to save memory — so we can't rely
// on any in-memory variable surviving between runs. Anything we need to persist
// must go through chrome.storage, not a normal JS variable.

// For real use: 3 days. For TESTING, temporarily change this to something like
// 15 * 1000 (15 seconds) so you don't have to wait 3 real days to see it fire.
const REVIEW_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

// chrome.alarms.create persists across service worker restarts — Chrome remembers
// it internally, so we don't need to recreate it every time the worker wakes up.
// onInstalled fires once, when the extension is first loaded or updated.
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("reviewCheckAlarm", { periodInMinutes: 60 });
  console.log("[AlgoCoach] Review-check alarm scheduled (every 60 min).");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "reviewCheckAlarm") {
    checkForDueReviews();
  }
});

async function checkForDueReviews() {
  const all = await chrome.storage.local.get(null); // fetch everything in storage
  const now = Date.now();

  for (const key of Object.keys(all)) {
    if (!key.startsWith("hints:")) continue; // only care about per-problem hint history

    const history = all[key];
    if (!Array.isArray(history) || history.length === 0) continue;

    const lastHint = history[history.length - 1];
    const elapsed = now - lastHint.timestamp;
    if (elapsed < REVIEW_THRESHOLD_MS) continue; // not due yet

    // Avoid spamming a notification every single hour once a problem becomes due —
    // only notify once per "due" period by tracking the last notified timestamp.
    const notifiedKey = `notified:${key}`;
    const lastNotified = all[notifiedKey] || 0;
    if (lastNotified >= lastHint.timestamp) continue; // already notified for this hint

    const problemTitle = key.replace("hints:", "");

    chrome.notifications.create(`reminder-${problemTitle}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Time to revisit a problem",
      message: `It's been a few days since your last hint on "${problemTitle}". Try it again?`,
    });

    await chrome.storage.local.set({ [notifiedKey]: now });
  }
}

// Lets the popup trigger a check immediately (useful for testing without
// waiting for the hourly alarm, and for a "Check now" button in the UI).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHECK_REVIEWS_NOW") {
    checkForDueReviews().then(() => sendResponse({ done: true }));
    return true; // keep sendResponse alive for the async work above
  }
});
