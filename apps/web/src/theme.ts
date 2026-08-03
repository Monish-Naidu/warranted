/**
 * Theme resolution.
 *
 * `applyTheme` is called from `main.tsx` before React mounts, so the correct
 * palette is on <html> before first paint — otherwise a dark-mode user sees a
 * white flash on every load.
 *
 * An explicit choice is stored and always wins. With nothing stored we follow
 * the OS and keep following it, so a user who changes their system theme mid
 * session sees the app move with it.
 */

export type Theme = "light" | "dark";

const STORAGE_KEY = "warranted.theme";

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    // Safari in private mode throws on localStorage access.
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(): Theme {
  return stored() ?? systemTheme();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Non-fatal: the theme still applies for this page view.
  }
  applyTheme(theme);
}

/**
 * Track the OS preference for as long as the user hasn't picked a theme.
 * Returns an unsubscribe function.
 */
export function watchSystemTheme(onChange: (theme: Theme) => void): () => void {
  const query = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!query) return () => {};

  const handler = (event: MediaQueryListEvent) => {
    if (stored() !== null) return;
    const next: Theme = event.matches ? "dark" : "light";
    applyTheme(next);
    onChange(next);
  };

  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}
