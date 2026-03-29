import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function normalizeBasePath(pathValue: string): string {
  const trimmed = pathValue.trim();
  if (!trimmed) {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function getProductionBasePath(env: NodeJS.ProcessEnv): string {
  const explicitBasePath = env.VITE_BASE_PATH;
  if (explicitBasePath) {
    return normalizeBasePath(explicitBasePath);
  }

  const repository = env.GITHUB_REPOSITORY;
  const repositoryName = repository?.split('/')[1];
  if (repositoryName) {
    return normalizeBasePath(repositoryName);
  }

  return '/';
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? getProductionBasePath(process.env) : '/',
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
