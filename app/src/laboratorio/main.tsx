import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../../../poc-tutor/web/App.tsx'
import './laboratorio.css'

/**
 * A POC do tutor (poc-tutor/ na raiz do repositório) servida pelo deploy da
 * plataforma, num caminho escondido (ver vercel.json) e atrás de uma senha
 * que só a função poc-tutor conhece.
 *
 * O código continua morando em poc-tutor/ — aqui só se monta a página. É uma
 * entrada à parte no build (laboratorio.html): nada da POC entra no bundle do
 * app, e nada do app entra no dela.
 */
createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
