import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Loader2, Plus, Search, Send, X } from 'lucide-react'
import { useAtividades, type AtividadeComEnvio } from '@/features/atividades/api'
import { EnvioModal } from '@/features/atividades/EnvioModal'
import { CORES_NIVEL } from '@/features/atividades/visual-atividade'
import { BotaoApagar } from '@/components/BotaoApagar'
import { useTarefasDaTurma } from './api'
import { CompletarNaTurma } from './CompletarNaTurma'
import { useTirarDaTurma } from './conteudos'

/**
 * A aba de tarefas da turma: o que foi enviado PARA ELA (0020) e o botão de
 * mandar mais.
 *
 * Enviar daqui é o EnvioModal com a turma já escolhida como destino: a
 * atividade vira da turma, cada membro recebe a sua (é ele que responde e tem
 * a nota) e quem entrar depois recebe também. Uma turma ainda vazia já pode
 * receber — o conteúdo espera os alunos.
 */
export function TarefasDaTurma({ turmaId, alunoIds }: { turmaId: string; alunoIds: string[] }) {
  const { data: tarefas, isLoading } = useTarefasDaTurma(turmaId, alunoIds)
  const [escolhendo, setEscolhendo] = useState(false)
  const [enviando, setEnviando] = useState<AtividadeComEnvio | null>(null)
  const tirar = useTirarDaTurma(turmaId)
  const tirando = tirar.isPending && tirar.variables && 'atividadeId' in tirar.variables ? tirar.variables.atividadeId : null

  return (
    <div className="rounded-3xl bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold text-neutral-900">
          Tarefas da turma {tarefas && <span className="text-neutral-400">· {tarefas.length}</span>}
        </h2>
        <button
          onClick={() => setEscolhendo(true)}
          className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Enviar tarefa
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
        </div>
      ) : !tarefas || tarefas.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-neutral-50 px-4 py-6 text-center">
          <ClipboardList className="mx-auto h-5 w-5 text-neutral-300" />
          <p className="mt-2 text-xs text-neutral-500">Nenhuma tarefa enviada para esta turma ainda.</p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100">
          {tarefas.map((t) => {
            const faltamReceber = alunoIds.length - t.receberam
            const tudoFeito = t.concluiram === alunoIds.length
            return (
              <li key={t.atividadeId} className="flex items-center gap-2">
                <Link
                  to={`/atividades/${t.atividadeId}`}
                  className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-3 transition hover:bg-neutral-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800">
                    <ClipboardList className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-neutral-900">{t.titulo}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      enviada {dataCurta(t.enviadaEm)}
                      {t.prazo && ` · prazo ${dataCurta(t.prazo)}`}
                      {faltamReceber > 0 && (
                        <span className="font-medium text-amber-700">
                          {' '}
                          · {faltamReceber} {faltamReceber === 1 ? 'não recebeu' : 'não receberam'}
                        </span>
                      )}
                    </span>
                  </span>
                  {/* Concluíram sobre o tamanho da turma, e não sobre quem
                      recebeu: "3/3" esconderia os dois que nem receberam. */}
                  {alunoIds.length > 0 && (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${
                        tudoFeito ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'
                      }`}
                      title="Quantos da turma concluíram"
                    >
                      {t.concluiram}/{alunoIds.length}
                    </span>
                  )}
                </Link>
                {faltamReceber > 0 && (
                  <CompletarNaTurma turmaId={turmaId} faltam={faltamReceber} />
                )}
                <BotaoApagar
                  titulo="Tirar da turma — sai de quem não concluiu; a atividade continua na sua biblioteca"
                  confirmacao="Tirar da turma?"
                  pendente={tirando === t.atividadeId}
                  aoConfirmar={() => tirar.mutate({ atividadeId: t.atividadeId })}
                />
              </li>
            )
          })}
        </ul>
      )}

      {escolhendo && (
        <EscolherAtividade
          aoFechar={() => setEscolhendo(false)}
          aoEscolher={(a) => {
            setEscolhendo(false)
            setEnviando(a)
          }}
        />
      )}

      {enviando && (
        <EnvioModal
          atividadeId={enviando.id}
          atividadeTitulo={enviando.titulo}
          turmaId={turmaId}
          aoFechar={() => setEnviando(null)}
        />
      )}
    </div>
  )
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

/** Primeiro passo do envio pela turma: qual atividade da biblioteca vai. */
function EscolherAtividade({
  aoEscolher,
  aoFechar,
}: {
  aoEscolher: (atividade: AtividadeComEnvio) => void
  aoFechar: () => void
}) {
  const { data: atividades, isLoading } = useAtividades()
  const [busca, setBusca] = useState('')

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (atividades ?? []).filter((a) => !termo || a.titulo.toLowerCase().includes(termo))
  }, [atividades, busca])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">Enviar tarefa para a turma</h2>
            <p className="text-sm text-neutral-500">Escolha a atividade. Ela vai para a turma inteira, inclusive quem entrar depois.</p>
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
            placeholder="Buscar atividade…"
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
              {busca ? `Nenhuma atividade para “${busca}”.` : 'Sua biblioteca ainda está vazia.'}
            </p>
          )}
          <ul className="space-y-1">
            {filtradas.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => aoEscolher(a)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-neutral-50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-neutral-900">{a.titulo}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${CORES_NIVEL[a.nivel]}`}>
                    {a.nivel}
                  </span>
                  <Send className="h-4 w-4 shrink-0 text-neutral-300" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <Link
          to="/atividades/nova"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-neutral-100 px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200"
        >
          <Plus className="h-3.5 w-3.5" /> Criar uma atividade nova
        </Link>
      </div>
    </div>
  )
}
