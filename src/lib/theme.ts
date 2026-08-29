export type Theme = "light" | "dark";
const STORAGE_KEY = "nocturne-theme";

export function getStoredTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return stored ?? "dark";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
}
