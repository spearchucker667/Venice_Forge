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
  const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000";
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
      target: "es2022",
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('/pdfjs-dist/')) return 'vendor-pdfjs';
              if (id.includes('/lucide-react/')) return 'vendor-lucide';
              if (id.includes('@xyflow') || id.includes('reactflow')) return 'vendor-xyflow';
              if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router/') || id.includes('/zustand/')) return 'vendor-react';
              if (id.includes('/framer-motion/')) return 'vendor-framer';
              return 'vendor'; // generic fallback for other node_modules
            }
          }
        }
      }
    },
    server: {
      hmr: !disableHmr,
      watch: disableHmr ? null : {},
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: false,
          secure: apiProxyTarget.startsWith("https:"),
        },
      },
    },
  };
});
