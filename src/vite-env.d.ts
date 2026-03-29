/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_URL_EXTRACTOR?: string;
  readonly VITE_EXTRACTOR_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
