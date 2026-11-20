import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync, cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Copies static extension assets (manifest + icons) into the build output.
 * Kept as an inline plugin to avoid extra dependencies for a marketplace build.
 */
function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      mkdirSync(outDir, { recursive: true });
      copyFileSync(resolve(__dirname, 'src/manifest.json'), resolve(outDir, 'manifest.json'));
      const iconsSrc = resolve(__dirname, 'public/icons');
      if (existsSync(iconsSrc)) {
        cpSync(iconsSrc, resolve(outDir, 'icons'), { recursive: true });
      }
      // Strip `crossorigin` attributes from HTML — they break module loading in extension context
      for (const file of readdirSync(outDir)) {
        if (file.endsWith('.html')) {
          const htmlPath = resolve(outDir, file);
          const content = readFileSync(htmlPath, 'utf-8');
          writeFileSync(htmlPath, content.replace(/ crossorigin/g, ''));
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), copyExtensionAssets()],
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        options: resolve(__dirname, 'options.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background/service-worker.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
