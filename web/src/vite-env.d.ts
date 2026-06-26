/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** CROO Agent Store listing URL where buyers place paid orders. */
  readonly VITE_CROO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
