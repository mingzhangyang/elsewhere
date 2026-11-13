import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlinePlugin } from './scripts/offline-plugin';

export default defineConfig({ plugins: [react(), offlinePlugin()], build: { rollupOptions: { output: { manualChunks(id) {
  if (id.includes('/node_modules/three/')) return 'three';
} } } } });
