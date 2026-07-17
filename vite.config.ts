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
            // The bundled prompt catalog is immutable data and is shared by several
            // lazy views. Keep it out of the startup entry so adding prompts cannot
            // silently consume the main-app bundle budget.
            if (id.endsWith('/src/data/promptStarters.ts')) return 'prompt-starters';
            // Sync packet parsing and conflict resolution are invoked only for
            // remote/manual imports. Isolate them from the startup entry so
            // format-specific merge logic cannot inflate the shell bundle.
            if (id.endsWith('/src/services/syncPacketImporter.ts')) return 'sync-packet-importer';
            if (id.includes('node_modules')) {
              if (id.includes('/pdfjs-dist/')) return 'vendor-pdfjs';
              if (id.includes('/mammoth/') || id.includes('/@xmldom/') || id.includes('/argparse/') || id.includes('/base64-js/') || id.includes('/bluebird/') || id.includes('/dingbat-to-unicode/') || id.includes('/jszip/') || id.includes('/lop/') || id.includes('/path-is-absolute/') || id.includes('/underscore/') || id.includes('/xmlbuilder/') || id.includes('/pako/') || id.includes('/sax/')) return 'vendor-documents';
              if (id.includes('/lucide-react/')) return 'vendor-lucide';
              if (id.includes('@xyflow') || id.includes('reactflow')) return 'vendor-xyflow';
              if (id.includes('@tanstack')) return 'vendor-tanstack';
              if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router/') || id.includes('/zustand/')) return 'vendor-react';
              if (id.includes('/framer-motion/')) return 'vendor-framer';
              if (id.includes('/react-markdown/') || id.includes('/remark/') || id.includes('/rehype/') || id.includes('/markdown/') || id.includes('/micromark') || id.includes('/mdast-') || id.includes('/hast-') || id.includes('/unist-') || id.includes('/hastscript/') || id.includes('/ccount/') || id.includes('/longest-streak/')) return 'vendor-markdown';
              if (id.includes('/katex/') || id.includes('/mathjax/')) return 'vendor-math';
              if (id.includes('/monaco-editor/') || id.includes('/@monaco/')) return 'vendor-monaco';
              if (id.includes('/d3/') || id.includes('/d3-')) return 'vendor-d3';
              if (id.includes('/recharts/') || id.includes('/victory/')) return 'vendor-charts';
              if (id.includes('/lodash/') || id.includes('/lodash-es/')) return 'vendor-lodash';
              if (id.includes('/mermaid/')) return 'vendor-mermaid';
              if (id.includes('/prismjs/') || id.includes('/highlight.js/')) return 'vendor-syntax';
              if (id.includes('/i18next/') || id.includes('/react-i18next/')) return 'vendor-i18n';
              // Removed generic fallback to allow Rollup to naturally chunk remaining modules
              // and prevent circular dependencies between forced chunks.
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
