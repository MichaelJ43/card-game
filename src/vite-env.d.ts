/// <reference types="vite/client" />

declare module '*.yaml?raw' {
  const src: string
  export default src
}

declare module '*.md?raw' {
  const src: string
  export default src
}
