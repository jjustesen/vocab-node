import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Milestone, Plus, Search, Send, X } from 'lucide-react'
import { CORES_NIVEL } from '@/features/atividades/visual-atividade'
import { useTrilhas, type TrilhaComProgresso } from '@/features/trilhas/api'
import { ModalAtribuir } from '@/features/trilhas/TrilhaDetalhePage'
import { CompletarNaTurma } from './CompletarNaTurma'
import { useConteudosDaTurma } from './conteudos'

/**
 * As trilhas da turma, na aba Tarefas — irmã de `TarefasDaTurma`.
 *
 * A lista é o que foi enviado PARA A TURMA (0020) — não as trilhas que os
 * membros fazem por fora. Cada aluno tem a sua (é ele que responde), e quem
 * entrar depois recebe sozinho.
 *
 * Enviar daqui é o `ModalAtribuir` da própria trilha, com a turma já
 * escolhida como destino.
 */
export function TrilhasDaTurma({ turmaId, alunoIds }: { turmaId: string; alunoIds: string[] }) {
  const { data: trilhas, isLoading } = useTrilhas()
  const { data: conteudos, isLoading: carregandoConteudos } = useConteudosDaTurma(turmaId)
  const [escolhendo, setEscolhendo] = useState(false)
  const [enviando, setEnviando] = useState<TrilhaComProgresso | null>(null)

  const membros = useMemo(() => new Set(alunoIds), [alunoIds])
  const trilhaPorId = new Map((trilhas ?? []).map((t) => [t.id, t]))
  const daTurma = (conteudos?.trilhaIds ?? []).flatMap((id) => {
    const t = trilhaPorId.get(id)
    return t ? [{ trilha: t, naTurma: t.progresso.filter((p) => membros.has(p.alunoId)) }] : []
  })

  return (
    <div className="rounded-3xl bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold text-neutral-900">
          Trilhas da turma {conteudos && <span className="text-neutral-400">· {daTurma.length}</span>}
        </h2>
        <button
          onClick={() => setEscolhendo(true)}
          className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Enviar trilha
        </button>
      </div>

      {isLoading || carregandoConteudos ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
        </div>
      ) : daTurma.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-neutral-50 px-4 py-6 text-center">
          <Milestone className="mx-auto h-5 w-5 text-neutral-300" />
          <p className="mt-2 text-xs text-neutral-500">Nenhuma trilha enviada para esta turma ainda.</p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100">
          {daTurma.map(({ trilha, naTurma }) => {
            const faltamReceber = alunoIds.length - naTurma.length
            // Terminou = todas as etapas concluídas. Sobre o tamanho da turma,
            // pelo mesmo motivo das tarefas: "2/2" esconderia quem nem recebeu.
            const terminaram = naTurma.filter((p) => p.total > 0 && p.concluidas >= p.total).length
            const tudoFeito = terminaram === alunoIds.length
            return (
              <li key={trilha.id} className="flex items-center gap-2">
                <Link
                  to={`/trilhas/${trilha.id}`}
                  className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-3 transition hover:bg-neutral-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-800">
                    <Milestone className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-neutral-900">{trilha.nome}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      {trilha.etapas} {trilha.etapas === 1 ? 'etapa' : 'etapas'}
                      {faltamReceber > 0 && (
                        <span className="font-medium text-amber-700">
                          {' '}
                          · {faltamReceber} {faltamReceber === 1 ? 'não recebeu' : 'não receberam'}
                        </span>
                      )}
                    </span>
                  </span>
                  {alunoIds.length > 0 && (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${
                        tudoFeito ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'
                      }`}
                      title="Quantos da turma terminaram a trilha"
                    >
                      {terminaram}/{alunoIds.length}
                    </span>
                  )}
                </Link>
                {faltamReceber > 0 && (
                  <CompletarNaTurma turmaId={turmaId} faltam={faltamReceber} />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {escolhendo && (
        <EscolherTrilha
          aoFechar={() => setEscolhendo(false)}
          aoEscolher={(t) => {
            setEscolhendo(false)
            setEnviando(t)
          }}
        />
      )}

      {enviando && (
        <ModalAtribuir
          trilhaId={enviando.id}
          trilhaNome={enviando.nome}
          temEtapas={enviando.etapas > 0}
          turmaId={turmaId}
          aoFechar={() => setEnviando(null)}
        />
      )}
    </div>
  )
}

/** Primeiro passo do envio pela turma: qual trilha vai. */
function EscolherTrilha({
  aoEscolher,
  aoFechar,
}: {
  aoEscolher: (trilha: TrilhaComProgresso) => void
  aoFechar: () => void
}) {
  const { data: trilhas, isLoading } = useTrilhas()
  const [busca, setBusca] = useState('')

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (trilhas ?? []).filter((t) => !termo || t.nome.toLowerCase().includes(termo))
  }, [trilhas, busca])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">Enviar trilha para a turma</h2>
            <p className="text-sm text-neutral-500">Escolha a trilha. Ela vai para a turma inteira, inclusive quem entrar depois — quem já está nela segue de onde parou.</p>
          </div>
          <button onClick={aoFechar} aria-label="Fechar" className="shrink-0 text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar trilha…"
            className="w-full rounded-2xl bg-neutral-100 py-2.5 pr-3 pl-10 text-sm outline-none ring-neutral-900 focus:ring-2"
          />
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
            </div>
          )}
          {!isLoading && filtradas.length === 0 && (
            <p className="py-6 text-center text-xs text-neutral-500">
              {busca ? `Nenhuma trilha para “${busca}”.` : 'Você ainda não criou nenhuma trilha.'}
            </p>
          )}
          <ul className="space-y-1">
            {filtradas.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => aoEscolher(t)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-neutral-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-neutral-900">{t.nome}</span>
                    <span className="text-[11px] text-neutral-400">
                      {t.etapas} {t.etapas === 1 ? 'etapa' : 'etapas'}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${CORES_NIVEL[t.nivel]}`}>
                    {t.nivel}
                  </span>
                  <Send className="h-4 w-4 shrink-0 text-neutral-300" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <Link
          to="/trilhas"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-neutral-100 px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200"
        >
          <Plus className="h-3.5 w-3.5" /> Criar uma trilha nova
        </Link>
      </div>
    </div>
  )
}
