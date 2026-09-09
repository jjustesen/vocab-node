import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { carregarPdfjs } from '@/lib/arquivo'
import type { Palco } from './estado-palco'

/**
 * O material do aluno renderizado NO PALCO — não compartilhado por tela.
 *
 * As duas pontas recebem a mesma URL assinada e desenham o arquivo cada uma na
 * própria resolução. O aluno não está vendo o notebook do professor: está
 * vendo o PDF dele, nítido, no celular dele. É a diferença que justifica todo
 * o resto desta pasta (ver `estado-palco.ts`).
 *
 * Como consequência, a anotação por cima cola no CONTEÚDO e não na tela de
 * quem desenhou — e virar a página troca de superfície, então o rabisco da
 * página 3 não vaza para a 4.
 */
export function MaterialNoPalco({ palco }: { palco: Extract<Palco, { tipo: 'material' }> }) {
  if (palco.formato === 'imagem') {
    return (
      <img
        src={palco.url}
        alt={palco.nome}
        className="h-full w-full rounded-2xl bg-white object-contain"
      />
    )
  }
  return <PdfNoPalco url={palco.url} pagina={palco.pagina} />
}

function PdfNoPalco({ url, pagina }: { url: string; pagina: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  /**
   * A largura em que a página foi rasterizada da última vez.
   *
   * Sem isto, ampliar (a lupa do palco, ver `Palco.tsx`) só esticava o bitmap
   * já desenhado: o texto crescia junto com os artefatos, que é exatamente o
   * contrário do que a lupa promete. Redesenhar na largura nova devolve texto
   * nítido em qualquer zoom.
   *
   * O degrau de 25% existe para não redesenhar o PDF a cada pixel de um
   * arrastar de janela — o render de uma página é caro, e a diferença de
   * nitidez abaixo disso ninguém enxerga.
   */
  const [larguraAlvo, setLarguraAlvo] = useState(0)
  const caixaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const caixa = caixaRef.current
    if (!caixa) return
    const observador = new ResizeObserver(([entrada]) => {
      const largura = entrada.contentRect.width
      if (largura < 1) return
      setLarguraAlvo((atual) => (Math.abs(largura - atual) / (atual || largura) > 0.25 ? largura : atual))
    })
    observador.observe(caixa)
    return () => observador.disconnect()
  }, [])

  useEffect(() => {
    let cancelado = false
    // Uma tarefa de render por vez: trocar de página rápido deixaria dois
    // `render()` disputando o mesmo canvas, e o pdf.js aborta os dois.
    let renderizando: { cancel: () => void } | null = null

    async function desenhar() {
      setCarregando(true)
      setErro(null)
      try {
        const pdfjs = await carregarPdfjs()
        const documento = await pdfjs.getDocument({ url }).promise
        if (cancelado) return

        const numero = Math.min(Math.max(1, pagina), documento.numPages)
        const paginaPdf = await documento.getPage(numero)
        if (cancelado) return

        const canvas = canvasRef.current
        if (!canvas) return

        // Renderiza na resolução REAL da caixa em que o canvas caiu, vezes o
        // dpr. É o que faz o mesmo PDF sair nítido no notebook e no celular
        // sem mandar imagem grande pela rede — cada lado rasteriza o seu.
        const { width } = canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        void larguraAlvo // a mudança de largura é o que redispara este efeito
        const original = paginaPdf.getViewport({ scale: 1 })
        const escala = ((width || 900) * dpr) / original.width
        const viewport = paginaPdf.getViewport({ scale: escala })

        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Este navegador não conseguiu abrir o PDF.')

        // Página de PDF costuma ter fundo transparente; sem isto sai preta.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // `intent: 'print'` não é sobre imprimir: é o jeito de o pdf.js
        // desenhar sem requestAnimationFrame — a aba que perde o foco no meio
        // da aula travaria o render com o intent padrão.
        const tarefa = paginaPdf.render({ canvas, canvasContext: ctx, viewport, intent: 'print' })
        renderizando = tarefa
        await tarefa.promise
        if (!cancelado) setCarregando(false)
      } catch {
        if (!cancelado) {
          // A URL assinada vale 1h. Uma aula que passe disso, ou um material
          // apagado no meio, caem aqui — e o texto tem que dizer o que fazer.
          setErro('Não consegui abrir este material. Peça ao professor para colocá-lo de novo.')
          setCarregando(false)
        }
      }
    }

    desenhar()
    return () => {
      cancelado = true
      renderizando?.cancel()
    }
  }, [url, pagina, larguraAlvo])

  return (
    <div ref={caixaRef} className="relative h-full w-full overflow-hidden rounded-2xl bg-white">
      <canvas ref={canvasRef} className="h-full w-full object-contain" />

      {carregando && !erro && (
        <div className="absolute inset-0 grid place-items-center bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      )}

      {erro && (
        <div className="absolute inset-0 grid place-items-center bg-white px-6 text-center">
          <div className="max-w-xs">
            <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
            <p className="mt-2 text-sm font-medium text-neutral-600">{erro}</p>
          </div>
        </div>
      )}
    </div>
  )
}
