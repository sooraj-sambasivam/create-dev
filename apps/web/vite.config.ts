import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    // Tunnel hostnames (phone demo): cloudflared, ngrok, Vercel previews.
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".vercel.app"],
    proxy: {
      "/api": { target: process.env.API_TARGET || "http://localhost:3001", changeOrigin: true },
    },
  },
});
