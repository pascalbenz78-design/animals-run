import { defineConfig } from 'vite';

// base './' damit das Spiel auch in einem Unterordner (GitHub Pages) läuft.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
