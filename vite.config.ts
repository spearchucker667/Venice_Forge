import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

/** Strips crossorigin attributes from script/link tags in the built HTML.
 *  Electron loads files via the file:// protocol, where CORS does not apply
 *  and the crossorigin attribute can cause module scripts to fail silently.
 */
function stripCrossorigin(): Plugin {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/\scrossorigin(?:=["'][^"']*["'])?(?=\s|>)/g, '');
    },
  };
}

export default defineConfig(() => {
  const disableHmr = process.env.DISABLE_HMR === "true";
  const isElectronBuild = process.env.ELECTRON_BUILD === "true";
  return {
    plugins: [
      react(),
      tailwindcss(),
      isElectronBuild ? stripCrossorigin() : undefined,
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Electron's loadFile requires relative asset paths
    base: isElectronBuild ? "./" : "/",
    build: {
      chunkSizeWarningLimit: 1000,
    },
    server: {
      hmr: !disableHmr,
      watch: disableHmr ? null : {},
    },
  };
});
