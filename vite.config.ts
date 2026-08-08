import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const devApiPort = Number(process.env.OCTAVE_DEV_API_PORT || 4311)

if (!Number.isInteger(devApiPort) || devApiPort < 1 || devApiPort > 65_535) {
  throw new Error(`OCTAVE_DEV_API_PORT inválido: ${process.env.OCTAVE_DEV_API_PORT}`)
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${devApiPort}` },
  },
})
