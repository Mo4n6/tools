import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const productionBase = (() => {
  const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'codextest';
  return `/${repository}/`;
})();

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? productionBase : '/',
}));
