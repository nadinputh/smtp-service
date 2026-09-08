// https://nuxt.com/docs/api/configuration/nuxt-config
import dotenv from "dotenv";
dotenv.config({ path: "../../.env", override: false });

const apiTarget = process.env.NUXT_API_TARGET || "http://localhost:3001";
const baseURL = process.env.NUXT_APP_BASE_URL || "/admin/smtp";
// Normalise: strip trailing slash so path concatenation is consistent
const base = baseURL.replace(/\/$/, "");

export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: true },

  app: {
    baseURL: process.env.NUXT_APP_BASE_URL || "/admin/smtp",
    head: {
      title: "MailPocket",
      titleTemplate: "%s — MailPocket",
      link: [
        { rel: "icon", type: "image/svg+xml", href: `${base}/favicon.svg` },
      ],
    },
  },

  experimental: {
    appManifest: false,
  },

  modules: ["@nuxtjs/tailwindcss", "@nuxt/icon"],

  // ─── Proxy: hide the API origin behind the Nuxt server ──
  // Override at deploy time with NUXT_API_TARGET env var.
  runtimeConfig: {
    apiTarget,
    public: {
      smtpHost: process.env.NUXT_PUBLIC_SMTP_HOST || "localhost",
      smtpPort: process.env.NUXT_PUBLIC_SMTP_PORT || "2525",
    },
  },

  // ─── Dev server port ─────────────────────────────────────
  // Override with WEB_PORT env var.
  devServer: {
    port: parseInt(process.env.WEB_PORT || "3000"),
  },

  // All API/SSE proxying is handled by server/middleware/api-proxy.ts
  // routeRules wildcard proxies are intentionally avoided: they use
  // ctx.localFetch which causes infinite recursion and _proxyStripBase which
  // doesn't account for app.baseURL being prepended by $fetch.

  ssr: false,

  tailwindcss: {
    cssPath: "~/assets/css/tailwind.css",
  },

  vite: {
    server: {
      watch: {
        ignored: ["**/node_modules/**", "**/.nuxt/**"],
      },
      // No Vite proxy rules: Vite's proxy middleware runs before Nitro and
      // forwards the full path (including app.baseURL) to the API server,
      // causing 404s. api-proxy.ts handles all proxying correctly.
    },
  },
});
