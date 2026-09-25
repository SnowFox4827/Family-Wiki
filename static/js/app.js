// -------------------------------------------------------------
// Main Application Module
// -------------------------------------------------------------
import * as API from "./modules/api.js";
import { initTheme } from "./modules/theme.js";
import { renderMarkdown, escapeHtml } from "./modules/markdown.js";
import { setupImageUpload } from "./modules/upload.js";
import { fetchBackupStatus, triggerSnapshot, downloadBackup, restoreBackupUpload, restoreSnapshot } from "./modules/api.js";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Initialize Theme
  initTheme();

  // 2. Application State
  let currentPage = null;
  let allPages = [];
  const titleToId = new Map();
  // Per-category collapse state, persisted locally
  let collapsedCats = {};
  try {
    collapsedCats = JSON.parse(localStorage.getItem("collapsed-categories") || "{}");
  } catch (e) { collapsedCats = {}; }

  // 3. DOM Elements
  const els = {
    sidebar: document.querySelector(".sidebar"),
    sidebarToggleBtn: document.getElementById("sidebar-toggle-btn"),
    categoryTree: document.getElementById("category-tree"),
    recentList: document.getElementById("recent-list"),
    categoryOptions: document.getElementById("category-options"),
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
    newPageBtn: document.getElementById("new-page-btn"),
    backupBtn: document.getElementById("backup-btn"),
    emptyNewPageBtn: document.getElementById("empty-new-page-btn"),
    editPageBtn: document.getElementById("edit-page-btn"),
    deletePageBtn: document.getElementById("delete-page-btn"),
    downloadPageBtn: document.getElementById("download-page-btn"),
    cancelEditBtn: document.getElementById("cancel-edit-btn"),
    editorForm: document.getElementById("editor-form"),
    fieldTitle: document.getElementById("field-title"),
    fieldCategory: document.getElementById("field-category"),
    fieldTags: document.getElementById("field-tags"),
    fieldAuthor: document.getElementById("field-author"),
    fieldContent: document.getElementById("field-content"),
    searchInput: document.getElementById("search-input"),
    searchResults: document.getElementById("search-results"),
    searchWrap: document.querySelector(".search-wrap"),
    uploadImageBtn: document.getElementById("upload-image-btn"),
    imageUploadInput: document.getElementById("image-upload-input"),
    uploadStatus: document.getElementById("upload-status"),
  };

  // 4. Setup Image Upload Handlers
  setupImageUpload({
    contentTextarea: els.fieldContent,
    uploadBtn: els.uploadImageBtn,
    fileInput: els.imageUploadInput,
    statusEl: els.uploadStatus,
  });

  // 4.1 Sidebar Toggle (desktop collapse / mobile drawer)
  const isMobile = () => window.matchMedia("(max-width: 860px)").matches;
  function syncSidebarOnResize() {
    if (!isMobile() && els.sidebar) {
      els.sidebar.classList.remove("is-open");
    }
  }
  window.addEventListener("resize", syncSidebarOnResize);

  if (els.sidebarToggleBtn) {
    els.sidebarToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!els.sidebar) return;
      if (isMobile()) {
        els.sidebar.classList.toggle("is-open");
      } else {
        const c = els.sidebar.classList.toggle("collapsed");
        localStorage.setItem("sidebar-collapsed", c ? "true" : "false");
      }
    });
  }

  function closeSidebar() {
    if (isMobile() && els.sidebar && els.sidebar.classList.contains("is-open")) {
      els.sidebar.classList.remove("is-open");
    }
  }

  // Tap outside the open mobile drawer to close it
  document.addEventListener("click", (e) => {
    if (!isMobile()) return;
    if (
      els.sidebar &&
      els.sidebar.classList.contains("is-open") &&
      !els.sidebar.contains(e.target) &&
      !els.sidebarToggleBtn.contains(e.target)
    ) {
      closeSidebar();
    }
  });

  // 5. Views Management
  function showView(name) {
    els.viewPage.classList.toggle("hidden", name !== "page");
    els.viewEmpty.classList.toggle("hidden", name !== "empty");
    els.viewEditor.classList.toggle("hidden", name !== "editor");
  }

  // 6. Data Loading & Indexing
  async function refreshIndex() {
    try {
      allPages = await API.fetchPages();
      titleToId.clear();
      allPages.forEach((p) => {
        titleToId.set(p.title.trim().toLowerCase(), p.id);
      });
      renderSidebar();
      renderCategoryOptions();
    } catch (err) {
      console.error("Index refresh failed:", err);
    }
  }

  function renderCategoryOptions() {
    if (!els.categoryOptions) return;
    const categories = new Set();
    allPages.forEach((p) => {
      if (p.category) categories.add(p.category);
    });
    els.categoryOptions.innerHTML = Array.from(categories)
      .map((c) => `<option value="${escapeHtml(c)}">`)
      .join("");
  }

  function renderSidebar() {
    // Categories Tree
    const tree = {};
    const unassigned = [];

    allPages.forEach((p) => {
      if (!p.category) {
        unassigned.push(p);
      } else {
        tree[p.category] = tree[p.category] || [];
        tree[p.category].push(p);
      }
    });

    let html = "";
    Object.keys(tree).sort().forEach((cat) => {
      const count = tree[cat].length;
      const isCollapsed = !!collapsedCats[cat];
      html += `<li class="category-node">`;
      html += `<div class="category-header${isCollapsed ? " collapsed" : ""}"><span class="category-toggle">▸</span><span class="category-name">📁 ${escapeHtml(cat)}</span><span class="category-count">${count}</span></div>`;
      html += `<ul class="page-branch-list${isCollapsed ? " collapsed" : ""}">`;
      tree[cat].forEach((p) => {
        const active = currentPage && currentPage.id === p.id ? "active" : "";
        html += `<li class="page-branch-item"><a href="#" class="page-link ${active}" data-id="${p.id}">${escapeHtml(p.title)}</a></li>`;
      });
      html += `</ul></li>`;
    });

    if (unassigned.length > 0) {
      const isCollapsed = !!collapsedCats["Uncategorized"];
      html += `<li class="category-node">`;
      html += `<div class="category-header${isCollapsed ? " collapsed" : ""}"><span class="category-toggle">▸</span><span class="category-name">Uncategorized</span><span class="category-count">${unassigned.length}</span></div>`;
      html += `<ul class="page-branch-list${isCollapsed ? " collapsed" : ""}">`;
      unassigned.forEach((p) => {
        const active = currentPage && currentPage.id === p.id ? "active" : "";
        html += `<li class="page-branch-item"><a href="#" class="page-link ${active}" data-id="${p.id}">${escapeHtml(p.title)}</a></li>`;
      });
      html += `</ul></li>`;
    }

    els.categoryTree.innerHTML = html;

    // Recent list
    const sorted = [...allPages].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    els.recentList.innerHTML = sorted
      .slice(0, 6)
      .map((p) => {
        const active = currentPage && currentPage.id === p.id ? "active" : "";
        return `<li><a href="#" class="page-link ${active}" data-id="${p.id}">${escapeHtml(p.title)}</a></li>`;
      })
      .join("");
  }

  // 7. Page Display & Routing
  async function openPage(id) {
    try {
      currentPage = await API.fetchPage(id);
      renderPage(currentPage);
      showView("page");
      renderSidebar();
      closeSidebar();
    } catch (err) {
      alert("Error loading page: " + err.message);
    }
  }

  function renderPage(page) {
    if (els.pageTab) els.pageTab.textContent = "";
    els.pageTitle.textContent = page.title;
    els.pageCategory.textContent = page.category || "General";
    els.pageAuthor.textContent = page.author ? `Written by ${page.author}` : "Written anonymously";

    if (page.updated_at) {
      const dt = new Date(page.updated_at);
      els.pageUpdated.textContent = " • " + dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } else {
      els.pageUpdated.textContent = "";
    }

    if (page.tags) {
      const tagList = Array.isArray(page.tags)
        ? page.tags
        : typeof page.tags === "string"
        ? page.tags.split(",")
        : [];
      const cleanTags = tagList.map((t) => String(t).trim()).filter(Boolean);
      els.pageTags.innerHTML = cleanTags.map((t) => `<span class="chip chip-tag">#${escapeHtml(t)}</span>`).join(" ");
    } else {
      els.pageTags.innerHTML = "";
    }

    els.pageContent.innerHTML = renderMarkdown(page.content, titleToId);
  }

  function openEditor(page = null, initialTitle = "") {
    currentPage = page;
    if (page) {
      els.fieldTitle.value = page.title || "";
      els.fieldCategory.value = page.category || "";
      els.fieldTags.value = Array.isArray(page.tags) ? page.tags.join(", ") : page.tags || "";
      els.fieldAuthor.value = page.author || "";
      els.fieldContent.value = page.content || "";
    } else {
      els.fieldTitle.value = initialTitle;
      els.fieldCategory.value = "";
      els.fieldTags.value = "";
      els.fieldAuthor.value = "";
      els.fieldContent.value = "";
    }
    showView("editor");
    els.fieldTitle.focus();
  }

  // 8. Event Listeners
  if (els.newPageBtn) els.newPageBtn.addEventListener("click", () => openEditor(null));
  if (els.backupBtn) els.backupBtn.addEventListener("click", openBackupModal);

  // ---------------- Backup Modal ----------------
  async function refreshBackupModal() {
    const timeEl = document.getElementById("backup-last-time");
    const countEl = document.getElementById("backup-total-count");
    const listEl = document.getElementById("backup-snapshots-list");
    if (timeEl) timeEl.textContent = "Checking snapshots...";
    if (countEl) countEl.textContent = "";
    if (listEl) listEl.innerHTML = '<div class="small text-muted">Loading snapshots...</div>';
    try {
      const data = await fetchBackupStatus();
      if (data.latest_snapshot) {
        timeEl.textContent = `Last snapshot: ${data.latest_snapshot.created_at}`;
        countEl.textContent = `Total snapshots: ${data.total_snapshots} (Retention: ${data.retention_days} days)`;
      } else {
        timeEl.textContent = "No automated snapshots recorded yet.";
        countEl.textContent = `Retention policy: ${data.retention_days} days`;
      }
      if (listEl) {
        listEl.innerHTML = data.snapshots.length
          ? data.snapshots.map(s => `
              <div class="snap-row">
                <div>
                  <div class="fw-semibold">${s.name}</div>
                  <div class="small text-muted">${s.created_at}</div>
                </div>
                <button type="button" class="btn btn-outline btn-sm" data-restore-snap="${s.name}">Restore</button>
              </div>`).join("")
          : '<div class="small text-muted">No snapshots available</div>';
      }
    } catch (e) {
      if (timeEl) timeEl.textContent = "Snapshot storage ready.";
      if (listEl) listEl.innerHTML = '<div class="small text-muted">No snapshots available</div>';
    }
  }

  function openBackupModal() {
    const modal = document.getElementById("backup-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    refreshBackupModal();
  }

  function closeBackupModal() {
    const modal = document.getElementById("backup-modal");
    if (modal) modal.classList.add("hidden");
  }

  document.querySelectorAll("[data-close-backup]").forEach(el =>
    el.addEventListener("click", closeBackupModal));

  const btnJson = document.getElementById("btn-download-json");
  if (btnJson) btnJson.addEventListener("click", () => downloadBackup("json"));
  const btnDb = document.getElementById("btn-download-db");
  if (btnDb) btnDb.addEventListener("click", () => downloadBackup("db"));

  const btnSnap = document.getElementById("btn-trigger-snapshot");
  if (btnSnap) btnSnap.addEventListener("click", async () => {
    const orig = btnSnap.textContent;
    btnSnap.disabled = true;
    btnSnap.textContent = "Creating snapshot...";
    try {
      const res = await triggerSnapshot();
      if (res.success) await refreshBackupModal();
      else alert(`Snapshot error: ${res.error || "Failed"}`);
    } catch (err) {
      alert("Network error while requesting snapshot.");
    } finally {
      btnSnap.disabled = false;
      btnSnap.textContent = orig;
    }
  });

  const btnRestoreFile = document.getElementById("btn-restore-file");
  if (btnRestoreFile) btnRestoreFile.addEventListener("click", async () => {
    const input = document.getElementById("backup-restore-file");
    const file = input && input.files && input.files[0];
    if (!file) { alert("Please select a backup file first."); return; }
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".json", ".db", ".sqlite", ".sqlite3"].includes(ext)) {
      alert("Unsupported file type. Please use .json, .db, .sqlite, or .sqlite3.");
      return;
    }
    if (!confirm("This will REPLACE all current data with the contents of the backup file. A safety snapshot of your current data will be taken first. Continue?")) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await restoreBackupUpload(formData);
      if (res.success) { alert(res.message || "Restore completed successfully."); closeBackupModal(); await refreshIndex(); }
      else alert(`Restore failed: ${res.error || "Unknown error"}`);
    } catch (err) { alert("Network error while restoring."); }
  });

  const snapList = document.getElementById("backup-snapshots-list");
  if (snapList) snapList.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-restore-snap]");
    if (!btn) return;
    const name = btn.dataset.restoreSnap;
    if (!confirm(`This will REPLACE all current data with the snapshot "${name}". A safety snapshot of your current data will be taken first. Continue?`)) return;
    try {
      const res = await restoreSnapshot(name);
      if (res.success) { alert(res.message || "Restore completed successfully."); closeBackupModal(); await refreshIndex(); }
      else alert(`Restore failed: ${res.error || "Unknown error"}`);
    } catch (err) { alert("Network error while restoring."); }
  });
  if (els.emptyNewPageBtn) els.emptyNewPageBtn.addEventListener("click", () => openEditor(null));

  if (els.editPageBtn) {
    els.editPageBtn.addEventListener("click", () => {
      if (currentPage) openEditor(currentPage);
    });
  }

  if (els.cancelEditBtn) {
    els.cancelEditBtn.addEventListener("click", () => {
      if (currentPage) {
        showView("page");
      } else {
        showView("empty");
      }
    });
  }

  if (els.deletePageBtn) {
    els.deletePageBtn.addEventListener("click", async () => {
      if (!currentPage) return;
      if (confirm(`Are you sure you want to delete "${currentPage.title}"?`)) {
        try {
          await API.deletePage(currentPage.id);
          currentPage = null;
          await refreshIndex();
          showView("empty");
        } catch (err) {
          alert("Failed to delete page: " + err.message);
        }
      }
    });
  }

  if (els.downloadPageBtn) {
    els.downloadPageBtn.addEventListener("click", () => {
      if (!currentPage) return;
      const safeTitle = currentPage.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "article";
      const meta = [
        `# ${currentPage.title}`,
        "",
        `- **Category:** ${currentPage.category || "Uncategorized"}`,
        `- **Tags:** ${(currentPage.tags || []).join(", ") || "none"}`,
        `- **Author:** ${currentPage.author || "unknown"}`,
        `- **Last updated:** ${currentPage.updated_at || "unknown"}`,
        "",
        "---",
        "",
      ].join("\n");
      const blob = new Blob([meta + (currentPage.content || "")], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeTitle}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  if (els.editorForm) {
    els.editorForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        title: els.fieldTitle.value.trim(),
        category: els.fieldCategory.value.trim(),
        tags: els.fieldTags.value.trim(),
        author: els.fieldAuthor.value.trim(),
        content: els.fieldContent.value,
      };

      try {
        let saved;
        if (currentPage && currentPage.id) {
          saved = await API.updatePage(currentPage.id, payload);
        } else {
          saved = await API.createPage(payload);
        }
        await refreshIndex();
        openPage(saved.id);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Links & Navigation handling
  document.addEventListener("click", (e) => {
    // Collapse / expand a category shelf
    const catHeader = e.target.closest(".category-header");
    if (catHeader) {
      e.preventDefault();
      const node = catHeader.closest(".category-node");
      const list = node && node.querySelector(".page-branch-list");
      if (list) {
        const isCollapsed = list.classList.toggle("collapsed");
        catHeader.classList.toggle("collapsed", isCollapsed);
        const name = catHeader.querySelector(".category-name");
        const key = name ? name.textContent.replace("📁 ", "").trim() : "Uncategorized";
        collapsedCats[key] = isCollapsed;
        localStorage.setItem("collapsed-categories", JSON.stringify(collapsedCats));
      }
      return;
    }

    // Sidebar & Recent links
    const pageLink = e.target.closest(".page-link");
    if (pageLink) {
      e.preventDefault();
      const id = pageLink.getAttribute("data-id");
      if (id) openPage(id);
      return;
    }

    // Existing Wiki Links [[Page Title]]
    const wikiLink = e.target.closest(".wiki-link:not(.missing)");
    if (wikiLink) {
      e.preventDefault();
      const id = wikiLink.getAttribute("data-id");
      if (id) openPage(id);
      return;
    }

    // Missing Wiki Links
    const missingLink = e.target.closest(".wiki-link.missing");
    if (missingLink) {
      e.preventDefault();
      const newTitle = missingLink.getAttribute("data-new-title");
      openEditor(null, newTitle || "");
      return;
    }

    // Search Results links
    const searchItem = e.target.closest(".search-item");
    if (searchItem) {
      e.preventDefault();
      const id = searchItem.getAttribute("data-id");
      if (id) {
        els.searchResults.classList.add("hidden");
        els.searchInput.value = "";
        openPage(id);
      }
      return;
    }

    // Dismiss search results when clicking outside
    if (els.searchWrap && !els.searchWrap.contains(e.target)) {
      els.searchResults.classList.add("hidden");
    }
  });

  // Search input handler with debounce
  let searchTimeout = null;
  if (els.searchInput) {
    els.searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      const q = els.searchInput.value.trim();
      if (!q) {
        els.searchResults.classList.add("hidden");
        return;
      }

      searchTimeout = setTimeout(async () => {
        try {
          const results = await API.searchPages(q);
          if (results.length === 0) {
            els.searchResults.innerHTML = `<div class="search-empty">No results found</div>`;
          } else {
            els.searchResults.innerHTML = results
              .map(
                (p) => `
                <a href="#" class="search-result-item search-item" data-id="${p.id}">
                  <div class="search-result-title">${escapeHtml(p.title)}</div>
                  <div class="search-result-meta">${escapeHtml(p.category || "General")}</div>
                </a>
              `
              )
              .join("");
          }
          els.searchResults.classList.remove("hidden");
        } catch (err) {
          console.error("Search failed:", err);
        }
      }, 250);
    });
  }

  // Initial Boot
  refreshIndex().then(() => {
    if (allPages.length > 0) {
      // Find welcome page or default to first page
      const welcome = allPages.find((p) => p.slug === "welcome");
      if (welcome) {
        openPage(welcome.id);
      } else {
        openPage(allPages[0].id);
      }
    } else {
      showView("empty");
    }
  });
});
