import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SendHorizontal, X } from 'lucide-react'
import { useCanal } from './canal'

/**
 * O chat da chamada — TEMPORÁRIO de propósito.
 *
 * Vive só na memória de cada navegador, pelo data channel do LiveKit, como o
 * palco e a lousa (ver `canal.ts`). Nada vai ao banco: quando a chamada
 * termina, a conversa acaba junto. É o bilhete passado durante a aula — o
 * link que o professor cola, a palavra que o aluno não entendeu de ouvido —,
 * não um histórico. O que precisa sobreviver à aula tem lugar próprio: o
 * documento da aula.
 *
 * Consequência que vale saber: quem entra no meio da aula não vê o que foi
 * escrito antes de chegar, e quem recarrega a página perde o que tinha.
 */

/** O suficiente para uma frase ou um link; não é lugar de colar texto longo. */
const LIMITE_DE_CARACTERES = 1000
/** A conversa de uma aula inteira cabe folgada; acima disso, some o mais velho. */
const MAXIMO_NA_MEMORIA = 300

type Pacote = { t: 'msg'; id: string; texto: string }

export type MensagemDoChat = {
  id: string
  /** Identidade do LiveKit — `prof-<id>` ou `aluno-<id>`. */
  de: string
  nome: string
  texto: string
  /** Hora de CHEGADA, no relógio de quem lê — o do remetente pode estar torto. */
  em: number
  minha: boolean
}

/**
 * O estado do chat. Fica em quem monta a sala, e não no painel do chat, porque
 * a conversa continua chegando com o painel fechado — é daí que sai o contador
 * de não lidas no botão.
 */
export function useChat({ eu, meuNome, aberto }: { eu: string; meuNome: string; aberto: boolean }) {
  const [mensagens, setMensagens] = useState<MensagemDoChat[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const abertoRef = useRef(aberto)
  abertoRef.current = aberto

  const acrescentar = useCallback((m: MensagemDoChat) => {
    setMensagens((atuais) => [...atuais, m].slice(-MAXIMO_NA_MEMORIA))
  }, [])

  const enviarNoCanal = useCanal<Pacote>('chat', (pacote, remetente) => {
    if (pacote?.t !== 'msg' || typeof pacote.texto !== 'string' || !remetente) return
    const texto = pacote.texto.slice(0, LIMITE_DE_CARACTERES).trim()
    if (!texto) return
    acrescentar({
      id: String(pacote.id),
      de: remetente.identity,
      // O nome do TOKEN, e não um campo do pacote — ver `useCanal`.
      nome: remetente.name || remetente.identity,
      texto,
      em: Date.now(),
      minha: false,
    })
    if (!abertoRef.current) setNaoLidas((n) => n + 1)
  })

  useEffect(() => {
    if (aberto) setNaoLidas(0)
  }, [aberto])

  const enviar = useCallback(
    (bruto: string) => {
      const texto = bruto.slice(0, LIMITE_DE_CARACTERES).trim()
      if (!texto) return
      const id = crypto.randomUUID()
      // O LiveKit não devolve a mensagem para quem mandou: ela entra na lista
      // local aqui, na hora, e não depende da rede para aparecer.
      acrescentar({ id, de: eu, nome: meuNome, texto, em: Date.now(), minha: true })
      enviarNoCanal({ t: 'msg', id, texto })
    },
    [acrescentar, enviarNoCanal, eu, meuNome],
  )

  return { mensagens, naoLidas, enviar }
}

export function ChatDaSala({
  mensagens,
  aoEnviar,
  aoFechar,
}: {
  mensagens: MensagemDoChat[]
  aoEnviar: (texto: string) => void
  aoFechar: () => void
}) {
  const [rascunho, setRascunho] = useState('')
  const listaRef = useRef<HTMLDivElement>(null)
  const campoRef = useRef<HTMLTextAreaElement>(null)
  /**
   * Só rola sozinho se a pessoa já estava no fim. Quem subiu para reler o link
   * de dez minutos atrás não pode ser arrancado de lá a cada mensagem nova.
   */
  const noFimRef = useRef(true)

  useLayoutEffect(() => {
    const lista = listaRef.current
    if (lista && noFimRef.current) lista.scrollTop = lista.scrollHeight
  }, [mensagens])

  useEffect(() => {
    campoRef.current?.focus()
  }, [])

  function enviar() {
    if (!rascunho.trim()) return
    noFimRef.current = true
    aoEnviar(rascunho)
    setRascunho('')
  }

  return (
    <section
      aria-label="Chat da aula"
      className="flex h-full flex-col overflow-hidden rounded-2xl bg-neutral-900 text-neutral-100"
    >
      <header className="flex items-start justify-between gap-2 border-b border-white/5 px-4 py-3">
        <div>
          <h2 className="text-sm font-extrabold">Chat da aula</h2>
          <p className="mt-0.5 text-xs text-neutral-500">As mensagens somem quando a chamada termina.</p>
        </div>
        <button
          onClick={aoFechar}
          aria-label="Fechar o chat"
          title="Fechar o chat"
          className="-mr-1 rounded-full p-1.5 text-neutral-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div
        ref={listaRef}
        onScroll={(e) => {
          const l = e.currentTarget
          noFimRef.current = l.scrollHeight - l.scrollTop - l.clientHeight < 40
        }}
        // `aria-live` para leitor de tela anunciar quem escreveu, como faria
        // ao ver o balão surgir.
        aria-live="polite"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3"
      >
        {mensagens.length === 0 ? (
          <p className="px-2 pt-6 text-center text-xs text-neutral-500">
            Ninguém escreveu ainda. Bom para mandar um link ou soletrar uma palavra.
          </p>
        ) : (
          mensagens.map((m, i) => {
            // Mensagens seguidas da mesma pessoa se agrupam: o nome aparece só
            // na primeira, como em qualquer chat — repetir o nome em cada
            // linha dobra a altura da conversa sem dizer nada de novo.
            const anterior = mensagens[i - 1]
            const continuacao = anterior?.de === m.de && m.em - anterior.em < 2 * 60_000
            return (
              <div key={m.id} className={`flex flex-col ${m.minha ? 'items-end' : 'items-start'} ${continuacao ? '' : 'pt-2'}`}>
                {!continuacao && (
                  <span className="mb-0.5 flex items-baseline gap-1.5 px-1 text-[11px]">
                    <span className={`font-bold ${m.de.startsWith('prof-') ? 'text-violet-300' : 'text-neutral-300'}`}>
                      {m.minha ? 'Você' : m.nome}
                    </span>
                    <span className="text-neutral-600">{hora(m.em)}</span>
                  </span>
                )}
                <p
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${
                    m.minha ? 'bg-violet-300 text-neutral-900' : 'bg-neutral-800 text-neutral-100'
                  }`}
                >
                  <ComLinks texto={m.texto} minha={m.minha} />
                </p>
              </div>
            )
          })
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          enviar()
        }}
        className="flex items-end gap-2 border-t border-white/5 p-2"
      >
        <textarea
          ref={campoRef}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={(e) => {
            // Enter manda, Shift+Enter quebra a linha — o combinado de todo
            // chat. `isComposing` para não mandar no meio de um acento em
            // teclado que compõe caractere (IME).
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              enviar()
            }
          }}
          rows={1}
          maxLength={LIMITE_DE_CARACTERES}
          placeholder="Escreva uma mensagem"
          aria-label="Mensagem"
          className="max-h-28 min-h-10 flex-1 resize-none rounded-xl bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none [field-sizing:content] placeholder:text-neutral-500 focus:ring-2 focus:ring-violet-400"
        />
        <button
          type="submit"
          disabled={!rascunho.trim()}
          aria-label="Enviar"
          title="Enviar"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-300 text-neutral-900 transition disabled:opacity-30"
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </form>
    </section>
  )
}

function hora(em: number): string {
  return new Date(em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const URL_NO_TEXTO = /(https?:\/\/[^\s<>"]+)/g

/**
 * Link colado vira link clicável — é metade do uso de um chat de aula. Montado
 * como elementos do React, e não como HTML: o texto vem de outro navegador e
 * nunca passa por `innerHTML`.
 */
function ComLinks({ texto, minha }: { texto: string; minha: boolean }) {
  const partes = texto.split(URL_NO_TEXTO)
  return (
    <>
      {partes.map((parte, i) =>
        // `split` com grupo de captura intercala: as posições ímpares são os links.
        i % 2 === 1 ? (
          <a
            key={i}
            href={parte}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline underline-offset-2 ${minha ? 'decoration-neutral-900/40' : 'text-violet-300'}`}
          >
            {parte}
          </a>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        ),
      )}
    </>
  )
}
