// -------------------------------------------------------------
// Markdown & Wiki Link Rendering Module
// -------------------------------------------------------------

export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(str) {
  return escapeHtml(str);
}

export function renderMarkdown(raw, titleToIdMap = new Map()) {
  if (!raw) return "";

  const lines = raw.split("\n");
  let html = [];
  let inList = false;

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  function inlineFormat(text) {
    // Images: ![alt](url)
    text = text.replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, url) => {
      return `<img src="${escapeAttr(url.trim())}" alt="${escapeAttr(alt.trim())}" class="page-image" />`;
    });
    // Bold & Italic
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // Wiki Links: [[Page Title]]
    text = text.replace(/\[\[(.+?)\]\]/g, (m, name) => {
      const unescapedName = name.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
      const id = titleToIdMap.get(unescapedName.trim().toLowerCase());
      if (id) return `<a href="#" class="wiki-link" data-id="${id}">${name}</a>`;
      return `<a href="#" class="wiki-link missing" data-new-title="${escapeAttr(unescapedName)}">${name}</a>`;
    });
    return text;
  }

  for (let rawLine of lines) {
    const line = escapeHtml(rawLine);
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed.startsWith("# ")) {
      closeList();
      html.push(`<h1>${inlineFormat(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith("## ")) {
      closeList();
      html.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith("### ")) {
      closeList();
      html.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`);
    } else {
      closeList();
      html.push(`<p>${inlineFormat(trimmed)}</p>`);
    }
  }

  closeList();
  return html.join("");
}
