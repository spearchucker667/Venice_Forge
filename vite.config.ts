import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

/** Strips crossorigin attributes from script/link tags in the built HTML.
 *  Electron loads files via the file:// protocol, where CORS does not apply
 *  and the crossorigin attribute can cause module scripts to fail silently.
 *
 *  Also injects a CSP nonce placeholder for Electron prod builds (see P2-CSP-IMPROVE
 *  and electron/main.ts). The placeholder is replaced at runtime with a real
 *  per-load nonce so the entry <script> tags satisfy the 'nonce-...' + 'strict-dynamic'
 *  policy when possible.
 */
function stripCrossorigin(): Plugin {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml(html) {
      let out = html.replace(/\scrossorigin(?:=["'][^"']*["'])?(?=\s|>)/g, '');
      // Nonce placeholder for prod Electron (replaced in main process before load).
      // Matches the two primary scripts in the built index.html (module entry + bootstrap).
      if (process.env.ELECTRON_BUILD === "true") {
        out = out.replace(
          /(<script[^>]*)(>)/g,
          (_m, pre, post) => {
            if (pre.includes('nonce=')) return pre + post;
            return pre + ' nonce="__VITE_CSP_NONCE__"' + post;
          }
        );
      }
      return out;
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
