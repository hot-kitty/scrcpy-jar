// Vite base path: "/" locally, "/scrcpy-jar/" on GitHub Pages.
// The Pages workflow sets VITE_BASE.
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE || "/",
});
