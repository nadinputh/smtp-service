export function useDarkMode() {
  const isDark = useState("darkMode", () => false);

  function init() {
    if (import.meta.server) return;
    const stored = localStorage.getItem("darkMode");
    if (stored !== null) {
      isDark.value = stored === "true";
    } else {
      isDark.value = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    apply();
  }

  function toggle() {
    isDark.value = !isDark.value;
    localStorage.setItem("darkMode", String(isDark.value));
    apply();
  }

  function apply() {
    if (import.meta.server) return;
    document.documentElement.classList.toggle("dark", isDark.value);
  }

  return { isDark, init, toggle, apply };
}
