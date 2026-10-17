interface ImportMetaEnv {
  /** tldraw SDK license key (production). Optional in dev. */
  readonly VITE_TLDRAW_LICENSE_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
