import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronLeft, ExternalLink, FileText, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { carregarPdfjs } from '@/lib/arquivo'
import { marcarMaterialLido, urlDoMaterialDoAluno, useMateriaisAluno, usePainelAluno, type MaterialDoAluno } from './api'

/**
 * /painel/materiais/:id — o material aberto DENTRO do app.
 *
 * Antes o aluno abria o arquivo com `window.open` da URL assinada, e cada
 * navegador fazia uma coisa: o Chrome do Android baixava o PDF e tirava o
 * aluno do app, o Safari do iPhone abria numa aba solta, o navegador de dentro
 * do WhatsApp às vezes nem abria, e o Word sempre baixava. Aqui o arquivo é
 * desenhado pelo próprio app (pdf.js em <canvas>, <img>, <audio>), então a
 * leitura é igual em todo lugar. Nunca <iframe>/<embed>: o iPhone mostra só a
 * primeira página, e o Android não mostra nada.
 *
 * O link do arquivo original continua no topo, para quem quer baixar — e é a
 * saída quando um arquivo não abre aqui.
 */

const ZOOMS = [1, 1.5, 2] as const
/** Antes de a URL assinada vencer (1 h em materiais-aluno-obter), pede outra. */
const URL_VALE_MS = 50 * 60 * 1000

export function LeitorMaterialPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { data: materiais, isLoading } = useMateriaisAluno()
  const material = materiais?.find((m) => m.id === id)

  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1)
  const [rotuloPagina, setRotuloPagina] = useState<string | null>(null)
  const arquivo = useUrlDoArquivo(material)
  // Aberto a partir de um passo da trilha (?passo=…): no fim, "Li este material".
  const [busca] = useSearchParams()
  const passoId = busca.get('passo')
  const [chegouAoFim, setChegouAoFim] = useState(false)
  const paginas = rotuloPagina?.match(/Página (\d+) de (\d+)/)
  if (!chegouAoFim && (paginas ? paginas[1] === paginas[2] : material && material.tipo !== 'pdf')) {
    setChegouAoFim(true)
  }

  if (isLoading) return <TelaCheia><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></TelaCheia>

  if (!material) {
    return (
      <TelaCheia>
        <div className="px-6 text-center">
          <p className="font-bold text-neutral-800">Material não encontrado.</p>
          <Link to="/painel/materiais" className="mt-2 inline-block text-sm font-bold text-violet-700 underline">
            Voltar para os materiais
          </Link>
        </div>
      </TelaCheia>
    )
  }

  const temZoom = material.tipo === 'pdf' || material.tipo === 'imagem' || material.tipo === 'texto' || material.tipo === 'docx'
  const indiceZoom = ZOOMS.indexOf(zoom)

  return (
    <div className="min-h-dvh bg-neutral-200/70">
      <header
        className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-1 px-2 py-2">
          <Link
            to="/painel/materiais"
            aria-label="Voltar para os materiais"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-neutral-900">{material.nome}</p>
            <p className="text-xs font-medium text-neutral-500 tabular-nums">
              {rotuloPagina ?? (material.pasta ? material.pasta : rotuloDoTipo(material))}
            </p>
          </div>
          {temZoom && (
            <>
              <button
                onClick={() => setZoom(ZOOMS[Math.max(0, indiceZoom - 1)])}
                disabled={indiceZoom === 0}
                aria-label="Diminuir"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <button
                onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, indiceZoom + 1)])}
                disabled={indiceZoom === ZOOMS.length - 1}
                aria-label="Aumentar"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
            </>
          )}
          {arquivo.url && (
            // Link de verdade, e não `window.open` depois de um await: o
            // bloqueador de pop-up do celular e o navegador do WhatsApp deixam
            // passar um <a> tocado pelo aluno.
            <a
              href={arquivo.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir o arquivo original"
              title="Abrir o arquivo original"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100"
            >
              <ExternalLink className="h-5 w-5" />
            </a>
          )}
        </div>
      </header>

      <main className={`mx-auto max-w-3xl px-3 pt-3 ${passoId ? 'pb-32' : 'pb-16'}`}>
        <Conteudo material={material} arquivo={arquivo} zoom={zoom} aoMudarRotulo={setRotuloPagina} />
      </main>

      {passoId && <BarraDoPasso passoId={passoId} chegouAoFim={chegouAoFim} />}
    </div>
  )
}

function Conteudo({
  material,
  arquivo,
  zoom,
  aoMudarRotulo,
}: {
  material: MaterialDoAluno
  arquivo: ArquivoDoMaterial
  zoom: number
  aoMudarRotulo: (rotulo: string | null) => void
}) {
  if (material.tipo === 'texto' || !material.temArquivo) {
    return material.texto ? <Texto texto={material.texto} zoom={zoom} /> : <Falha mensagem="Este material está vazio." />
  }

  if (material.tipo === 'docx') {
    return (
      <div className="space-y-3">
        <div className="flex gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <FileText className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Arquivo do Word.{' '}
            {material.texto
              ? 'Abaixo está o texto dele; a formatação pode ser diferente do original.'
              : 'Ele ainda não abre aqui: use o botão no canto de cima para abrir o original.'}
          </p>
        </div>
        {material.texto && <Texto texto={material.texto} zoom={zoom} />}
      </div>
    )
  }

  if (arquivo.erro) return <Falha mensagem={arquivo.erro} url={arquivo.url} aoTentarDeNovo={arquivo.renovar} />
  if (!arquivo.url) return <Carregando />

  if (material.tipo === 'pdf') {
    return (
      <LeitorPdf
        // Uma URL nova (a anterior venceu) recomeça o documento na página
        // em que o aluno estava.
        key={arquivo.url}
        materialId={material.id}
        url={arquivo.url}
        zoom={zoom}
        aoMudarRotulo={aoMudarRotulo}
        aoFalhar={arquivo.renovarOuFalhar}
      />
    )
  }
  if (material.tipo === 'imagem') return <Imagem url={arquivo.url} nome={material.nome} zoom={zoom} />
  return <Audio url={arquivo.url} />
}

// ---------------------------------------------------------------------------
// A URL assinada do arquivo
// ---------------------------------------------------------------------------

type ArquivoDoMaterial = {
  url: string | null
  erro: string | null
  renovar: () => void
  /** Uma página que não carregou: tenta UMA URL nova antes de desistir. */
  renovarOuFalhar: () => void
}

function useUrlDoArquivo(material: MaterialDoAluno | undefined): ArquivoDoMaterial {
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const pedidaEm = useRef(0)
  const renovacoes = useRef(0)
  const materialId = material?.temArquivo ? material.id : null

  const pedir = useCallback(async () => {
    if (!materialId) return
    setErro(null)
    try {
      const nova = await urlDoMaterialDoAluno(materialId)
      pedidaEm.current = Date.now()
      setUrl(nova)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui abrir este material.')
    }
  }, [materialId])

  useEffect(() => {
    setUrl(null)
    renovacoes.current = 0
    void pedir()
  }, [pedir])

  // Quem deixa a leitura aberta por mais de uma hora volta com um link vencido
  // e o pdf.js falha ao buscar a próxima página. Renova antes disso, quando a
  // aba volta a ficar visível — o momento em que o aluno retoma a leitura.
  useEffect(() => {
    function aoVoltar() {
      if (document.visibilityState === 'visible' && pedidaEm.current && Date.now() - pedidaEm.current > URL_VALE_MS) {
        void pedir()
      }
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [pedir])

  const renovarOuFalhar = useCallback(() => {
    if (renovacoes.current >= 1) {
      setErro('Não deu para abrir este arquivo aqui.')
      return
    }
    renovacoes.current += 1
    void pedir()
  }, [pedir])

  return { url, erro, renovar: () => void pedir(), renovarOuFalhar }
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

type DocumentoPdf = Awaited<ReturnType<Awaited<ReturnType<typeof carregarPdfjs>>['getDocument']>['promise']>

/**
 * O teto de pixels de UM canvas. O Safari do iPhone recusa canvas acima de
 * ~16,7 milhões de pixels e, somando todos, fecha a aba sem aviso quando a
 * memória de canvas estoura — por isso o teto por página fica bem abaixo, e
 * as páginas longe da tela são liberadas (ver `PaginaPdf`).
 */
const PIXELS_MAX_POR_PAGINA = 6_000_000

function LeitorPdf({
  materialId,
  url,
  zoom,
  aoMudarRotulo,
  aoFalhar,
}: {
  materialId: string
  url: string
  zoom: number
  aoMudarRotulo: (rotulo: string | null) => void
  aoFalhar: () => void
}) {
  const [documento, setDocumento] = useState<DocumentoPdf | null>(null)
  const [proporcao, setProporcao] = useState(1.414)
  const [falhou, setFalhou] = useState(false)
  const caixaRef = useRef<HTMLDivElement>(null)
  const largura = useLarguraDe(caixaRef)
  const paginasRef = useRef<(HTMLDivElement | null)[]>([])
  const chaveDaPagina = `leitor:pagina:${materialId}`
  const paginaAtualRef = useRef(1)

  useEffect(() => {
    let cancelado = false
    // Quem solta o documento (rede e worker) é a tarefa de carga, não o documento.
    let tarefa: { destroy: () => Promise<void> } | null = null
    ;(async () => {
      try {
        const pdfjs = await carregarPdfjs()
        if (cancelado) return
        // Busca por partes (o Storage aceita Range): a primeira página aparece
        // antes de o arquivo inteiro chegar, o que no 4G é a diferença entre
        // abrir e desistir. `disableAutoFetch` só baixa o que for desenhado.
        const carga = pdfjs.getDocument({ url, disableAutoFetch: true, rangeChunkSize: 256 * 1024 })
        tarefa = carga
        const aberto = await carga.promise
        if (cancelado) return
        const primeira = await aberto.getPage(1)
        const vp = primeira.getViewport({ scale: 1 })
        if (cancelado) return
        setProporcao(vp.height / vp.width)
        setDocumento(aberto)
      } catch {
        if (!cancelado) setFalhou(true)
      }
    })()
    return () => {
      cancelado = true
      void tarefa?.destroy()
      aoMudarRotulo(null)
    }
  }, [url, aoMudarRotulo])

  // Volta para a página em que o aluno parou da última vez (neste aparelho).
  // Só depois de as páginas existirem na tela (documento E largura), e antes
  // de começar a gravar a página atual — senão a primeira medição grava
  // "página 1" por cima da página salva.
  const restaurou = useRef(false)
  useEffect(() => {
    if (!documento || !largura || restaurou.current) return
    restaurou.current = true
    const salva = Number(lerArmazenado(chaveDaPagina))
    if (salva > 1 && salva <= documento.numPages) {
      paginaAtualRef.current = salva
      requestAnimationFrame(() => paginasRef.current[salva - 1]?.scrollIntoView({ block: 'start' }))
    }
  }, [documento, largura, chaveDaPagina])

  // Ao mudar o zoom as páginas crescem, mas a rolagem fica no mesmo pixel: sem
  // isto o aluno que estava na página 5 aparece de volta na 3. Volta para a
  // página em que ele estava.
  const zoomAnterior = useRef(zoom)
  useEffect(() => {
    if (zoomAnterior.current === zoom) return
    zoomAnterior.current = zoom
    const alvo = paginasRef.current[paginaAtualRef.current - 1]
    if (alvo) requestAnimationFrame(() => alvo.scrollIntoView({ block: 'start' }))
  }, [zoom])

  // A página atual é a que ocupa o topo da tela.
  useEffect(() => {
    if (!documento || !largura || !restaurou.current) return
    const total = documento.numPages
    let agendado = 0
    let ultima = 0
    function medir() {
      agendado = 0
      const linha = window.innerHeight * 0.35
      let atual = 1
      paginasRef.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= linha) atual = i + 1
      })
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) atual = total
      if (atual !== ultima) {
        ultima = atual
        paginaAtualRef.current = atual
        aoMudarRotulo(`Página ${atual} de ${total}`)
        gravarArmazenado(chaveDaPagina, String(atual))
      }
    }
    function aoRolar() {
      if (!agendado) agendado = requestAnimationFrame(medir)
    }
    medir()
    window.addEventListener('scroll', aoRolar, { passive: true })
    window.addEventListener('resize', aoRolar)
    return () => {
      window.removeEventListener('scroll', aoRolar)
      window.removeEventListener('resize', aoRolar)
      if (agendado) cancelAnimationFrame(agendado)
    }
  }, [documento, largura, aoMudarRotulo, chaveDaPagina])

  if (falhou) return <Falha mensagem="Não deu para abrir este PDF aqui." aoTentarDeNovo={aoFalhar} />

  return (
    <div ref={caixaRef} className="w-full">
      {!documento || !largura ? (
        <Carregando />
      ) : (
        <div className="overflow-x-auto">
          <div className="mx-auto flex flex-col gap-3" style={{ width: largura * zoom }}>
            {Array.from({ length: documento.numPages }, (_, i) => (
              <PaginaPdf
                key={i}
                ref={(el) => {
                  paginasRef.current[i] = el
                }}
                documento={documento}
                numero={i + 1}
                largura={largura * zoom}
                proporcaoInicial={proporcao}
                aoFalhar={aoFalhar}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PaginaPdf({
  ref,
  documento,
  numero,
  largura,
  proporcaoInicial,
  aoFalhar,
}: {
  ref: (el: HTMLDivElement | null) => void
  documento: DocumentoPdf
  numero: number
  largura: number
  proporcaoInicial: number
  aoFalhar: () => void
}) {
  const caixaRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [proporcao, setProporcao] = useState(proporcaoInicial)
  const [perto, setPerto] = useState(numero <= 2)
  const [desenhada, setDesenhada] = useState(false)

  // Desenha só a página que está perto da tela — e solta as que se afastaram.
  useEffect(() => {
    const el = caixaRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setPerto(true)
      return
    }
    const observador = new IntersectionObserver(([entrada]) => setPerto(entrada.isIntersecting), {
      rootMargin: '150% 0px',
    })
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!perto) {
      // Zerar o tamanho é o que devolve a memória do canvas no Safari.
      canvas.width = 0
      canvas.height = 0
      setDesenhada(false)
      return
    }
    let cancelado = false
    let tarefa: { cancel: () => void; promise: Promise<unknown> } | null = null
    ;(async () => {
      try {
        const pagina = await documento.getPage(numero)
        if (cancelado) return
        const original = pagina.getViewport({ scale: 1 })
        setProporcao(original.height / original.width)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        let escala = (largura * dpr) / original.width
        const pixels = original.width * escala * original.height * escala
        if (pixels > PIXELS_MAX_POR_PAGINA) escala *= Math.sqrt(PIXELS_MAX_POR_PAGINA / pixels)
        const viewport = pagina.getViewport({ scale: escala })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas')
        // PDF costuma ter fundo transparente; sem isto a página sai preta.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        tarefa = pagina.render({ canvas, canvasContext: ctx, viewport })
        await tarefa.promise
        if (!cancelado) setDesenhada(true)
      } catch (e) {
        if (cancelado || (e instanceof Error && e.name === 'RenderingCancelledException')) return
        aoFalhar()
      }
    })()
    return () => {
      cancelado = true
      tarefa?.cancel()
    }
  }, [perto, documento, numero, largura, aoFalhar])

  return (
    <div
      ref={(el) => {
        caixaRef.current = el
        ref(el)
      }}
      className="relative w-full scroll-mt-20 overflow-hidden rounded-sm bg-white shadow-sm"
      style={{ aspectRatio: `1 / ${proporcao}` }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {!desenhada && (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-300" />
        </div>
      )}
    </div>
  )
}

/** Largura útil da caixa, em degraus de 10% — redesenhar a cada pixel é caro. */
function useLarguraDe(ref: React.RefObject<HTMLDivElement | null>) {
  const [largura, setLargura] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = (w: number) =>
      setLargura((atual) => (w > 0 && (!atual || Math.abs(w - atual) / atual > 0.1) ? Math.round(w) : atual))
    medir(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(([entrada]) => medir(entrada.contentRect.width))
    observador.observe(el)
    return () => observador.disconnect()
  }, [ref])
  return largura
}

// ---------------------------------------------------------------------------
// Imagem, áudio e texto
// ---------------------------------------------------------------------------

function Imagem({ url, nome, zoom }: { url: string; nome: string; zoom: number }) {
  const [falhou, setFalhou] = useState(false)
  if (falhou) return <Falha mensagem="Não deu para abrir esta imagem aqui." />
  return (
    <div className="overflow-x-auto">
      <img
        src={url}
        alt={nome}
        onError={() => setFalhou(true)}
        className="mx-auto block max-w-none rounded-sm bg-white shadow-sm"
        style={{ width: `${zoom * 100}%` }}
      />
    </div>
  )
}

const VELOCIDADES = [0.75, 1, 1.25] as const

function Audio({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [velocidade, setVelocidade] = useState<number>(1)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = velocidade
  }, [velocidade])

  if (falhou) return <Falha mensagem="Não deu para tocar este áudio aqui." />

  return (
    <div className="mx-auto mt-6 max-w-sm rounded-3xl bg-white p-5">
      {/* Os controles do próprio navegador: são os que funcionam com a tela
          bloqueada, com fone bluetooth e com o leitor de tela em todo celular. */}
      <audio
        ref={audioRef}
        src={url}
        controls
        preload="metadata"
        onError={() => setFalhou(true)}
        className="w-full"
      />
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-neutral-500">Velocidade</span>
        <div className="flex gap-1">
          {VELOCIDADES.map((v) => (
            <button
              key={v}
              onClick={() => setVelocidade(v)}
              aria-pressed={velocidade === v}
              className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${
                velocidade === v ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {String(v).replace('.', ',')}×
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Texto({ texto, zoom }: { texto: string; zoom: number }) {
  return (
    <article
      className="whitespace-pre-wrap break-words rounded-3xl bg-white px-5 py-6 leading-relaxed text-neutral-800"
      style={{ fontSize: `${15 * zoom}px` }}
    >
      {texto}
    </article>
  )
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

function TelaCheia({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center bg-areia">{children}</div>
}

function Carregando() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
    </div>
  )
}

function Falha({ mensagem, url, aoTentarDeNovo }: { mensagem: string; url?: string | null; aoTentarDeNovo?: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-xs rounded-3xl bg-white px-6 py-8 text-center">
      <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
      <p className="mt-2 font-bold text-neutral-800">{mensagem}</p>
      <p className="mt-1 text-sm text-neutral-500">
        Você pode abrir o arquivo original pelo botão no canto de cima.
      </p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-bold text-violet-700 underline">
          Abrir o arquivo original
        </a>
      )}
      {aoTentarDeNovo && (
        <button onClick={aoTentarDeNovo} className="mt-4 rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-white">
          Tentar de novo
        </button>
      )}
    </div>
  )
}

function rotuloDoTipo(material: MaterialDoAluno): string {
  return { pdf: 'PDF', docx: 'Word', imagem: 'Imagem', audio: 'Áudio', texto: 'Texto' }[material.tipo]
}

// O localStorage pode não existir (aba anônima do Safari antigo) ou recusar a
// escrita: lembrar a página é conveniência, nunca motivo para quebrar a tela.
function lerArmazenado(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}
function gravarArmazenado(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    /* sem armazenamento: só não lembra a página */
  }
}

// ---------------------------------------------------------------------------
// "Li este material" — o passo de material da trilha
// ---------------------------------------------------------------------------

/**
 * Só aparece quando o leitor foi aberto por um passo da trilha. No PDF, o
 * botão liga quando o aluno chega à última página; nos outros tipos, na hora.
 * Quem confere se o passo está liberado é a função (`trilha-passo-concluir`).
 */
function BarraDoPasso({ passoId, chegouAoFim }: { passoId: string; chegouAoFim: boolean }) {
  const qc = useQueryClient()
  const { data: painel } = usePainelAluno()
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [marcado, setMarcado] = useState(false)

  const trilha = painel?.trilhas.find((t) => t.etapas.some((e) => e.etapaId === passoId))
  const passo = trilha?.etapas.find((e) => e.etapaId === passoId)
  const feito = marcado || passo?.estado === 'feito'
  const voltar = trilha ? `/painel/trilha/${trilha.id}` : '/painel'

  async function marcar() {
    setErro(null)
    setSalvando(true)
    try {
      await marcarMaterialLido(passoId)
      setMarcado(true)
      await qc.invalidateQueries({ queryKey: ['painel-aluno'] })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui marcar como lido.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 px-4 pt-3 backdrop-blur"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="mx-auto max-w-sm">
        {feito ? (
          <Link
            to={voltar}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3 text-sm font-extrabold text-white"
          >
            <Check className="h-4 w-4" /> Lido · voltar para a trilha
          </Link>
        ) : (
          <button
            onClick={marcar}
            disabled={!chegouAoFim || salvando}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3 text-sm font-extrabold text-white disabled:bg-neutral-200 disabled:text-neutral-500"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {chegouAoFim ? 'Li este material' : 'Role até o fim para concluir'}
          </button>
        )}
        {erro && <p className="mt-2 text-center text-xs font-medium text-rose-700">{erro}</p>}
      </div>
    </div>
  )
}
