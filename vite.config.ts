import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? './' : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/kokoro-js') || id.includes('node_modules/@huggingface/transformers')) {
            return 'kokoro';
          }
        },
      },
    },
  },
}));
