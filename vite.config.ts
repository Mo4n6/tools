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

function isMp3EncoderAsset(id: string): boolean {
  return id.includes('node_modules/lamejs') || id.includes('/src/tts/mp3EncoderAdapter.ts');
}

// The licence asks for the Required Notice to survive redistribution, and
// minification strips the comments the sources carry it in. The served pages
// keep it because Vite leaves index.html alone, but a chunk copied on its own
// would not, so every chunk is stamped here. Kept in sync by the test in
// src/licenses/__tests__/notices.test.ts.
//
// The Notices section asks for two things to travel with any part of the
// software: the Required Notice line, and the terms themselves or their URL.
// A chunk cannot carry the terms and the deploy uploads only `dist`, which has
// no LICENSE in it, so the URL is the half that has to be here.
const CHUNK_BANNER = [
  '/*!',
  ' * SPDX-License-Identifier: PolyForm-Small-Business-1.0.0',
  ' * Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)',
  ' * Full terms: https://polyformproject.org/licenses/small-business/1.0.0',
  ' * Third-party code in this bundle keeps its own licence. See THIRD-PARTY.md.',
  ' */',
].join('\n');

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? getProductionBasePath(process.env) : '/',
  // Workers go through a separate Rollup pass, so the banner above does not
  // reach them. Glass and Husk both do their real work in one.
  worker: {
    rollupOptions: {
      output: {
        banner: CHUNK_BANNER,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        banner: CHUNK_BANNER,
        manualChunks(id) {
          if (id.includes('node_modules/kokoro-js') || id.includes('node_modules/@huggingface/transformers')) {
            return 'kokoro';
          }

          // Glass only reaches for the ONNX runtime when the operator picks the
          // neural tier, so it must not ride along in the entry chunk.
          if (id.includes('node_modules/onnxruntime-web')) {
            return 'onnxruntime';
          }

          if (isMp3EncoderAsset(id)) {
            return 'mp3-encoder';
          }
        },
      },
    },
  },
}));
