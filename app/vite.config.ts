import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

/**
 * Landing (SEO, estática) e SPA do professor/aluno dividem o mesmo domínio e
 * o mesmo deploy — decisão de arquitetura, não acidente:
 *   index.html → landing, servida em /landing (é o que o Google indexa)
 *   app.html   → shell do React Router (todas as outras rotas)
 * A raiz não serve mais a landing: quem digita o domínio é quase sempre um
 * professor voltando para trabalhar, então `/` manda para /entrar.
 *
 * Em produção quem decide isso são o redirect e os rewrites em vercel.json.
 * Este plugin só replica o mesmo comportamento no `vite dev`, onde não existe
 * vercel.json: sem ele, abrir /entrar direto no navegador (ou dar F5) cairia
 * na landing em vez do SPA, porque o appType 'spa' padrão do Vite só sabe
 * fazer fallback para UM index.html.
 */
function roteamentoDaVercelEmDev(): Plugin {
  return {
    name: 'roteamento-da-vercel-em-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (req.method !== 'GET') return next()

        // Espelha o redirect da Vercel: 307, não 301 — navegador não guarda em
        // cache permanente, senão trocar isso depois exigiria limpar o cache
        // de todo mundo que já abriu a raiz uma vez.
        if (url === '/') {
          res.statusCode = 307
          res.setHeader('Location', '/entrar')
          return res.end()
        }

        // A landing, servida pelo caminho novo. Precisa vir ANTES do fallback:
        // /landing não tem ponto na URL e cairia no app.html.
        if (url === '/landing' || url.startsWith('/landing?')) {
          req.url = '/index.html'
          return next()
        }

        // A POC do tutor, no caminho escondido (o mesmo do vercel.json).
        if (url === '/lab-1084b4c851' || url.startsWith('/lab-1084b4c851?')) {
          req.url = '/laboratorio.html'
          return next()
        }

        const rotaDoAppSemArquivo = !url.startsWith('/@') && !url.startsWith('/src') && !url.includes('.')
        if (rotaDoAppSemArquivo) req.url = '/app.html'
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), roteamentoDaVercelEmDev()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
    // A POC (../poc-tutor) importa react de fora de app/: sem isto o Vite
    // procuraria um node_modules que não existe no build da Vercel.
    dedupe: ['react', 'react-dom'],
  },
  // Deixa o servidor de dev ler a POC, que mora fora da raiz do app.
  server: { port: Number(process.env.PORT) || 5173, fs: { allow: ['..'] } },
  build: {
    rollupOptions: {
      input: {
        landing: path.resolve(import.meta.dirname, 'index.html'),
        app: path.resolve(import.meta.dirname, 'app.html'),
        laboratorio: path.resolve(import.meta.dirname, 'laboratorio.html'),
      },
    },
  },
})
