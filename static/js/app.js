(() => {
  "use strict";

  const state = {
    pages: [],        // lightweight list (no content)
    currentPage: null, // full page object when viewing/editing
    editingId: null,   // id being edited, or null for "new"
  };

  // -------------------------------------------------------------
  // DOM refs
  // -------------------------------------------------------------
  const els = {
    categoryTree: document.getElementById("category-tree"),
    recentList: document.getElementById("recent-list"),
    searchInput: document.getElementById("search-input"),
    searchResults: document.getElementById("search-results"),

    viewPage: document.getElementById("view-page"),
    viewEmpty: document.getElementById("view-empty"),
    viewEditor: document.getElementById("view-editor"),

    pageTab: document.getElementById("page-tab"),
    pageCategory: document.getElementById("page-category"),
    pageTags: document.getElementById("page-tags"),
    pageTitle: document.getElementById("page-title"),
    pageAuthor: document.getElementById("page-author"),
    pageUpdated: document.getElementById("page-updated"),
    pageContent: document.getElementById("page-content"),

    editorForm: document.getElementById("editor-form"),
    fieldTitle: document.getElementById("field-title"),
    fieldCategory: document.getElementById("field-category"),
    fieldTags: document.getElementById("field-tags"),
    fieldAuthor: document.getElementById("field-author"),
    fieldContent: document.getElementById("field-content"),
    categoryOptions: document.getElementById("category-options"),

    newPageBtn: document.getElementById("new-page-btn"),
    emptyNewPageBtn: document.getElementById("empty-new-page-btn"),
    editPageBtn: document.getElementById("edit-page-btn"),
    deletePageBtn: document.getElementById("delete-page-btn"),
    cancelEditBtn: document.getElementById("cancel-edit-btn"),
  };

  // A palette cycled per category for the little sidebar dots / tab color.
  const TAB_COLORS = ["#B8863B", "#8C4A34", "#1F3B2C", "#5B7B6C", "#A5673F", "#3E5C48"];
  function colorForCategory(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return TAB_COLORS[hash % TAB_COLORS.length];
  }

  // -------------------------------------------------------------
  // API helpers
  // -------------------------------------------------------------
  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Something went wrong");
    }
    return data;
  }

  const fetchPages = () => api("/api/pages");
  const fetchPage = (id) => api(`/api/pages/${id}`);
  const createPage = (payload) => api("/api/pages", { method: "POST", body: JSON.stringify(payload) });
  const updatePage = (id, payload) => api(`/api/pages/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  const deletePageApi = (id) => api(`/api/pages/${id}`, { method: "DELETE" });
  const searchPages = (q) => api(`/api/search?q=${encodeURIComponent(q)}`);

  // -------------------------------------------------------------
  // Rendering: sidebar
  // -------------------------------------------------------------
  function groupByCategory(pages) {
    const groups = new Map();
    for (const p of pages) {
      if (!groups.has(p.category)) groups.set(p.category, []);
      groups.get(p.category).push(p);
    }
    return groups;
  }

  function renderSidebar() {
    const groups = groupByCategory(state.pages);
    const categories = [...groups.keys()].sort((a, b) => a.localeCompare(b));

    els.categoryTree.innerHTML = "";
    for (const cat of categories) {
      const pages = groups.get(cat).sort((a, b) => a.title.localeCompare(b.title));
      const li = document.createElement("li");
      li.className = "category-node";

      const header = document.createElement("div");
      header.className = "category-header";
      header.innerHTML = `
        <span class="category-name">${escapeHtml(cat)}</span>
        <span class="category-count">${pages.length}</span>
      `;
      header.style.borderLeftColor = colorForCategory(cat);

      const branch = document.createElement("ul");
      branch.className = "page-branch-list";
      for (const p of pages) {
        const item = document.createElement("li");
        item.className = "page-branch-item";
        const a = document.createElement("a");
        a.href = "#";
        a.textContent = p.title;
        a.dataset.id = p.id;
        if (state.currentPage && state.currentPage.id === p.id) a.classList.add("active");
        a.addEventListener("click", (e) => { e.preventDefault(); openPage(p.id); });
        item.appendChild(a);
        branch.appendChild(item);
      }

      header.addEventListener("click", () => {
        branch.classList.toggle("hidden");
        header.classList.toggle("active");
      });

      li.appendChild(header);
      li.appendChild(branch);
      els.categoryTree.appendChild(li);
    }

    // Recently updated (top 8)
    const recent = [...state.pages]
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 8);
    els.recentList.innerHTML = "";
    for (const p of recent) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = p.title;
      a.addEventListener("click", (e) => { e.preventDefault(); openPage(p.id); });
      li.appendChild(a);
      els.recentList.appendChild(li);
    }

    // Keep the category datalist in the editor fresh
    els.categoryOptions.innerHTML = categories
      .map((c) => `<option value="${escapeAttr(c)}"></option>`)
      .join("");
  }

  // -------------------------------------------------------------
  // Rendering: content (very small markdown-ish + wiki-link parser)
  // -------------------------------------------------------------
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  function renderContent(raw) {
    const titleToId = new Map(state.pages.map((p) => [p.title.toLowerCase(), p.id]));
    const lines = escapeHtml(raw || "").split("\n");
    let html = "";
    let inList = false;

    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };

    for (let line of lines) {
      if (/^###\s+/.test(line)) { closeList(); html += `<h3>${line.replace(/^###\s+/, "")}</h3>`; continue; }
      if (/^##\s+/.test(line)) { closeList(); html += `<h2>${line.replace(/^##\s+/, "")}</h2>`; continue; }
      if (/^#\s+/.test(line)) { closeList(); html += `<h1>${line.replace(/^#\s+/, "")}</h1>`; continue; }
      if (/^-\s+/.test(line)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${inlineFormat(line.replace(/^-\s+/, ""))}</li>`;
        continue;
      }
      closeList();
      if (line.trim() === "") { continue; }
      html += `<p>${inlineFormat(line)}</p>`;
    }
    closeList();
    return html;

    function inlineFormat(text) {
      text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
      text = text.replace(/\[\[(.+?)\]\]/g, (m, name) => {
        const id = titleToId.get(name.trim().toLowerCase());
        if (id) return `<a href="#" class="wiki-link" data-id="${id}">${escapeHtml(name)}</a>`;
        return `<a href="#" class="wiki-link missing" data-new-title="${escapeAttr(name)}">${escapeHtml(name)}</a>`;
      });
      return text;
    }
  }

  function attachWikiLinkHandlers(container) {
    container.querySelectorAll("a.wiki-link").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (a.dataset.id) {
          openPage(Number(a.dataset.id));
        } else if (a.dataset.newTitle) {
          openEditor(null, { title: a.dataset.newTitle });
        }
      });
    });
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
        " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    } catch {
      return iso;
    }
  }

  // -------------------------------------------------------------
  // View switching
  // -------------------------------------------------------------
  function showView(name) {
    els.viewPage.classList.toggle("hidden", name !== "page");
    els.viewEmpty.classList.toggle("hidden", name !== "empty");
    els.viewEditor.classList.toggle("hidden", name !== "editor");
  }

  async function openPage(id) {
    try {
      const page = await fetchPage(id);
      state.currentPage = page;
      els.pageTab.style.background = colorForCategory(page.category);
      els.pageCategory.textContent = page.category;
      els.pageTags.innerHTML = page.tags.map((t) => `<span class="chip chip-tag">#${escapeHtml(t)}</span>`).join("");
      els.pageTitle.textContent = page.title;
      els.pageAuthor.textContent = page.author ? `Written by ${page.author}` : "";
      els.pageUpdated.textContent = `Updated ${formatDate(page.updated_at)}`;
      els.pageContent.innerHTML = renderContent(page.content);
      attachWikiLinkHandlers(els.pageContent);
      showView("page");
      renderSidebar();
      window.scrollTo({ top: 0 });
    } catch (err) {
      alert(err.message);
    }
  }

  function openEditor(id, prefill) {
    state.editingId = id;
    if (id && state.currentPage && state.currentPage.id === id) {
      const p = state.currentPage;
      els.fieldTitle.value = p.title;
      els.fieldCategory.value = p.category;
      els.fieldTags.value = p.tags.join(", ");
      els.fieldAuthor.value = p.author || "";
      els.fieldContent.value = p.content;
    } else {
      els.fieldTitle.value = (prefill && prefill.title) || "";
      els.fieldCategory.value = "";
      els.fieldTags.value = "";
      els.fieldAuthor.value = state.currentPage ? (state.currentPage.author || "") : "";
      els.fieldContent.value = "";
    }
    showView("editor");
    els.fieldTitle.focus();
  }

  // -------------------------------------------------------------
  // Events
  // -------------------------------------------------------------
  els.newPageBtn.addEventListener("click", () => openEditor(null));
  els.emptyNewPageBtn.addEventListener("click", () => openEditor(null));
  els.editPageBtn.addEventListener("click", () => openEditor(state.currentPage.id));
  els.cancelEditBtn.addEventListener("click", () => {
    if (state.currentPage) showView("page"); else showView("empty");
  });

  els.deletePageBtn.addEventListener("click", async () => {
    if (!state.currentPage) return;
    if (!confirm(`Delete "${state.currentPage.title}"? This can't be undone.`)) return;
    try {
      await deletePageApi(state.currentPage.id);
      state.currentPage = null;
      await refreshPages();
      showView("empty");
    } catch (err) {
      alert(err.message);
    }
  });

  els.editorForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      title: els.fieldTitle.value.trim(),
      category: els.fieldCategory.value.trim() || "Uncategorized",
      tags: els.fieldTags.value.split(",").map((t) => t.trim()).filter(Boolean),
      author: els.fieldAuthor.value.trim(),
      content: els.fieldContent.value,
    };
    if (!payload.title) return;

    try {
      let page;
      if (state.editingId) {
        page = await updatePage(state.editingId, payload);
      } else {
        page = await createPage(payload);
      }
      await refreshPages();
      await openPage(page.id);
    } catch (err) {
      alert(err.message);
    }
  });

  // Search
  let searchDebounce = null;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    const q = els.searchInput.value.trim();
    if (!q) { els.searchResults.classList.add("hidden"); return; }
    searchDebounce = setTimeout(async () => {
      try {
        const results = await searchPages(q);
        renderSearchResults(results);
      } catch (err) {
        console.error(err);
      }
    }, 180);
  });

  document.addEventListener("click", (e) => {
    if (!els.searchWrap && !e.target.closest(".search-wrap")) {
      els.searchResults.classList.add("hidden");
    }
  });

  function renderSearchResults(results) {
    if (results.length === 0) {
      els.searchResults.innerHTML = `<div class="search-empty">No pages match.</div>`;
    } else {
      els.searchResults.innerHTML = results.map((p) => `
        <button type="button" class="search-result-item" data-id="${p.id}">
          <div class="search-result-title">${escapeHtml(p.title)}</div>
          <div class="search-result-meta">${escapeHtml(p.category)}</div>
        </button>
      `).join("");
      els.searchResults.querySelectorAll(".search-result-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          openPage(Number(btn.dataset.id));
          els.searchResults.classList.add("hidden");
          els.searchInput.value = "";
        });
      });
    }
    els.searchResults.classList.remove("hidden");
  }

  // -------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------
  async function refreshPages() {
    state.pages = await fetchPages();
    renderSidebar();
  }

  async function boot() {
    await refreshPages();
    if (state.pages.length > 0) {
      const welcome = state.pages.find((p) => p.slug === "welcome") || state.pages[0];
      await openPage(welcome.id);
    } else {
      showView("empty");
    }
  }

  boot();
})();
