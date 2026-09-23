declare module '*.gif' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

/** Vite ?url suffix — forces asset-URL resolution for any file type. */
declare module '*?url' {
  const src: string;
  export default src;
}
