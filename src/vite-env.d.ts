/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MULTIPLAYER_HTTP_URL?: string
  readonly VITE_MULTIPLAYER_WS_URL?: string
  readonly VITE_MULTIPLAYER_STUN_URLS?: string
}

declare module '*.yaml?raw' {
  const src: string
  export default src
}

declare module '*.md?raw' {
  const src: string
  export default src
}
