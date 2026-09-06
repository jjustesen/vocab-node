import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, FileDown, Heading, List, Loader2, Pilcrow } from 'lucide-react'
import { useCanal, useSalaConectada } from './canal'
import {
  aplicarBloco,
  blocoNovo,
  documentoInicial,
  estaVazio,
  type Bloco,
  type MensagemDocumento,
  type TipoBloco,
} from './formato-documento'
import { useCongelarDocumento, useDocumentoDaAula, useSalvarDocumento } from './documento-api'
import type { ParticipanteId } from './estado-palco'

/**
 * O documento que professor e aluno escrevem JUNTOS durante a aula.
 *
 * É a peça que fecha o modelo do palco (ver `estado-palco.ts`): num Zoom, o documento
 * mora fora da chamada e você espelha pixels dele; aqui ele é conteúdo da
 * sala, e as duas pontas digitam no mesmo texto ao vivo.
 *
 * ── Duas camadas com propósitos diferentes ──────────────────────────────────
 *
 *   AO VIVO   → data channel do LiveKit, como a lousa. Atende os três tipos de
 *               visitante da sala, inclusive o aluno sem conta.
 *   GUARDADO  → `documentos_aula`, gravado SÓ pelo professor, com debounce.
 *
 * Se o professor cair no meio da aula, o texto continua vivo entre as pontas e
 * volta a ser salvo quando ele reconectar. Se ninguém tem aula na janela de
 * ±12h, o documento funciona igual e simplesmente não é salvo — carimbar a
 * aula do mês passado seria pior que não guardar.
 *
 * ── Colisão ─────────────────────────────────────────────────────────────────
 *
 * Por bloco, com trava de 3 segundos que se renova a cada tecla e expira
 * sozinha. Trava que depende de alguém soltar fica presa quando a pessoa cai
 * no meio da frase; esta se cura sem ninguém fazer nada.
 */

/** Quanto tempo um bloco fica reservado para quem digitou por último. */
const TRAVA_MS = 3000
/** Parado por isto = salvou. Sem botão: no meio da aula ninguém lembra de clicar. */
const DEBOUNCE_SALVAR_MS = 2000

type Trava = { quem: ParticipanteId; quando: number }

export function Documento({
  eu,
  contexto,
}: {
  /** Identidade de quem digita — a trava de bloco é por pessoa, não por papel. */
  eu: ParticipanteId
  /**
   * Só o professor tem contexto — é ele quem grava e quem congela. Para o
   * aluno (com conta ou pelo link) vem null, e o componente inteiro funciona
   * do mesmo jeito, sem tocar no banco.
   */
  contexto: { alunoId: string; aulaId: string | null } | null
}) {
  const [blocos, setBlocos] = useState<Bloco[]>(documentoInicial)
  const [travas, setTravas] = useState<Record<string, Trava>>({})
  const blocosRef = useRef(blocos)
  blocosRef.current = blocos

  /**
   * De onde veio o conteúdo que está na tela. Existe por causa de uma corrida
   * real: o professor pede o estado ao outro lado E carrega do banco ao mesmo
   * tempo. Se a resposta do banco chegasse depois da do canal, o texto que o
   * aluno acabou de escrever sumiria, substituído pela versão salva. O canal
   * ganha sempre — ele é o presente, o banco é o passado.
   */
  const origem = useRef<'nenhuma' | 'canal' | 'banco'>('nenhuma')
  const foco = useRef<string | null>(null)

  const aulaId = contexto?.aulaId ?? undefined
  const { data: salvo } = useDocumentoDaAula(aulaId)
  const salvar = useSalvarDocumento(aulaId, contexto?.alunoId ?? '')
  const congelar = useCongelarDocumento(contexto?.alunoId ?? '')

  // ── canal ─────────────────────────────────────────────────────────────────

  const enviarRef = useRef<((m: MensagemDocumento) => void) | null>(null)

  const enviar = useCanal<MensagemDocumento>('documento', (msg) => {
    switch (msg.t) {
      case 'pedir-estado':
        // Só responde quem tem algo — senão duas pontas vazias trocariam
        // documentos vazios e a última resposta apagaria o cursor da outra.
        if (!estaVazio(blocosRef.current)) {
          enviarRef.current?.({ t: 'estado', blocos: blocosRef.current })
        }
        break
      case 'estado':
        origem.current = 'canal'
        setBlocos(msg.blocos)
        break
      case 'bloco':
        origem.current = 'canal'
        setBlocos((atuais) => aplicarBloco(atuais, msg.bloco, msg.depoisDe))
        setTravas((t) => ({ ...t, [msg.bloco.id]: { quem: msg.autor, quando: Date.now() } }))
        break
      case 'remover':
        setBlocos((atuais) => {
          const restantes = atuais.filter((b) => b.id !== msg.id)
          return restantes.length > 0 ? restantes : documentoInicial()
        })
        break
    }
  })
  enviarRef.current = enviar

  const conectada = useSalaConectada()

  useEffect(() => {
    if (conectada) enviar({ t: 'pedir-estado' })
  }, [conectada, enviar])

  // O documento salvo entra só se ninguém ao vivo respondeu antes — e só com a
  // sala de pé, senão o `estado` que avisa o outro lado se perderia no meio do
  // caminho e as duas pontas ficariam com textos diferentes.
  useEffect(() => {
    if (!conectada || !salvo || origem.current !== 'nenhuma') return
    origem.current = 'banco'
    setBlocos(salvo)
    enviar({ t: 'estado', blocos: salvo })
  }, [conectada, salvo, enviar])

  // As travas expiram sozinhas; sem este tique a tela só destravaria no
  // próximo evento, e um bloco abandonado ficaria cinza até alguém digitar.
  useEffect(() => {
    if (Object.keys(travas).length === 0) return
    const id = setInterval(() => {
      const agora = Date.now()
      setTravas((atuais) => {
        const vivas = Object.entries(atuais).filter(([, t]) => agora - t.quando < TRAVA_MS)
        return vivas.length === Object.keys(atuais).length ? atuais : Object.fromEntries(vivas)
      })
    }, 1000)
    return () => clearInterval(id)
  }, [travas])

  // ── salvamento (só o professor) ───────────────────────────────────────────

  const salvarRef = useRef(salvar)
  salvarRef.current = salvar

  useEffect(() => {
    if (!aulaId || origem.current === 'nenhuma' || estaVazio(blocos)) return
    const id = setTimeout(() => salvarRef.current.mutate(blocos), DEBOUNCE_SALVAR_MS)
    return () => clearTimeout(id)
  }, [blocos, aulaId])

  // ── edição ────────────────────────────────────────────────────────────────

  const travadoPorOutro = useCallback(
    (id: string) => {
      const trava = travas[id]
      return Boolean(trava && trava.quem !== eu && Date.now() - trava.quando < TRAVA_MS)
    },
    [travas, eu],
  )

  function mudar(bloco: Bloco, campos: Partial<Bloco>) {
    const atualizado = { ...bloco, ...campos }
    setBlocos((atuais) => atuais.map((b) => (b.id === bloco.id ? atualizado : b)))
    origem.current = origem.current === 'nenhuma' ? 'canal' : origem.current
    enviar({ t: 'bloco', bloco: atualizado, depoisDe: null, autor: eu })
  }

  function inserirDepois(bloco: Bloco) {
    // Lista puxa lista: quem está fazendo uma lista de vocabulário não quer
    // reescolher o tipo a cada item. Título não puxa — depois do título vem texto.
    const novo = blocoNovo(bloco.tipo === 'lista' ? 'lista' : 'texto')
    setBlocos((atuais) => aplicarBloco(atuais, novo, bloco.id))
    foco.current = novo.id
    enviar({ t: 'bloco', bloco: novo, depoisDe: bloco.id, autor: eu })
  }

  function remover(bloco: Bloco) {
    const indice = blocos.findIndex((b) => b.id === bloco.id)
    if (blocos.length === 1) return // o documento sempre tem uma linha para o cursor
    foco.current = blocos[indice - 1]?.id ?? blocos[indice + 1]?.id ?? null
    setBlocos((atuais) => atuais.filter((b) => b.id !== bloco.id))
    enviar({ t: 'remover', id: bloco.id })
  }

  const podeCongelar = Boolean(contexto?.aulaId) && !estaVazio(blocos)

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white text-neutral-900">
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-4 py-2">
        <span className="text-xs font-bold text-neutral-500">Documento da aula</span>

        <span className="ml-auto flex items-center gap-3">
          {contexto && <Estado aulaId={contexto.aulaId} salvando={salvar.isPending} />}

          {contexto && (
            <button
              onClick={() => {
                if (!contexto.aulaId) return
                congelar.mutate({
                  blocos,
                  aulaId: contexto.aulaId,
                  nome: `Aula de ${new Date().toLocaleDateString('pt-BR')}`,
                })
              }}
              disabled={!podeCongelar || congelar.isPending}
              title="Guardar este texto nos materiais do aluno, como está agora"
              className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-40"
            >
              {congelar.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : congelar.isSuccess ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              {congelar.isSuccess ? 'Nos materiais' : 'Guardar'}
            </button>
          )}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {blocos.map((bloco) => (
          <LinhaDoBloco
            key={bloco.id}
            bloco={bloco}
            travado={travadoPorOutro(bloco.id)}
            autoFoco={foco.current === bloco.id}
            aoFocar={() => {
              if (foco.current === bloco.id) foco.current = null
            }}
            aoMudar={(campos) => mudar(bloco, campos)}
            aoEnter={() => inserirDepois(bloco)}
            aoApagarVazio={() => remover(bloco)}
          />
        ))}
      </div>
    </div>
  )
}

/** Diz ao professor onde o texto está indo parar — ou por que não está. */
function Estado({ aulaId, salvando }: { aulaId: string | null; salvando: boolean }) {
  if (!aulaId) {
    return (
      <span
        title="A sala não sabe quando a aula é; fora da janela de 12h não há aula para carimbar. Registre a aula na agenda para guardar o texto."
        className="text-xs font-medium text-amber-600"
      >
        Sem aula agora — não vai ser salvo
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-neutral-400">
      {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      {salvando ? 'salvando' : 'salvo'}
    </span>
  )
}

const ESTILO: Record<TipoBloco, string> = {
  titulo: 'text-lg font-extrabold',
  texto: 'text-sm',
  lista: 'text-sm',
}

const PROXIMO_TIPO: Record<TipoBloco, TipoBloco> = {
  texto: 'titulo',
  titulo: 'lista',
  lista: 'texto',
}

const ICONE_TIPO: Record<TipoBloco, typeof Pilcrow> = {
  texto: Pilcrow,
  titulo: Heading,
  lista: List,
}

function LinhaDoBloco({
  bloco,
  travado,
  autoFoco,
  aoFocar,
  aoMudar,
  aoEnter,
  aoApagarVazio,
}: {
  bloco: Bloco
  travado: boolean
  autoFoco: boolean
  aoFocar: () => void
  aoMudar: (campos: Partial<Bloco>) => void
  aoEnter: () => void
  aoApagarVazio: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Textarea não cresce sozinho. Sem isto, um parágrafo de três linhas viraria
  // uma caixinha com barra de rolagem no meio do documento.
  useEffect(() => {
    const campo = ref.current
    if (!campo) return
    campo.style.height = 'auto'
    campo.style.height = `${campo.scrollHeight}px`
  }, [bloco.texto])

  useEffect(() => {
    if (!autoFoco) return
    ref.current?.focus()
    aoFocar()
  }, [autoFoco, aoFocar])

  const Icone = ICONE_TIPO[bloco.tipo]

  return (
    <div className="group flex items-start gap-2 py-0.5">
      <button
        onClick={() => aoMudar({ tipo: PROXIMO_TIPO[bloco.tipo] })}
        title="Trocar entre parágrafo, título e item de lista"
        className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-neutral-300 opacity-0 transition hover:bg-neutral-100 hover:text-neutral-600 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <Icone className="h-3.5 w-3.5" />
      </button>

      {bloco.tipo === 'lista' && <span className="mt-1.5 shrink-0 text-sm text-neutral-400">•</span>}

      <textarea
        ref={ref}
        rows={1}
        value={bloco.texto}
        readOnly={travado}
        onChange={(e) => aoMudar({ texto: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            // Shift+Enter continua quebrando linha dentro do bloco; Enter puro
            // cria o próximo, que é o que a mão espera num documento.
            e.preventDefault()
            aoEnter()
          }
          if (e.key === 'Backspace' && bloco.texto === '') {
            e.preventDefault()
            aoApagarVazio()
          }
        }}
        placeholder={bloco.tipo === 'titulo' ? 'Título' : 'Escreva aqui…'}
        className={`min-w-0 flex-1 resize-none bg-transparent leading-relaxed outline-none placeholder:text-neutral-300 ${
          ESTILO[bloco.tipo]
        } ${travado ? 'cursor-not-allowed rounded bg-violet-50/70' : ''}`}
      />
    </div>
  )
}
