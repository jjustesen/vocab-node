import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

/**
 * Landing (SEO, estática) e SPA do professor/aluno dividem o mesmo domínio e
 * o mesmo deploy — decisão de arquitetura, não acidente:
 *   index.html → landing (raiz do domínio, é o que o Google indexa)
 *   app.html   → shell do React Router (todas as outras rotas)
 * Em produção quem decide isso é o rewrite em vercel.json. Este plugin só
 * replica o mesmo comportamento no `vite dev`, onde não existe vercel.json:
 * sem ele, abrir /entrar direto no navegador (ou dar F5) cairia na landing
 * em vez do SPA, porque o appType 'spa' padrão do Vite só sabe fazer
 * fallback para UM index.html.
 */
function fallbackParaSpaEmDev(): Plugin {
  return {
    name: 'fallback-app-html-em-dev',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? ''
        const rotaDoAppSemArquivo = url !== '/' && !url.startsWith('/@') && !url.startsWith('/src') && !url.includes('.')
        if (req.method === 'GET' && rotaDoAppSemArquivo) req.url = '/app.html'
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), fallbackParaSpaEmDev()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: { port: Number(process.env.PORT) || 5173 },
  build: {
    rollupOptions: {
      input: {
        landing: path.resolve(import.meta.dirname, 'index.html'),
        app: path.resolve(import.meta.dirname, 'app.html'),
      },
    },
  },
})
