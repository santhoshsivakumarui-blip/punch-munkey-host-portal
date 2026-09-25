/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the api-gateway, e.g. http://localhost:4000. No trailing slash. */
  readonly VITE_API_BASE_URL?: string;
  /** How long idle before auto sign-out — milliseconds. Overrides the 90-minute default. */
  readonly VITE_IDLE_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
