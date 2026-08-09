import { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ChevronRight, Clock, Loader2, LogOut, Milestone, Play, TrendingUp } from 'lucide-react'
import { useAlunoAuth } from '@/features/aluno-auth/AlunoAuthProvider'
import { corDaNota, minutosEstimados } from '@/features/tarefa/formato'
import { guardarMotivoDaSaida } from '@/lib/motivo-saida'
import { usePainelAluno, ContaNaoEDeAluno, type TrilhaDoAluno } from './api'

/** /painel — RF-28. Tudo vem de painel-aluno-obter; nenhuma tabela é lida direto (ver lib/supabase-aluno.ts). */
export function PainelAlunoPage() {
  const { sair } = useAlunoAuth()
  const { data, isLoading, error } = usePainelAluno()

  // Professor que entrou pela porta do aluno: a senha confere (mesmo GoTrue),
  // mas não existe aluno nenhum por trás. Derruba a sessão em vez de deixar a
  // pessoa parada numa tela de erro — sem isso ela fica "logada" num app que
  // não tem nada para mostrar, e nem o botão de sair aparece.
  const contaNaoEDeAluno = error instanceof ContaNaoEDeAluno
  useEffect(() => {
    if (!contaNaoEDeAluno) return
    // Grava ANTES de sair: derrubar a sessão dispara o redirect do guard pai,
    // e a partir daí esta tela já não decide mais para onde se vai.
    guardarMotivoDaSaida('conta-de-professor')
    void sair()
  }, [contaNaoEDeAluno, sair])
  if (contaNaoEDeAluno) return <Navigate to="/entrar-aluno" replace />

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-6 text-center">
        <p className="font-bold text-neutral-800">Não consegui carregar seu painel.</p>
      </div>
    )
  }

  const mediaAcertos =
    data.concluidas.length > 0
      ? Math.round(
          (data.concluidas.reduce((soma, c) => soma + (c.total ? c.acertos / c.total : 0), 0) /
            data.concluidas.length) *
            100,
        )
      : null

  /**
   * Qual tarefa merece o destaque: a de prazo mais próximo; sem prazo nenhum,
   * a primeira da lista — que a Edge Function já devolve por `enviada_em`
   * decrescente, ou seja, a lição da aula mais recente. Prazo ganha de
   * "recente" porque é o único sinal de urgência real que o aluno tem.
   *
   * `toSorted` não muta `data.pendentes` — a lista vem do cache do react-query
   * e ordenar no lugar sujaria o estado compartilhado com as outras telas.
   */
  const ordenadas = data.pendentes.toSorted((a, b) => {
    if (a.prazo && b.prazo) return a.prazo.localeCompare(b.prazo)
    if (a.prazo) return -1
    if (b.prazo) return 1
    return 0
  })
  const [destaque, ...resto] = ordenadas

  return (
    <div className="min-h-dvh bg-areia px-5 pb-10 pt-6">
      <div className="mx-auto max-w-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-extrabold text-neutral-900">Oi, {data.alunoNome.split(' ')[0]}</h1>
            <p className="text-xs font-medium text-neutral-500">com {data.professorNome}</p>
          </div>
          <button
            onClick={sair}
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-neutral-400 hover:text-neutral-700"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {data.trilhas.map((t) => (
          <CartaoTrilha key={t.id} trilha={t} />
        ))}

        {data.pendentes.length === 0 ? (
          <>
            <p className="mb-2 mt-6 text-xs font-extrabold uppercase tracking-wider text-neutral-400">
              Para fazer
            </p>
            <p className="rounded-3xl bg-white px-4 py-5 text-center text-sm text-neutral-400">
              Nenhuma tarefa pendente agora.
            </p>
          </>
        ) : (
          <>
            {/* UMA tarefa em destaque. O resto vira lista compacta logo abaixo:
                com 5+ pendentes, cards pretos iguais viravam uma parede em que
                nada se destacava — e o aluno tem 5-15 min no celular, à noite.
                A pergunta que a tela responde é "o que eu faço agora?". */}
            <p className="mb-2 mt-6 text-xs font-extrabold uppercase tracking-wider text-neutral-400">
              Sua vez
            </p>
            <Link
              to={`/painel/tarefa/${destaque.atribuicaoId}`}
              className="relative block overflow-hidden rounded-3xl bg-neutral-900 p-5 text-white"
            >
              <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-violet-500/30" />
              <p className="relative font-extrabold">{destaque.titulo}</p>
              <p className="relative mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
                <Clock className="h-3.5 w-3.5" />
                {destaque.totalQuestoes} {destaque.totalQuestoes === 1 ? 'questão' : 'questões'} · ~
                {minutosEstimados(destaque.totalQuestoes)} min
                {destaque.prazo && ` · prazo ${new Date(destaque.prazo).toLocaleDateString('pt-BR')}`}
              </p>
              <span className="relative mt-4 flex w-fit items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-neutral-900">
                <Play className="h-3.5 w-3.5" /> Começar
              </span>
            </Link>

            {/* Sem botão repetido: a linha inteira é o alvo de toque (>=44px,
                RNF-06). Repetir "Começar" cinco vezes era o que fazia todas as
                tarefas gritarem no mesmo volume. */}
            {resto.length > 0 && (
              <>
                <p className="mb-2 mt-6 text-xs font-extrabold uppercase tracking-wider text-neutral-400">
                  Depois ({resto.length})
                </p>
                <div className="space-y-2">
                  {resto.map((t) => (
                    <Link
                      key={t.atribuicaoId}
                      to={`/painel/tarefa/${t.atribuicaoId}`}
                      className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-neutral-800">{t.titulo}</span>
                        <span className="mt-0.5 block text-xs text-neutral-400">
                          {t.totalQuestoes} {t.totalQuestoes === 1 ? 'questão' : 'questões'} · ~
                          {minutosEstimados(t.totalQuestoes)} min
                          {t.prazo && ` · prazo ${new Date(t.prazo).toLocaleDateString('pt-BR')}`}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Histórico é consulta, não ação: fechado por padrão para não crescer
            para sempre por cima do que o aluno veio fazer. A média fica na
            própria linha do resumo — é o número que motiva, e assim ele aparece
            sem ocupar um bloco só dele. */}
        {data.concluidas.length > 0 && (
          <details className="group mt-6">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl bg-white px-4 py-3.5 [&::-webkit-details-marker]:hidden">
              {/* `group-open:` não é gerado pelo Tailwind v4 deste projeto (só
                  pelo CDN v3 da landing) — a variante arbitrária abaixo vira
                  `.group[open] &` e funciona nos dois. */}
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-[[open]]:rotate-90" />
              <span className="text-sm font-bold text-neutral-800">
                Já feitas ({data.concluidas.length})
              </span>
              {mediaAcertos !== null && (
                <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-extrabold text-violet-900">
                  <TrendingUp className="h-3.5 w-3.5" /> {mediaAcertos}%
                </span>
              )}
            </summary>
            <div className="mt-2 space-y-2 text-sm">
              {data.concluidas.map((c) => (
                <div
                  key={c.atribuicaoId}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3.5"
                >
                  <span className="min-w-0 flex-1 truncate font-bold text-neutral-800">{c.titulo}</span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${corDaNota(c.acertos, c.total)}`}
                  >
                    {c.acertos}/{c.total}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

/**
 * RF-138: resumo da trilha no painel. A linha de etapas completa fica em
 * /painel/trilha/:id (A6) — no painel só o essencial, para a trilha não
 * empurrar as tarefas soltas para fora da primeira tela.
 */
function CartaoTrilha({ trilha }: { trilha: TrilhaDoAluno }) {
  const pausada = trilha.status === 'pausada'
  const percentual = trilha.etapas.length > 0 ? (trilha.concluidas / trilha.etapas.length) * 100 : 0
  const atual = trilha.etapas.find((e) => !e.concluidaEm)

  return (
    <Link
      to={`/painel/trilha/${trilha.id}`}
      className={`relative mt-6 block overflow-hidden rounded-3xl p-5 ${pausada ? 'bg-neutral-200' : 'bg-violet-200'}`}
    >
      <span className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-violet-300/60" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold text-violet-900">
            <Milestone className="h-3.5 w-3.5" /> Trilha
          </p>
          <h2 className="mt-0.5 truncate font-extrabold text-neutral-900">{trilha.nome}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-xs font-extrabold text-violet-900">
          {trilha.concluidas}/{trilha.etapas.length}
        </span>
      </div>

      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-white/60">
        <div
          className={`h-full rounded-full ${pausada ? 'bg-neutral-400' : 'bg-violet-600'}`}
          style={{ width: `${percentual}%` }}
        />
      </div>

      <p className="relative mt-2.5 truncate text-xs font-semibold text-violet-900/70">
        {pausada
          ? 'Seu professor pausou esta trilha por enquanto.'
          : atual
            ? `Próxima: ${atual.titulo}`
            : 'Trilha concluída!'}
      </p>
    </Link>
  )
}
