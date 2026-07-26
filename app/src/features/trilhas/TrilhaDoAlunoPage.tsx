import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import {
  useAlterarStatusNaTrilha,
  useReenviarEtapa,
  useTrilhaDoAluno,
  type EtapaDoAluno,
  type TrilhaDoAluno,
} from './api'
import { corDaNota, minutosEstimados } from '@/features/tarefa/formato'
import { corDoAvatar, inicial } from '@/lib/avatar'
import { linkWhatsapp } from '@/lib/whatsapp'
import { ROTULO_HABILIDADE } from '@/types/questao'

function dataCurta(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

/**
 * P13 — o professor acompanha onde o aluno está numa trilha, mas não controla
 * o avanço: as etapas seguintes já estão liberadas para ele (RF-132). A tela
 * existe para o professor saber **quando cobrar** e **o que reforçar**.
 */
export function TrilhaDoAlunoPage() {
  const { id: alunoId, trilhaId } = useParams<{ id: string; trilhaId: string }>()
  const { data, isLoading, error } = useTrilhaDoAluno(trilhaId, alunoId)

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Trilha não encontrada para este aluno.{' '}
        <Link to={`/alunos/${alunoId}`} className="font-bold underline">
          Voltar para a ficha
        </Link>
      </p>
    )
  }

  const percentual = data.etapas.length > 0 ? Math.round((data.concluidas / data.etapas.length) * 100) : 0
  const indiceAtual = data.etapas.findIndex((e) => !e.concluidaEm)
  const etapaAtual = indiceAtual >= 0 ? data.etapas[indiceAtual] : null
  const primeiroNome = data.alunoNome.split(' ')[0]

  return (
    <div>
      <p className="mb-3 text-xs font-medium text-neutral-400">
        <Link to="/alunos" className="hover:text-neutral-600">
          Alunos
        </Link>{' '}
        /{' '}
        <Link to={`/alunos/${alunoId}`} className="hover:text-neutral-600">
          {data.alunoNome}
        </Link>{' '}
        / <span className="text-neutral-700">Trilha</span>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-extrabold ${corDoAvatar(alunoId!)}`}
          >
            {inicial(data.alunoNome)}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold">{data.trilha.nome}</h1>
            <p className="text-sm text-neutral-500">
              {data.alunoNome} ·{' '}
              {etapaAtual ? `etapa ${etapaAtual.ordem} de ${data.etapas.length}` : 'trilha concluída'} ·
              começou em {dataCurta(data.iniciadaEm)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="rounded-3xl bg-white px-5 py-3 text-center">
            <p className="text-lg font-extrabold text-neutral-900">{percentual}%</p>
            <p className="text-xs font-medium text-neutral-500">concluído</p>
          </div>
          <a
            href={linkWhatsapp(
              `Oi ${primeiroNome}! Como está indo a trilha "${data.trilha.nome}"?`,
              data.alunoTelefone,
            )}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-bold text-white"
          >
            <MessageCircle className="h-4 w-4" /> Falar com {primeiroNome}
          </a>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 rounded-3xl bg-white p-5 lg:col-span-2">
          {data.etapas.map((etapa, i) => (
            <LinhaEtapa
              key={etapa.etapaId}
              etapa={etapa}
              atual={i === indiceAtual}
              ultima={i === data.etapas.length - 1}
              alunoNome={data.alunoNome}
              alunoTelefone={data.alunoTelefone}
            />
          ))}
        </div>

        <div className="min-w-0 space-y-4">
          <CartaoAtencao etapaAtual={etapaAtual} dados={data} />
          <CartaoDesempenho dados={data} />
          <CartaoAjustes dados={data} trilhaId={trilhaId!} alunoId={alunoId!} etapas={data.etapas} />
        </div>
      </div>
    </div>
  )
}

function LinhaEtapa({
  etapa,
  atual,
  ultima,
  alunoNome,
  alunoTelefone,
}: {
  etapa: EtapaDoAluno
  atual: boolean
  ultima: boolean
  alunoNome: string
  alunoTelefone: string | null
}) {
  const concluida = Boolean(etapa.concluidaEm)
  const percentual = etapa.total ? (etapa.acertos ?? 0) / etapa.total : 1
  const sugereReforco = concluida && percentual < 0.7
  const minutos = etapa.tempoMs ? Math.max(1, Math.round(etapa.tempoMs / 60000)) : null

  const marcador = concluida ? (
    <span
      className={`grid h-7 w-7 place-items-center rounded-full ${
        sugereReforco ? 'bg-amber-300 text-amber-900' : 'bg-emerald-300 text-emerald-900'
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

  return (
    <div className="flex gap-3">
      <div className="flex shrink-0 flex-col items-center">
        {marcador}
        {!ultima && <span className="my-1 flex-1 border-l-2 border-dashed border-neutral-200" />}
      </div>

      <div className={`min-w-0 flex-1 ${ultima ? '' : 'pb-4'}`}>
        {atual ? (
          <div className="relative overflow-hidden rounded-3xl bg-violet-200 p-5">
            <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-violet-300/60" />
            <span className="relative rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-extrabold text-violet-900">
              ETAPA ATUAL
            </span>
            <p className="relative mt-2 font-extrabold text-neutral-900">{etapa.titulo}</p>
            <p className="relative text-xs font-medium text-violet-900/70">
              {etapa.nivel} · {etapa.questoes} questões
              {etapa.enviadaEm && ` · enviada ${rotuloDias(diasDesde(etapa.enviadaEm))}`}
              {' · '}
              {etapa.iniciadaEm ? 'começou, não terminou' : 'não iniciada'}
            </p>
            <div className="relative mt-3 flex flex-wrap gap-2">
              <a
                href={linkWhatsapp(
                  `Oi ${alunoNome.split(' ')[0]}! Passando pra lembrar da etapa "${etapa.titulo}" 🙂`,
                  alunoTelefone,
                )}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Cobrar no WhatsApp
              </a>
              <Link
                to={`/atividades/${etapa.atividadeId}`}
                className="rounded-full bg-white px-4 py-2 text-xs font-bold text-neutral-700"
              >
                Ver atividade
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-bold text-neutral-900">
                <span className="truncate">{etapa.titulo}</span>
                {concluida && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${corDaNota(etapa.acertos ?? 0, etapa.total ?? 0)}`}
                  >
                    {etapa.acertos}/{etapa.total}
                  </span>
                )}
              </p>
              <p
                className={`text-xs font-medium ${sugereReforco ? 'text-amber-700' : 'text-neutral-400'}`}
              >
                {concluida
                  ? `Concluída em ${dataCurta(etapa.concluidaEm)}${minutos ? ` · ${minutos} min` : ''}${
                      sugereReforco ? ' · sugerido reforço' : ''
                    }`
                  : `${etapa.nivel} · ${etapa.questoes} questões · ~${minutosEstimados(etapa.questoes)} min · ${
                      etapa.atribuicaoId ? 'disponível, não iniciada' : 'ainda não atribuída'
                    }`}
              </p>
            </div>
            {concluida && etapa.atribuicaoId && (
              <Link
                to={`/resultados/${etapa.atribuicaoId}`}
                className="ml-auto shrink-0 text-xs font-bold text-violet-700 hover:underline"
              >
                ver respostas
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function rotuloDias(dias: number): string {
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}

/**
 * O alerta só aparece quando há um sinal real: a etapa atual está parada há
 * mais tempo do que o aluno costuma levar. Sem histórico não há como afirmar
 * que está atrasado, então o card não aparece.
 */
function CartaoAtencao({ etapaAtual, dados }: { etapaAtual: EtapaDoAluno | null; dados: TrilhaDoAluno }) {
  if (!etapaAtual?.enviadaEm) return null
  const parada = diasDesde(etapaAtual.enviadaEm)
  const tipico = dados.diasTipicosParaResponder
  if (tipico === null || parada <= Math.max(tipico, 1)) return null

  return (
    <div className="flex gap-2 rounded-3xl bg-amber-100 px-5 py-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div className="text-sm text-amber-900">
        <p className="font-bold">Atenção</p>
        <p className="mt-0.5">
          A etapa atual está parada {rotuloDias(parada)}.{' '}
          {dados.alunoNome.split(' ')[0]} costuma responder{' '}
          {tipico === 0 ? 'no mesmo dia' : `em ${tipico} ${tipico === 1 ? 'dia' : 'dias'}`}.
        </p>
      </div>
    </div>
  )
}

function CartaoDesempenho({ dados }: { dados: TrilhaDoAluno }) {
  if (dados.mediaPercentual === null) {
    return (
      <div className="rounded-3xl bg-white p-5">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-neutral-900">
          <TrendingUp className="h-4 w-4" /> Desempenho na trilha
        </h2>
        <p className="mt-2 text-sm text-neutral-400">Nenhuma etapa concluída ainda.</p>
      </div>
    )
  }

  return (
    <div className="rounded-3xl bg-white p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-neutral-900">
        <TrendingUp className="h-4 w-4" /> Desempenho na trilha
      </h2>
      <p className="mt-3 text-3xl font-extrabold text-neutral-900">{dados.mediaPercentual}%</p>
      <p className="text-xs font-medium text-neutral-500">
        média das {dados.concluidas} {dados.concluidas === 1 ? 'etapa concluída' : 'etapas concluídas'}
      </p>

      {dados.pontoFraco && (
        <>
          <div className="my-4 border-t border-neutral-100" />
          <p className="text-sm font-bold text-neutral-900">Habilidade com mais erros</p>
          <p className="text-sm text-neutral-500">
            {ROTULO_HABILIDADE[dados.pontoFraco as keyof typeof ROTULO_HABILIDADE] ?? dados.pontoFraco}
          </p>
          <Link
            to="/atividades/gerar"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3 text-sm font-extrabold text-white"
          >
            <Sparkles className="h-4 w-4" /> Gerar reforço
          </Link>
        </>
      )}
    </div>
  )
}

function CartaoAjustes({
  dados,
  trilhaId,
  alunoId,
  etapas,
}: {
  dados: TrilhaDoAluno
  trilhaId: string
  alunoId: string
  etapas: EtapaDoAluno[]
}) {
  const alterarStatus = useAlterarStatusNaTrilha(trilhaId)
  const reenviar = useReenviarEtapa(trilhaId, alunoId)
  const [linkGerado, setLinkGerado] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const pausada = dados.status === 'pausada'
  const primeiroNome = dados.alunoNome.split(' ')[0]

  // Reforço faz sentido no que já foi feito e foi mal — refazer uma etapa que
  // o aluno ainda nem abriu não é reforço, é duplicata.
  const paraReforcar = etapas.filter(
    (e) => e.concluidaEm && e.total && (e.acertos ?? 0) / e.total < 0.7,
  )

  return (
    <div className="rounded-3xl bg-white p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-neutral-900">
        <Settings className="h-4 w-4" /> Ajustes da trilha
      </h2>

      <div className="mt-3 space-y-1">
        <Link
          to={`/trilhas/${trilhaId}`}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          <Plus className="h-3.5 w-3.5 text-neutral-400" /> Adicionar etapa à trilha
        </Link>

        <button
          onClick={() => alterarStatus.mutate({ alunoId, status: pausada ? 'ativa' : 'pausada' })}
          disabled={alterarStatus.isPending}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          {pausada ? (
            <Play className="h-3.5 w-3.5 text-neutral-400" />
          ) : (
            <Pause className="h-3.5 w-3.5 text-neutral-400" />
          )}
          {pausada ? `Retomar trilha de ${primeiroNome}` : `Pausar trilha de ${primeiroNome}`}
        </button>

        {paraReforcar.map((e) => (
          <button
            key={e.etapaId}
            onClick={async () =>
              setLinkGerado(await reenviar.mutateAsync({ etapaId: e.etapaId, atividadeId: e.atividadeId }))
            }
            disabled={reenviar.isPending}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            <RefreshCw className="h-3.5 w-3.5 text-neutral-400" /> Reenviar etapa {e.ordem}
          </button>
        ))}
      </div>

      {linkGerado && (
        <div className="mt-3 rounded-2xl bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-800">
            Etapa reenviada. {primeiroNome} vê no painel; o link abaixo serve se ele não tiver conta.
          </p>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(linkGerado)
              setCopiado(true)
              setTimeout(() => setCopiado(false), 2000)
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-xs font-bold text-neutral-700"
          >
            {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copiado ? 'Copiado' : 'Copiar link'}
          </button>
        </div>
      )}
    </div>
  )
}
