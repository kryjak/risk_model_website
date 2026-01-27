import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  resolve: {
    alias: {
      'buffer/': 'buffer/',
    },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  define: {
    'global': 'globalThis',
  },
})
