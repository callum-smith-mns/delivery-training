import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBaseUrl = (env.VITE_API_BASE_URL ?? '').trim()

  // When the API is hosted under a path prefix (e.g. VITE_API_BASE_URL=/foo),
  // proxy that prefixed /api path so dev mirrors a subfolder deployment. Start
  // the API with a matching BASE_PATH=/foo. A full URL (http://…) means the app
  // calls the API directly, so only the default /api proxy is needed.
  const isPathPrefix = apiBaseUrl.startsWith('/')
  const apiPrefix = isPathPrefix ? `${apiBaseUrl.replace(/\/+$/, '')}/api` : '/api'

  return {
    plugins: [react()],
    // Emit relative asset URLs so the built app works when deployed in a subfolder.
    base: './',
    server: {
      proxy: {
        [apiPrefix]: 'http://127.0.0.1:3001',
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      globals: true,
      css: true,
      include: ['src/**/*.test.{js,jsx}'],
      exclude: ['tests/**'],
    },
  }
})
