const sidebarOpen = ref(false);

export function useSidebar() {
  function open() {
    sidebarOpen.value = true;
  }

  function close() {
    sidebarOpen.value = false;
  }

  function toggle() {
    sidebarOpen.value = !sidebarOpen.value;
  }

  return {
    isOpen: sidebarOpen,
    open,
    close,
    toggle,
  };
}
