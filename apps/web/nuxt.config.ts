// https://nuxt.com/docs/api/configuration/nuxt-config
import dotenv from "dotenv";
dotenv.config({ path: "../../.env", override: false });

const apiTarget = process.env.NUXT_API_TARGET || "http://localhost:3002";
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
      link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
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
  },

  // ─── Dev server port ─────────────────────────────────────
  // Override with WEB_PORT env var.
  devServer: {
    port: parseInt(process.env.WEB_PORT || "3000"),
  },

  routeRules: {
    // SSE uses native fetch() (no $fetch baseURL prepend), so a non-wildcard
    // rule works correctly here. All other API calls come through $fetch which
    // prepends app.baseURL — those are handled by server/middleware/api-proxy.ts
    "/api/events": { proxy: `${apiTarget}/api/events` },
  },

  ssr: false,

  tailwindcss: {
    cssPath: "~/assets/css/tailwind.css",
  },

  vite: {
    server: {
      watch: {
        ignored: ["**/node_modules/**", "**/.nuxt/**"],
      },
      proxy: {
        "/api/events": {
          target: apiTarget,
          changeOrigin: true,
          // SSE requires no response buffering
          headers: {
            Connection: "keep-alive",
          },
        },
      },
    },
  },
});
