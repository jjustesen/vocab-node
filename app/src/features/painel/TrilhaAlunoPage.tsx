import { Link, useParams } from 'react-router-dom'
import { Check, ChevronLeft, Clock, Loader2, Milestone, Play, Trophy, Unlock } from 'lucide-react'
import { usePainelAluno, type EtapaDaTrilha, type TrilhaDoAluno } from './api'
import { corDaNota, minutosEstimados } from '@/features/tarefa/formato'

/**
 * A6 — a trilha inteira numa tela, como uma linha do tempo.
 *
 * Nada aqui é bloqueado (RF-132): a etapa atual ganha destaque, mas todas as
 * seguintes já podem ser abertas — é o que permite o aluno emendar a trilha
 * inteira numa sentada. A "atual" é derivada aqui, na leitura: a primeira sem
 * conclusão. Não existe campo `etapa_atual` no banco.
 */
export function TrilhaAlunoPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = usePainelAluno()

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  const trilha = data?.trilhas.find((t) => t.id === id)
  if (!trilha) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-6 text-center">
        <div>
          <p className="font-bold text-neutral-800">Trilha não encontrada.</p>
          <Link to="/painel" className="mt-2 inline-block text-sm font-bold text-violet-700 underline">
            Voltar para o painel
          </Link>
        </div>
      </div>
    )
  }

  const indiceAtual = trilha.etapas.findIndex((e) => !e.concluidaEm)
  const pausada = trilha.status === 'pausada'

  return (
    <div className="min-h-dvh bg-areia px-5 pb-10 pt-4">
      <div className="mx-auto max-w-sm">
        <Link to="/painel" className="flex items-center gap-2 text-neutral-400">
          <ChevronLeft className="h-5 w-5" />
          <span className="text-sm font-bold text-neutral-500">Minha trilha</span>
        </Link>

        <CabecalhoTrilha trilha={trilha} professorNome={data!.professorNome} pausada={pausada} />

        <div className="mt-5">
          {trilha.etapas.map((etapa, i) => (
            <LinhaEtapa
              key={etapa.ordem}
              etapa={etapa}
              atual={i === indiceAtual}
              ultima={i === trilha.etapas.length - 1}
              bloqueadaPorPausa={pausada}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CabecalhoTrilha({
  trilha,
  professorNome,
  pausada,
}: {
  trilha: TrilhaDoAluno
  professorNome: string
  pausada: boolean
}) {
  const percentual = trilha.etapas.length > 0 ? (trilha.concluidas / trilha.etapas.length) * 100 : 0

  return (
    <div
      className={`relative mt-3 overflow-hidden rounded-3xl p-5 ${pausada ? 'bg-neutral-200' : 'bg-violet-200'}`}
    >
      <span className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-violet-300/60" />
      <span className="relative grid h-10 w-10 place-items-center rounded-2xl bg-white text-violet-700">
        <Milestone className="h-5 w-5" />
      </span>
      <h1 className="relative mt-2 text-lg font-extrabold text-neutral-900">{trilha.nome}</h1>
      <p className="relative text-xs font-semibold text-violet-900/70">
        com {professorNome} · nível {trilha.nivel}
      </p>

      <div className="relative mt-3 flex items-center gap-2">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/60">
          <div
            className={`h-full rounded-full ${pausada ? 'bg-neutral-400' : 'bg-violet-600'}`}
            style={{ width: `${percentual}%` }}
          />
        </div>
        <span className="text-xs font-extrabold text-violet-900">
          {trilha.concluidas}/{trilha.etapas.length}
        </span>
      </div>

      <p className="relative mt-2 flex items-center gap-1.5 text-xs font-semibold text-violet-900/70">
        <Unlock className="h-3.5 w-3.5" />
        {pausada
          ? 'Seu professor pausou esta trilha por enquanto.'
          : 'Todas as etapas liberadas — faça no seu ritmo'}
      </p>
    </div>
  )
}

function LinhaEtapa({
  etapa,
  atual,
  ultima,
  bloqueadaPorPausa,
}: {
  etapa: EtapaDaTrilha
  atual: boolean
  ultima: boolean
  bloqueadaPorPausa: boolean
}) {
  const concluida = Boolean(etapa.concluidaEm)
  const percentual = etapa.total ? (etapa.acertos ?? 0) / etapa.total : 1
  // Concluída com nota baixa vira convite a refazer, não repreensão.
  const daPraMelhorar = concluida && percentual < 0.7
  const clicavel = etapa.atribuicaoId && !bloqueadaPorPausa

  const marcador = concluida ? (
    <span
      className={`grid h-7 w-7 place-items-center rounded-full ${
        daPraMelhorar ? 'bg-amber-300 text-amber-900' : 'bg-emerald-300 text-emerald-900'
      }`}
    >
      <Check className="h-3.5 w-3.5" />
    </span>
  ) : atual ? (
    <span className="grid h-7 w-7 place-items-center rounded-full bg-neutral-900 text-white">
      <Play className="h-3 w-3" />
    </span>
  ) : ultima ? (
    <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-200 text-amber-800">
      <Trophy className="h-3 w-3" />
    </span>
  ) : (
    <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-neutral-200 bg-white text-xs font-extrabold text-neutral-400">
      {etapa.ordem}
    </span>
  )

  const cartao = atual ? (
    <div className="relative overflow-hidden rounded-3xl bg-neutral-900 p-5 text-white">
      <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-violet-500/30" />
      <span className="relative rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-extrabold">SUA VEZ</span>
      <p className="relative mt-2 text-base font-extrabold">{etapa.titulo}</p>
      <p className="relative mt-0.5 flex items-center gap-1.5 text-xs font-medium text-neutral-400">
        <Clock className="h-3.5 w-3.5" /> {etapa.totalQuestoes} questões · ~
        {minutosEstimados(etapa.totalQuestoes)} min
      </p>
      {clicavel && (
        <span className="relative mt-3 flex w-fit items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-neutral-900">
          <Play className="h-3.5 w-3.5" /> Começar
        </span>
      )}
    </div>
  ) : (
    <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-neutral-800">{etapa.titulo}</p>
        <p
          className={`text-xs font-medium ${daPraMelhorar ? 'font-semibold text-amber-700' : 'text-neutral-400'}`}
        >
          {concluida
            ? daPraMelhorar
              ? 'dá pra melhorar — refazer?'
              : 'concluída'
            : `${etapa.totalQuestoes} questões · ~${minutosEstimados(etapa.totalQuestoes)} min`}
        </p>
      </div>
      {concluida ? (
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${corDaNota(etapa.acertos ?? 0, etapa.total ?? 0)}`}
        >
          {etapa.acertos}/{etapa.total}
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-extrabold text-neutral-600">
          Fazer
        </span>
      )}
    </div>
  )

  return (
    <div className="flex gap-3">
      <div className="flex shrink-0 flex-col items-center">
        {marcador}
        {!ultima && <span className="my-1 flex-1 border-l-2 border-dashed border-neutral-300" />}
      </div>
      <div className={`min-w-0 flex-1 ${ultima ? '' : 'pb-2.5'}`}>
        {clicavel ? (
          <Link to={`/painel/tarefa/${etapa.atribuicaoId}`} className="block">
            {cartao}
          </Link>
        ) : (
          cartao
        )}
      </div>
    </div>
  )
}
