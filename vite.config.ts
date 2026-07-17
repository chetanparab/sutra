import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5183, strictPort: true },
  // Two pages: the product site at / and the IDE at /app.html.
  build: {
    rollupOptions: {
      input: {
        site: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app.html', import.meta.url)),
      },
    },
  },
  // Don't let esbuild pre-bundle the QuickJS variant — it mangles the WASM
  // loading. Excluding keeps the module intact (binary served from public/).
  optimizeDeps: {
    exclude: ['quickjs-emscripten', 'quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync'],
  },
})
