// -------------------------------------------------------------
// Theme Toggle (Light / Dark) Module
// -------------------------------------------------------------

export function initTheme() {
  const toggleBtn = document.getElementById("theme-toggle-btn");

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("wiki-theme", theme);
  }

  const savedTheme = localStorage.getItem("wiki-theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = savedTheme || (systemPrefersDark ? "dark" : "light");

  setTheme(initialTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      setTheme(next);
    });
  }
}