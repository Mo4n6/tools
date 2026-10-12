/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_URL_INGEST?: string;
  readonly VITE_EXTRACT_API_BASE_URL?: string;
  /**
   * Where the published wasm PowerShell engine lives, e.g. '/husk-engine/'.
   * Unset means Husk uses its own tree-walker, which is the default: the
   * engine is a 16 MB .NET build that is published separately.
   */
  readonly VITE_HUSK_ENGINE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
