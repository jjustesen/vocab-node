import { Check, UsersRound } from 'lucide-react'
import { useTurmasComMembros } from './api'

/**
 * "Marcar a turma inteira" — uma fileira de turmas acima de qualquer lista de
 * escolha de aluno.
 *
 * Mandar o material da aula para a turma "Adults 1" não pode ser caçar cinco
 * nomes numa lista de quarenta: o professor pensa em turma, e a lista pensa em
 * aluno. O atalho só MARCA — quem continua decidindo é a lista, então dá para
 * marcar a turma e desmarcar quem faltou.
 *
 * Clicar numa turma já toda marcada desmarca a turma: o mesmo botão desfaz o
 * que fez, sem precisar achar os cinco de novo.
 *
 * @param indisponiveis quem não conta (ex.: já recebeu o material). A turma
 *   em que todos os que sobram estão marcados aparece como marcada.
 */
export function AtalhosDeTurma({
  marcados,
  aoMudar,
  indisponiveis,
}: {
  marcados: Set<string>
  aoMudar: (novos: Set<string>) => void
  indisponiveis?: Set<string>
}) {
  const { data: turmas } = useTurmasComMembros()
  const comGente = (turmas ?? []).filter((t) => t.alunoIds.length > 0)
  if (comGente.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-extrabold tracking-wide text-neutral-400 uppercase">Turmas</span>
      {comGente.map((t) => {
        const elegiveis = t.alunoIds.filter((id) => !indisponiveis?.has(id))
        const inteira = elegiveis.length > 0 && elegiveis.every((id) => marcados.has(id))
        return (
          <button
            key={t.id}
            type="button"
            disabled={elegiveis.length === 0}
            onClick={() => {
              const novos = new Set(marcados)
              for (const id of elegiveis) {
                if (inteira) novos.delete(id)
                else novos.add(id)
              }
              aoMudar(novos)
            }}
            title={
              elegiveis.length === 0
                ? `Todos de ${t.nome} já têm`
                : inteira
                  ? `Desmarcar ${t.nome}`
                  : `Marcar os ${elegiveis.length} de ${t.nome}`
            }
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-40 ${
              inteira
                ? 'bg-violet-600 text-white'
                : 'bg-violet-50 text-violet-800 hover:bg-violet-100'
            }`}
          >
            {inteira ? <Check className="h-3.5 w-3.5" /> : <UsersRound className="h-3.5 w-3.5" />}
            {t.nome}
            <span className={inteira ? 'text-violet-200' : 'text-violet-400'}>{t.alunoIds.length}</span>
          </button>
        )
      })}
    </div>
  )
}
