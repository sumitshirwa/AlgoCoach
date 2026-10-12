// world-main.js
// IMPORTANT: this file runs in the page's MAIN world (see manifest.json "world": "MAIN").
// That means it CAN see window.monaco (LeetCode's code editor library), but it CANNOT
// use chrome.runtime.* APIs — those only exist in the isolated content-script world.
// So this file's only job is: read data from the page, then hand it to content.js
// using a CustomEvent on `document` (the one channel both worlds can share).

function getCurrentEditorCode() {
  try {
    if (window.monaco && window.monaco.editor) {
      const models = window.monaco.editor.getModels();
      if (models.length > 0) {
        // The first model is usually the active code editor's content
        return models[0].getValue();
      }
    }
  } catch (err) {
    console.warn("[AZ Problem Tracker] Could not read Monaco editor:", err);
  }
  return null; // fallback if Monaco isn't found (e.g. LeetCode changed editor library)
}

// Wait for a request from content.js, then reply with the code
document.addEventListener("AZ_REQUEST_CODE", () => {
  const code = getCurrentEditorCode();
  document.dispatchEvent(
    new CustomEvent("AZ_RESPONSE_CODE", { detail: { code } })
  );
});
