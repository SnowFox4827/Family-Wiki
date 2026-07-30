// -------------------------------------------------------------
// API Helper Methods
// -------------------------------------------------------------

export async function fetchPages(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `/api/pages?${query}` : "/api/pages";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load pages");
  return await res.json();
}

export async function fetchPage(id) {
  const res = await fetch(`/api/pages/${id}`);
  if (!res.ok) throw new Error("Failed to load page");
  return await res.json();
}

export async function createPage(data) {
  const res = await fetch("/api/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Save failed");
  return body;
}

export async function updatePage(id, data) {
  const res = await fetch(`/api/pages/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Save failed");
  return body;
}

export async function deletePage(id) {
  const res = await fetch(`/api/pages/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Delete failed");
}

export async function fetchCategories() {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("Failed to load categories");
  return await res.json();
}

export async function searchPages(q) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Search failed");
  return await res.json();
}

export async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Upload failed");
  return body;
}
