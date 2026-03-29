import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const productionBase = (() => {
  const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'kokoro-reader';
  return `/${repository}/`;
})();

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? productionBase : '/',
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
