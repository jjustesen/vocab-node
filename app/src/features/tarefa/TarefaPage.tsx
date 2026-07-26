import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
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
  X,
  XCircle,
} from 'lucide-react'
import { apiTarefa, mensagemDeErro } from '@/lib/api-tarefa'
import { embaralhar } from '@/lib/embaralhar'
import { inicial } from '@/lib/avatar'
import { corrigir } from '@/types/questao'
import { useAlunoAuthOpcional } from '@/features/aluno-auth/AlunoAuthProvider'
import { minutosEstimados } from './formato'
import { BotaoPrincipal, Chip, TelaAluno } from './visual'
import type { ConcluirResposta, FeedbackLocal, IdentificadorTarefa, QuestaoTarefa, TarefaObterResposta } from './tipos'

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

  if (tela === 'intro') {
    return <TelaIntro dados={dados} aoComecar={() => setTela('respondendo')} />
  }

  // Só quem tem sessão tem para onde voltar (o painel). Por link anônimo a
  // tarefa é a única tela do app.
  const aoSair = atribuicaoId ? () => navegar('/painel') : null

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
      aoAvancar={proxima}
      aoSair={aoSair}
    />
  )
}

// ────────────────────────────────────────────────────────────────────────

/** A1 — abertura do link. O nome do professor é o que dá confiança na tela. */
function TelaIntro({ dados, aoComecar }: { dados: TarefaObterResposta; aoComecar: () => void }) {
  const primeiroNome = dados.aluno_nome.split(' ')[0]

  return (
    <div className="min-h-dvh bg-areia pb-10">
      <div className="mx-auto max-w-sm">
        {/* Raio de 32px na base — igual à sobreposição do card (-mt-8), que é o
            máximo que cabe: acima disso a curva sobe além da faixa coberta pelo
            card e abre falhas de fundo areia ao lado dos cantos dele. */}
        <div className="relative overflow-hidden rounded-b-[2rem] bg-violet-200 px-6 pb-14 pt-10 text-center">
          <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-violet-300/60" />
          <span className="absolute -left-8 top-16 h-20 w-20 rounded-full bg-white/40" />
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
          <div className="relative -mt-8 rounded-3xl bg-white p-6 text-center shadow-lg">
            <h1 className="text-lg font-extrabold text-neutral-900">{dados.atividade.titulo}</h1>
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
    <TelaAluno comFormas>
      <div className="pt-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-emerald-200">
          <PartyPopper className="h-7 w-7 text-emerald-800" />
        </span>

        <p className="mt-5 text-5xl font-extrabold text-neutral-900">
          {resultado.acertos}
          <span className="text-3xl text-neutral-300">/{resultado.total}</span>
        </p>
        <p className="mt-2 text-lg font-extrabold text-neutral-900">
          {proxima
            ? `Etapa ${proxima.ordem - 1} concluída!`
            : percentual >= 80
              ? `Mandou bem, ${alunoNome.split(' ')[0]}!`
              : percentual >= 50
                ? `Bom trabalho, ${alunoNome.split(' ')[0]}!`
                : 'Continue praticando!'}
        </p>

        <div className="mt-5 flex justify-center gap-2.5">
          {minutos && (
            <div className="rounded-2xl bg-white px-4 py-3">
              <Clock className="mx-auto h-3.5 w-3.5 text-neutral-400" />
              <p className="mt-1 text-sm font-extrabold text-neutral-900">{minutos} min</p>
            </div>
          )}
          {melhorSequencia > 1 && (
            <div className="rounded-2xl bg-amber-100 px-4 py-3">
              <Flame className="mx-auto h-3.5 w-3.5 text-amber-700" />
              <p className="mt-1 text-sm font-extrabold text-amber-900">{melhorSequencia} seguidas</p>
            </div>
          )}
          <div className="rounded-2xl bg-emerald-100 px-4 py-3">
            <TrendingUp className="mx-auto h-3.5 w-3.5 text-emerald-700" />
            <p className="mt-1 text-sm font-extrabold text-emerald-900">{percentual}% de acerto</p>
          </div>
        </div>

        {proxima && <CartaoProximaEtapa proxima={proxima} aoContinuar={aoContinuar} />}

        {!proxima && erros > 0 && (
          <div className="mt-6">
            <BotaoPrincipal onClick={aoRefazerErros}>
              <RotateCcw className="h-4 w-4" /> Refazer {erros === 1 ? 'o erro' : `os ${erros} erros`}
            </BotaoPrincipal>
          </div>
        )}

        {aoSair && (
          <button onClick={aoSair} className="mt-1 w-full rounded-full py-3 text-sm font-bold text-neutral-500">
            {proxima ? 'Parar por aqui' : 'Concluir'}
          </button>
        )}
        {proxima && <p className="text-xs font-medium text-neutral-400">Você pode voltar quando quiser</p>}

        <p className="mt-3 flex items-center justify-center gap-1 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> {professorNome} já recebeu seu resultado
        </p>
      </div>
    </TelaAluno>
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
  aoAvancar,
  aoSair,
}: {
  questao: QuestaoTarefa
  numero: number
  total: number
  sequencia: number
  feedback: FeedbackLocal | null
  repassandoErros: boolean
  aoResponder: (valor: string) => void
  aoAvancar: () => void
  aoSair: (() => void) | null
}) {
  const progresso = Math.round(((numero - 1) / total) * 100)

  return (
    <div className="min-h-dvh bg-areia px-5 pb-10 pt-4">
      <div className="mx-auto max-w-sm">
        <div className="flex items-center gap-3">
          {aoSair ? (
            <button onClick={aoSair} title="Sair da tarefa" className="shrink-0 text-neutral-400">
              <X className="h-4 w-4" />
            </button>
          ) : (
            // Sem sessão não há para onde voltar — a tarefa é a única tela.
            <span className="w-0" />
          )}
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${progresso}%` }} />
          </div>
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-extrabold ${
              sequencia > 0 ? 'bg-amber-200 text-amber-900' : 'bg-white text-neutral-400'
            }`}
          >
            <Flame className="h-3.5 w-3.5" /> {sequencia}
          </span>
        </div>
        <p className="mt-2 text-xs font-bold text-neutral-400">
          {repassandoErros ? 'Revisando · ' : ''}Questão {numero} de {total}
        </p>
        {repassandoErros && numero === 1 && (
          <p className="mt-1 text-xs font-medium text-neutral-400">
            É só treino — sua nota já foi enviada e não muda.
          </p>
        )}

        <h2 className="mt-4 text-lg font-extrabold leading-snug text-neutral-900">{questao.enunciado}</h2>

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
          {(questao.tipo === 'lacuna' || questao.tipo === 'resposta_curta') && (
            <RespostaTexto questao={questao} feedback={feedback} aoResponder={aoResponder} />
          )}
          {questao.tipo === 'ordenar_palavras' && (
            <RespostaOrdenarPalavras questao={questao} feedback={feedback} aoResponder={aoResponder} />
          )}
          {questao.tipo === 'ligar_colunas' && (
            <RespostaLigarColunas questao={questao} feedback={feedback} aoResponder={aoResponder} />
          )}
        </div>

        {feedback && (
          <>
            {/* O tom nunca é punitivo: no erro o card é rosa claro e a
                explicação vem antes de qualquer cobrança (mockup A2b). */}
            <div
              className={`mt-4 flex gap-2.5 rounded-2xl px-4 py-3 ${
                feedback.correta ? 'bg-emerald-100' : 'bg-rose-100'
              }`}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white">
                {feedback.correta ? (
                  <PartyPopper className="h-3.5 w-3.5 text-emerald-700" />
                ) : (
                  <Lightbulb className="h-3.5 w-3.5 text-rose-600" />
                )}
              </span>
              <div>
                <p
                  className={`text-sm font-extrabold ${
                    feedback.correta ? 'text-emerald-900' : 'text-rose-900'
                  }`}
                >
                  {feedback.correta ? 'Boa!' : 'Quase!'}
                </p>
                <p className={`mt-0.5 text-xs ${feedback.correta ? 'text-emerald-800' : 'text-rose-800'}`}>
                  {feedback.explicacao}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <BotaoPrincipal onClick={aoAvancar}>
                {numero === total ? 'Ver resultado' : feedback.correta ? 'Próxima' : 'Entendi, próxima'}
                <ArrowRight className="h-4 w-4" />
              </BotaoPrincipal>
            </div>
          </>
        )}
      </div>
    </div>
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
    <div className="space-y-2.5">
      {questao.opcoes?.map((opcao) => {
        const escolhidaPeloAluno = escolhida === opcao
        const corretaRevelada = feedback && opcao === feedback.resposta_correta
        const acertou = escolhidaPeloAluno && feedback?.correta
        const errou = escolhidaPeloAluno && feedback && !feedback.correta

        const estilo = !feedback
          ? 'bg-white text-neutral-600'
          : acertou
            ? 'bg-emerald-200 font-extrabold text-emerald-950'
            : errou
              ? 'bg-rose-200 font-extrabold text-rose-950'
              : corretaRevelada
                ? 'bg-emerald-100 text-emerald-900'
                : 'bg-white text-neutral-400'

        return (
          <button
            key={opcao}
            disabled={Boolean(feedback)}
            onClick={() => escolher(opcao)}
            className={`flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3.5 text-left text-sm font-bold transition ${estilo}`}
          >
            <span className="min-w-0 flex-1 break-words">{rotulo ? rotulo(opcao) : opcao}</span>
            {acertou && (
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white">
                <Check className="h-3.5 w-3.5 text-emerald-700" />
              </span>
            )}
            {errou && (
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white">
                <X className="h-3.5 w-3.5 text-rose-600" />
              </span>
            )}
            {/* Sem ícone, só um rótulo: a certa não deve competir com a
                resposta do aluno pela atenção. */}
            {corretaRevelada && !escolhidaPeloAluno && (
              <span className="shrink-0 text-xs font-semibold">correta</span>
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

  return (
    <div>
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        disabled={Boolean(feedback)}
        placeholder="Digite sua resposta"
        className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3.5 text-sm outline-none focus:border-indigo-500 disabled:bg-neutral-50"
      />
      {feedback && !feedback.correta && questao.tipo !== 'resposta_curta' && (
        <p className="mt-2 text-xs text-neutral-500">
          Resposta certa: <b className="text-neutral-700">{feedback.resposta_correta}</b>
        </p>
      )}
      {!feedback && (
        <button
          onClick={() => valor.trim() && aoResponder(valor.trim())}
          disabled={!valor.trim()}
          className="mt-3 w-full rounded-2xl bg-neutral-900 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          Responder
        </button>
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

  return (
    <div>
      <div className="flex min-h-14 flex-wrap gap-2 rounded-2xl border-2 border-dashed border-neutral-200 p-3">
        {escolhidas.length === 0 && <span className="text-sm text-neutral-300">Toque nas palavras abaixo</span>}
        {escolhidas.map((palavra, i) => (
          <button
            key={i}
            disabled={Boolean(feedback)}
            onClick={() => setEscolhidas((atual) => atual.filter((_, j) => j !== i))}
            className="rounded-xl bg-indigo-100 px-3 py-1.5 text-sm font-semibold text-indigo-800"
          >
            {palavra}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {disponiveis.map((palavra, i) => (
          <button
            key={i}
            disabled={Boolean(feedback)}
            onClick={() => setEscolhidas((atual) => [...atual, palavra])}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700"
          >
            {palavra}
          </button>
        ))}
      </div>

      {feedback && !feedback.correta && (
        <p className="mt-2 text-xs text-neutral-500">
          Frase certa: <b className="text-neutral-700">{feedback.resposta_correta}</b>
        </p>
      )}
      {!feedback && (
        <button
          onClick={() => escolhidas.length && aoResponder(escolhidas.join(' '))}
          disabled={escolhidas.length === 0}
          className="mt-3 w-full rounded-2xl bg-neutral-900 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          Responder
        </button>
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
  const esquerda = useMemo(() => pares.map((p) => p.esquerda), [pares])
  // Embaralhado uma vez por questão (useMemo por id) — não a cada re-render,
  // senão as opções trocariam de lugar sozinhas enquanto o aluno escolhe.
  const direita = useMemo(() => embaralhar(pares.map((p) => p.direita)), [questao.id])
  const [escolhas, setEscolhas] = useState<(string | null)[]>(() => esquerda.map(() => null))

  const completo = escolhas.length === esquerda.length && escolhas.every((e) => e !== null)

  return (
    <div className="space-y-2">
      {esquerda.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2/5 truncate text-sm font-medium text-neutral-700">{item}</span>
          <select
            value={escolhas[i] ?? ''}
            disabled={Boolean(feedback)}
            onChange={(e) => setEscolhas((atual) => atual.map((v, j) => (j === i ? e.target.value : v)))}
            className="w-3/5 rounded-xl border-2 border-neutral-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          >
            <option value="" disabled>
              Selecione…
            </option>
            {direita.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      ))}

      {feedback && !feedback.correta && feedback.pares_corretos && (
        <div className="mt-2 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
          <p className="mb-1 font-bold text-neutral-500">Pares corretos:</p>
          {feedback.pares_corretos.map((p, i) => (
            <p key={i}>
              {p.esquerda} → {p.direita}
            </p>
          ))}
        </div>
      )}

      {!feedback && (
        <button
          onClick={() => completo && aoResponder(JSON.stringify(escolhas))}
          disabled={!completo}
          className="mt-1 w-full rounded-2xl bg-neutral-900 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          Responder
        </button>
      )}
    </div>
  )
}
