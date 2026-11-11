import { defineConfig, Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import Markdown from './plugins/md-loader.js';
import Binary from './plugins/binary-loader.js';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    Markdown() as Plugin,
    Binary() as Plugin,
  ],
  base: process.env.VITE_BASE || '/scrcpy-jar/', // GitHub Pages 项目站点路径；CI 由 pages.yml 传入 VITE_BASE=/scrcpy-jar/
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
});
