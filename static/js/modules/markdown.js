// -------------------------------------------------------------
// Markdown & Wiki Link Rendering Module
// Full CommonMark / GFM support (self-contained, offline)
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

function sanitizeUrl(url) {
  if (!url) return "#";
  const trimmed = url.trim();
  // Allow safe protocols + relative / local anchors
  if (/^(?:https?:\/\/|mailto:|tel:|\/|#|\.\/|\.\.\/|data:image\/)/i.test(trimmed)) {
    return escapeAttr(trimmed);
  }
  return "#";
}

export function renderMarkdown(raw, titleToIdMap = new Map()) {
  if (!raw) return "";

  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out = [];

  let inCodeBlock = false;
  let codeLang = "";
  let codeLines = [];

  let listStack = []; // [{ type: 'ul'|'ol', indent: number }]
  let inBlockquote = false;
  let bqLines = [];

  let tableLines = [];

  function closeAllLists() {
    while (listStack.length > 0) {
      const top = listStack.pop();
      out.push(`</${top.type}>`);
    }
  }

  function flushBlockquote() {
    if (inBlockquote) {
      inBlockquote = false;
      const inner = renderMarkdown(bqLines.join("\n"), titleToIdMap);
      out.push(`<blockquote>${inner}</blockquote>`);
      bqLines = [];
    }
  }

  function flushTable() {
    if (tableLines.length === 0) return;
    const parsed = renderTable(tableLines, titleToIdMap);
    if (parsed) {
      out.push(parsed);
    } else {
      // Fallback: render each line as normal markdown
      for (const tline of tableLines) {
        out.push(`<p>${renderInlines(tline, titleToIdMap)}</p>`);
      }
    }
    tableLines = [];
  }

  function renderTable(tlines, map) {
    if (tlines.length < 2) return null;
    const headerLine = tlines[0];
    const alignLine = tlines[1];

    // Check separator format: | :--- | :---: | ---: |
    const alignCells = splitTableRow(alignLine);
    const isAlignRow = alignCells.length > 0 && alignCells.every(c => /^:?-+:?$/.test(c.trim()));
    if (!isAlignRow) return null;

    const alignments = alignCells.map(c => {
      const s = c.trim();
      const left = s.startsWith(":");
      const right = s.endsWith(":");
      if (left && right) return "center";
      if (right) return "right";
      if (left) return "left";
      return "";
    });

    const headerCells = splitTableRow(headerLine);
    let html = ['<div class="table-wrap"><table class="ledger-table"><thead><tr>'];
    headerCells.forEach((c, idx) => {
      const align = alignments[idx] ? ` style="text-align:${alignments[idx]}"` : "";
      html.push(`<th${align}>${renderInlines(c.trim(), map)}</th>`);
    });
    html.push("</tr></thead><tbody>");

    for (let i = 2; i < tlines.length; i++) {
      const rowCells = splitTableRow(tlines[i]);
      if (rowCells.length === 0) continue;
      html.push("<tr>");
      rowCells.forEach((c, idx) => {
        const align = alignments[idx] ? ` style="text-align:${alignments[idx]}"` : "";
        html.push(`<td${align}>${renderInlines(c.trim(), map)}</td>`);
      });
      // Fill missing columns if uneven
      for (let k = rowCells.length; k < headerCells.length; k++) {
        html.push("<td></td>");
      }
      html.push("</tr>");
    }

    html.push("</tbody></table></div>");
    return html.join("");
  }

  function splitTableRow(row) {
    let s = row.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    return s.split("|");
  }

  function handleList(rawLine, listType, markerIndent, content) {
    // Check for task list checkboxes: [ ] or [x]
    let taskHtml = "";
    const taskMatch = content.match(/^\[([ xX])\]\s+(.*)$/);
    let itemContent = content;
    let isTask = false;
    if (taskMatch) {
      isTask = true;
      const checked = taskMatch[1].toLowerCase() === "x";
      taskHtml = `<input type="checkbox" disabled ${checked ? "checked" : ""} class="task-checkbox"> `;
      itemContent = taskMatch[2];
    }

    // Adjust nesting stack
    if (listStack.length === 0) {
      listStack.push({ type: listType, indent: markerIndent });
      out.push(`<${listType}${isTask ? ' class="task-list"' : ""}>`);
    } else {
      let top = listStack[listStack.length - 1];
      if (markerIndent > top.indent) {
        listStack.push({ type: listType, indent: markerIndent });
        out.push(`<${listType}${isTask ? ' class="task-list"' : ""}>`);
      } else {
        while (listStack.length > 0 && markerIndent < listStack[listStack.length - 1].indent) {
          const popped = listStack.pop();
          out.push(`</${popped.type}>`);
        }
        if (listStack.length === 0 || listStack[listStack.length - 1].type !== listType) {
          if (listStack.length > 0) {
            const popped = listStack.pop();
            out.push(`</${popped.type}>`);
          }
          listStack.push({ type: listType, indent: markerIndent });
          out.push(`<${listType}${isTask ? ' class="task-list"' : ""}>`);
        }
      }
    }

    const liClass = isTask ? ' class="task-item"' : "";
    out.push(`<li${liClass}>${taskHtml}${renderInlines(itemContent, titleToIdMap)}</li>`);
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // 1. Fenced code block check (``` or ~~~)
    const codeMatch = rawLine.match(/^[ ]{0,3}(`{3,}|~{3,})(.*)$/);
    if (codeMatch) {
      if (!inCodeBlock) {
        closeAllLists();
        flushBlockquote();
        flushTable();
        inCodeBlock = true;
        codeLang = codeMatch[2].trim().toLowerCase();
        codeLines = [];
        continue;
      } else {
        // Closing code block
        inCodeBlock = false;
        const codeText = escapeHtml(codeLines.join("\n"));
        const langClass = codeLang ? ` class="language-${escapeAttr(codeLang)}"` : "";
        out.push(`<pre><code${langClass}>${codeText}</code></pre>`);
        codeLines = [];
        codeLang = "";
        continue;
      }
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    // 2. Blockquotes (> ...)
    const bqMatch = rawLine.match(/^[ ]{0,3}>\s?(.*)$/);
    if (bqMatch) {
      closeAllLists();
      flushTable();
      inBlockquote = true;
      bqLines.push(bqMatch[1]);
      continue;
    } else {
      flushBlockquote();
    }

    // 3. Tables (| ... | ... |)
    const tableMatch = rawLine.match(/^[ ]{0,3}\|(.+)\|[ ]*$/);
    if (tableMatch) {
      closeAllLists();
      tableLines.push(rawLine);
      continue;
    } else {
      flushTable();
    }

    const trimmed = rawLine.trim();

    // 4. Blank lines
    if (!trimmed) {
      closeAllLists();
      continue;
    }

    // 5. Horizontal rules (---, ***, ___ with optional spaces)
    if (/^[ ]{0,3}([-*_])[ ]*(?:\1[ ]*){2,}$/.test(rawLine)) {
      closeAllLists();
      out.push("<hr />");
      continue;
    }

    // 6. ATX Headings (# to ######)
    const headingMatch = rawLine.match(/^[ ]{0,3}(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeAllLists();
      const level = headingMatch[1].length;
      const headingContent = headingMatch[2].replace(/\s+#+$/, ""); // Strip trailing hashes
      out.push(`<h${level}>${renderInlines(headingContent, titleToIdMap)}</h${level}>`);
      continue;
    }

    // 7. Unordered Lists (-, *, +)
    const ulMatch = rawLine.match(/^([ ]*)([-*+])\s+(.*)$/);
    if (ulMatch) {
      const indent = ulMatch[1].length;
      handleList(rawLine, "ul", indent, ulMatch[3]);
      continue;
    }

    // 8. Ordered Lists (1., 2., etc.)
    const olMatch = rawLine.match(/^([ ]*)(\d+)\.\s+(.*)$/);
    if (olMatch) {
      const indent = olMatch[1].length;
      handleList(rawLine, "ol", indent, olMatch[3]);
      continue;
    }

    // 9. Standard Paragraphs
    closeAllLists();
    out.push(`<p>${renderInlines(trimmed, titleToIdMap)}</p>`);
  }

  // Cleanup pending structures at end of text
  if (inCodeBlock && codeLines.length > 0) {
    const codeText = escapeHtml(codeLines.join("\n"));
    const langClass = codeLang ? ` class="language-${escapeAttr(codeLang)}"` : "";
    out.push(`<pre><code${langClass}>${codeText}</code></pre>`);
  }
  closeAllLists();
  flushBlockquote();
  flushTable();

  return out.join("\n");
}

// -------------------------------------------------------------
// Inline Markdown Parser
// Handles: bold, italic, bold+italic, strikethrough, inline code,
// images, standard links, [[Wiki Links]], and autolinks
// -------------------------------------------------------------
function renderInlines(text, titleToIdMap = new Map()) {
  if (!text) return "";

  // 1. Extract and protect inline code `code` with placeholders
  const codeSnippets = [];
  text = text.replace(/`([^`]+)`/g, (match, code) => {
    const idx = codeSnippets.length;
    codeSnippets.push(`<code>${escapeHtml(code)}</code>`);
    return `\x1aCODE_${idx}\x1a`;
  });

  // 2. Images: ![alt](url "title")
  text = text.replace(/!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)/g, (match, alt, url, title) => {
    const cleanUrl = sanitizeUrl(url);
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
    return `<img src="${cleanUrl}" alt="${escapeAttr(alt)}" class="page-image"${titleAttr} />`;
  });

  // 3. Wiki Links: [[Page Title]] or [[Page Title|Display Text]]
  text = text.replace(/\[\[(.+?)\]\]/g, (match, inner) => {
    let target = inner;
    let label = inner;
    if (inner.includes("|")) {
      const parts = inner.split("|");
      target = parts[0].trim();
      label = parts.slice(1).join("|").trim();
    }
    const cleanTarget = target.trim().toLowerCase();
    const id = titleToIdMap.get(cleanTarget);
    if (id) {
      return `<a href="#" class="wiki-link" data-id="${id}">${escapeHtml(label)}</a>`;
    }
    return `<a href="#" class="wiki-link missing" data-new-title="${escapeAttr(target.trim())}">${escapeHtml(label)}</a>`;
  });

  // 4. Standard Links: [text](url "title")
  text = text.replace(/\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)/g, (match, label, url, title) => {
    const cleanUrl = sanitizeUrl(url);
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
    return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer"${titleAttr}>${escapeHtml(label)}</a>`;
  });

  // 5. Bold & Italic combinations (***text*** or ___text___)
  text = text.replace(/(\*\*\*|___)(.+?)\1/g, "<strong><em>$2</em></strong>");

  // 6. Bold (**text** or __text__)
  text = text.replace(/(\*\*|__)(.+?)\1/g, "<strong>$2</strong>");

  // 7. Italic (*text* or _text_)
  text = text.replace(/(\*|_)(.+?)\1/g, "<em>$2</em>");

  // 8. Strikethrough (~~text~~)
  text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // 9. Restore inline code snippets
  text = text.replace(/\x1aCODE_(\d+)\x1a/g, (match, idx) => {
    return codeSnippets[parseInt(idx, 10)] || "";
  });

  return text;
}

