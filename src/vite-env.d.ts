/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MULTIPLAYER_HTTP_URL?: string
  readonly VITE_MULTIPLAYER_WS_URL?: string
  readonly VITE_MULTIPLAYER_STUN_URLS?: string
  readonly VITE_MULTIPLAYER_ICE_JSON?: string
  readonly VITE_MULTIPLAYER_TURN_HOST?: string
  readonly VITE_MULTIPLAYER_TURN_USER?: string
  readonly VITE_MULTIPLAYER_TURN_CREDENTIAL?: string
}

declare module '*.yaml?raw' {
  const src: string
  export default src
}

declare module '*.md?raw' {
  const src: string
  export default src
}
