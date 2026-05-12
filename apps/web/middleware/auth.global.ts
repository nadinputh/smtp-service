export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return;

  const { isAuthenticated } = useAuth();

  // Public routes that never require auth
  const publicPaths = ["/login", "/register"];
  const isPublic = publicPaths.some(
    (p) => to.path === p || to.path.startsWith(`${p}/`),
  );

  // OAuth2 callback is also public
  if (isPublic || to.path.startsWith("/auth/")) return;

  if (!isAuthenticated.value) {
    return navigateTo("/login", { replace: true });
  }
});
