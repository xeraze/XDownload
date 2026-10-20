import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let apiKey = "";
try {
  apiKey = readFileSync(resolve(process.cwd(), "..", ".api-key"), "utf8").trim();
} catch {}

export default defineConfig(({ command }) => ({
  base: process.env.BASE_PATH || (command === "build" ? "/XDownload/" : "/"),
  plugins: [react(), tailwindcss(), Icons({ compiler: "jsx", jsx: "react" })],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        headers: apiKey ? { "X-Api-Key": apiKey } : {},
      },
    },
  },
}));
