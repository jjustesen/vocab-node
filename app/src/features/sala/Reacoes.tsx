import { useCallback, useEffect, useRef, useState } from 'react'
import { Hand, Heart, Laugh, PartyPopper, Sparkles, SmilePlus, ThumbsUp, type LucideIcon } from 'lucide-react'
import { useCanal } from './canal'

/**
 * Reações — o aceno de cabeça de quem está com o microfone fechado.
 *
 * Numa aula de idioma a pessoa passa boa parte do tempo ouvindo, e abrir o
 * microfone só para dizer "entendi" corta quem está falando. A reação diz
 * isso sem som: sobe pela tela com o nome de quem mandou e some sozinha.
 *
 * Ícones, e não emoji, pela regra do produto (index.css): emoji muda de cara
 * em cada sistema e destoa do resto da interface. Cada reação tem uma cor para
 * ser reconhecida de relance, sem precisar ler.
 *
 * Nada fica guardado — é sinal ao vivo, pelo mesmo data channel do resto da
 * sala (ver `canal.ts`).
 */
const REACOES = {
  curtir: { Icone: ThumbsUp, rotulo: 'Entendi', cor: 'bg-sky-300' },
  amei: { Icone: Heart, rotulo: 'Amei', cor: 'bg-pink-300' },
  haha: { Icone: Laugh, rotulo: 'Haha', cor: 'bg-amber-300' },
  uau: { Icone: Sparkles, rotulo: 'Uau', cor: 'bg-violet-300' },
  parabens: { Icone: PartyPopper, rotulo: 'Parabéns', cor: 'bg-emerald-300' },
  mao: { Icone: Hand, rotulo: 'Tenho uma dúvida', cor: 'bg-orange-300' },
} satisfies Record<string, { Icone: LucideIcon; rotulo: string; cor: string }>

export type TipoDeReacao = keyof typeof REACOES

function ehReacao(tipo: unknown): tipo is TipoDeReacao {
  return typeof tipo === 'string' && Object.hasOwn(REACOES, tipo)
}

type Pacote = { t: 'reacao'; tipo: TipoDeReacao }

type ReacaoNoAr = {
  id: number
  tipo: TipoDeReacao
  nome: string
  /** 0–1: de onde ela sobe, para duas reações simultâneas não se empilharem. */
  faixa: number
}

/** O tempo da animação em index.css (`--animate-sobe`) — a reação sai do DOM quando ela acaba. */
const DURACAO_MS = 3200
/** Segurar o dedo no botão não pode virar uma enxurrada na tela da turma inteira. */
const INTERVALO_MINIMO_MS = 300
/** Numa turma animada, acima disso a tela vira confete e ninguém lê nome nenhum. */
const MAXIMO_NO_AR = 24

export function useReacoes(meuNome: string) {
  const [noAr, setNoAr] = useState<ReacaoNoAr[]>([])
  const proximoId = useRef(0)
  const ultimaRef = useRef(0)
  const timers = useRef(new Set<number>())

  useEffect(() => {
    const pendentes = timers.current
    return () => pendentes.forEach((t) => window.clearTimeout(t))
  }, [])

  const mostrar = useCallback((tipo: TipoDeReacao, nome: string) => {
    const id = proximoId.current++
    setNoAr((atuais) => [...atuais, { id, tipo, nome, faixa: Math.random() }].slice(-MAXIMO_NO_AR))
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setNoAr((atuais) => atuais.filter((r) => r.id !== id))
    }, DURACAO_MS)
    timers.current.add(timer)
  }, [])

  const enviarNoCanal = useCanal<Pacote>('reacao', (pacote, remetente) => {
    if (pacote?.t !== 'reacao' || !ehReacao(pacote.tipo) || !remetente) return
    mostrar(pacote.tipo, remetente.name || remetente.identity)
  })

  const reagir = useCallback(
    (tipo: TipoDeReacao) => {
      const agora = Date.now()
      if (agora - ultimaRef.current < INTERVALO_MINIMO_MS) return
      ultimaRef.current = agora
      mostrar(tipo, meuNome)
      enviarNoCanal({ t: 'reacao', tipo })
    },
    [enviarNoCanal, meuNome, mostrar],
  )

  return { noAr, reagir }
}

/**
 * A camada por cima do vídeo e do palco onde as reações sobem. Não recebe
 * clique (`pointer-events-none`): passar por cima da lousa não pode roubar o
 * traço de quem está escrevendo.
 *
 * Sobem pelo canto de baixo à ESQUERDA, numa faixa estreita — o centro é o
 * exercício, e reação no meio dele atrapalharia justo o que a turma está lendo.
 */
export function CamadaDeReacoes({ noAr }: { noAr: ReacaoNoAr[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {noAr.map((r) => {
        const { Icone, cor } = REACOES[r.tipo]
        return (
          <div
            key={r.id}
            style={{ left: `${4 + r.faixa * 14}%` }}
            className="absolute bottom-4 flex flex-col items-center gap-1 motion-safe:animate-sobe motion-reduce:animate-esmaece"
          >
            <span className={`grid h-11 w-11 place-items-center rounded-full shadow-lg shadow-black/30 ${cor}`}>
              <Icone className="h-5 w-5 text-neutral-900" />
            </span>
            <span className="max-w-28 truncate rounded-full bg-neutral-950/80 px-2 py-0.5 text-[11px] font-bold text-white">
              {r.nome}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * O botão da barra que abre a fileira de reações. A fileira fica aberta até
 * clicar fora ou apertar Esc — aplaudir é clicar várias vezes seguidas, e
 * reabrir o menu a cada clique mataria o gesto.
 */
export function BotaoDeReagir({ aoReagir }: { aoReagir: (tipo: TipoDeReacao) => void }) {
  const [aberto, setAberto] = useState(false)
  const raizRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function fora(e: PointerEvent) {
      if (!raizRef.current?.contains(e.target as Node)) setAberto(false)
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  return (
    <div ref={raizRef} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        title="Reagir sem abrir o microfone"
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${
          aberto ? 'bg-violet-300 text-neutral-900' : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
        }`}
      >
        <SmilePlus className="h-4 w-4" />
        <span className="hidden sm:inline">Reagir</span>
      </button>

      {aberto && (
        <div
          role="menu"
          aria-label="Reações"
          className="absolute bottom-full left-1/2 z-30 mb-2 flex -translate-x-1/2 gap-1 rounded-full bg-neutral-900 p-1.5 shadow-xl shadow-black/40 ring-1 ring-white/10"
        >
          {(Object.keys(REACOES) as TipoDeReacao[]).map((tipo) => {
            const { Icone, rotulo, cor } = REACOES[tipo]
            return (
              <button
                key={tipo}
                role="menuitem"
                onClick={() => aoReagir(tipo)}
                title={rotulo}
                aria-label={rotulo}
                className={`grid h-10 w-10 place-items-center rounded-full text-neutral-900 transition hover:scale-110 active:scale-95 ${cor}`}
              >
                <Icone className="h-5 w-5" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
