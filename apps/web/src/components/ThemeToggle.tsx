import { useEffect, useState } from "react";
import { resolveTheme, setTheme, watchSystemTheme, type Theme } from "../theme";
import { IconMoon, IconSun } from "./Icon";

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  // Keep following the OS until the user makes an explicit choice.
  useEffect(() => watchSystemTheme(setThemeState), []);

  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="btn ghost sm"
      onClick={() => {
        setTheme(next);
        setThemeState(next);
      }}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
    >
      {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
    </button>
  );
}
