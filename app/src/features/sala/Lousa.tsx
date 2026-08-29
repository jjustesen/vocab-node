import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataChannel } from '@livekit/components-react'
import { Eraser, Undo2 } from 'lucide-react'

/**
 * Lousa compartilhada da sala.
 *
 * A sincronia sai pelo DATA CHANNEL do próprio LiveKit — a mesma conexão do
 * vídeo. Nenhum servidor, tabela ou canal novo: se a chamada está de pé, a
 * lousa está. É a razão de a lousa morar aqui dentro e não numa página à parte.
 *
 * Coordenadas viajam num quadro lógico fixo de 1600x900, nunca em pixels: o
 * professor está no notebook e o aluno no celular, e um traço em pixels
 * chegaria do outro lado no lugar errado. O contêiner é `aspect-video` nos
 * dois, então o mesmo par (x, y) cai no mesmo ponto do desenho.
 *
 * O desenho é EFÊMERO: vive na memória das duas pontas enquanto a sala está
 * aberta e some quando ela fecha. Guardar exigiria decidir a quem o desenho
 * pertence e por quanto tempo — decisão de produto que ninguém tomou ainda.
 */

const LARGURA_LOGICA = 1600
const ALTURA_LOGICA = 900

const CORES = ['#171717', '#7c3aed', '#dc2626', '#059669'] as const
const ESPESSURAS = [3, 8] as const

type Ponto = [number, number]
type Traco = { id: string; cor: string; espessura: number; pontos: Ponto[] }

type Mensagem =
  | { t: 'pontos'; id: string; cor: string; espessura: number; pontos: Ponto[] }
  | { t: 'desfazer'; id: string }
  | { t: 'limpar' }
  | { t: 'pedir-estado' }
  | { t: 'estado'; tracos: Traco[] }

/** Um lote a cada ~80ms: o traço aparece do outro lado enquanto ainda está sendo feito, sem inundar o canal. */
const INTERVALO_ENVIO_MS = 80

export function Lousa() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tracos = useRef<Traco[]>([])
  const meusTracos = useRef<string[]>([])

  const [cor, setCor] = useState<string>(CORES[0])
  const [espessura, setEspessura] = useState<number>(ESPESSURAS[0])

  const tracoAtual = useRef<Traco | null>(null)
  const naoEnviados = useRef<Ponto[]>([])
  const ultimoEnvio = useRef(0)

  // ── desenho ───────────────────────────────────────────────────────────────

  const contexto = useCallback((): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current
    return canvas ? canvas.getContext('2d') : null
  }, [])

  const desenharTraco = useCallback(
    (ctx: CanvasRenderingContext2D, traco: Traco, apenasDoIndice = 0) => {
      if (traco.pontos.length === 0) return
      const escala = ctx.canvas.width / LARGURA_LOGICA
      ctx.strokeStyle = traco.cor
      ctx.lineWidth = traco.espessura * escala
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Um ponto solto vira bolinha — senão tocar a tela sem arrastar não marcaria nada.
      if (traco.pontos.length === 1) {
        const [x, y] = traco.pontos[0]
        ctx.beginPath()
        ctx.arc(x * escala, y * escala, (traco.espessura * escala) / 2, 0, Math.PI * 2)
        ctx.fillStyle = traco.cor
        ctx.fill()
        return
      }

      const inicio = Math.max(0, apenasDoIndice - 1)
      ctx.beginPath()
      ctx.moveTo(traco.pontos[inicio][0] * escala, traco.pontos[inicio][1] * escala)
      for (let i = inicio + 1; i < traco.pontos.length; i++) {
        ctx.lineTo(traco.pontos[i][0] * escala, traco.pontos[i][1] * escala)
      }
      ctx.stroke()
    },
    [],
  )

  const redesenhar = useCallback(() => {
    const ctx = contexto()
    if (!ctx) return
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    for (const traco of tracos.current) desenharTraco(ctx, traco)
  }, [contexto, desenharTraco])

  // O canvas acompanha o tamanho do contêiner e a densidade da tela; sem isso
  // o traço sai borrado no celular (dpr 2 ou 3).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ajustar = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (width === 0 || height === 0) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      redesenhar()
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(canvas)
    return () => observador.disconnect()
  }, [redesenhar])

  // ── canal de dados ────────────────────────────────────────────────────────

  const aplicar = useCallback(
    (msg: Mensagem) => {
      const ctx = contexto()
      switch (msg.t) {
        case 'pontos': {
          const existente = tracos.current.find((t) => t.id === msg.id)
          if (existente) {
            const desde = existente.pontos.length
            existente.pontos.push(...msg.pontos)
            if (ctx) desenharTraco(ctx, existente, desde)
          } else {
            const novo: Traco = { id: msg.id, cor: msg.cor, espessura: msg.espessura, pontos: msg.pontos }
            tracos.current.push(novo)
            if (ctx) desenharTraco(ctx, novo)
          }
          break
        }
        case 'desfazer':
          tracos.current = tracos.current.filter((t) => t.id !== msg.id)
          redesenhar()
          break
        case 'limpar':
          tracos.current = []
          meusTracos.current = []
          redesenhar()
          break
        case 'estado':
          tracos.current = msg.tracos
          redesenhar()
          break
      }
    },
    [contexto, desenharTraco, redesenhar],
  )

  const enviarRef = useRef<((msg: Mensagem) => void) | null>(null)

  const { send } = useDataChannel('lousa', (recebida) => {
    let msg: Mensagem
    try {
      msg = JSON.parse(new TextDecoder().decode(recebida.payload)) as Mensagem
    } catch {
      return // mensagem de uma versão futura do app: ignorar é melhor que quebrar
    }
    // Quem chega depois pede o desenho; quem já tem responde. Sem isso, entrar
    // no meio da aula mostraria uma lousa vazia enquanto o outro vê a cheia.
    if (msg.t === 'pedir-estado') {
      if (tracos.current.length > 0) enviarRef.current?.({ t: 'estado', tracos: tracos.current })
      return
    }
    aplicar(msg)
  })

  const enviar = useCallback(
    (msg: Mensagem) => {
      // Falha de envio não pode derrubar o desenho local: se a conexão caiu, a
      // pessoa continua escrevendo na própria lousa e só o outro lado fica para
      // trás. Engolir aqui é a diferença entre um traço perdido e uma
      // unhandled rejection no meio da aula.
      send(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true, topic: 'lousa' }).catch(
        () => {},
      )
    },
    [send],
  )
  enviarRef.current = enviar

  useEffect(() => {
    enviar({ t: 'pedir-estado' })
  }, [enviar])

  // ── ponteiro ──────────────────────────────────────────────────────────────

  function paraLogico(evento: React.PointerEvent<HTMLCanvasElement>): Ponto {
    const retangulo = evento.currentTarget.getBoundingClientRect()
    return [
      ((evento.clientX - retangulo.left) / retangulo.width) * LARGURA_LOGICA,
      ((evento.clientY - retangulo.top) / retangulo.height) * ALTURA_LOGICA,
    ]
  }

  function despejar() {
    const traco = tracoAtual.current
    if (!traco || naoEnviados.current.length === 0) return
    enviar({
      t: 'pontos',
      id: traco.id,
      cor: traco.cor,
      espessura: traco.espessura,
      pontos: naoEnviados.current,
    })
    naoEnviados.current = []
    ultimoEnvio.current = Date.now()
  }

  function aoPressionar(evento: React.PointerEvent<HTMLCanvasElement>) {
    evento.currentTarget.setPointerCapture(evento.pointerId)
    const ponto = paraLogico(evento)
    const traco: Traco = { id: crypto.randomUUID(), cor, espessura, pontos: [ponto] }
    tracoAtual.current = traco
    tracos.current.push(traco)
    meusTracos.current.push(traco.id)
    naoEnviados.current = [ponto]
    const ctx = contexto()
    if (ctx) desenharTraco(ctx, traco)
    despejar()
  }

  function aoMover(evento: React.PointerEvent<HTMLCanvasElement>) {
    const traco = tracoAtual.current
    if (!traco) return
    const ponto = paraLogico(evento)
    const desde = traco.pontos.length
    traco.pontos.push(ponto)
    naoEnviados.current.push(ponto)
    const ctx = contexto()
    if (ctx) desenharTraco(ctx, traco, desde)
    if (Date.now() - ultimoEnvio.current >= INTERVALO_ENVIO_MS) despejar()
  }

  function aoSoltar() {
    if (!tracoAtual.current) return
    // Despeja o resto SEM olhar o relógio: o fim do traço não pode ficar preso
    // esperando o próximo lote que nunca vem.
    despejar()
    tracoAtual.current = null
  }

  function desfazer() {
    const id = meusTracos.current.pop()
    if (!id) return
    tracos.current = tracos.current.filter((t) => t.id !== id)
    redesenhar()
    enviar({ t: 'desfazer', id })
  }

  function limpar() {
    tracos.current = []
    meusTracos.current = []
    redesenhar()
    enviar({ t: 'limpar' })
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2 rounded-2xl bg-neutral-900 px-3 py-2">
        {CORES.map((c) => (
          <button
            key={c}
            onClick={() => setCor(c)}
            title="Escolher cor"
            style={{ backgroundColor: c }}
            className={`h-7 w-7 rounded-full border-2 transition ${
              cor === c ? 'border-white' : 'border-transparent opacity-60'
            }`}
          />
        ))}

        <span className="mx-1 h-6 w-px bg-neutral-700" />

        {ESPESSURAS.map((e) => (
          <button
            key={e}
            onClick={() => setEspessura(e)}
            title={e === ESPESSURAS[0] ? 'Traço fino' : 'Traço grosso'}
            className={`grid h-7 w-7 place-items-center rounded-full transition ${
              espessura === e ? 'bg-neutral-700' : 'hover:bg-neutral-800'
            }`}
          >
            <span className="rounded-full bg-white" style={{ width: e + 2, height: e + 2 }} />
          </button>
        ))}

        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={desfazer}
            title="Desfazer meu último traço"
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={limpar}
            title="Limpar a lousa dos dois lados"
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <Eraser className="h-4 w-4" />
          </button>
        </span>
      </div>

      <div className="grid min-h-0 flex-1 place-items-center">
        <canvas
          ref={canvasRef}
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          // `touch-none`: sem isso, arrastar o dedo rola a página em vez de desenhar.
          className="aspect-video max-h-full w-full touch-none rounded-2xl bg-white"
        />
      </div>
    </div>
  )
}
