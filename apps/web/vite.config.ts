import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

/** GitHub Pages sert 404.html pour les chemins inconnus ; copie index.html pour le cold open `/r`. */
function spa404Fallback(): Plugin {
  return {
    name: "spa-404-fallback",
    closeBundle() {
      const distDir = resolve(__dirname, "dist");
      const indexPath = resolve(distDir, "index.html");
      const fallbackPath = resolve(distDir, "404.html");
      if (!existsSync(indexPath)) {
        throw new Error(
          `spa-404-fallback: index.html introuvable dans ${distDir} — build incomplet ou dist absent.`
        );
      }
      copyFileSync(indexPath, fallbackPath);
    }
  };
}

const basePath = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  server: {
    host: true, // expose on 0.0.0.0 for local network access
    port: 5173
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Cookies & Coquillettes",
        short_name: "C&C",
        description: "Capture, organise et cuisine tes recettes facilement.",
        theme_color: "#1f4f46",
        background_color: "#f8f4ec",
        display: "standalone",
        start_url: ".",
        scope: ".",
        lang: "fr",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml"
          }
        ],
        share_target: {
          // GET keeps the flow simple for static hosting + SPA routing.
          action: ".",
          method: "GET",
          params: {
            title: "share-title",
            text: "share-text",
            url: "share-url"
          }
        }
      }
    }),
    // Après VitePWA pour copier le index.html final (évite 404.html obsolète).
    spa404Fallback()
  ]
});
