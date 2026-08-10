import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Emit relative asset URLs so the built app works when deployed in a subfolder.
  base: './',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
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
})
