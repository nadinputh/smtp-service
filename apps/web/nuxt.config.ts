// https://nuxt.com/docs/api/configuration/nuxt-config
import dotenv from "dotenv";
dotenv.config({ path: "../../.env", override: false });

const apiTarget = process.env.NUXT_API_TARGET || "http://localhost:3002";

export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: true },

  app: {
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
    "/api/**": { proxy: `${apiTarget}/api/**` },
    "/v1/**": { proxy: `${apiTarget}/v1/**` },
    "/health": { proxy: `${apiTarget}/health` },
    "/admin/queues/**": { proxy: `${apiTarget}/admin/queues/**` },
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
