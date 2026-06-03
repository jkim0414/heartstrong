import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' makes the build work whether hosted at a domain root,
// in a subfolder (e.g. GitHub Pages), or opened from the file system.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
