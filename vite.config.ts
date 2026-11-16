import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode, command}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      // The Gemini key is for local development only (`npm run dev`). A production build
      // never carries it: the hosted site calls /api/* and the key stays in the Cloudflare
      // Pages environment. Building it in would publish the key in the public JavaScript.
      'process.env.GEMINI_API_KEY': JSON.stringify(command === 'serve' ? env.GEMINI_API_KEY || '' : ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
