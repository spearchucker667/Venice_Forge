import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const disableHmr = process.env.DISABLE_HMR === "true";
  const isElectronBuild = process.env.ELECTRON_BUILD === "true";
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Electron's loadFile requires relative asset paths
    base: isElectronBuild ? "./" : "/",
    server: {
      hmr: !disableHmr,
      watch: disableHmr ? null : {},
    },
  };
});
