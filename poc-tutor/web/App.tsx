import { useEffect, useRef, useState } from 'react'
import roteiroJson from '../roteiro/licao-clima.json'
import { iniciar, receber } from '../src/controlador.ts'
import { falaDaAcao, ROTULO_HABILIDADE, textoDaFala, type Fala } from '../src/falas.ts'
import { contextoDoTurno, paraAvaliacao } from '../src/turno.ts'
import { validarRoteiro } from '../src/validacao.ts'
import type { Acao, Avaliacao, Resumo, Roteiro, Sessao } from '../src/tipos.ts'
import { avaliarNoServidor, codigoDeAcesso, entrarComSenha } from './api.ts'
import {
  custoPorServico,
  ehGemini,
  formatarDolares,
  nomeDoServico,
  precoDe,
  precoDoGemini,
  precoTotal,
  SERVICOS_FIXOS,
  somar,
  type Custo,
  type Gasto,
} from './custo.ts'
import { gerar, pararAudio, tocar, type AudioGerado } from './vozGemini.ts'
import { blobParaBase64, Microfone } from './microfone.ts'
import { cancelarFala, carregarVozes, destravarVoz, falar, type Vozes } from './voz.ts'

const roteiro = roteiroJson as Roteiro
const problemasDoRoteiro = validarRoteiro(roteiro)

/**
 * O ciclo de um turno (especificação §7):
 *
 *   tutor fala → microfone abre → aluno fala → fim da fala detectado
 *     → função poc-tutor (transcreve às cegas, depois avalia)
 *     → controlador decide (receber) → tutor fala → …
 *
 * A página não decide nada da aula: ela só leva a avaliação ao controlador e
 * dá voz às ações que ele devolve. Toda a pedagogia está em src/.
 */

type Status = 'inicio' | 'falando' | 'ouvindo' | 'pensando' | 'confirmando' | 'aguardando' | 'fim'

type Linha =
  | { id: number; quem: 'tutor'; texto: string }
  | { id: number; quem: 'aluno'; texto: string; detalhe?: string }
  | { id: number; quem: 'nota'; texto: string }

/** `Omit` que respeita cada membro da união (o comum colapsaria `detalhe`). */
type SemId<T> = T extends unknown ? Omit<T, 'id'> : never

let proximoId = 1

/**
 * A porta da POC: sem a senha certa (conferida pela função), nada da aula
 * aparece — e a senha não está em lugar nenhum do código.
 */
export function App() {
  const [liberado, setLiberado] = useState(() => Boolean(codigoDeAcesso()))
  if (!liberado) return <TelaDeSenha aoEntrar={() => setLiberado(true)} />
  return <Aula />
}

function TelaDeSenha({ aoEntrar }: { aoEntrar: () => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [conferindo, setConferindo] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setConferindo(true)
    try {
      if (await entrarComSenha(senha.trim())) aoEntrar()
      else setErro('Senha incorreta.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui conferir a senha.')
    } finally {
      setConferindo(false)
    }
  }

  return (
    <div className="grid h-dvh place-items-center px-4">
      <form onSubmit={entrar} className="w-full max-w-xs rounded-3xl bg-white p-6">
        <p className="text-lg font-extrabold">Tutor de inglês</p>
        <p className="mt-1 text-sm text-neutral-500">Versão de teste. Digite a senha para entrar.</p>
        <input
          type="password"
          autoFocus
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha"
          className="mt-4 w-full rounded-full bg-neutral-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
        />
        {erro && <p className="mt-2 text-xs font-medium text-rose-700">{erro}</p>}
        <button
          disabled={!senha.trim() || conferindo}
          className="mt-3 w-full rounded-full bg-violet-600 py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
        >
          {conferindo ? 'Conferindo…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

function Aula() {
  const [status, setStatus] = useState<Status>('inicio')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [nivel, setNivel] = useState(0)
  const [texto, setTexto] = useState('')
  const [avisos, setAvisos] = useState<string[]>([])
  const [mostrarDecisoes, setMostrarDecisoes] = useState(true)
  const [painelAberto, setPainelAberto] = useState(false)
  const [registroAberto, setRegistroAberto] = useState(false)
  const [escutaAutomatica, setEscutaAutomatica] = useState(true)
  const [gasto, setGasto] = useState<Gasto>({})
  const [vozNatural, setVozNatural] = useState(true)
  const vozNaturalRef = useRef(vozNatural)
  vozNaturalRef.current = vozNatural

  // Refs: as funções assíncronas abaixo atravessam vários renders, e precisam
  // da sessão e das opções ATUAIS, não das que existiam quando começaram.
  const sessaoRef = useRef<Sessao | null>(null)
  const microfone = useRef<Microfone | null>(null)
  const vozes = useRef<Vozes>({ pt: null, en: null })
  const interrompido = useRef(false)
  const ultimasFalas = useRef<Fala[]>([])
  const aConfirmar = useRef<string | null>(null)
  const escutaRef = useRef(escutaAutomatica)
  escutaRef.current = escutaAutomatica

  const fimDoFeed = useRef<HTMLDivElement>(null)
  // Chaves de propósito: no Chrome recente `scrollIntoView` devolve uma
  // Promise, e um efeito que a devolve quebra o React ("destroy is not a function").
  useEffect(() => {
    void fimDoFeed.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [linhas, status])
  useEffect(() => () => microfone.current?.fechar(), [])

  function adicionar(linha: SemId<Linha>) {
    setLinhas((atuais) => [...atuais, { ...linha, id: proximoId++ } as Linha])
  }

  function atualizarSessao(s: Sessao) {
    sessaoRef.current = s
    setSessao(s)
  }

  // ── Começar ────────────────────────────────────────────────────────────────

  async function comecar() {
    // Tudo que precisa do gesto do toque vem ANTES do primeiro await.
    destravarVoz()
    const mic = microfone.current ?? new Microfone()
    const abrindo = microfone.current ? Promise.resolve() : mic.abrir()

    const novosAvisos: string[] = []
    try {
      await abrindo
      microfone.current = mic
    } catch (e) {
      microfone.current = null
      novosAvisos.push(`Sem microfone (${e instanceof Error ? e.message : 'permissão negada'}). Dá para seguir digitando.`)
    }
    vozes.current = await carregarVozes()
    if (!vozes.current.en) novosAvisos.push('Este aparelho não tem voz em inglês instalada: as frases em inglês saem na voz que houver.')
    if (!vozes.current.pt && !vozes.current.en) novosAvisos.push('Sem voz no navegador: o tutor vai só escrever.')
    setAvisos(novosAvisos)

    const { sessao: s, acoes } = iniciar(roteiro)
    setLinhas([])
    setResumo(null)
    atualizarSessao(s)
    await executar(acoes, s)
  }

  function recomecar() {
    pararVoz()
    microfone.current?.descartar()
    setGasto({})
    void comecar()
  }

  // ── Tutor fala ─────────────────────────────────────────────────────────────

  async function executar(acoes: Acao[], s: Sessao) {
    setStatus('falando')
    interrompido.current = false
    ultimasFalas.current = []

    const falas = acoes.map((acao) => falaDaAcao(acao, s))
    ultimasFalas.current = falas
    // Todas as falas do turno pedidas JUNTAS ao TTS: enquanto a primeira toca,
    // as outras já estão chegando.
    const audios = vozNaturalRef.current ? falas.map((f) => gerar(f).catch(() => null)) : []

    for (const [i, acao] of acoes.entries()) {
      adicionar({ quem: 'tutor', texto: textoDaFala(falas[i]) })
      if (acao.tipo === 'encerrar') setResumo(acao.resumo)
      // Interrompido: o texto continua aparecendo, só não é lido.
      if (!interrompido.current) await dizer(falas[i], audios[i])
    }

    if (s.encerrada) {
      setStatus('fim')
      return
    }
    const ultima = acoes.at(-1)
    if (ultima?.tipo === 'confirmar_audio' && ultima.reconhecido) {
      aConfirmar.current = ultima.reconhecido
      setStatus('confirmando')
      return
    }
    if (microfone.current && (escutaRef.current || interrompido.current)) ouvir()
    else setStatus('aguardando')
  }

  /**
   * Uma fala: o áudio do Gemini, se chegou; senão a voz do aparelho. A aula
   * não para porque o TTS falhou.
   */
  async function dizer(fala: Fala, pedido?: Promise<AudioGerado | null>) {
    const audio = pedido ? await pedido : null
    if (audio) {
      registrarCustos(audio.custos)
      if (interrompido.current) return
      await tocar(audio)
    } else {
      await falar(fala, vozes.current)
    }
  }

  function registrarCustos(custos: Custo[] = []) {
    setGasto((g) => somar(g, custos))
  }

  function pararVoz() {
    pararAudio()
    cancelarFala()
  }

  /** O aluno pode cortar o tutor para falar (especificação §6). */
  function interromper() {
    interrompido.current = true
    pararVoz()
  }

  async function repetir() {
    microfone.current?.descartar()
    setStatus('falando')
    interrompido.current = false
    for (const fala of ultimasFalas.current) await dizer(fala, vozNaturalRef.current ? gerar(fala).catch(() => null) : undefined)
    if (microfone.current && escutaRef.current) ouvir()
    else setStatus('aguardando')
  }

  // ── Aluno fala ─────────────────────────────────────────────────────────────

  function ouvir() {
    const mic = microfone.current
    if (!mic) return setStatus('aguardando')
    setNivel(0)
    setStatus('ouvindo')
    mic.gravar({
      aoNivel: setNivel,
      aoFimDaFala: () => void enviarGravacao(),
      aoSilencioLongo: () => {
        mic.descartar()
        adicionar({ quem: 'nota', texto: 'Silêncio prolongado.' })
        void turno({ tipo: 'silencio' })
      },
    })
  }

  async function enviarGravacao() {
    const gravacao = await microfone.current?.parar()
    if (!gravacao) {
      adicionar({ quem: 'nota', texto: 'Não gravou nada. Tente de novo.' })
      return setStatus('aguardando')
    }
    setStatus('pensando')
    const base64 = await blobParaBase64(gravacao.blob)
    await avaliar({ audio: { base64, mimeType: gravacao.mimeType } })
  }

  async function enviarTexto(valor: string, rotulo?: string) {
    const limpo = valor.trim()
    if (!limpo) return
    microfone.current?.descartar()
    pararVoz()
    setTexto('')
    setStatus('pensando')
    adicionar({ quem: 'aluno', texto: limpo, detalhe: rotulo ?? 'digitado' })
    await avaliar({ texto: limpo })
  }

  async function avaliar(entrada: { audio?: { base64: string; mimeType: string }; texto?: string }) {
    const s = sessaoRef.current
    if (!s) return
    try {
      const resposta = await avaliarNoServidor({ ...entrada, contexto: contextoDoTurno(s) })
      registrarCustos(resposta.custos)
      // Quem avaliou, quanto tempo levou e quanto custou ESTE turno.
      const t = resposta.tempos ?? {}
      const ms = (t.transcricaoMs ?? 0) + (t.jevMs ?? 0) + (t.avaliacaoMs ?? 0)
      const tokens = (resposta.custos ?? []).reduce((n, c) => n + c.entrada + c.saida, 0)
      const quem = resposta.decidiuPor === 'jev' ? 'Jev' : resposta.decidiuPor === 'gemini' ? 'Jev → Gemini' : null
      const detalhe = [
        resposta.transcricao.confianca === 'baixa' ? 'reconhecimento incerto' : null,
        quem,
        ms ? `${(ms / 1000).toFixed(1)}s` : null,
        tokens ? `${tokens.toLocaleString('pt-BR')} tokens · ${custoPorServico(resposta.custos)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
      if (entrada.audio) adicionar({ quem: 'aluno', texto: resposta.transcricao.texto || '(nada audível)', detalhe })
      else adicionar({ quem: 'nota', texto: `Avaliação: ${detalhe}${resposta.motivoGemini ? ` (Gemini porque: ${resposta.motivoGemini})` : ''}` })
      await turno(paraAvaliacao(resposta, s))
    } catch (e) {
      // Falha de rede ou do servidor não é erro de inglês: a sessão não muda.
      adicionar({ quem: 'nota', texto: `Não consegui avaliar: ${e instanceof Error ? e.message : e}. Não conta como erro — tente de novo.` })
      setStatus('aguardando')
    }
  }

  function pedirAjuda() {
    microfone.current?.descartar()
    pararVoz()
    adicionar({ quem: 'aluno', texto: '(pediu ajuda)' })
    void turno({ tipo: 'pedido_ajuda' })
  }

  // ── Controlador decide ─────────────────────────────────────────────────────

  async function turno(avaliacao: Avaliacao) {
    const anterior = sessaoRef.current
    if (!anterior || anterior.encerrada) return
    const { sessao: s, acoes } = receber(anterior, avaliacao)
    atualizarSessao(s)
    const motivos = s.registro
      .slice(anterior.registro.length)
      .filter((e) => e.tipo === 'decisao' && e.motivo)
      .map((e) => e.motivo!)
    if (motivos.length) adicionar({ quem: 'nota', texto: motivos.join(' · ') })
    await executar(acoes, s)
  }

  // ── Tela ───────────────────────────────────────────────────────────────────

  if (problemasDoRoteiro.length > 0) {
    return (
      <pre className="m-4 rounded-2xl bg-rose-50 p-4 text-sm whitespace-pre-wrap text-rose-800">
        Roteiro inválido:{'\n'}- {problemasDoRoteiro.join('\n- ')}
      </pre>
    )
  }

  const emAula = status !== 'inicio'

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">Tutor de inglês</p>
          <p className="truncate text-xs text-neutral-500">{roteiro.titulo} · POC</p>
        </div>
        <BotaoTopo ativo={painelAberto} aoClicar={() => setPainelAberto((v) => !v)}>Apoio</BotaoTopo>
        {emAula && (
          <BotaoTopo ativo={registroAberto} aoClicar={() => setRegistroAberto((v) => !v)}>Registro</BotaoTopo>
        )}
        {emAula && <BotaoTopo aoClicar={recomecar}>Reiniciar</BotaoTopo>}
      </header>

      {painelAberto && <PainelDeApoio />}
      {registroAberto && sessao && <PainelDeRegistro sessao={sessao} />}

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!emAula && <Boasvindas />}
        {avisos.map((a) => (
          <p key={a} className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{a}</p>
        ))}
        <div className="space-y-2.5">
          {linhas.map((l) =>
            l.quem === 'nota' ? (
              mostrarDecisoes && (
                <p key={l.id} className="px-1 text-[11px] leading-snug text-neutral-400">{l.texto}</p>
              )
            ) : (
              <div key={l.id} className={`flex ${l.quem === 'aluno' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${
                    l.quem === 'aluno' ? 'rounded-br-md bg-violet-600 text-white' : 'rounded-bl-md bg-white text-neutral-900'
                  }`}
                >
                  {l.texto}
                  {l.quem === 'aluno' && l.detalhe && <span className="mt-0.5 block text-[11px] text-violet-200">{l.detalhe}</span>}
                </div>
              </div>
            ),
          )}
        </div>
        {resumo && <CartaoResumo resumo={resumo} />}
        <div ref={fimDoFeed} className="h-2" />
      </main>

      <footer className="border-t border-neutral-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Controles
          status={status}
          nivel={nivel}
          temMicrofone={Boolean(microfone.current)}
          aoComecar={() => void comecar()}
          aoInterromper={interromper}
          aoOuvir={ouvir}
          aoTerminar={() => void enviarGravacao()}
          aoAjuda={pedirAjuda}
          aoRepetir={() => void repetir()}
          aoConfirmar={() => aConfirmar.current && void enviarTexto(aConfirmar.current, 'confirmado')}
          aoRecomecar={recomecar}
        />

        {emAula && status !== 'fim' && (
          <form
            className="mt-2.5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void enviarTexto(texto)
            }}
          >
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ou digite sua resposta…"
              disabled={status === 'pensando'}
              className="min-w-0 flex-1 rounded-full bg-neutral-100 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
            <button
              disabled={!texto.trim() || status === 'pensando'}
              className="rounded-full bg-neutral-900 px-4 text-sm font-bold text-white disabled:opacity-30"
            >
              Enviar
            </button>
          </form>
        )}

        {emAula && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={escutaAutomatica} onChange={(e) => setEscutaAutomatica(e.target.checked)} />
              Ouvir sozinho depois do tutor
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={mostrarDecisoes} onChange={(e) => setMostrarDecisoes(e.target.checked)} />
              Mostrar decisões do tutor
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={vozNatural} onChange={(e) => setVozNatural(e.target.checked)} />
              Voz natural (Gemini Flash-Lite TTS)
            </label>
            <TabelaDeCustos gasto={gasto} />
            {microfone.current?.medidorFunciona === false && <span>Medidor do microfone mudo: toque em "Terminei" ao acabar.</span>}
          </div>
        )}
      </footer>
    </div>
  )
}

/**
 * O custo da sessão por serviço — Gemini (texto e voz) somado à parte, Jev,
 * e o total. Os serviços principais aparecem mesmo zerados: ver o Gemini Flash
 * em US$ 0 numa sessão digitada é a informação (o Jev decidiu tudo).
 */
function TabelaDeCustos({ gasto }: { gasto: Gasto }) {
  const servicos = [...new Set([...SERVICOS_FIXOS, ...Object.keys(gasto)])]
  const linha = (servico: string) => {
    const g = gasto[servico] ?? { entrada: 0, saida: 0, chamadas: 0 }
    return (
      <tr key={servico}>
        <td className="py-0.5 pr-3">{nomeDoServico(servico)}</td>
        <td className="pr-3 text-right">{g.chamadas}×</td>
        <td className="pr-3 text-right">{g.entrada.toLocaleString('pt-BR')}</td>
        <td className="pr-3 text-right">{g.saida.toLocaleString('pt-BR')}</td>
        <td className="text-right">{formatarDolares(precoDe(servico, g.entrada, g.saida))}</td>
      </tr>
    )
  }
  return (
    <table className="mt-1 basis-full text-[11px] tabular-nums">
      <thead className="text-neutral-400">
        <tr>
          <th className="pr-3 text-left font-semibold">Custo da sessão</th>
          <th className="pr-3 text-right font-semibold">chamadas</th>
          <th className="pr-3 text-right font-semibold">entrada</th>
          <th className="pr-3 text-right font-semibold">saída</th>
          <th className="text-right font-semibold">US$</th>
        </tr>
      </thead>
      <tbody>
        {servicos.filter(ehGemini).map(linha)}
        <tr className="font-bold text-neutral-700">
          <td className="pr-3">Total Gemini</td>
          <td colSpan={3} />
          <td className="text-right">{formatarDolares(precoDoGemini(gasto))}</td>
        </tr>
        {servicos.filter((s) => !ehGemini(s)).map(linha)}
        <tr className="border-t border-neutral-200 font-extrabold text-neutral-900">
          <td className="pt-0.5 pr-3">Total da sessão</td>
          <td colSpan={3} />
          <td className="pt-0.5 text-right">{formatarDolares(precoTotal(gasto))}</td>
        </tr>
      </tbody>
    </table>
  )
}

function Controles(p: {
  status: Status
  nivel: number
  temMicrofone: boolean
  aoComecar: () => void
  aoInterromper: () => void
  aoOuvir: () => void
  aoTerminar: () => void
  aoAjuda: () => void
  aoRepetir: () => void
  aoConfirmar: () => void
  aoRecomecar: () => void
}) {
  const principal = 'flex h-14 flex-1 items-center justify-center gap-2 rounded-full text-base font-extrabold transition disabled:opacity-40'
  const secundario = 'h-14 rounded-full bg-neutral-100 px-4 text-sm font-bold text-neutral-700'

  switch (p.status) {
    case 'inicio':
      return <button onClick={p.aoComecar} className={`${principal} w-full bg-violet-600 text-white`}>Começar aula</button>
    case 'falando':
      return (
        <div className="flex gap-2">
          <button onClick={p.aoInterromper} className={`${principal} bg-neutral-900 text-white`}>
            <Onda /> Tutor falando · tocar para falar
          </button>
        </div>
      )
    case 'ouvindo':
      return (
        <div className="flex gap-2">
          <button onClick={p.aoRepetir} className={secundario}>Repetir</button>
          <button onClick={p.aoTerminar} className={`${principal} relative overflow-hidden bg-rose-600 text-white`}>
            {/* O anel cresce com o volume: é o sinal de que o microfone está ouvindo. */}
            <span
              className="absolute inset-0 bg-rose-400 transition-transform duration-75"
              style={{ transform: `scaleX(${Math.min(1, p.nivel * 12)})`, transformOrigin: 'left' }}
            />
            <span className="relative">Ouvindo… Terminei</span>
          </button>
          <button onClick={p.aoAjuda} className={secundario}>Ajuda</button>
        </div>
      )
    case 'pensando':
      return <button disabled className={`${principal} w-full bg-neutral-200 text-neutral-600`}>Pensando…</button>
    case 'confirmando':
      return (
        <div className="flex gap-2">
          <button onClick={p.aoConfirmar} className={`${principal} bg-emerald-600 text-white`}>Foi isso</button>
          <button onClick={p.aoOuvir} disabled={!p.temMicrofone} className={`${principal} bg-neutral-900 text-white`}>Falar de novo</button>
        </div>
      )
    case 'aguardando':
      return (
        <div className="flex gap-2">
          <button onClick={p.aoRepetir} className={secundario}>Repetir</button>
          <button onClick={p.aoOuvir} disabled={!p.temMicrofone} className={`${principal} bg-violet-600 text-white`}>Falar</button>
          <button onClick={p.aoAjuda} className={secundario}>Ajuda</button>
        </div>
      )
    case 'fim':
      return <button onClick={p.aoRecomecar} className={`${principal} w-full bg-violet-600 text-white`}>Fazer de novo</button>
  }
}

function Onda() {
  return (
    <span className="flex h-4 items-end gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1 animate-pulse rounded-full bg-white" style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  )
}

function BotaoTopo({ children, ativo = false, aoClicar }: { children: React.ReactNode; ativo?: boolean; aoClicar: () => void }) {
  return (
    <button
      onClick={aoClicar}
      className={`rounded-full px-3 py-1.5 text-xs font-bold ${ativo ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}
    >
      {children}
    </button>
  )
}

function Boasvindas() {
  return (
    <div className="rounded-3xl bg-white p-5">
      <p className="text-lg font-extrabold">{roteiro.titulo}</p>
      <p className="mt-1 text-sm text-neutral-600">
        Uma aula curta de prática oral: o tutor pede uma frase, você fala, ele corrige e vai mudando a frase aos poucos.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-neutral-600">
        <li>• Fale a frase inteira, sem pressa. Pausas curtas não encerram sua vez.</li>
        <li>• Travou? Toque em <strong>Ajuda</strong>, ou pergunte em português.</li>
        <li>• Pode interromper o tutor tocando no botão enquanto ele fala.</li>
      </ul>
      <p className="mt-3 text-xs text-neutral-400">
        Use fone de ouvido se puder. O navegador vai pedir permissão para o microfone.
      </p>
    </div>
  )
}

/** R04: o painel do aluno — estruturas e vocabulário, nunca as respostas das cadeias. */
function PainelDeApoio() {
  const { painel } = roteiro
  return (
    <section className="max-h-[40dvh] overflow-y-auto border-b border-neutral-200 bg-white px-4 py-3 text-sm">
      <Titulo>Estruturas</Titulo>
      <ul className="mt-1 space-y-0.5">{painel.estruturas.map((e) => <li key={e} className="font-medium">{e}</li>)}</ul>
      <Titulo>Vocabulário</Titulo>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {painel.vocabulario.map((v) => (
          <span key={v.en} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs">
            <strong>{v.en}</strong> <span className="text-neutral-500">{v.pt}</span>
          </span>
        ))}
      </div>
      <Titulo>Exemplos</Titulo>
      <ul className="mt-1 space-y-0.5 text-neutral-700">{painel.exemplos.map((e) => <li key={e}>{e}</li>)}</ul>
      <Titulo>Atenção</Titulo>
      <ul className="mt-1 space-y-0.5 text-neutral-700">{painel.alertas.map((e) => <li key={e}>{e}</li>)}</ul>
    </section>
  )
}

/** Critério 9: por que o tutor avançou, corrigiu ou ajudou — e o arquivo para revisar depois. */
function PainelDeRegistro({ sessao }: { sessao: Sessao }) {
  function baixar() {
    const dados = {
      roteiro: roteiro.id,
      geradoEm: new Date().toISOString(),
      calibracao: sessao.calibracao,
      resultados: sessao.resultados,
      dificuldades: sessao.dificuldades,
      registro: sessao.registro,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `sessao-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const atual = sessao.atual
  return (
    <section className="max-h-[45dvh] overflow-y-auto border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-xs">
      <div className="flex items-center justify-between">
        <Titulo>Estado</Titulo>
        <button onClick={baixar} className="rounded-full bg-neutral-900 px-3 py-1 font-bold text-white">Baixar registro</button>
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-neutral-500">Item</dt><dd>{atual?.item.id ?? '—'} ({atual?.contexto ?? '—'})</dd>
        <dt className="text-neutral-500">Alvo</dt><dd>{atual?.item.alvo ?? atual?.item.criterio ?? '—'}</dd>
        <dt className="text-neutral-500">Última aceita</dt><dd>{sessao.ultimaAceita ?? '—'}</dd>
        <dt className="text-neutral-500">Ajuda / tentativas</dt><dd>{atual ? `nível ${atual.nivelAjuda} · ${atual.tentativas}` : '—'}</dd>
        <dt className="text-neutral-500">Para revisar</dt>
        <dd>{[...new Set(sessao.dificuldades.filter((d) => d.recuperada !== true).map((d) => d.habilidade))].join(', ') || '—'}</dd>
      </dl>
      <Titulo>Decisões</Titulo>
      <ol className="mt-1 space-y-0.5">
        {sessao.registro
          .filter((e) => e.tipo === 'decisao')
          .map((e) => (
            <li key={e.seq}>
              <span className="text-neutral-400">#{e.seq}</span> {e.motivo}
            </li>
          ))}
      </ol>
    </section>
  )
}

function CartaoResumo({ resumo }: { resumo: Resumo }) {
  return (
    <div className="mt-4 rounded-3xl bg-white p-5 text-sm">
      <p className="font-extrabold">Resumo da sessão</p>
      <Lista titulo="Sozinho" itens={resumo.autonomos} />
      <Lista titulo="Com ajuda" itens={resumo.comAjuda} />
      <Lista titulo="Pendentes" itens={resumo.pendentes} />
      <Lista titulo="Acertou sozinho na segunda vez" itens={resumo.recuperadas.map(rotular)} />
      <Lista titulo="Para revisar" itens={resumo.paraRevisar.map(rotular)} />
    </div>
  )
}

const rotular = (h: string) => ROTULO_HABILIDADE[h] ?? h

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null
  return (
    <div className="mt-2">
      <p className="text-xs font-bold text-neutral-500">{titulo} · {itens.length}</p>
      <ul className="mt-0.5 text-neutral-700">{itens.map((i, n) => <li key={`${i}-${n}`}>{i}</li>)}</ul>
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11px] font-extrabold tracking-wider text-neutral-400 uppercase first:mt-0">{children}</p>
}
