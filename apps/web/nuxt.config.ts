// https://nuxt.com/docs/api/configuration/nuxt-config
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
    apiTarget: process.env.NUXT_API_TARGET || "http://localhost:3002",
  },

  routeRules: {
    "/api/**": {
      proxy: `${process.env.NUXT_API_TARGET || "http://localhost:3002"}/api/**`,
    },
    "/v1/**": {
      proxy: `${process.env.NUXT_API_TARGET || "http://localhost:3002"}/v1/**`,
    },
    "/health": {
      proxy: `${process.env.NUXT_API_TARGET || "http://localhost:3002"}/health`,
    },
    "/admin/queues/**": {
      proxy: `${process.env.NUXT_API_TARGET || "http://localhost:3002"}/admin/queues/**`,
    },
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
          target: process.env.NUXT_API_TARGET || "http://localhost:3002",
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
