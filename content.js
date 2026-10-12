// content.js
// Runs in the isolated content-script world: can read the DOM, can use chrome.runtime,
// but CANNOT see window.monaco directly (that's world-main.js's job — see manifest.json).

console.log("[AZ Problem Tracker] content script loaded on:", window.location.href);

// ---------------------------------------------------------------------------
// SELECTORS CONFIG
// LeetCode's CSS class names are auto-generated and change on redeploys, so avoid
// hardcoding them where possible. If extraction breaks, open DevTools (F12) on a
// LeetCode problem page, right-click the element you need -> Inspect, and update
// the relevant line below.
// ---------------------------------------------------------------------------
const SELECTORS = {
  // Difficulty badge text is usually "Easy" / "Medium" / "Hard" inside a small span.
  // We search by TEXT CONTENT instead of class name, since that's far more stable.
  difficultyCandidates: ["Easy", "Medium", "Hard"],
};

function extractDifficulty() {
  const allSpans = document.querySelectorAll("span, div");
  for (const el of allSpans) {
    const text = el.textContent.trim();
    if (SELECTORS.difficultyCandidates.includes(text) && text.length < 10) {
      return text;
    }
  }
  return "Unknown";
}

function extractProblemStatement() {
  // Primary source: the meta description tag. LeetCode populates this for SEO,
  // and it's far more stable than scraping the rendered description div.
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && metaDesc.content && metaDesc.content.length > 20) {
    return metaDesc.content;
  }
  return "Could not extract problem statement (meta tag missing or empty).";
}

function extractProblemTitle() {
  // document.title on LeetCode usually looks like: "Two Sum - LeetCode"
  return document.title.replace(/\s*-\s*LeetCode\s*$/i, "").trim();
}

// Ask world-main.js (running in the page's own JS context) for the current code
// in the Monaco editor. We can't read window.monaco from here directly, so we
// dispatch a custom event and wait for the reply.
function requestEditorCode() {
  return new Promise((resolve) => {
    const handleResponse = (event) => {
      document.removeEventListener("AZ_RESPONSE_CODE", handleResponse);
      resolve(event.detail.code);
    };
    document.addEventListener("AZ_RESPONSE_CODE", handleResponse);
    document.dispatchEvent(new CustomEvent("AZ_REQUEST_CODE"));

    // Safety timeout in case world-main.js never responds
    setTimeout(() => {
      document.removeEventListener("AZ_RESPONSE_CODE", handleResponse);
      resolve(null);
    }, 1000);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PAGE_INFO") {
    sendResponse({ pageTitle: document.title });
    return;
  }

  if (message.type === "EXTRACT_PROBLEM") {
    // sendResponse must stay open until our async work finishes, hence `return true`
    (async () => {
      const code = await requestEditorCode();
      sendResponse({
        title: extractProblemTitle(),
        difficulty: extractDifficulty(),
        statement: extractProblemStatement(),
        code: code || "(Could not read editor — open a problem's code tab and try again)",
      });
    })();
    return true; // tells Chrome: "wait, sendResponse will be called asynchronously"
  }
});
