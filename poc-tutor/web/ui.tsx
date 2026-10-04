import { useRef } from 'react'
import type { Item, Roteiro, Sessao } from '../src/tipos.ts'

/**
 * As peças visuais da aula — a tela focada na FRASE, não num chat
 * (docs/melhorias-sugeridas.md, item 8; protótipo em docs/prototipo-tela.html).
 */

// ── Ícones (traço no estilo Lucide, sem dependência) ─────────────────────────

const CAMINHOS = {
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/>',
  devagar: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  ajuda: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  pular: '<path d="M5 4l10 8-10 8V4z"/><path d="M19 5v14"/>',
  teclado: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  livro: '<path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z"/><path d="M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/>',
  professor: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  revisao: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  carregando: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/>',
  pare: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
} as const

export type NomeIcone = keyof typeof CAMINHOS

export function Icone({ nome, className = 'h-4 w-4', grosso = false }: { nome: NomeIcone; className?: string; grosso?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={grosso ? 2.4 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: CAMINHOS[nome] }}
    />
  )
}

// ── Trilha de progresso ──────────────────────────────────────────────────────

const NOME_DO_BLOCO: Record<string, string> = {
  clima: 'Clima',
  sujeito: 'Sujeito',
  pergunta_pessoa: 'Perguntas',
  pergunta_clima: 'O tempo',
  jantar: 'Jantar',
}

/** As etapas da aula: os blocos do roteiro, a conversa e o fim. */
export function Trilha({ roteiro, sessao }: { roteiro: Roteiro; sessao: Sessao | null }) {
  const etapas = [...roteiro.blocos.map((b) => NOME_DO_BLOCO[b.id] ?? b.id), 'Conversa', 'Fim']
  const t = sessao?.atual
  let atual = -1
  let fracao = 0
  if (sessao?.encerrada) {
    atual = etapas.length - 1
    fracao = 1
  } else if (t?.origem === 'conversa') {
    atual = roteiro.blocos.length
    fracao = (roteiro.conversa.findIndex((i) => i.id === t.item.id) + 1) / roteiro.conversa.length
  } else if (t?.blocoId) {
    atual = roteiro.blocos.findIndex((b) => b.id === t.blocoId)
    const bloco = roteiro.blocos[atual]
    fracao = Math.max(0.08, (bloco.itens.findIndex((i) => i.id === t.item.id) + 1) / bloco.itens.length)
  }
  return (
    <div className="flex min-w-0 flex-1 gap-1">
      {etapas.map((nome, i) => (
        <div key={nome} className="min-w-0 flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--linha)]">
            <div
              className="h-full rounded-full bg-violet-600 transition-[width] duration-500"
              style={{ width: i < atual ? '100%' : i === atual ? `${Math.round(fracao * 100)}%` : '0%' }}
            />
          </div>
          <span className={`mt-1 block truncate text-[10px] ${i === atual ? 'font-bold text-neutral-900' : 'text-neutral-400'}`}>
            {nome}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Habilidades: dominadas e em revisão ──────────────────────────────────────

const NOME_DA_HABILIDADE: Record<string, string> = {
  sujeito_it: 'sujeito it',
  was: 'was',
  concordancia_were: 'were',
  concordancia_was: "wasn't",
  negativa: 'negativas',
  pergunta_inversao: 'perguntas',
  what_like: 'what … like',
  having_refeicao: 'have dinner',
  progressivo: '-ing',
  plural: 'plural',
  preservar_cadeia: 'manter a frase',
  marcador_tempo: 'tempo',
  adjetivo_clima: 'clima',
  lugar: 'lugar',
  substantivo: 'substantivo',
  presente_passado: 'is / was',
}

export function Habilidades({ sessao }: { sessao: Sessao | null }) {
  if (!sessao) return null
  const porHabilidade = new Map<string, boolean>()
  for (const d of sessao.dificuldades) {
    porHabilidade.set(d.habilidade, (porHabilidade.get(d.habilidade) ?? true) && d.recuperada === true)
  }
  if (porHabilidade.size === 0) return <div className="h-6" />
  return (
    <div className="flex min-h-6 flex-wrap gap-1.5">
      {[...porHabilidade].map(([h, dominada]) => (
        <span
          key={h}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
            dominada ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
          }`}
          title={dominada ? 'Acertou sozinho depois de ter precisado de ajuda' : 'Precisou de ajuda; vai voltar'}
        >
          <Icone nome={dominada ? 'check' : 'revisao'} className="h-3 w-3" grosso />
          {NOME_DA_HABILIDADE[h] ?? h.replaceAll('_', ' ')}
        </span>
      ))}
    </div>
  )
}

// ── Palco: o pedido e a frase em construção ──────────────────────────────────

export type Tentativa = { texto: string; tipo: 'erro' | 'parte' | 'ok' | 'incerto' | 'neutra' }

export type PerguntaDoTutor = {
  texto: string
  /** 1–2: pergunta socrática; 3: a frase-modelo. */
  nivel: number
  estado: 'aberta' | 'parte' | 'resolvida'
  parte?: string
}

function rotuloDoPedido(item: Item, contexto: string): string {
  if (item.tipo === 'conversa') return 'Conversa'
  if (contexto === 'apoio') return 'Passo a passo'
  if (contexto === 'retorno') return 'De volta à frase'
  if (contexto === 'recuperacao') return 'Revisão'
  if (item.tipo === 'substituicao') return 'Substituição'
  if (item.tipo === 'repeticao') return 'Repita'
  return contexto === 'calibracao' ? 'Primeira frase' : 'Nova frase'
}

const palavras = (frase: string | null) => (frase ? frase.split(/\s+/).filter(Boolean) : [])
const normalizar = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '')

export function Palco({
  sessao,
  tentativa,
  pergunta,
}: {
  sessao: Sessao
  tentativa: Tentativa | null
  pergunta: PerguntaDoTutor | null
}) {
  const t = sessao.atual
  // A frase que está sendo transformada: a última aceita (na substituição), ou
  // o modelo a repetir. Numa frase nova, ainda não há nada — só o pedido.
  const frase = t?.item.tipo === 'repeticao' ? t.item.modelo ?? null : t?.item.tipo === 'substituicao' ? sessao.ultimaAceita : null

  // Palavras que entraram desde a frase anterior: são elas que animam e ficam
  // roxas. Calculadas só quando a FRASE muda — não a cada redesenho da tela.
  const atuais = palavras(frase)
  const memo = useRef<{ frase: string | null; novas: Set<string> }>({ frase: null, novas: new Set() })
  if (memo.current.frase !== frase) {
    const antigas = palavras(memo.current.frase).map(normalizar)
    memo.current = {
      frase,
      novas: antigas.length ? new Set(atuais.filter((w) => !antigas.includes(normalizar(w)))) : new Set(),
    }
  }
  const novas = memo.current.novas

  if (!t) return null
  const alvo = new Set(palavras(t.item.alvo ?? null).map(normalizar))

  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      <span className="text-[11px] font-extrabold tracking-[0.08em] text-neutral-400 uppercase">
        {rotuloDoPedido(t.item, t.contexto)}
      </span>

      {t.item.tipo === 'conversa' ? (
        <p key={t.item.id} className="animar-surge max-w-[16em] text-2xl leading-snug font-extrabold sm:text-3xl">
          {t.item.pergunta}
        </p>
      ) : (
        <>
          {t.item.tipo === 'construcao' && (
            <p key={t.item.id} className="animar-surge max-w-[22em] text-[17px] text-neutral-500">
              Diga em inglês: <strong className="text-neutral-900">{t.item.solicitacao}</strong>
            </p>
          )}
          {t.item.tipo === 'substituicao' && (
            <span key={t.item.id} className="animar-surge rounded-2xl bg-violet-100 px-5 py-2 text-2xl font-extrabold text-violet-700">
              {t.item.pista}
            </span>
          )}
          <p className="min-h-[1.3em] text-[clamp(26px,7.5vw,40px)] leading-tight font-extrabold tracking-tight">
            {atuais.length > 0 ? (
              atuais.map((w, i) => (
                <span key={`${w}-${i}`} className={`mx-[0.12em] inline-block ${novas.has(w) ? 'animar-entra text-violet-600' : ''}`}>
                  {w}
                </span>
              ))
            ) : (
              <span className="text-[var(--linha)]">· · ·</span>
            )}
          </p>
        </>
      )}

      {tentativa && (
        <p className="min-h-[1.4em] text-[17px] text-neutral-500">
          {tentativa.tipo === 'erro'
            ? palavras(tentativa.texto).map((w, i) => (
                <span
                  key={i}
                  className={`mx-[0.12em] ${alvo.size && !alvo.has(normalizar(w)) ? 'rounded bg-rose-100 px-1 text-rose-600 underline decoration-wavy underline-offset-4' : ''}`}
                >
                  {w}
                </span>
              ))
            : tentativa.tipo === 'incerto'
              ? <>Entendi “{tentativa.texto}”?</>
              : <>“{tentativa.texto}”</>}
        </p>
      )}

      {pergunta && <CartaoPergunta pergunta={pergunta} />}
    </div>
  )
}

/** A pista socrática, com o degrau em que a ajuda está. */
function CartaoPergunta({ pergunta }: { pergunta: PerguntaDoTutor }) {
  const ok = pergunta.estado !== 'aberta'
  return (
    <div className="animar-sobe w-full rounded-[20px] bg-[var(--cartao)] px-4 py-3.5 text-left shadow-[0_6px_24px_rgba(0,0,0,.06)]">
      <div className={`flex items-center gap-2 text-[11px] font-extrabold tracking-[0.06em] uppercase ${ok ? 'text-emerald-600' : 'text-amber-700'}`}>
        {pergunta.nivel >= 3 ? 'A frase é' : 'Pergunta do tutor'}
        <span className="ml-auto flex gap-1">
          {[1, 2, 3].map((d) => (
            <i key={d} className={`h-[5px] w-[18px] rounded-full ${d <= pergunta.nivel ? (ok ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-[var(--linha)]'}`} />
          ))}
        </span>
      </div>
      <p className="mt-2 text-[17px] font-semibold">
        {pergunta.estado === 'parte' ? (
          <>
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Icone nome="check" className="h-4 w-4" grosso />
              {pergunta.parte}
            </span>{' '}
            — agora a frase inteira.
          </>
        ) : pergunta.estado === 'resolvida' ? (
          'Isso, agora sim!'
        ) : (
          pergunta.texto
        )}
      </p>
    </div>
  )
}

// ── Microfone ────────────────────────────────────────────────────────────────

export type EstadoMic = 'falando' | 'ouvindo' | 'pensando' | 'aguardando' | 'confirmando' | 'desligado'

export function BotaoMic({ estado, nivel, aoTocar }: { estado: EstadoMic; nivel: number; aoTocar: () => void }) {
  const cor =
    estado === 'ouvindo' ? 'bg-rose-600 shadow-rose-600/35' : estado === 'pensando' || estado === 'desligado' ? 'bg-neutral-400 shadow-none' : 'bg-violet-600 shadow-violet-600/35'
  const rotulo = {
    falando: 'Tocar para falar',
    ouvindo: 'Terminei',
    pensando: 'Pensando',
    aguardando: 'Falar',
    confirmando: 'Falar de novo',
    desligado: 'Sem microfone',
  }[estado]
  return (
    <button
      onClick={aoTocar}
      disabled={estado === 'pensando' || estado === 'desligado'}
      aria-label={rotulo}
      title={rotulo}
      className={`relative grid h-[84px] w-[84px] place-items-center rounded-full text-white shadow-[0_10px_30px] transition active:scale-95 ${cor}`}
    >
      {estado === 'ouvindo' && (
        // O anel cresce com o volume: é o sinal de que o microfone está ouvindo.
        <span
          className="absolute -inset-2 rounded-full border-[3px] border-rose-500/50 transition-transform duration-75"
          style={{ transform: `scale(${1 + Math.min(0.35, nivel * 4)})` }}
        />
      )}
      <Icone
        nome={estado === 'pensando' ? 'carregando' : estado === 'ouvindo' ? 'pare' : 'mic'}
        className={`h-8 w-8 ${estado === 'pensando' ? 'animate-spin' : ''}`}
      />
    </button>
  )
}

export function Onda({ ativa }: { ativa: boolean }) {
  return (
    <span className={`inline-flex h-3.5 items-end gap-0.5 transition-opacity ${ativa ? 'opacity-100' : 'opacity-0'}`}>
      {[0, 1, 2].map((i) => (
        <i key={i} className="animar-onda w-[3px] rounded-sm bg-violet-600" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  )
}

export function Atalho({ icone, rotulo, aoClicar, desligado = false }: { icone: NomeIcone; rotulo: string; aoClicar: () => void; desligado?: boolean }) {
  return (
    <button
      onClick={aoClicar}
      disabled={desligado}
      className="inline-flex items-center justify-center gap-1.5 rounded-[14px] bg-[var(--cartao)] px-2 py-2.5 text-xs font-bold disabled:opacity-35"
    >
      <Icone nome={icone} className="h-[15px] w-[15px]" />
      {rotulo}
    </button>
  )
}
