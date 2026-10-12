// popup.js
// This runs when you click the extension icon. It does NOT have direct access
// to the webpage's DOM — that's the content script's job. So it sends a message
// to content.js and waits for a response. This message-passing pattern is the
// core of how Chrome extensions work.

document.getElementById("checkPageBtn").addEventListener("click", async () => {
  const resultDiv = document.getElementById("result");
  resultDiv.textContent = "Checking...";

  // Find the currently active browser tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Send a message into that tab's content script
  chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_INFO" }, (response) => {
    if (chrome.runtime.lastError) {
      // This fires if content.js isn't running on this page
      // (e.g., you're not on leetcode.com)
      resultDiv.textContent = "Not on a supported page (try leetcode.com).";
      return;
    }
    resultDiv.textContent = `Page title: ${response.pageTitle}`;
  });
});

document.getElementById("extractBtn").addEventListener("click", async () => {
  const resultDiv = document.getElementById("result");
  resultDiv.textContent = "Extracting...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PROBLEM" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      resultDiv.textContent = "Not on a supported page (try a leetcode.com problem).";
      return;
    }

    // Just dump the raw extracted data for now so you can SEE what's working.
    // Later this is exactly what gets sent to Gemini instead of shown raw.
    resultDiv.innerHTML = `
      <strong>${response.title}</strong> (${response.difficulty})<br/><br/>
      <em>Statement:</em><br/>${response.statement.slice(0, 150)}...<br/><br/>
      <em>Your code (${response.code.length} chars):</em><br/>
      <pre style="white-space:pre-wrap;font-size:11px;">${response.code.slice(0, 200)}</pre>
    `;
  });
});

// ---------------------------------------------------------------------------
// API KEY STORAGE
// We use chrome.storage.local instead of hardcoding the key in source code.
// This means the key lives only on YOUR machine, never in a file you'd commit
// to git/GitHub — important since this project will likely end up in a public repo.
// ---------------------------------------------------------------------------
async function loadSavedKeyStatus() {
  const { geminiApiKey } = await chrome.storage.local.get("geminiApiKey");
  const statusEl = document.getElementById("keyStatus");
  statusEl.textContent = geminiApiKey ? "Key saved ✓" : "No key saved yet";
}

document.getElementById("saveKeyBtn").addEventListener("click", async () => {
  const key = document.getElementById("apiKeyInput").value.trim();
  if (!key) return;
  await chrome.storage.local.set({ geminiApiKey: key });
  document.getElementById("apiKeyInput").value = "";
  loadSavedKeyStatus();
});

loadSavedKeyStatus();

// ---------------------------------------------------------------------------
// GEMINI API CALL
// ---------------------------------------------------------------------------
async function getHintFromGemini(statement, code) {
  const { geminiApiKey } = await chrome.storage.local.get("geminiApiKey");
  if (!geminiApiKey) {
    throw new Error("No API key saved. Open settings and paste your key first.");
  }

  // The prompt is deliberately framed to request a HINT, not a full solution —
  // this keeps the tool in "practice aid" territory rather than something that
  // just hands you contest answers.
  const prompt = `You are a coding practice assistant. A student is working on this problem:

PROBLEM STATEMENT:
${statement}

THEIR CURRENT CODE:
${code}

Give a short, specific HINT to help them move forward — point out a bug, missing edge case,
or the right approach to consider next. Do NOT write a full working solution. Keep it under
100 words.`;

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 150)}`);
  }

  const data = await response.json();
  // Defensive parsing — the exact response shape can vary slightly, so don't
  // assume candidates[0] always exists.
  const hintText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return hintText || "No hint returned — try again.";
}

// ---------------------------------------------------------------------------
// PERSISTENT SESSIONS
// Hints are saved per-problem-title in chrome.storage.local, so reopening the
// popup on the same LeetCode problem shows your previous hints instead of
// starting from a blank slate.
// ---------------------------------------------------------------------------
async function saveHintToHistory(problemTitle, hintText) {
  const storageKey = `hints:${problemTitle}`;
  const existing = await chrome.storage.local.get(storageKey);
  const history = existing[storageKey] || [];
  history.push({ hint: hintText, timestamp: Date.now() });
  await chrome.storage.local.set({ [storageKey]: history });
}

async function loadHintHistory(problemTitle) {
  const storageKey = `hints:${problemTitle}`;
  const existing = await chrome.storage.local.get(storageKey);
  return existing[storageKey] || [];
}

function renderHistoryHtml(history) {
  if (history.length === 0) return "";
  const items = history
    .slice()
    .reverse() // most recent first
    .map((h) => `<div class="historyItem">${renderMarkdown(h.hint)}</div>`)
    .join("");
  return `<details class="historyBlock"><summary>Previous hints (${history.length})</summary>${items}</details>`;
}

// ---------------------------------------------------------------------------
// WEB SPEECH API — read the hint aloud
// ---------------------------------------------------------------------------
function speakHint(rawText) {
  // Cancel anything currently speaking first, so clicking the button
  // repeatedly doesn't queue up overlapping speech
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(stripMarkdownForSpeech(rawText));
  speechSynthesis.speak(utterance);
}

document.getElementById("hintBtn").addEventListener("click", async () => {
  const resultDiv = document.getElementById("result");
  resultDiv.textContent = "Reading problem...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PROBLEM" }, async (response) => {
    if (chrome.runtime.lastError || !response) {
      resultDiv.textContent = "Not on a supported page (try a leetcode.com problem).";
      return;
    }

    resultDiv.textContent = "Asking Gemini for a hint...";

    try {
      const hint = await getHintFromGemini(response.statement, response.code);
      await saveHintToHistory(response.title, hint);
      const history = await loadHintHistory(response.title);

      resultDiv.innerHTML = `
        <strong>💡 Hint:</strong>
        <button id="speakBtn" title="Read aloud" style="float:right;">🔊</button>
        <div class="hintText">${renderMarkdown(hint)}</div>
        ${renderHistoryHtml(history)}
      `;

      document.getElementById("speakBtn").addEventListener("click", () => speakHint(hint));
    } catch (err) {
      resultDiv.textContent = `Error: ${err.message}`;
    }
  });
});

// ---------------------------------------------------------------------------
// MANUAL REVIEW CHECK (for testing — normally background.js does this hourly
// on its own via chrome.alarms, even with the popup closed)
// ---------------------------------------------------------------------------
document.getElementById("checkReviewsBtn").addEventListener("click", async () => {
  const resultDiv = document.getElementById("result");
  resultDiv.textContent = "Checking for due reviews...";
  await chrome.runtime.sendMessage({ type: "CHECK_REVIEWS_NOW" });
  resultDiv.textContent =
    "Check complete. If any problem was due, you should see a system notification.";
});
