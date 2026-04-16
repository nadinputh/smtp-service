export type ThemeMode = "light" | "dark" | "system";

export function useDarkMode() {
  const isDark = useState("darkMode", () => false);
  const mode = useState<ThemeMode>("themeMode", () => "system");

  function init() {
    if (import.meta.server) return;
    const stored = localStorage.getItem("themeMode") as ThemeMode | null;
    mode.value = stored && ["light", "dark", "system"].includes(stored) ? stored : "system";
    applyMode();

    // Listen for OS theme changes when in system mode
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (mode.value === "system") applyMode();
    });
  }

  function setMode(newMode: ThemeMode) {
    mode.value = newMode;
    localStorage.setItem("themeMode", newMode);
    applyMode();
  }

  function applyMode() {
    if (import.meta.server) return;
    isDark.value =
      mode.value === "dark" ||
      (mode.value === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark.value);
  }

  return { isDark, mode, init, setMode };
}
