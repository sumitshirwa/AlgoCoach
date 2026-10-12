// markdown.js
// A deliberately small Markdown renderer — Gemini's hints only ever use a handful
// of markdown features (bold, inline code, bullet lists), so a full library like
// "marked" would be overkill. This covers exactly what we need.

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdown(rawText) {
  // 1. Escape HTML first so user/AI text can't inject real tags (basic XSS safety)
  let text = escapeHtml(rawText);

  // 2. Bold: **text** -> <strong>text</strong>
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // 3. Inline code: `code` -> <code>code</code>
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

  // 4. Bullet lists: lines starting with "- " or "* " become <li> items,
  //    consecutive ones get wrapped in a single <ul>.
  const lines = text.split("\n");
  let html = "";
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${trimmed.slice(2)}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      if (trimmed.length > 0) {
        html += `<p>${trimmed}</p>`;
      }
    }
  }
  if (inList) html += "</ul>";

  return html;
}

// Used by the Web Speech API later — speaking "asterisk asterisk bold asterisk
// asterisk" out loud would sound broken, so strip markdown symbols for speech only.
function stripMarkdownForSpeech(rawText) {
  return rawText
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .trim();
}
