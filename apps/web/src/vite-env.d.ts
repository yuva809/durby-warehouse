/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Dev/demo convenience only — password used by the Login page's "demo accounts" quick-login list. */
  readonly VITE_SEED_DEMO_PASSWORD?: string
  /** Set to "true" to show the Login page's demo-account quick-login list. Leave unset/false in any real deployment. */
  readonly VITE_SHOW_DEMO_LOGINS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
