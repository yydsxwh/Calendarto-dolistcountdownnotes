/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DAYS_API_ORIGIN?: string
  readonly VITE_ACCOUNT_URL?: string
  readonly VITE_SITE_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
