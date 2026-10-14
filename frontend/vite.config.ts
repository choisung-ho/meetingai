import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Electron은 빌드 결과를 file://로 읽으므로 자산 경로가 상대여야 한다.
  base: "./",
});