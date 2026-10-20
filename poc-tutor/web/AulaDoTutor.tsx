import { useEffect, useMemo, useRef, useState } from 'react'
import { iniciar, receber } from '../src/controlador.ts'
import { falaDaAcao, textoDaFala, type Fala } from '../src/falas.ts'
import { contextoDoTurno, paraAvaliacao } from '../src/turno.ts'
import { validarRoteiro } from '../src/validacao.ts'
import type { Acao, Avaliacao, Resumo, Roteiro, Sessao } from '../src/tipos.ts'
import { avaliarNoServidor, ErroDoTutor } from './api.ts'
import { custoPorServico, somar, type Custo, type Gasto } from './custo.ts'
import { destravarAudio, pararAudio, preparar, type VozPreparada } from './vozGemini.ts'
import { blobParaBase64, Microfone } from './microfone.ts'
import { cancelarFala, carregarVozes, destravarVoz, falar, type Vozes } from './voz.ts'
import {
  Atalho,
  BotaoMic,
  Habilidades,
  Icone,
  Onda,
  Palco,
  Trilha,
  type EstadoMic,
  type PerguntaDoTutor,
  type Tentativa,
} from './ui.tsx'
import { CartaoResumo, FolhaDeApoio, PainelDoProfessor, type LinhaDoHistorico, type Opcoes } from './professor.tsx'

/**
 * O ciclo de um turno (especificação §7):
 *
 *   tutor fala → microfone abre → aluno fala → fim da fala detectado
 *     → função poc-tutor (transcreve às cegas, Jev decide, Gemini se precisar)
 *     → controlador decide (receber) → tutor fala → …
 *
 * A página não decide nada da aula: ela só leva a avaliação ao controlador e
 * dá voz às ações que ele devolve. Toda a pedagogia está em src/.
 *
 * A tela não é um chat (docs/melhorias-sugeridas.md, item 8): no centro, a
 * FRASE em construção; a fala do tutor vira legenda; a pista socrática vira um
 * cartão com o degrau da ajuda; histórico, decisões e custos ficam no modo
 * professor.
 */

type Status = 'inicio' | 'falando' | 'ouvindo' | 'pensando' | 'confirmando' | 'aguardando' | 'pausado' | 'fim'

/** `Omit` que respeita cada membro da união. */
type SemId<T> = T extends unknown ? Omit<T, 'id'> : never

let proximoId = 1

export type PropsDaAula = {
  roteiro: Roteiro
  /**
   * `lab`: a página da POC, com a gaveta do professor (decisões, custos,
   * opções de teste). `aluno`: dentro do app, só a aula — as opções são as que
   * o professor escolheu em Configurações → Tutor.
   */
  modo: 'lab' | 'aluno'
  opcoesIniciais?: Opcoes
  /**
   * No toque em Começar, DEPOIS de destravar o áudio e pedir o microfone (o
   * gesto do toque já foi usado). No app, abre a sessão no servidor; se
   * rejeitar, a aula não começa e a mensagem aparece como aviso.
   */
  aoComecar?: () => Promise<void>
  /** O controlador encerrou a aula: o app grava o resumo. */
  aoTerminar?: (resumo: Resumo) => void
  /** O X do topo, no app: volta para a lista de lições. */
  aoSair?: () => void
}

export function AulaDoTutor({ roteiro, modo, opcoesIniciais, aoComecar, aoTerminar, aoSair }: PropsDaAula) {
  const problemasDoRoteiro = useMemo(() => validarRoteiro(roteiro), [roteiro])
  const [status, setStatus] = useState<Status>('inicio')
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [nivel, setNivel] = useState(0)
  const [avisos, setAvisos] = useState<string[]>([])
  const [gasto, setGasto] = useState<Gasto>({})
  const [historico, setHistorico] = useState<LinhaDoHistorico[]>([])
  const [opcoes, setOpcoes] = useState<Opcoes>(opcoesIniciais ?? { escutaAutomatica: true, vozNatural: true })

  // O que o palco mostra além da frase.
  const [legenda, setLegenda] = useState('')
  const [tentativa, setTentativa] = useState<Tentativa | null>(null)
  const [pergunta, setPergunta] = useState<PerguntaDoTutor | null>(null)

  const [professorAberto, setProfessorAberto] = useState(false)
  const [apoioAberto, setApoioAberto] = useState(false)
  const [digitando, setDigitando] = useState(false)
  const [texto, setTexto] = useState('')

  // Refs: as funções assíncronas abaixo atravessam vários renders, e precisam
  // da sessão e das opções ATUAIS, não das que existiam quando começaram.
  const sessaoRef = useRef<Sessao | null>(null)
  const microfone = useRef<Microfone | null>(null)
  const vozes = useRef<Vozes>({ pt: null, en: null })
  const interrompido = useRef(false)
  /**
   * A vez de quem está falando. Pular, pedir ajuda, digitar, "Devagar" e
   * pausar começam uma rodada nova: a anterior para de dizer o que faltava
   * na hora — sem isto as falas do item pulado tocavam por cima das do novo.
   */
  const rodada = useRef(0)
  const pausadoRef = useRef(false)
  const ultimasFalas = useRef<Fala[]>([])
  const aConfirmar = useRef<string | null>(null)
  const opcoesRef = useRef(opcoes)
  opcoesRef.current = opcoes
  const digitandoRef = useRef(digitando)
  digitandoRef.current = digitando
  const aoTerminarRef = useRef(aoTerminar)
  aoTerminarRef.current = aoTerminar

  useEffect(() => () => microfone.current?.fechar(), [])

  function anotar(linha: SemId<LinhaDoHistorico>): number {
    const id = proximoId++
    setHistorico((h) => [...h, { ...linha, id }])
    return id
  }

  function detalhar(id: number, detalhe: string) {
    setHistorico((h) => h.map((l) => (l.id === id ? { ...l, detalhe } : l)))
  }

  function atualizarSessao(s: Sessao) {
    sessaoRef.current = s
    setSessao(s)
  }

  // ── Começar ────────────────────────────────────────────────────────────────

  async function comecar() {
    // Tudo que precisa do gesto do toque vem ANTES do primeiro await.
    destravarVoz()
    destravarAudio()
    const mic = microfone.current ?? new Microfone()
    const abrindo = microfone.current ? Promise.resolve() : mic.abrir()

    const novosAvisos: string[] = []
    try {
      await abrindo
      microfone.current = mic
    } catch (e) {
      microfone.current = null
      novosAvisos.push(`Sem microfone (${e instanceof Error ? e.message : 'permissão negada'}). Dá para seguir digitando.`)
      setDigitando(true)
      digitandoRef.current = true
    }
    vozes.current = await carregarVozes()
    if (!opcoesRef.current.vozNatural && !vozes.current.en) {
      novosAvisos.push('Este aparelho não tem voz em inglês instalada: as frases em inglês saem na voz que houver.')
    }
    setAvisos(novosAvisos)

    if (aoComecar) {
      try {
        await aoComecar()
      } catch (e) {
        setAvisos([...novosAvisos, e instanceof Error ? e.message : 'Não consegui começar a aula.'])
        return
      }
    }

    const { sessao: s, acoes } = iniciar(roteiro)
    setHistorico([])
    setResumo(null)
    setTentativa(null)
    setPergunta(null)
    atualizarSessao(s)
    await executar(acoes, s)
  }

  function recomecar() {
    cortar()
    pausadoRef.current = false
    microfone.current?.descartar()
    setGasto({})
    setProfessorAberto(false)
    void comecar()
  }

  // ── Tutor fala ─────────────────────────────────────────────────────────────

  /** O que cada ação muda no palco, no momento em que o tutor a diz. */
  function aplicarNoPalco(acao: Acao) {
    switch (acao.tipo) {
      case 'solicitar':
      case 'registrar_pendente':
      case 'iniciar_conversa':
        setPergunta(null)
        setTentativa(null)
        break
      case 'ajudar':
        setPergunta({ texto: acao.conteudo, nivel: acao.nivel, estado: 'aberta' })
        break
      case 'modelar':
        setPergunta({ texto: acao.modelo, nivel: 3, estado: 'aberta' })
        break
      case 'pedir_frase_inteira':
        setPergunta((p) => ({ texto: p?.texto ?? '', nivel: p?.nivel ?? 1, estado: 'parte', parte: acao.reconhecido }))
        break
      case 'confirmar_acerto':
        setPergunta((p) => (p ? { ...p, estado: 'resolvida' } : null))
        break
      case 'confirmar_audio':
        if (acao.reconhecido) setTentativa({ texto: acao.reconhecido, tipo: 'incerto' })
        break
      case 'encerrar':
        setResumo(acao.resumo)
        setPergunta(null)
        setTentativa(null)
        break
    }
  }

  async function executar(acoes: Acao[], s: Sessao) {
    const minha = cortar()
    setStatus('falando')
    interrompido.current = false

    // O resumo sai antes de o tutor dizê-lo: quem fecha a aba durante a
    // despedida não perde a aula feita.
    const fim = acoes.find((a) => a.tipo === 'encerrar')
    if (fim?.tipo === 'encerrar') aoTerminarRef.current?.(fim.resumo)

    const falas = acoes.map((acao) => falaDaAcao(acao, s))
    ultimasFalas.current = falas
    // Todas as falas do turno preparadas JUNTAS: as pré-gravadas já estão
    // aqui, e os streams das outras começam agora, enquanto a primeira toca.
    const vozesDoTurno = opcoesRef.current.vozNatural ? falas.map(preparar) : []

    for (const [i, acao] of acoes.entries()) {
      const texto = textoDaFala(falas[i])
      aplicarNoPalco(acao)
      setLegenda(texto)
      const voz = vozesDoTurno[i]
      const linha = anotar({ quem: 'tutor', texto, detalhe: voz && (voz.origem === 'gravada' ? 'voz pré-gravada' : 'voz em stream…') })
      if (voz?.origem === 'stream') {
        void voz.primeiroSomMs.then((ms) => detalhar(linha, ms === null ? 'stream falhou: voz do aparelho' : `voz em stream: 1º som em ${ms} ms`))
      }
      // Interrompido: o palco e a legenda continuam mudando, só não é lido.
      if (!interrompido.current) await dizer(falas[i], voz, 1, minha)
      // Outra rodada começou (pulou, pediu ajuda, pausou): esta não diz mais nada.
      if (minha !== rodada.current) return
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
    if (microfone.current && !digitandoRef.current && (opcoesRef.current.escutaAutomatica || interrompido.current)) ouvir()
    else setStatus('aguardando')
  }

  /**
   * Uma fala: a voz do Gemini (pré-gravada ou em stream); se ela falhar sem
   * soar nada, a voz do aparelho. A aula não para porque o TTS falhou.
   */
  async function dizer(fala: Fala, voz?: VozPreparada, velocidade = 1, minha = rodada.current) {
    if (voz) {
      void voz.custos.then(registrarCustos)
      if (await voz.tocar(velocidade)) return
      if (interrompido.current || minha !== rodada.current) return
    }
    await falar(fala, vozes.current, velocidade)
  }

  /** Começa uma rodada nova: cala o tutor e invalida o que a rodada anterior ainda ia dizer. */
  function cortar(): number {
    rodada.current++
    pararVoz()
    return rodada.current
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

  /** "Devagar" (0.75) e "Continuar" depois da pausa (1): diz de novo as últimas falas e volta a ouvir. */
  async function repetir(velocidade: number) {
    microfone.current?.descartar()
    const minha = cortar()
    setStatus('falando')
    interrompido.current = false
    for (const fala of ultimasFalas.current) {
      if (interrompido.current) break
      await dizer(fala, opcoesRef.current.vozNatural ? preparar(fala) : undefined, velocidade, minha)
      if (minha !== rodada.current) return
    }
    if (microfone.current && !digitandoRef.current && opcoesRef.current.escutaAutomatica) ouvir()
    else setStatus('aguardando')
  }

  /**
   * Pausar: o tutor cala, o microfone fecha e nada acontece até Continuar.
   * Continuar repete o último pedido — depois de uma pausa ninguém lembra
   * exatamente o que o tutor tinha acabado de pedir.
   */
  function pausar() {
    cortar()
    microfone.current?.descartar()
    pausadoRef.current = true
    setStatus('pausado')
  }

  function continuar() {
    destravarAudio()
    pausadoRef.current = false
    void repetir(1)
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
        anotar({ quem: 'nota', texto: 'Silêncio prolongado.' })
        void turno({ tipo: 'silencio' })
      },
    })
  }

  async function enviarGravacao() {
    const gravacao = await microfone.current?.parar()
    if (!gravacao) {
      setLegenda('Não ouvi nada. Toque no microfone e tente de novo.')
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
    cortar()
    setTexto('')
    setStatus('pensando')
    anotar({ quem: 'aluno', texto: limpo, detalhe: rotulo ?? 'digitado' })
    await avaliar({ texto: limpo })
  }

  async function avaliar(entrada: { audio?: { base64: string; mimeType: string }; texto?: string }) {
    const s = sessaoRef.current
    if (!s) return
    try {
      const resposta = await avaliarNoServidor({ ...entrada, contexto: contextoDoTurno(s), itemId: s.atual?.item.id })
      registrarCustos(resposta.custos)
      const avaliacao = paraAvaliacao(resposta, s)

      // No palco: o que o aluno disse, marcado conforme a avaliação.
      const dito = resposta.transcricao.texto
      const tipo: Tentativa['tipo'] =
        avaliacao.tipo === 'erro' ? 'erro' : avaliacao.tipo === 'parte_certa' ? 'parte' : avaliacao.tipo === 'adequada' ? 'ok' : avaliacao.tipo === 'audio_incerto' ? 'incerto' : 'neutra'
      if (dito && tipo !== 'ok') setTentativa({ texto: dito, tipo })

      // No modo professor: quem avaliou, quanto tempo levou e quanto custou.
      const t = resposta.tempos ?? {}
      const ms = (t.transcricaoMs ?? 0) + (t.jevMs ?? 0) + (t.avaliacaoMs ?? 0)
      const tokens = (resposta.custos ?? []).reduce((n, c) => n + c.entrada + c.saida, 0)
      const quem = resposta.decidiuPor === 'jev' ? 'Jev' : resposta.decidiuPor === 'gemini' ? `Jev → Gemini (${resposta.motivoGemini})` : null
      const detalhe = [
        resposta.transcricao.confianca === 'baixa' ? 'reconhecimento incerto' : null,
        quem,
        ms ? `${(ms / 1000).toFixed(1)}s` : null,
        tokens ? `${tokens.toLocaleString('pt-BR')} tokens · ${custoPorServico(resposta.custos)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
      if (entrada.audio) anotar({ quem: 'aluno', texto: dito || '(nada audível)', detalhe })
      else anotar({ quem: 'nota', texto: `Avaliação: ${detalhe}` })

      // Pausou enquanto a resposta era avaliada: o turno espera o Continuar.
      if (pausadoRef.current) {
        await turno(avaliacao, { calado: true })
        return
      }
      await turno(avaliacao)
    } catch (e) {
      // Falha de rede ou do servidor não é erro de inglês: a sessão não muda.
      // Recusa (tutor desligado, sessão expirada, limite) diz o porquê.
      setLegenda(
        e instanceof ErroDoTutor && e.recusa
          ? e.message
          : 'Não consegui ouvir a resposta agora. Isso não conta como erro — tente de novo.',
      )
      anotar({ quem: 'nota', texto: `Falha ao avaliar: ${e instanceof Error ? e.message : e}` })
      setStatus('aguardando')
    }
  }

  function pedir(avaliacao: Avaliacao, rotulo: string) {
    microfone.current?.descartar()
    cortar()
    anotar({ quem: 'aluno', texto: rotulo })
    void turno(avaliacao)
  }

  // ── Controlador decide ─────────────────────────────────────────────────────

  async function turno(avaliacao: Avaliacao, { calado = false }: { calado?: boolean } = {}) {
    const anterior = sessaoRef.current
    if (!anterior || anterior.encerrada) return
    const { sessao: s, acoes } = receber(anterior, avaliacao)
    atualizarSessao(s)
    const motivos = s.registro
      .slice(anterior.registro.length)
      .filter((e) => e.tipo === 'decisao' && e.motivo)
      .map((e) => e.motivo!)
    if (motivos.length) anotar({ quem: 'nota', texto: motivos.join(' · ') })
    if (calado) {
      // A decisão fica tomada; o que o tutor diria espera o Continuar.
      for (const acao of acoes) aplicarNoPalco(acao)
      ultimasFalas.current = acoes.map((acao) => falaDaAcao(acao, s))
      setLegenda(textoDaFala(ultimasFalas.current.at(-1) ?? []))
      return
    }
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

  const emAula = status !== 'inicio' && status !== 'fim' && status !== 'pausado'
  const estadoMic: EstadoMic =
    !microfone.current && emAula ? 'desligado' : status === 'inicio' || status === 'fim' ? 'aguardando' : (status as EstadoMic)

  function tocarMic() {
    destravarAudio()
    if (status === 'falando') return interromper()
    if (status === 'ouvindo') return void enviarGravacao()
    if (status === 'aguardando' || status === 'confirmando') return ouvir()
  }

  return (
    <div className="mx-auto flex h-dvh max-w-[520px] flex-col px-4">
      <header className="flex items-start gap-2.5 pt-3.5 pb-2">
        <Trilha roteiro={roteiro} sessao={sessao} />
        <button onClick={() => setApoioAberto(true)} aria-label="Apoio" title="Estruturas e vocabulário" className="grid h-8 w-8 place-items-center rounded-full bg-[var(--cartao)] text-neutral-600">
          <Icone nome="livro" />
        </button>
        {(emAula || status === 'pausado') && (
          <button
            onClick={() => (status === 'pausado' ? continuar() : pausar())}
            aria-label={status === 'pausado' ? 'Continuar a aula' : 'Pausar a aula'}
            title={status === 'pausado' ? 'Continuar' : 'Pausar'}
            className="grid h-8 w-8 place-items-center rounded-full bg-[var(--cartao)] text-neutral-600"
          >
            <Icone nome={status === 'pausado' ? 'continuar' : 'pausa'} />
          </button>
        )}
        {modo === 'lab' ? (
          <button onClick={() => setProfessorAberto(true)} aria-label="Modo professor" title="Modo professor" className="grid h-8 w-8 place-items-center rounded-full bg-[var(--cartao)] text-neutral-600">
            <Icone nome="professor" />
          </button>
        ) : (
          aoSair && (
            <button
              onClick={() => {
                cortar()
                microfone.current?.fechar()
                aoSair()
              }}
              aria-label="Sair da aula"
              title="Sair da aula"
              className="grid h-8 w-8 place-items-center rounded-full bg-[var(--cartao)] text-neutral-600"
            >
              <Icone nome="fechar" />
            </button>
          )
        )}
      </header>
      <Habilidades sessao={sessao} />

      {avisos.map((a) => (
        <p key={a} className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-900">{a}</p>
      ))}

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto py-4">
        {status === 'inicio' && <Boasvindas roteiro={roteiro} />}
        {status === 'pausado' && (
          <div className="animar-sobe w-full rounded-3xl bg-[var(--cartao)] p-6 text-center">
            <p className="text-lg font-extrabold">Aula pausada</p>
            <p className="mt-1 text-sm text-neutral-500">O tutor espera você. Ao continuar, ele repete o último pedido.</p>
            <button onClick={continuar} className="mt-4 w-full rounded-full bg-violet-600 py-3.5 text-base font-extrabold text-white">
              Continuar
            </button>
          </div>
        )}
        {status === 'fim' && resumo && <CartaoResumo resumo={resumo} roteiro={roteiro} aoRefazer={recomecar} />}
        {emAula && sessao && <Palco sessao={sessao} tentativa={tentativa} pergunta={pergunta} />}
      </main>

      {/* A fala do tutor como legenda — o "balão" de chat sai de cena. */}
      <div className="flex min-h-14 items-center justify-center gap-2.5 px-2 text-center text-[15px]">
        <Onda ativa={status === 'falando'} />
        <span>{status === 'inicio' || status === 'pausado' ? '' : legenda}</span>
      </div>

      <footer className="pt-2 pb-[max(1.1rem,env(safe-area-inset-bottom))]">
        {status === 'inicio' ? (
          <button onClick={() => void comecar()} className="w-full rounded-full bg-violet-600 py-4 text-base font-extrabold text-white shadow-[0_10px_30px_rgba(124,58,237,.35)]">
            Começar aula
          </button>
        ) : status === 'fim' || status === 'pausado' ? null : (
          <>
            {status === 'confirmando' && aConfirmar.current && (
              <div className="mb-3 flex justify-center">
                <button
                  onClick={() => void enviarTexto(aConfirmar.current!, 'confirmado')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
                >
                  <Icone nome="check" grosso /> Foi isso
                </button>
              </div>
            )}

            {digitando && (
              <form
                className="mb-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void enviarTexto(texto)
                }}
              >
                <input
                  value={texto}
                  autoFocus
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Digite sua resposta…"
                  disabled={status === 'pensando'}
                  className="min-w-0 flex-1 rounded-full bg-[var(--cartao)] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                />
                <button
                  disabled={!texto.trim() || status === 'pensando'}
                  aria-label="Enviar"
                  className="grid h-10 w-10 place-items-center rounded-full bg-violet-600 text-white disabled:opacity-30"
                >
                  <Icone nome="enviar" />
                </button>
              </form>
            )}

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex flex-col gap-1.5">
                <Atalho icone="devagar" rotulo="Devagar" aoClicar={() => void repetir(0.75)} desligado={status === 'pensando'} />
                <Atalho icone="teclado" rotulo={digitando ? 'Falar' : 'Digitar'} aoClicar={() => {
                    // Passar a digitar no meio da escuta descarta a gravação.
                    if (!digitando && status === 'ouvindo') {
                      microfone.current?.descartar()
                      setStatus('aguardando')
                    }
                    setDigitando(!digitando)
                  }}
                />
              </div>
              <BotaoMic estado={estadoMic} nivel={nivel} aoTocar={tocarMic} />
              <div className="flex flex-col gap-1.5">
                <Atalho icone="ajuda" rotulo="Ajuda" aoClicar={() => pedir({ tipo: 'pedido_ajuda' }, '(pediu ajuda)')} desligado={status === 'pensando'} />
                <Atalho icone="pular" rotulo="Pular" aoClicar={() => pedir({ tipo: 'pular' }, '(pulou)')} desligado={status === 'pensando'} />
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-neutral-400">
              {{
                falando: 'Toque no microfone para falar agora',
                ouvindo: 'Ouvindo… toque quando terminar',
                pensando: 'Pensando…',
                aguardando: 'Toque para responder',
                confirmando: 'Ou toque no microfone para falar de novo',
              }[status as 'falando' | 'ouvindo' | 'pensando' | 'aguardando' | 'confirmando']}
            </p>
          </>
        )}
      </footer>

      <FolhaDeApoio roteiro={roteiro} aberta={apoioAberto} aoFechar={() => setApoioAberto(false)} />
      {modo === 'lab' && (
        <PainelDoProfessor
          aberto={professorAberto}
          aoFechar={() => setProfessorAberto(false)}
          roteiro={roteiro}
          sessao={sessao}
          gasto={gasto}
          historico={historico}
          opcoes={opcoes}
          aoMudarOpcoes={setOpcoes}
          aoReiniciar={recomecar}
          medidorMudo={microfone.current?.medidorFunciona === false}
        />
      )}
    </div>
  )
}

function Boasvindas({ roteiro }: { roteiro: Roteiro }) {
  return (
    <div className="animar-sobe w-full rounded-3xl bg-[var(--cartao)] p-5">
      <p className="text-lg font-extrabold">{roteiro.titulo}</p>
      <p className="mt-1 text-sm text-neutral-500">
        Uma aula curta de prática oral: o tutor pede uma frase, você fala, e ele vai mudando a frase aos poucos.
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        <li className="flex gap-2"><Icone nome="mic" className="mt-0.5 h-4 w-4 text-violet-600" /> Fale a frase inteira, sem pressa.</li>
        <li className="flex gap-2"><Icone nome="ajuda" className="mt-0.5 h-4 w-4 text-violet-600" /> Travou? Toque em Ajuda, ou pergunte em português.</li>
        <li className="flex gap-2"><Icone nome="devagar" className="mt-0.5 h-4 w-4 text-violet-600" /> Não entendeu? Toque em Devagar.</li>
      </ul>
      <p className="mt-3 text-xs text-neutral-400">Use fone de ouvido se puder. O navegador vai pedir o microfone.</p>
    </div>
  )
}
