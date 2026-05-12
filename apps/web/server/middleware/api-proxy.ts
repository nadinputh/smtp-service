import { proxyRequest } from "h3";

/**
 * Proxy API calls to the backend API server.
 *
 * Why this exists:
 *   $fetch() is configured with baseURL = app.baseURL (e.g. "/admin/smtp"),
 *   so $fetch('/api/auth/login') sends a request to "/admin/smtp/api/auth/login".
 *   Nitro's routeRules wildcard proxy has a _proxyStripBase bug in this scenario.
 *
 * How the path works:
 *   Nitro registers this middleware via h3App.use("/admin/smtp/", handler).
 *   h3 strips the mount prefix BEFORE calling the handler, so event.path
 *   arrives here already WITHOUT "/admin/smtp", e.g. "/api/auth/login".
 *   We handle both stripped and non-stripped forms defensively.
 *
 * Coverage:
 *   /api/**          → apiTarget/api/**
 *   /v1/**           → apiTarget/v1/**
 *   /admin/queues/** → apiTarget/admin/queues/**
 *   /health          → apiTarget/health
 *   /t/**            → apiTarget/t/**  (tracking pixel / click)
 *
 * Paths NOT handled here (handled by routeRules in nuxt.config.ts):
 *   /api/events  – SSE uses native fetch() without the $fetch baseURL prepend
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const apiTarget = config.apiTarget as string;
  const appBase = (config.app.baseURL || "").replace(/\/$/, ""); // "/admin/smtp"

  // Nitro mounts this middleware at app.baseURL via h3App.use(appBase + "/", handler).
  // h3 strips that prefix from event.path before invoking the handler, so
  // event.path here is already WITHOUT the base, e.g. "/api/auth/login".
  // We also handle the non-stripped case defensively in case of h3 version differences.
  let path = event.path;
  if (appBase && (path.startsWith(appBase + "/") || path === appBase)) {
    path = path.slice(appBase.length) || "/";
  }

  const shouldProxy =
    path.startsWith("/api/") ||
    path === "/api" ||
    path.startsWith("/v1/") ||
    path.startsWith("/admin/queues") ||
    path === "/health" ||
    path.startsWith("/t/");

  if (!shouldProxy) return;

  return proxyRequest(event, `${apiTarget}${path}`);
});
