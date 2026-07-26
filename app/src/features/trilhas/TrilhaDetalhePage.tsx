import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Info,
  Loader2,
  Milestone,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Trash2,
  Unlock,
  UserPlus,
  X,
} from 'lucide-react'
import {
  useAdicionarEtapa,
  useAlterarStatusNaTrilha,
  useAlunosDaTrilha,
  useAtribuirTrilha,
  useDuplicarTrilha,
  useEtapasDaTrilha,
  useExcluirTrilha,
  useRemoverAlunoDaTrilha,
  useRemoverEtapa,
  useReordenarEtapas,
  useTrilha,
  type EtapaComAtividade,
  type LinkDaEtapa,
  type ProgressoAluno,
} from './api'
import { useAlunos, useAlunosComConta } from '@/features/alunos/api'
import { useAtividades } from '@/features/atividades/api'
import { corDoAvatar, inicial } from '@/lib/avatar'
import type { Aluno, TrilhaEtapa } from '@/types/db'

export function TrilhaDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const { data: trilha, isLoading, error } = useTrilha(id)
  const { data: etapas } = useEtapasDaTrilha(id)
  const { data: alunosNaTrilha } = useAlunosDaTrilha(id)
  const excluir = useExcluirTrilha()
  const duplicar = useDuplicarTrilha()
  const [menuAberto, setMenuAberto] = useState(false)
  const [modalAtividade, setModalAtividade] = useState(false)
  const [modalAluno, setModalAluno] = useState(false)

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (error || !trilha) {
    return (
      <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Trilha não encontrada.{' '}
        <Link to="/trilhas" className="font-bold underline">
          Voltar
        </Link>
      </p>
    )
  }

  return (
    <div>
      <p className="mb-3 text-xs font-medium text-neutral-400">
        <Link to="/trilhas" className="hover:text-neutral-600">
          Trilhas
        </Link>{' '}
        / <span className="text-neutral-700">{trilha.nome}</span>
      </p>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold">
            {trilha.nome}
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-extrabold text-violet-700">
              {trilha.nivel}
            </span>
          </h1>
          {trilha.descricao && <p className="mt-1 max-w-xl text-sm text-neutral-500">{trilha.descricao}</p>}
        </div>

        <div className="relative flex shrink-0 items-center gap-2">
          <button
            onClick={() => setModalAluno(true)}
            className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            <UserPlus className="h-4 w-4" /> Atribuir a alunos
          </button>
          <button
            onClick={() => setMenuAberto((v) => !v)}
            title="Mais ações"
            className="grid h-10 w-10 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-500"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuAberto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
              <div className="absolute right-0 top-12 z-20 w-52 rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-neutral-200">
                <button
                  onClick={async () => {
                    setMenuAberto(false)
                    const nova = await duplicar.mutateAsync(trilha)
                    navegar(`/trilhas/${nova.id}`)
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-neutral-700 hover:bg-neutral-100"
                >
                  <Copy className="h-3.5 w-3.5" /> Duplicar trilha
                </button>
                <button
                  onClick={async () => {
                    setMenuAberto(false)
                    await excluir.mutateAsync(trilha.id)
                    navegar('/trilhas')
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir trilha
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-neutral-900">
              <Milestone className="h-4 w-4" /> Sequência da trilha
            </h2>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">
              <Unlock className="h-3.5 w-3.5" /> Todas liberadas para o aluno
            </span>
          </div>

          <div className="rounded-3xl bg-white p-5">
            {etapas && etapas.length > 0 ? (
              <Sequencia trilhaId={trilha.id} etapas={etapas} />
            ) : (
              <p className="py-6 text-center text-sm text-neutral-400">
                Nenhuma etapa ainda. Adicione atividades da sua biblioteca.
              </p>
            )}

            <button
              onClick={() => setModalAtividade(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 py-3 text-sm font-bold text-neutral-500 transition hover:border-neutral-400"
            >
              <Plus className="h-4 w-4" /> Adicionar atividade
            </button>
          </div>

          <div className="mt-3 flex gap-2.5 rounded-2xl bg-amber-100 px-4 py-3 text-xs text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <span>
              <b>A ordem é um roteiro, não uma trava.</b> O aluno recebe a trilha inteira liberada e faz
              uma etapa por vez, na ordem sugerida — mas pode emendar tudo numa sentada ou pular uma
              etapa. Você não precisa liberar nada.
            </span>
          </div>
        </section>

        <section className="min-w-0">
          <h2 className="mb-2 text-sm font-bold text-neutral-900">
            Alunos{' '}
            {alunosNaTrilha && alunosNaTrilha.length > 0 && (
              <span className="font-medium text-neutral-400">· {alunosNaTrilha.length}</span>
            )}
          </h2>
          {alunosNaTrilha && alunosNaTrilha.length > 0 ? (
            <div className="space-y-2">
              {alunosNaTrilha.map((p) => (
                <LinhaAluno key={p.alunoId} trilhaId={trilha.id} progresso={p} />
              ))}
            </div>
          ) : (
            <p className="rounded-3xl bg-white px-5 py-8 text-center text-sm text-neutral-400">
              Ninguém nesta trilha ainda.
            </p>
          )}
        </section>
      </div>

      {modalAtividade && (
        <ModalAdicionarAtividade
          trilhaId={trilha.id}
          jaNaTrilha={new Set((etapas ?? []).map((e) => e.atividade_id))}
          aoFechar={() => setModalAtividade(false)}
        />
      )}
      {modalAluno && (
        <ModalAtribuir
          trilhaId={trilha.id}
          temEtapas={(etapas ?? []).length > 0}
          aoFechar={() => setModalAluno(false)}
        />
      )}
    </div>
  )
}

/**
 * Reordenação por setas, não arrastar: o HTML5 drag-and-drop não funciona em
 * toque, e o app é usado no celular (RNF-06). Sem biblioteca de DnD, setas
 * dão o mesmo resultado em qualquer dispositivo.
 */
function Sequencia({ trilhaId, etapas }: { trilhaId: string; etapas: EtapaComAtividade[] }) {
  const reordenar = useReordenarEtapas(trilhaId)
  const remover = useRemoverEtapa(trilhaId)

  function mover(indice: number, direcao: -1 | 1) {
    const nova = [...etapas]
    const destino = indice + direcao
    if (destino < 0 || destino >= nova.length) return
    ;[nova[indice], nova[destino]] = [nova[destino], nova[indice]]
    reordenar.mutate(nova as TrilhaEtapa[])
  }

  return (
    <div>
      {etapas.map((etapa, i) => (
        <div key={etapa.id} className="flex gap-3">
          <div className="flex shrink-0 flex-col items-center">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-300 text-xs font-extrabold text-violet-900">
              {i + 1}
            </span>
            {i < etapas.length - 1 && <span className="my-1 flex-1 border-l-2 border-dashed border-neutral-200" />}
          </div>

          {/* min-w-0 no flex item: sem isso o título não encolhe e os três
              botões de ação empurram a linha para fora da tela no celular. */}
          <div className="mb-2 flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-3">
            <Link to={`/atividades/${etapa.atividade_id}`} className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-neutral-800">{etapa.atividadeTitulo}</p>
              <p className="text-xs font-medium text-neutral-400">
                {etapa.atividadeNivel} · {etapa.questoes} {etapa.questoes === 1 ? 'questão' : 'questões'}
              </p>
            </Link>

            <button
              onClick={() => mover(i, -1)}
              disabled={i === 0 || reordenar.isPending}
              title="Subir"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-200 disabled:opacity-25"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => mover(i, 1)}
              disabled={i === etapas.length - 1 || reordenar.isPending}
              title="Descer"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-200 disabled:opacity-25"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              onClick={() => remover.mutate(etapa.id)}
              disabled={remover.isPending}
              title="Tirar da trilha"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-300 hover:bg-rose-50 hover:text-rose-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function LinhaAluno({ trilhaId, progresso }: { trilhaId: string; progresso: ProgressoAluno }) {
  const alterarStatus = useAlterarStatusNaTrilha(trilhaId)
  const removerAluno = useRemoverAlunoDaTrilha(trilhaId)
  const percentual = progresso.total > 0 ? (progresso.concluidas / progresso.total) * 100 : 0
  const pausada = progresso.status === 'pausada'

  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="flex items-center gap-2.5">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold ${corDoAvatar(progresso.alunoId)}`}
        >
          {inicial(progresso.alunoNome)}
        </span>
        <Link to={`/alunos/${progresso.alunoId}`} className="min-w-0 flex-1 truncate text-sm font-bold text-neutral-800">
          {progresso.alunoNome}
        </Link>
        <span className="shrink-0 text-xs font-extrabold text-neutral-500">
          {progresso.concluidas}/{progresso.total}
        </span>
      </div>

      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full ${pausada ? 'bg-neutral-400' : 'bg-violet-500'}`}
          style={{ width: `${percentual}%` }}
        />
      </div>

      <div className="mt-2.5 flex items-center gap-1">
        <button
          onClick={() =>
            alterarStatus.mutate({ alunoId: progresso.alunoId, status: pausada ? 'ativa' : 'pausada' })
          }
          disabled={alterarStatus.isPending}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-neutral-500 hover:bg-neutral-100"
        >
          {pausada ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {pausada ? 'Retomar' : 'Pausar'}
        </button>
        <button
          onClick={() => removerAluno.mutate(progresso.alunoId)}
          disabled={removerAluno.isPending}
          className="ml-auto rounded-full px-2.5 py-1 text-xs font-bold text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
        >
          Remover
        </button>
      </div>
    </div>
  )
}

function ModalAdicionarAtividade({
  trilhaId,
  jaNaTrilha,
  aoFechar,
}: {
  trilhaId: string
  jaNaTrilha: Set<string>
  aoFechar: () => void
}) {
  const { data: atividades } = useAtividades()
  const adicionar = useAdicionarEtapa(trilhaId)
  const [busca, setBusca] = useState('')

  const termo = busca.trim().toLowerCase()
  const visiveis = (atividades ?? []).filter((a) => !termo || a.titulo.toLowerCase().includes(termo))

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold">Adicionar atividade</h2>
            <p className="text-sm text-neutral-500">Da sua biblioteca — a trilha não cria conteúdo novo.</p>
          </div>
          <button onClick={aoFechar} className="text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar atividade..."
          className="mt-4 w-full rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm outline-none ring-neutral-900 focus:ring-2"
        />

        <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
          {visiveis.length === 0 && (
            <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
              Nenhuma atividade encontrada.
            </p>
          )}
          {visiveis.map((a) => {
            const repetida = jaNaTrilha.has(a.id)
            return (
              <button
                key={a.id}
                onClick={async () => {
                  await adicionar.mutateAsync(a.id)
                  aoFechar()
                }}
                disabled={adicionar.isPending}
                className="flex w-full items-center gap-3 rounded-2xl bg-neutral-50 px-4 py-2.5 text-left transition hover:bg-neutral-100 disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-neutral-800">{a.titulo}</span>
                  <span className="text-xs text-neutral-400">
                    {a.nivel} · {a.questoes} {a.questoes === 1 ? 'questão' : 'questões'}
                    {repetida && ' · já está na trilha'}
                  </span>
                </span>
                <Plus className="h-4 w-4 shrink-0 text-neutral-400" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ModalAtribuir({
  trilhaId,
  temEtapas,
  aoFechar,
}: {
  trilhaId: string
  temEtapas: boolean
  aoFechar: () => void
}) {
  const { data: alunos } = useAlunos('ativo')
  const { data: comConta } = useAlunosComConta()
  const atribuir = useAtribuirTrilha(trilhaId)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [links, setLinks] = useState<LinkDaEtapa[] | null>(null)

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  const escolhidos: Aluno[] = (alunos ?? []).filter((a) => selecionados.has(a.id))
  const semConta = escolhidos.filter((a) => !comConta?.has(a.id))

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold">Atribuir trilha</h2>
            <p className="text-sm text-neutral-500">Todas as etapas são enviadas de uma vez.</p>
          </div>
          <button onClick={aoFechar} className="text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!links ? (
          <>
            <div className="mt-4 max-h-56 space-y-1.5 overflow-y-auto">
              {alunos?.length === 0 && (
                <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
                  Nenhum aluno cadastrado ainda.
                </p>
              )}
              {alunos?.map((a) => {
                const marcado = selecionados.has(a.id)
                return (
                  <button
                    key={a.id}
                    onClick={() => alternar(a.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition ${
                      marcado ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-700'
                    }`}
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                        marcado ? 'bg-white text-neutral-900' : corDoAvatar(a.id)
                      }`}
                    >
                      {inicial(a.nome)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{a.nome}</span>
                  </button>
                )
              })}
            </div>

            {semConta.length > 0 && (
              <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                {semConta.map((a) => a.nome.split(' ')[0]).join(', ')}{' '}
                {semConta.length === 1 ? 'não tem conta' : 'não têm conta'} — sem conta, a trilha não
                aparece no painel do aluno; só os links de cada etapa, que você recebe aqui depois de
                atribuir.
              </p>
            )}

            {atribuir.error && (
              <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
                {(atribuir.error as Error).message}
              </p>
            )}

            <button
              onClick={async () => setLinks(await atribuir.mutateAsync(escolhidos))}
              disabled={selecionados.size === 0 || !temEtapas || atribuir.isPending}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-extrabold text-white disabled:opacity-40"
            >
              {atribuir.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {temEtapas
                ? `Atribuir a ${selecionados.size || ''} ${selecionados.size === 1 ? 'aluno' : 'alunos'}`
                : 'Adicione uma etapa primeiro'}
            </button>
          </>
        ) : (
          <div className="mt-4">
            <p className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
              Trilha atribuída. Quem tem conta já vê a sequência no painel; os links abaixo servem para
              quem não tem.
            </p>
            <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
              {links.map((l) => (
                <div key={l.link} className="flex items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-neutral-700">
                      {l.alunoNome.split(' ')[0]} · etapa {l.ordem}
                    </span>
                    <span className="block truncate text-xs text-neutral-400">{l.atividadeTitulo}</span>
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(l.link)}
                    title="Copiar link"
                    className="shrink-0 rounded-xl bg-white p-2 text-neutral-600"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={aoFechar}
              className="mt-4 w-full rounded-full bg-neutral-900 py-3 text-sm font-extrabold text-white"
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
