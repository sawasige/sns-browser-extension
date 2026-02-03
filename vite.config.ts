import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync } from 'fs';
import { build } from 'vite';

function copyPublicFiles() {
  return {
    name: 'copy-public-files',
    closeBundle() {
      // Copy manifest.json
      copyFileSync('public/manifest.json', 'dist/manifest.json');

      // Copy icons
      mkdirSync('dist/icons', { recursive: true });
      const iconFiles = readdirSync('public/icons');
      for (const file of iconFiles) {
        if (file.endsWith('.png')) {
          copyFileSync(`public/icons/${file}`, `dist/icons/${file}`);
        }
      }
    },
  };
}

// Build content scripts separately as IIFE
async function buildContentScripts() {
  const contentScripts = ['instagram', 'twitter', 'threads'];

  for (const script of contentScripts) {
    await build({
      configFile: false,
      build: {
        emptyOutDir: false,
        outDir: 'dist',
        lib: {
          entry: resolve(__dirname, `src/content/${script}.ts`),
          name: `content_${script}`,
          formats: ['iife'],
          fileName: () => `content-${script}.js`,
        },
        rollupOptions: {
          output: {
            extend: true,
          },
        },
      },
    });
  }
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    copyPublicFiles(),
    {
      name: 'build-content-scripts',
      closeBundle: buildContentScripts,
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'sidepanel') {
            return 'sidepanel.js';
          }
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
