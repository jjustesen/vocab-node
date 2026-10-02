import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, X } from 'lucide-react'
import { useAlunos } from '@/features/alunos/api'
import { corDoAvatar, inicial } from '@/lib/avatar'
import { corDaNota } from '@/features/tarefa/formato'
import { useTodasConcluidas, type AtribuicaoConcluida } from './api'

/**
 * Todas as entregas, e não só as seis do cartão.
 *
 * Antes, o "ver todos" levava para /atividades — que lista as ATIVIDADES da
 * biblioteca, não o que os alunos entregaram, e o professor caía numa tela
 * que não respondia à pergunta que o trouxe até ali. Aqui a lista continua a
 * do cartão, só que inteira: agrupada por dia, filtrável por aluno, e cada
 * linha abre o resultado.
 */
export function TodasConcluidasModal({ aoFechar }: { aoFechar: () => void }) {
  const [alunoId, setAlunoId] = useState<string | null>(null)
  const { data: alunos } = useAlunos('ativo')
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useTodasConcluidas(alunoId)

  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [aoFechar])

  const entregas = data?.pages.flat() ?? []
  const dias = agruparPorDia(entregas)

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-neutral-950/60 p-3 sm:place-items-center sm:p-6"
      onClick={aoFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tarefas concluídas"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white"
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-neutral-100 px-5 py-4">
          <h2 className="flex-1 text-base font-extrabold text-neutral-900">Concluídas</h2>
          <label className="flex items-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-700">
            <span className="sr-only">Filtrar por aluno</span>
            <select
              value={alunoId ?? ''}
              onChange={(e) => setAlunoId(e.target.value || null)}
              className="cursor-pointer appearance-none rounded-full bg-transparent py-2 pr-4 pl-4 outline-none"
            >
              <option value="">Todos os alunos</option>
              {(alunos ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            title="Fechar"
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            </div>
          )}

          {error && (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Não consegui carregar as entregas. Tente de novo em instantes.
            </p>
          )}

          {!isLoading && !error && entregas.length === 0 && (
            <p className="py-10 text-center text-sm text-neutral-400">
              {alunoId ? 'Este aluno ainda não concluiu nenhuma tarefa.' : 'Nada concluído ainda.'}
            </p>
          )}

          <div className="space-y-5">
            {dias.map(({ dia, itens }) => (
              <section key={dia}>
                <h3 className="mb-2 text-xs font-extrabold tracking-wider text-neutral-400 uppercase">
                  {rotuloDoDia(dia)}
                </h3>
                <div className="space-y-1">
                  {itens.map((c) => (
                    <Link
                      key={c.atribuicaoId}
                      to={`/resultados/${c.atribuicaoId}`}
                      className="flex items-center gap-2.5 rounded-2xl px-2 py-2 text-sm transition hover:bg-neutral-50"
                    >
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold ${corDoAvatar(c.alunoId)}`}
                      >
                        {inicial(c.alunoNome)}
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate font-bold text-neutral-900">{c.alunoNome}</span>
                        <span className="block truncate text-xs text-neutral-400">
                          {c.atividadeTitulo} · {horaDe(c.concluidaEm)}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${corDaNota(c.acertos, c.total)}`}
                      >
                        {c.acertos}/{c.total}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {hasNextPage && (
            <button
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="mx-auto mt-5 flex items-center gap-1.5 rounded-full bg-neutral-100 px-4 py-2 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-50"
            >
              {isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Carregar mais
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Mantém a ordem (mais recente primeiro) e junta por dia LOCAL, não UTC. */
function agruparPorDia(entregas: AtribuicaoConcluida[]) {
  const grupos: { dia: string; itens: AtribuicaoConcluida[] }[] = []
  for (const c of entregas) {
    const dia = new Date(c.concluidaEm).toLocaleDateString('sv-SE') // AAAA-MM-DD no fuso do navegador
    const ultimo = grupos.at(-1)
    if (ultimo?.dia === dia) ultimo.itens.push(c)
    else grupos.push({ dia, itens: [c] })
  }
  return grupos
}

function rotuloDoDia(dia: string): string {
  const hoje = new Date().toLocaleDateString('sv-SE')
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE')
  if (dia === hoje) return 'Hoje'
  if (dia === ontem) return 'Ontem'
  const [ano, mes, d] = dia.split('-').map(Number)
  const data = new Date(ano, mes - 1, d)
  return data.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    ...(ano !== new Date().getFullYear() && { year: 'numeric' }),
  })
}

function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
