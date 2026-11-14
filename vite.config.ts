import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlinePlugin } from './scripts/offline-plugin';

export default defineConfig({
  plugins: [react(), offlinePlugin()],
  build: {
    rollupOptions: {
      output: {
        // Stable, separately cached pieces that download in parallel with the app.
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.includes('/node_modules/astronomy-engine/')) return 'astronomy';
          if (id.endsWith('/src/data/stars.json')) return 'catalog';
        },
      },
    },
  },
});
