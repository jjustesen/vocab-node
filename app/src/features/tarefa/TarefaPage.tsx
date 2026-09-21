import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Flame,
  Lightbulb,
  Loader2,
  Milestone,
  PartyPopper,
  Play,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  Volume2,
  X,
  XCircle,
} from 'lucide-react'
import { apiTarefa, mensagemDeErro } from '@/lib/api-tarefa'
import { embaralhar } from '@/lib/embaralhar'
import { inicial } from '@/lib/avatar'
import {
  CORTE_PRONUNCIA,
  MARCADOR_LACUNA,
  compararFala,
  corrigir,
  dividirEnunciado,
  pontuarPronuncia,
} from '@/types/questao'
import { useAlunoAuthOpcional } from '@/features/aluno-auth/AlunoAuthProvider'
import { minutosEstimados } from './formato'
import { BotaoPrincipal, Chip, TelaAluno } from './visual'
import { BOTAO_CHUNKY, FICHA_BASE, FICHA_COR, LOUSA } from './estilo'
import { BotaoOuvir } from './RespostasAudio'
import { RespostaPronuncia } from './RespostaPronuncia'
import { falarEmIngles, useTemVozEmIngles } from './vozDoNavegador'
import type {
  ConcluirResposta,
  PronunciaResposta,
  FeedbackLocal,
  IdentificadorTarefa,
  QuestaoTarefa,
  TarefaObterResposta,
} from './tipos'

type Tela = 'carregando' | 'erro' | 'intro' | 'respondendo' | 'concluindo' | 'final'

export function TarefaPage() {
  // Rota anônima (/t/:token) OU rota logada (/painel/tarefa/:atribuicaoId,
  // dentro de <AlunoAuthProvider>/<ExigeSessaoAluno> — session já garantida
  // quando atribuicaoId está presente). Ver tipos.ts (IdentificadorTarefa).
  const { token, atribuicaoId } = useParams<{ token?: string; atribuicaoId?: string }>()
  const navegar = useNavigate()
  const alunoAuth = useAlunoAuthOpcional()
  const identificador: IdentificadorTarefa | null = token
    ? { token }
    : atribuicaoId && alunoAuth?.session
      ? { atribuicao_id: atribuicaoId, access_token: alunoAuth.session.access_token }
      : null

  const [tela, setTela] = useState<Tela>('carregando')
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<TarefaObterResposta | null>(null)
  const [indice, setIndice] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackLocal | null>(null)
  const [sequencia, setSequencia] = useState(0)
  const [melhorSequencia, setMelhorSequencia] = useState(0)
  const [resultadoFinal, setResultadoFinal] = useState<ConcluirResposta | null>(null)
  /**
   * RF-86 — repasse dos erros. É TREINO: as respostas não são reenviadas, o
   * placar já registrado não muda. Refazer valendo nota exigiria reabrir uma
   * tentativa concluída (`tarefa-responder` recusa com 409), o que reescreveria
   * o resultado que o professor já viu.
   */
  const [indicesParaRefazer, setIndicesParaRefazer] = useState<number[] | null>(null)
  const [posicaoNoRepasse, setPosicaoNoRepasse] = useState(0)
  /**
   * Acertou/errou por questão nesta sessão. `dados` é a foto do servidor no
   * carregamento e não muda enquanto o aluno responde, então sem isto a tela
   * final não saberia quais foram os erros de agora — só os de uma tentativa
   * anterior já gravada.
   */
  const resultadosLocais = useRef(new Map<string, boolean>())
  const inicioQuestaoRef = useRef(Date.now())
  // Envios de resposta disparados em segundo plano (fire-and-forget) — a UI
  // não espera por eles. Só são reconciliados uma vez, ao concluir a tarefa.
  const pendentesRef = useRef<Promise<unknown>[]>([])

  useEffect(() => {
    if (!identificador) return
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, atribuicaoId, alunoAuth?.session])

  async function carregar() {
    if (!identificador) return
    setTela('carregando')
    setErro('')
    // Ao emendar a próxima etapa da trilha (RF-139) a rota muda mas o
    // componente não remonta — sem zerar aqui, o placar e a sequência de
    // acertos da etapa anterior vazariam para a nova.
    setResultadoFinal(null)
    setFeedback(null)
    setSequencia(0)
    setMelhorSequencia(0)
    setIndice(0)
    setIndicesParaRefazer(null)
    setPosicaoNoRepasse(0)
    resultadosLocais.current = new Map()
    pendentesRef.current = []
    try {
      const { data } = await apiTarefa.post<TarefaObterResposta>('/tarefa-obter', identificador)
      setDados(data)

      if (data.concluida) {
        await buscarResultadoFinal()
        return
      }

      const primeiraPendente = data.questoes.findIndex((q) => !q.respondida)
      if (primeiraPendente === -1) {
        // Todas as questões já têm resposta gravada, mas a tarefa não foi
        // fechada (ex.: internet caiu bem no último passo). Fecha sozinho —
        // o servidor confirma pelo que está gravado, não pelo que a tela lembra.
        setIndice(data.questoes.length)
        await concluirTarefa()
        return
      }

      setIndice(primeiraPendente)
      setTela('intro')
    } catch (e) {
      setErro(mensagemDeErro(e))
      setTela('erro')
    }
  }

  async function buscarResultadoFinal() {
    if (!identificador) return
    const { data } = await apiTarefa.post<ConcluirResposta>('/tarefa-concluir', identificador)
    setResultadoFinal(data)
    setTela('final')
  }

  async function concluirTarefa() {
    setTela('concluindo')
    try {
      // Só aqui esperamos os envios em segundo plano — é o único momento em
      // que precisamos ter certeza de que tudo chegou no banco.
      await Promise.allSettled(pendentesRef.current)
      await buscarResultadoFinal()
    } catch (e) {
      setErro(mensagemDeErro(e))
      setTela('erro')
    }
  }

  function responder(valor: string) {
    if (!identificador) return
    const questao = dados!.questoes[indice]

    // Corrige NA HORA, no navegador — sem esperar o servidor (decisão de
    // produto de 26/07/2026, ver docs/CONTRATO-QUESTOES.md §7).
    const correta = corrigir(
      {
        tipo: questao.tipo,
        resposta_correta: questao.resposta_correta,
        respostas_aceitas: questao.respostas_aceitas,
        pares: questao.pares ?? [],
      },
      valor,
    )

    setFeedback({
      correta,
      resposta_correta: questao.resposta_correta,
      pares_corretos: questao.pares,
      explicacao: questao.explicacao,
    })
    setSequencia((s) => {
      const nova = correta ? s + 1 : 0
      setMelhorSequencia((m) => Math.max(m, nova))
      return nova
    })

    // No repasse dos erros nada é enviado nem regravado — ver indicesParaRefazer.
    if (indicesParaRefazer) return
    resultadosLocais.current.set(questao.id, correta)

    const tempoMs = Date.now() - inicioQuestaoRef.current
    const promessa = apiTarefa
      .post('/tarefa-responder', { ...identificador, questao_id: questao.id, valor, tempo_ms: tempoMs })
      .catch(() => {
        // Sem retry aqui de propósito: se faltar ao concluir, o servidor
        // rejeita com "faltam N questões" e o aluno vê a tela de erro com
        // "Tentar novamente", que refaz o carregamento do zero.
      })
    pendentesRef.current.push(promessa)
  }

  /**
   * O caminho da fala. Voltou a ser correção LOCAL como todos os outros tipos
   * (§7) desde que a nota deixou de depender de IA: o navegador transcreve,
   * pontuamos aqui e o feedback aparece na hora. A chamada ao servidor vai em
   * segundo plano — ela existe para guardar o áudio e para RECALCULAR a nota,
   * porque o registro que o professor vê nunca sai do que o cliente mandou.
   */
  async function responderPronuncia(
    transcricao: string,
    audioBase64: string | null,
    mimeType: string | null,
    /** O aluno desistiu de ser ouvido — registra a tentativa vazia e segue. */
    desistiu = false,
  ): Promise<{ ouviu: boolean }> {
    if (!identificador) return { ouviu: false }
    const questao = dados!.questoes[indice]

    // Sem transcrição do navegador mas com áudio: quem transcreve é o servidor
    // (Gemini). É o caminho NORMAL no celular, onde o reconhecedor do navegador
    // não é confiável — e a rede de segurança no desktop, quando ele falha.
    if (!desistiu && transcricao.trim() === '' && audioBase64) {
      try {
        const { data } = await apiTarefa.post<PronunciaResposta>('/tarefa-pronuncia', {
          ...identificador,
          questao_id: questao.id,
          transcricao: '',
          audio_base64: audioBase64,
          mime_type: mimeType,
          tempo_ms: Date.now() - inicioQuestaoRef.current,
          // No repasse dos erros o servidor transcreve e pontua sem gravar.
          apenas_transcrever: Boolean(indicesParaRefazer),
        })

        if (!data.transcricao?.trim()) return { ouviu: false }

        setFeedback({
          correta: data.correta,
          resposta_correta: questao.resposta_correta,
          pares_corretos: null,
          explicacao: questao.explicacao,
          pontuacao: data.pontuacao,
          transcricao: data.transcricao,
        })
        setSequencia((s) => {
          const nova = data.correta ? s + 1 : 0
          setMelhorSequencia((m) => Math.max(m, nova))
          return nova
        })
        // A resposta já foi gravada pela própria chamada acima — nada de
        // reenviar em segundo plano como no caminho local.
        if (!indicesParaRefazer) resultadosLocais.current.set(questao.id, data.correta)
        return { ouviu: true }
      } catch {
        // Servidor fora do ar ou áudio recusado: tratamos como "não te ouvi",
        // que oferece tentar de novo em vez de cravar um zero.
        return { ouviu: false }
      }
    }

    if (!desistiu && transcricao.trim() === '') return { ouviu: false }

    const { pontuacao } = pontuarPronuncia(questao.resposta_correta, transcricao)
    const correta = pontuacao >= CORTE_PRONUNCIA

    setFeedback({
      correta,
      resposta_correta: questao.resposta_correta,
      pares_corretos: null,
      // A lista de palavras não reconhecidas saía costurada aqui dentro da
      // explicação; agora quem mostra o que saiu diferente é <FalaOuvida>,
      // marcando na própria transcrição — dizer as duas coisas era repetição.
      explicacao: questao.explicacao,
      pontuacao,
      transcricao,
    })
    setSequencia((s) => {
      const nova = correta ? s + 1 : 0
      setMelhorSequencia((m) => Math.max(m, nova))
      return nova
    })

    if (indicesParaRefazer) return { ouviu: true }
    resultadosLocais.current.set(questao.id, correta)

    const promessa = apiTarefa
      .post('/tarefa-pronuncia', {
        ...identificador,
        questao_id: questao.id,
        transcricao,
        audio_base64: audioBase64,
        mime_type: mimeType,
        tempo_ms: Date.now() - inicioQuestaoRef.current,
      })
      .catch(() => {
        // Mesma regra de tarefa-responder: sem retry aqui — se faltar resposta
        // ao concluir, o servidor recusa e a tela oferece recarregar.
      })
    pendentesRef.current.push(promessa)
    return { ouviu: true }
  }

  function proxima() {
    setFeedback(null)
    inicioQuestaoRef.current = Date.now()

    if (indicesParaRefazer) {
      const seguinte = posicaoNoRepasse + 1
      if (seguinte >= indicesParaRefazer.length) {
        // Fim do repasse: volta para a mesma tela final, com o mesmo placar.
        setIndicesParaRefazer(null)
        setTela('final')
        return
      }
      setPosicaoNoRepasse(seguinte)
      setIndice(indicesParaRefazer[seguinte])
      return
    }

    const proximoIndice = indice + 1
    setIndice(proximoIndice)
    if (dados && proximoIndice >= dados.questoes.length) concluirTarefa()
  }

  /** Índices errados: o que foi respondido agora tem prioridade sobre a foto do servidor. */
  function indicesErrados(): number[] {
    if (!dados) return []
    return dados.questoes
      .map((q, i) => {
        const local = resultadosLocais.current.get(q.id)
        const errou = local !== undefined ? !local : q.correta === false
        return errou ? i : -1
      })
      .filter((i) => i >= 0)
  }

  /** RF-86: reabre só as questões erradas, em modo treino. */
  function refazerErros() {
    const erradas = indicesErrados()
    if (erradas.length === 0) return

    setIndicesParaRefazer(erradas)
    setPosicaoNoRepasse(0)
    setIndice(erradas[0])
    setFeedback(null)
    setSequencia(0)
    inicioQuestaoRef.current = Date.now()
    setTela('respondendo')
  }

  if (tela === 'carregando' || tela === 'concluindo') {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-4">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (tela === 'erro') {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-6 text-center">
        <div>
          <XCircle className="mx-auto h-10 w-10 text-rose-400" />
          <p className="mt-3 font-bold text-neutral-800">{erro}</p>
          <p className="mt-1 text-sm text-neutral-500">Confira o link ou peça outro para o professor.</p>
          <button
            onClick={carregar}
            className="mx-auto mt-4 flex items-center gap-1.5 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (!dados) return null

  // Só quem tem sessão tem para onde voltar (o painel). Por link anônimo a
  // tarefa é a única tela do app.
  const aoSair = atribuicaoId ? () => navegar('/painel') : null

  if (tela === 'intro') {
    return <TelaIntro dados={dados} aoComecar={() => setTela('respondendo')} aoSair={aoSair} />
  }

  if (tela === 'final' && resultadoFinal) {
    return (
      <TelaFinal
        resultado={resultadoFinal}
        professorNome={dados.professor_nome}
        alunoNome={dados.aluno_nome}
        erros={indicesErrados().length}
        melhorSequencia={melhorSequencia}
        // A continuação abre por `atribuicao_id`, rota que exige sessão. Quem
        // chegou por link anônimo não tem como abrir a próxima etapa: o token
        // dela nunca foi exposto (só o hash fica no banco).
        podeContinuar={Boolean(atribuicaoId)}
        aoContinuar={(proximaAtribuicaoId) => navegar(`/painel/tarefa/${proximaAtribuicaoId}`)}
        aoRefazerErros={refazerErros}
        aoSair={aoSair}
      />
    )
  }

  const questao = dados.questoes[indice]
  if (!questao) return null

  return (
    <TelaQuestao
      questao={questao}
      numero={indicesParaRefazer ? posicaoNoRepasse + 1 : indice + 1}
      total={indicesParaRefazer ? indicesParaRefazer.length : dados.questoes.length}
      sequencia={sequencia}
      feedback={feedback}
      repassandoErros={Boolean(indicesParaRefazer)}
      aoResponder={responder}
      aoFalar={responderPronuncia}
      aoLimparFeedback={() => setFeedback(null)}
      aoAvancar={proxima}
      aoSair={aoSair}
    />
  )
}

// ────────────────────────────────────────────────────────────────────────

/** A1 — abertura do link. O nome do professor é o que dá confiança na tela. */
function TelaIntro({
  dados,
  aoComecar,
  aoSair,
}: {
  dados: TarefaObterResposta
  aoComecar: () => void
  /** null por link anônimo: sem sessão não existe painel para onde voltar. */
  aoSair: (() => void) | null
}) {
  const primeiroNome = dados.aluno_nome.split(' ')[0]

  return (
    <div className="min-h-dvh bg-areia pb-10 md:grid md:place-items-center md:px-5">
      {/* No desktop o topo lilás vira a "capa" de um cartão centralizado; no
          celular continua colado nas bordas da tela. */}
      <div className={`mx-auto w-full max-w-sm md:max-w-md md:overflow-hidden ${LOUSA} md:pb-8`}>
        {/* Raio de 32px na base — igual à sobreposição do card (-mt-8), que é o
            máximo que cabe: acima disso a curva sobe além da faixa coberta pelo
            card e abre falhas de fundo areia ao lado dos cantos dele. */}
        <div className="relative overflow-hidden rounded-b-[2rem] bg-violet-200 px-6 pb-14 pt-10 text-center">
          <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-violet-300/60" />
          <span className="absolute -left-8 top-16 h-20 w-20 rounded-full bg-white/40" />
          {/* Abrir a tarefa era um caminho sem volta: as telas de questão e a
              final já tinham saída, só a abertura não. 44px de alvo (RNF-06) e
              acima das formas decorativas por causa do z-10. */}
          {aoSair && (
            <button
              onClick={aoSair}
              title="Voltar para o painel"
              aria-label="Voltar para o painel"
              className="absolute left-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/70 text-violet-900 transition hover:bg-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white text-2xl font-extrabold text-violet-700">
            {inicial(dados.professor_nome)}
          </span>
          <p className="relative mt-3 text-sm text-violet-900">
            <b>{dados.professor_nome}</b> enviou
            <br />
            uma tarefa para você
          </p>
        </div>

        <div className="px-5">
          {/* `relative` é o que faz o card aparecer POR CIMA do lilás. Sem ele o
              card é estático, o bloco lilás acima é posicionado, e elemento
              posicionado pinta sobre estático mesmo vindo antes no DOM — os
              32px de -mt-8 continuam existindo, só ficam escondidos. */}
          <div className="relative -mt-8 rounded-3xl border-2 border-neutral-200 border-b-4 bg-white p-6 text-center shadow-lg md:shadow-none">
            <h1 className="text-xl font-extrabold leading-tight text-neutral-900 md:text-2xl">
              {dados.atividade.titulo}
            </h1>
            <div className="mt-2 flex justify-center gap-1.5">
              <Chip>
                {dados.questoes.length} {dados.questoes.length === 1 ? 'questão' : 'questões'}
              </Chip>
              <Chip>~{minutosEstimados(dados.questoes.length)} min</Chip>
              <Chip cor="bg-violet-200 text-violet-900">{dados.atividade.nivel}</Chip>
            </div>

            <div className="mt-4 text-left">
              <span className="text-xs font-bold text-neutral-600">Seu primeiro nome</span>
              <div className="mt-1 flex items-center justify-between rounded-2xl bg-neutral-100 px-4 py-3 text-sm font-bold text-neutral-900">
                {primeiroNome}
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <Check className="h-3 w-3" /> lembrado
                </span>
              </div>
            </div>

            <div className="mt-4">
              <BotaoPrincipal onClick={aoComecar}>
                <Play className="h-4 w-4" /> Começar
              </BotaoPrincipal>
            </div>
            <p className="mt-3 text-xs font-medium text-neutral-400">Sem cadastro, sem instalar nada</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * A3 (tarefa solta) e A7 (etapa de trilha) são a mesma tela com ênfases
 * diferentes: fora da trilha o destaque é revisar os erros; dentro dela é
 * continuar, que é o que permite fazer a trilha inteira de uma vez (RF-139).
 */
function TelaFinal({
  resultado,
  professorNome,
  alunoNome,
  erros,
  melhorSequencia,
  podeContinuar,
  aoContinuar,
  aoRefazerErros,
  aoSair,
}: {
  resultado: ConcluirResposta
  professorNome: string
  alunoNome: string
  erros: number
  melhorSequencia: number
  podeContinuar: boolean
  aoContinuar: (proximaAtribuicaoId: string) => void
  aoRefazerErros: () => void
  aoSair: (() => void) | null
}) {
  const percentual = resultado.total > 0 ? Math.round((resultado.acertos / resultado.total) * 100) : 0
  const minutos = resultado.tempo_total_ms ? Math.max(1, Math.round(resultado.tempo_total_ms / 60000)) : null
  const proxima = podeContinuar ? resultado.proxima_etapa : null

  return (
    <TelaAluno comFormas moldura>
      <div className="pt-8 text-center md:pt-2">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-emerald-200">
          <PartyPopper className="h-9 w-9 text-emerald-800" />
        </span>

        {/* O título é o veredito, em amarelo-ouro como o "Perfect lesson!":
            é o que se lê primeiro. O placar vem logo abaixo, grande. */}
        <p className="mt-5 text-2xl font-extrabold text-amber-500 md:text-3xl">
          {proxima
            ? `Etapa ${proxima.ordem - 1} concluída!`
            : percentual === 100
              ? 'Tarefa perfeita!'
              : percentual >= 80
                ? `Mandou bem, ${alunoNome.split(' ')[0]}!`
                : percentual >= 50
                  ? `Bom trabalho, ${alunoNome.split(' ')[0]}!`
                  : 'Continue praticando!'}
        </p>
        <p className="mt-1 text-base font-medium text-neutral-500">
          {erros === 0
            ? 'Você não errou nenhuma questão'
            : `Você acertou ${resultado.acertos} de ${resultado.total}`}
        </p>

        {/* Cartões de estatística: rótulo colorido em cima, valor grande
            embaixo, borda da mesma cor. */}
        <div className="mt-7 flex justify-center gap-3">
          {minutos && (
            <CartaoEstatistica cor="sky" rotulo="Tempo">
              <Clock className="h-5 w-5" /> {minutos} min
            </CartaoEstatistica>
          )}
          {melhorSequencia > 1 && (
            <CartaoEstatistica cor="amber" rotulo="Sequência">
              <Flame className="h-5 w-5" fill="currentColor" /> {melhorSequencia}
            </CartaoEstatistica>
          )}
          <CartaoEstatistica cor="emerald" rotulo="Acertos">
            <TrendingUp className="h-5 w-5" /> {percentual}%
          </CartaoEstatistica>
        </div>

        {proxima && <CartaoProximaEtapa proxima={proxima} aoContinuar={aoContinuar} />}

        {!proxima && erros > 0 && (
          <div className="mt-8">
            <BotaoPrincipal onClick={aoRefazerErros} cor="violeta">
              <RotateCcw className="h-5 w-5" strokeWidth={2.5} /> Refazer{' '}
              {erros === 1 ? 'o erro' : `os ${erros} erros`}
            </BotaoPrincipal>
          </div>
        )}

        {aoSair && (
          <button
            onClick={aoSair}
            className={`${BOTAO_CHUNKY} mt-3 w-full border-neutral-200 bg-white py-3.5 text-base text-neutral-600 hover:bg-neutral-50`}
          >
            {proxima ? 'Parar por aqui' : 'Concluir'}
          </button>
        )}
        {proxima && <p className="mt-2 text-xs font-medium text-neutral-400">Você pode voltar quando quiser</p>}

        <p className="mt-5 flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> {professorNome} já recebeu seu resultado
        </p>
      </div>
    </TelaAluno>
  )
}

/** Cartão de estatística da tela final: faixa colorida com o rótulo, valor grande embaixo. */
function CartaoEstatistica({
  cor,
  rotulo,
  children,
}: {
  cor: 'sky' | 'amber' | 'emerald'
  rotulo: string
  children: React.ReactNode
}) {
  const cores = {
    sky: 'border-sky-400 [&>span]:bg-sky-400 [&>p]:text-sky-600',
    amber: 'border-amber-400 [&>span]:bg-amber-400 [&>p]:text-amber-600',
    emerald: 'border-emerald-400 [&>span]:bg-emerald-400 [&>p]:text-emerald-600',
  }[cor]

  return (
    <div className={`min-w-24 overflow-hidden rounded-2xl border-2 bg-white ${cores}`}>
      <span className="block px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">{rotulo}</span>
      <p className="flex items-center justify-center gap-1.5 px-3 py-3 text-lg font-extrabold">{children}</p>
    </div>
  )
}

/** A7: progresso da trilha + a próxima etapa como ação principal. */
function CartaoProximaEtapa({
  proxima,
  aoContinuar,
}: {
  proxima: NonNullable<ConcluirResposta['proxima_etapa']>
  aoContinuar: (id: string) => void
}) {
  const faltam = proxima.total_etapas - proxima.etapas_concluidas

  return (
    <>
      <div className="mt-5 rounded-3xl bg-white p-4 text-left">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-violet-200 text-violet-700">
            <Milestone className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-extrabold text-neutral-900">{proxima.trilha_nome}</p>
            <p className="text-xs font-medium text-neutral-400">
              {faltam === 1 ? 'falta 1 etapa' : `faltam ${faltam} etapas`}
            </p>
          </div>
          <span className="text-xs font-extrabold text-violet-700">
            {proxima.etapas_concluidas}/{proxima.total_etapas}
          </span>
        </div>
        <div className="mt-3 flex gap-1">
          {Array.from({ length: proxima.total_etapas }, (_, i) => (
            <span
              key={i}
              className={`h-2 flex-1 rounded-full ${
                i < proxima.etapas_concluidas ? 'bg-emerald-400' : 'bg-neutral-200'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-3xl bg-neutral-900 p-4 text-left">
        <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-violet-500/30" />
        <p className="relative text-[10px] font-extrabold text-neutral-400">PRÓXIMA ETAPA</p>
        <p className="relative mt-0.5 text-sm font-extrabold text-white">{proxima.titulo}</p>
        <p className="relative mt-0.5 flex items-center gap-1.5 text-xs font-medium text-neutral-400">
          <Clock className="h-3.5 w-3.5" /> {proxima.total_questoes} questões · ~
          {minutosEstimados(proxima.total_questoes)} min
        </p>
        <button
          onClick={() => aoContinuar(proxima.atribuicao_id)}
          className="relative mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 font-extrabold text-neutral-900"
        >
          <ArrowRight className="h-4 w-4" /> Continuar agora
        </button>
      </div>
    </>
  )
}

function TelaQuestao({
  questao,
  numero,
  total,
  sequencia,
  feedback,
  repassandoErros,
  aoResponder,
  aoFalar,
  aoLimparFeedback,
  aoAvancar,
  aoSair,
}: {
  questao: QuestaoTarefa
  numero: number
  total: number
  sequencia: number
  feedback: FeedbackLocal | null
  aoFalar: (
    transcricao: string,
    audioBase64: string | null,
    mimeType: string | null,
    desistiu?: boolean,
  ) => Promise<{ ouviu: boolean }>
  aoLimparFeedback: () => void
  repassandoErros: boolean
  aoResponder: (valor: string) => void
  aoAvancar: () => void
  aoSair: (() => void) | null
}) {
  const progresso = Math.round(((numero - 1) / total) * 100)

  // Três faixas, como no Duolingo: progresso em cima, a questão no meio e um
  // rodapé que gruda embaixo e vira o cartão de feedback. O rodapé fixo é o
  // que garante que "Próxima" está sempre ao alcance do polegar, mesmo com a
  // explicação longa ou a lista de opções passando da dobra.
  return (
    <div className="flex min-h-dvh flex-col bg-areia">
      <header className="px-5 pt-4 md:pt-8">
        <div className="mx-auto w-full max-w-sm md:max-w-2xl">
          <div className="flex items-center gap-3 md:gap-4">
            {aoSair ? (
              <button
                onClick={aoSair}
                title="Sair da tarefa"
                aria-label="Sair da tarefa"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-400 transition hover:bg-white hover:text-neutral-700"
              >
                <X className="h-6 w-6" strokeWidth={2.5} />
              </button>
            ) : (
              // Sem sessão não há para onde voltar — a tarefa é a única tela.
              <span className="w-0" />
            )}
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-neutral-200">
              <div
                className="relative h-full rounded-full bg-violet-500 transition-all duration-500"
                style={{ width: `${progresso}%` }}
              >
                {/* O brilho na parte de cima é o que faz a barra parecer um
                    tubo e não uma linha — só aparece com alguma largura. */}
                {progresso > 0 && (
                  <span className="absolute left-2.5 right-2.5 top-1 h-1 rounded-full bg-white/40" />
                )}
              </div>
            </div>
            <span
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-extrabold ${
                sequencia > 0 ? 'bg-amber-200 text-amber-900' : 'bg-white text-neutral-400'
              }`}
            >
              <Flame className="h-4 w-4" fill={sequencia > 0 ? 'currentColor' : 'none'} /> {sequencia}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 pb-8 pt-4 md:pt-6">
        <div className={`mx-auto w-full max-w-sm md:max-w-2xl ${LOUSA} md:px-10 md:py-8`}>
          <p className="text-xs font-extrabold uppercase tracking-wide text-neutral-400">
            {repassandoErros ? 'Revisando · ' : ''}Questão {numero} de {total}
          </p>
          {repassandoErros && numero === 1 && (
            <p className="mt-1 text-xs font-medium text-neutral-400">
              É só treino — sua nota já foi enviada e não muda.
            </p>
          )}

          <CorpoDaQuestao
            questao={questao}
            feedback={feedback}
            aoResponder={aoResponder}
            aoFalar={aoFalar}
            aoLimparFeedback={aoLimparFeedback}
          />
        </div>
      </main>

      {/* O tom nunca é punitivo: no erro o rodapé é rosa claro e a explicação
          vem antes de qualquer cobrança (mockup A2b). */}
      {feedback && (
        <footer
          className={`sticky bottom-0 z-10 border-t-2 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 md:pb-8 md:pt-6 ${
            feedback.correta ? 'border-emerald-200 bg-emerald-100' : 'border-rose-200 bg-rose-100'
          }`}
        >
          <div className="mx-auto w-full max-w-sm md:flex md:max-w-2xl md:items-end md:gap-8">
            <div className="flex gap-3 md:min-w-0 md:flex-1">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white md:h-14 md:w-14">
                {feedback.correta ? (
                  <PartyPopper className="h-5 w-5 text-emerald-600 md:h-7 md:w-7" />
                ) : (
                  <Lightbulb className="h-5 w-5 text-rose-500 md:h-7 md:w-7" />
                )}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-xl font-extrabold md:text-2xl ${
                    feedback.correta ? 'text-emerald-800' : 'text-rose-800'
                  }`}
                >
                  {feedback.correta ? 'Boa!' : 'Quase!'}
                  {/* Em pronúncia o aluno merece o número, não só o veredito:
                      45 e 68 são os dois "quase", e a diferença entre eles é o
                      que mostra que ele está evoluindo entre as tentativas. */}
                  {feedback.pontuacao !== undefined && (
                    <span className="ml-2 text-base font-bold opacity-80">{feedback.pontuacao}/100</span>
                  )}
                </p>
                <p
                  className={`mt-0.5 text-sm font-medium ${feedback.correta ? 'text-emerald-800' : 'text-rose-800'}`}
                >
                  {feedback.explicacao}
                </p>
                {feedback.transcricao && (
                  <FalaOuvida
                    fraseAlvo={feedback.resposta_correta}
                    transcricao={feedback.transcricao}
                    correta={feedback.correta}
                  />
                )}
              </div>
            </div>

            <div className="mt-4 md:mt-0 md:w-64 md:shrink-0">
              <BotaoPrincipal onClick={aoAvancar} cor={feedback.correta ? 'verde' : 'rosa'}>
                {numero === total ? 'Ver resultado' : feedback.correta ? 'Próxima' : 'Entendi, próxima'}
                <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
              </BotaoPrincipal>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}

/**
 * Instrução e frase-alvo, separadas (migration 0011).
 *
 * A instrução é o TÍTULO da tela — grande e pesado, como o "Translate this
 * sentence" do Duolingo: é a primeira coisa que o olho pega e diz o que fazer.
 * A frase é o conteúdo — um balão branco com borda, corpo maior, como a fala
 * do personagem. Antes as duas saíam no mesmo negrito miúdo e o olho não
 * achava onde começava o inglês.
 */
function Enunciado({ questao }: { questao: QuestaoTarefa }) {
  const { instrucao, frase } = dividirEnunciado(questao)

  return (
    <div className="mt-3">
      {instrucao && (
        <h1 className="text-2xl font-extrabold leading-tight text-neutral-900 md:text-3xl">{instrucao}</h1>
      )}
      {frase && (
        <div className={`relative ${instrucao ? 'mt-5' : ''}`}>
          {/* A pontinha do balão: um quadrado girado, com a mesma borda, meio
              escondido atrás do corpo. É o que faz o bloco ler como "alguém
              disse isso" e não como mais um campo. */}
          <span className="absolute -top-2 left-7 h-4 w-4 rotate-45 border-l-2 border-t-2 border-neutral-200 bg-white" />
          <p className="relative rounded-2xl border-2 border-neutral-200 bg-white px-5 py-4 text-lg font-bold leading-relaxed text-neutral-900 md:text-xl">
            <FraseComLacuna texto={frase} />
          </p>
        </div>
      )}
    </div>
  )
}

/** Os seis underscores viram um traço desenhado — a frase vira exercício, não código. */
function FraseComLacuna({ texto }: { texto: string }) {
  const partes = texto.split(MARCADOR_LACUNA)
  if (partes.length === 1) return <>{texto}</>

  return (
    <>
      {partes.map((parte, i) => (
        <Fragment key={i}>
          {parte}
          {i < partes.length - 1 && (
            <span className="mx-1 inline-block w-20 border-b-[3px] border-violet-400 align-baseline" />
          )}
        </Fragment>
      ))}
    </>
  )
}

/**
 * "Ouvi: ..." com as palavras que não bateram sublinhadas.
 *
 * É o feedback mais útil que a questão de fala consegue dar sem análise
 * fonética: ver que o motor entendeu "fink" no lugar de "think" mostra ONDE a
 * leitura escorregou, e de quebra prova ao aluno que a nota não é aleatória.
 */
function FalaOuvida({
  fraseAlvo,
  transcricao,
  correta,
}: {
  fraseAlvo: string
  transcricao: string
  correta: boolean
}) {
  const palavras = compararFala(fraseAlvo, transcricao)
  const algumaErrada = palavras.some((p) => !p.bate)

  return (
    <div className={`mt-1.5 text-sm ${correta ? 'text-emerald-700' : 'text-rose-700'}`}>
      <p>
        Ouvi:{' '}
        <i>
          “
          {palavras.map((p, i) => (
            <span
              key={i}
              className={p.bate ? undefined : 'font-bold underline decoration-wavy underline-offset-2'}
            >
              {p.palavra}
              {i < palavras.length - 1 ? ' ' : ''}
            </span>
          ))}
          ”
        </i>
      </p>
      {algumaErrada && <p className="mt-0.5 opacity-80">O sublinhado é o que saiu diferente da frase.</p>}
    </div>
  )
}


/**
 * O miolo da questão: enunciado + o componente de resposta do tipo.
 *
 * Extraído para que a PRÉ-VISUALIZAÇÃO do professor
 * (features/atividades/PreviewAtividadePage.tsx) mostre exatamente o que o
 * aluno vê, usando os mesmos componentes. Um preview que redesenha a tela por
 * conta própria mente na primeira divergência — e é justamente para conferir
 * antes de enviar que ele existe.
 */
export function CorpoDaQuestao({
  questao,
  feedback,
  aoResponder,
  aoFalar,
  aoLimparFeedback,
}: {
  questao: QuestaoTarefa
  feedback: FeedbackLocal | null
  aoResponder: (valor: string) => void
  aoFalar: (
    transcricao: string,
    audioBase64: string | null,
    mimeType: string | null,
    desistiu?: boolean,
  ) => Promise<{ ouviu: boolean }>
  aoLimparFeedback: () => void
}) {
  return (
    <>
      <Enunciado questao={questao} />

      {/* key por questão: cada componente de resposta guarda o que o aluno
          escolheu/digitou em estado próprio, e sem remontar esse valor
          vazaria para a questão seguinte. */}
      <div key={questao.id} className="mt-5">
        {questao.tipo === 'multipla_escolha' && (
          <RespostaOpcoes questao={questao} feedback={feedback} aoResponder={aoResponder} />
        )}
        {questao.tipo === 'verdadeiro_falso' && (
          <RespostaOpcoes
            questao={questao}
            feedback={feedback}
            aoResponder={aoResponder}
            rotulo={(o) => (o === 'true' ? 'Verdadeiro' : 'Falso')}
          />
        )}
        {/* Digitar saiu de cena (13/08/2026): campo livre em frase dava
            falso erro demais — sinônimo válido, grafia, acento, espaço. A
            lacuna agora é escolha em BOTÃO, com as alternativas em `opcoes`.
            O <RespostaTexto> sobrevive só para o acervo anterior, que não
            tem alternativas guardadas e ficaria sem como ser respondido. */}
        {(questao.tipo === 'lacuna' || questao.tipo === 'resposta_curta') &&
          ((questao.opcoes?.length ?? 0) >= 2 ? (
            <RespostaOpcoes questao={questao} feedback={feedback} aoResponder={aoResponder} />
          ) : (
            <RespostaTexto questao={questao} feedback={feedback} aoResponder={aoResponder} />
          ))}
        {questao.tipo === 'ordenar_palavras' && (
          <RespostaOrdenarPalavras questao={questao} feedback={feedback} aoResponder={aoResponder} />
        )}
        {/* Mesma montagem de `ordenar_palavras` — o que muda é a origem do
            estímulo (o navegador fala a frase) e as fichas distratoras, que
            já vêm misturadas em `opcoes`. */}
        {questao.tipo === 'ordenar_audio' && (
          <div className="space-y-3">
            <BotaoOuvir frase={questao.resposta_correta} audioUrl={questao.audio_url} />
            <RespostaOrdenarPalavras questao={questao} feedback={feedback} aoResponder={aoResponder} />
          </div>
        )}
        {questao.tipo === 'pronuncia' && (
          <RespostaPronuncia
            questao={questao}
            feedback={feedback}
            aoFalar={aoFalar}
            aoTentarNovamente={aoLimparFeedback}
          />
        )}
        {questao.tipo === 'ligar_colunas' && (
          <RespostaLigarColunas questao={questao} feedback={feedback} aoResponder={aoResponder} />
        )}
      </div>
    </>
  )
}

// ─── Cada tipo de resposta captura o valor à sua maneira e chama aoResponder ──

function RespostaOpcoes({
  questao,
  feedback,
  aoResponder,
  rotulo,
}: {
  questao: QuestaoTarefa
  feedback: FeedbackLocal | null
  aoResponder: (valor: string) => void
  rotulo?: (opcao: string) => string
}) {
  const [escolhida, setEscolhida] = useState<string | null>(null)

  function escolher(opcao: string) {
    if (feedback) return
    setEscolhida(opcao)
    aoResponder(opcao)
  }

  return (
    <div className="space-y-3">
      {questao.opcoes?.map((opcao, i) => {
        const escolhidaPeloAluno = escolhida === opcao
        const corretaRevelada = feedback && opcao === feedback.resposta_correta
        const acertou = escolhidaPeloAluno && feedback?.correta
        const errou = escolhidaPeloAluno && feedback && !feedback.correta

        const cor = !feedback
          ? FICHA_COR.neutra
          : acertou
            ? FICHA_COR.certa
            : errou
              ? FICHA_COR.errada
              : corretaRevelada
                ? FICHA_COR.certa
                : FICHA_COR.apagada

        return (
          <button
            key={opcao}
            disabled={Boolean(feedback)}
            onClick={() => escolher(opcao)}
            className={`${FICHA_BASE} flex w-full items-center gap-3 px-4 py-3.5 text-base md:text-lg ${cor}`}
          >
            {/* O número em caixinha é o atalho de teclado que o desktop
                merece e o "pega aqui" que o celular entende. Vira o
                veredito quando o feedback chega. */}
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 text-sm font-extrabold ${
                acertou || (corretaRevelada && !escolhidaPeloAluno)
                  ? 'border-emerald-400 bg-emerald-400 text-white'
                  : errou
                    ? 'border-rose-400 bg-rose-400 text-white'
                    : 'border-current opacity-40'
              }`}
            >
              {acertou || (corretaRevelada && !escolhidaPeloAluno) ? (
                <Check className="h-4 w-4" strokeWidth={3} />
              ) : errou ? (
                <X className="h-4 w-4" strokeWidth={3} />
              ) : (
                i + 1
              )}
            </span>
            <span className="min-w-0 flex-1 break-words">{rotulo ? rotulo(opcao) : opcao}</span>
            {/* Sem ícone extra, só um rótulo: a certa não deve competir com a
                resposta do aluno pela atenção. */}
            {corretaRevelada && !escolhidaPeloAluno && (
              <span className="shrink-0 text-xs font-extrabold uppercase tracking-wide">correta</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function RespostaTexto({
  questao,
  feedback,
  aoResponder,
}: {
  questao: QuestaoTarefa
  feedback: FeedbackLocal | null
  aoResponder: (valor: string) => void
}) {
  const [valor, setValor] = useState('')
  const temVoz = useTemVozEmIngles()

  // A dica só existe na lacuna: em `resposta_curta` a resposta é uma frase
  // inteira, e ouvi-la seria entregar tudo.
  const podeOuvirDica = questao.tipo === 'lacuna' && temVoz && !feedback

  return (
    <div>
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        disabled={Boolean(feedback)}
        placeholder="Digite sua resposta"
        className={`w-full rounded-2xl border-2 bg-white px-4 py-4 text-base font-bold outline-none transition placeholder:font-medium placeholder:text-neutral-300 md:text-lg ${
          !feedback
            ? 'border-neutral-200 focus:border-violet-400'
            : feedback.correta
              ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
              : 'border-rose-400 bg-rose-50 text-rose-900'
        }`}
      />
      {feedback && !feedback.correta && questao.tipo !== 'resposta_curta' && (
        <p className="mt-3 text-sm text-neutral-500">
          Resposta certa: <b className="text-neutral-800">{feedback.resposta_correta}</b>
        </p>
      )}

      {/* Ouvir a palavra destrava quem empacou sem entregar a escrita — o
          aluno ainda precisa soletrar. Some quando o aparelho não tem voz em
          inglês (ver vozDoNavegador.ts). */}
      {podeOuvirDica && (
        <button
          onClick={() => falarEmIngles(questao.resposta_correta)}
          className={`${BOTAO_CHUNKY} mt-3 w-full border-neutral-200 bg-white py-3 text-sm text-neutral-500 hover:bg-neutral-50`}
        >
          <Volume2 className="h-4 w-4" /> Travou? Ouvir a pronúncia
        </button>
      )}

      {!feedback && (
        <div className="mt-5">
          <BotaoPrincipal onClick={() => valor.trim() && aoResponder(valor.trim())} disabled={!valor.trim()}>
            Responder
          </BotaoPrincipal>
        </div>
      )}
    </div>
  )
}

function RespostaOrdenarPalavras({
  questao,
  feedback,
  aoResponder,
}: {
  questao: QuestaoTarefa
  feedback: FeedbackLocal | null
  aoResponder: (valor: string) => void
}) {
  const [escolhidas, setEscolhidas] = useState<string[]>([])
  const disponiveis = (questao.opcoes ?? []).filter((_, i) => !usadas(questao.opcoes ?? [], escolhidas).has(i))

  function usadas(opcoes: string[], escolhidasAtuais: string[]): Set<number> {
    const indices = new Set<number>()
    const restante = [...escolhidasAtuais]
    opcoes.forEach((palavra, i) => {
      const pos = restante.indexOf(palavra)
      if (pos !== -1) {
        indices.add(i)
        restante.splice(pos, 1)
      }
    })
    return indices
  }

  // As fichas montadas e as disponíveis são a MESMA peça: o que muda é a cor
  // depois do feedback. Tamanho igual dos dois lados para a ficha não
  // "encolher" ao subir para a frase.
  const ficha = `${FICHA_BASE} px-4 py-2.5 text-base md:text-lg`
  const corMontada = !feedback ? FICHA_COR.selecionada : feedback.correta ? FICHA_COR.certa : FICHA_COR.errada

  return (
    <div>
      {/* As linhas de caderno por trás são o "escreva aqui" do Duolingo: dão
          a altura de duas linhas mesmo com a área vazia, então a tela não
          pula quando a primeira palavra sobe. */}
      <div
        className="relative flex min-h-[7.5rem] flex-wrap content-start gap-2 py-2"
        style={{
          backgroundImage: 'linear-gradient(to bottom, transparent calc(100% - 2px), #e5e5e5 calc(100% - 2px))',
          backgroundSize: '100% 3.75rem',
        }}
      >
        {escolhidas.length === 0 && (
          <span className="self-center px-1 text-sm font-medium text-neutral-300">Toque nas palavras abaixo</span>
        )}
        {escolhidas.map((palavra, i) => (
          <button
            key={i}
            disabled={Boolean(feedback)}
            onClick={() => setEscolhidas((atual) => atual.filter((_, j) => j !== i))}
            className={`${ficha} ${corMontada}`}
          >
            {palavra}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        {disponiveis.map((palavra, i) => (
          <button
            key={i}
            disabled={Boolean(feedback)}
            onClick={() => setEscolhidas((atual) => [...atual, palavra])}
            className={`${ficha} ${feedback ? FICHA_COR.apagada : FICHA_COR.neutra}`}
          >
            {palavra}
          </button>
        ))}
      </div>

      {feedback && !feedback.correta && (
        <p className="mt-4 text-sm text-neutral-500">
          Frase certa: <b className="text-neutral-800">{feedback.resposta_correta}</b>
        </p>
      )}
      {!feedback && (
        <div className="mt-6">
          <BotaoPrincipal
            onClick={() => escolhidas.length && aoResponder(escolhidas.join(' '))}
            disabled={escolhidas.length === 0}
          >
            Responder
          </BotaoPrincipal>
        </div>
      )}
    </div>
  )
}

function RespostaLigarColunas({
  questao,
  feedback,
  aoResponder,
}: {
  questao: QuestaoTarefa
  feedback: FeedbackLocal | null
  aoResponder: (valor: string) => void
}) {
  const pares = questao.pares ?? []

  // Os dois lados embaralhados uma vez por questão (useMemo por id) — não a
  // cada re-render, senão as fichas trocariam de lugar sozinhas enquanto o
  // aluno joga. A esquerda carrega o índice de origem porque é ele, não a
  // posição na tela, que define a ordem do que enviamos.
  const esquerda = useMemo(
    () => embaralhar(pares.map((p, indice) => ({ indice, texto: p.esquerda }))),
    [questao.id],
  )
  const direita = useMemo(() => embaralhar(pares.map((p) => p.direita)), [questao.id])

  /** índice do par → posição da ficha da direita que fechou com ele. */
  const [fechados, setFechados] = useState<Map<number, number>>(new Map())
  /** índice do par → PRIMEIRA direita tentada para ele; é o que vira resposta. */
  const primeirasRef = useRef<Map<number, string>>(new Map())
  const [selecionado, setSelecionado] = useState<{ lado: 'esq' | 'dir'; pos: number } | null>(null)
  const [errando, setErrando] = useState<{ esq: number; dir: number } | null>(null)

  const travado = Boolean(feedback) || errando !== null
  const posicoesDireitaFechadas = new Set(fechados.values())

  function tocar(lado: 'esq' | 'dir', pos: number) {
    if (travado) return
    const jaFechada = lado === 'esq' ? fechados.has(esquerda[pos].indice) : posicoesDireitaFechadas.has(pos)
    if (jaFechada) return

    // Tocar de novo na mesma ficha desfaz; trocar de ideia no mesmo lado só
    // move a seleção — nenhum dos dois conta como tentativa.
    if (selecionado?.lado === lado) {
      setSelecionado(selecionado.pos === pos ? null : { lado, pos })
      return
    }
    if (!selecionado) {
      setSelecionado({ lado, pos })
      return
    }

    const posEsq = lado === 'esq' ? pos : selecionado.pos
    const posDir = lado === 'dir' ? pos : selecionado.pos
    const indicePar = esquerda[posEsq].indice
    const textoDireita = direita[posDir]
    setSelecionado(null)

    // Só a PRIMEIRA tentativa de cada item da esquerda entra na conta — é ela
    // que responde "o aluno sabia?", e é ela que enviamos ao servidor.
    if (!primeirasRef.current.has(indicePar)) {
      primeirasRef.current.set(indicePar, textoDireita)
    }

    if (pares[indicePar].direita !== textoDireita) {
      setErrando({ esq: posEsq, dir: posDir })
      setTimeout(() => setErrando(null), 620)
      return
    }

    const novos = new Map(fechados).set(indicePar, posDir)
    setFechados(novos)
    // Fechou o último par: a questão se responde sozinha, sem botão. O valor
    // enviado é o das primeiras tentativas, na ordem original de `pares`
    // (CONTRATO-QUESTOES.md §3) — daí a correção e a tela do professor
    // seguirem sem nenhuma mudança.
    if (novos.size === pares.length) {
      aoResponder(JSON.stringify(pares.map((_, i) => primeirasRef.current.get(i) ?? '')))
    }
  }

  const errosDePrimeira = pares.filter((p, i) => {
    const primeira = primeirasRef.current.get(i)
    return primeira !== undefined && primeira !== p.direita
  }).length
  const faltam = pares.length - fechados.size

  // Ordinal do par, na ordem em que o aluno fechou — é o que liga visualmente
  // as duas fichas depois que elas travam, no lugar de uma linha entre colunas.
  const numeroPorPar = new Map<number, number>()
  const numeroPorPosicaoDireita = new Map<number, number>()
  for (const [indicePar, posDireita] of fechados) {
    const numero = numeroPorPar.size + 1
    numeroPorPar.set(indicePar, numero)
    numeroPorPosicaoDireita.set(posDireita, numero)
  }

  return (
    <div>
      {/* Uma linha da grade = uma ficha de cada lado, mas os lados NÃO se
          correspondem: ambos estão embaralhados, e é o toque que liga. */}
      <div className="grid grid-cols-2 gap-3">
        {esquerda.map((item, pos) => (
          <Fragment key={item.indice}>
            <Ficha
              texto={item.texto}
              numero={numeroPorPar.get(item.indice)}
              selecionada={selecionado?.lado === 'esq' && selecionado.pos === pos}
              errando={errando?.esq === pos}
              travada={travado}
              aoTocar={() => tocar('esq', pos)}
            />
            <Ficha
              texto={direita[pos]}
              numero={numeroPorPosicaoDireita.get(pos)}
              selecionada={selecionado?.lado === 'dir' && selecionado.pos === pos}
              errando={errando?.dir === pos}
              travada={travado}
              aoTocar={() => tocar('dir', pos)}
            />
          </Fragment>
        ))}
      </div>

      {!feedback && (
        <p className="mt-4 text-center text-sm font-semibold text-neutral-400">
          {selecionado
            ? 'Agora toque no par do outro lado.'
            : faltam === pares.length
              ? 'Toque em uma palavra de cada lado para formar o par.'
              : `Boa! ${faltam === 1 ? 'Falta 1.' : `Faltam ${faltam}.`}`}
        </p>
      )}

      {/* Sem esta linha a tela se contradiz: a grade termina toda verde (par
          errado nunca gruda) enquanto o card do pai diz "Quase!". */}
      {feedback && !feedback.correta && errosDePrimeira > 0 && (
        <p className="mt-4 rounded-2xl bg-neutral-100 px-4 py-3 text-center text-sm font-medium text-neutral-600">
          Você fechou todos os pares, mas{' '}
          {errosDePrimeira === 1 ? 'errou 1 na primeira tentativa' : `errou ${errosDePrimeira} na primeira tentativa`}.
        </p>
      )}
    </div>
  )
}

/**
 * Ficha de ligar_colunas — a mesma dos dois lados. `numero` presente significa
 * par já fechado: ganha a bolinha verde (o que substitui a linha que ligaria
 * as colunas) e sai do jogo.
 */
function Ficha({
  texto,
  numero,
  selecionada,
  errando,
  travada,
  aoTocar,
}: {
  texto: string
  numero?: number
  selecionada: boolean
  errando: boolean
  travada: boolean
  aoTocar: () => void
}) {
  const fechada = numero !== undefined
  const aparencia = fechada
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : errando
      ? FICHA_COR.errando
      : selecionada
        ? FICHA_COR.selecionada
        : FICHA_COR.neutra

  return (
    <button
      type="button"
      aria-pressed={selecionada}
      disabled={travada || fechada}
      onClick={aoTocar}
      className={`${FICHA_BASE} flex min-h-14 items-center gap-2 px-3 py-3 text-base md:text-lg ${aparencia}`}
    >
      {fechada && (
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-xs font-extrabold text-white">
          {numero}
        </span>
      )}
      <span className="min-w-0 flex-1 break-words">{texto}</span>
    </button>
  )
}
