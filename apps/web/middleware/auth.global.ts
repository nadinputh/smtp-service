export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return;

  const { isAuthenticated } = useAuth();

  if (
    !isAuthenticated.value &&
    to.path !== "/login" &&
    to.path !== "/register"
  ) {
    return navigateTo("/login");
  }
});
