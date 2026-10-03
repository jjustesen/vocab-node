import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Página única da POC. Porta própria (5175) para não brigar com o app (5173).
// Host 127.0.0.1 (IPv4) de propósito: o `adb reverse` do celular entrega em
// 127.0.0.1, e o "localhost" do Windows às vezes só escuta em IPv6 (::1).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: Number(process.env.PORT) || 5175 },
})
