import { Check, UsersRound } from 'lucide-react'
import { useTurmasComMembros } from './api'
import type { Destinos } from './turmas-do-envio'

/**
 * As turmas como DESTINO do envio — uma fileira acima da lista de alunos.
 *
 * Escolher uma turma não é marcar cinco nomes: é mandar para a turma. O item
 * passa a ser dela, os membros recebem e ficam travados na lista (ver
 * `useDestinos`), e quem entrar depois recebe também. Por isso uma turma sem
 * ninguém ainda aparece e pode ser escolhida: o conteúdo espera os alunos.
 */
export function AtalhosDeTurma({ destinos }: { destinos: Destinos }) {
  const { data: turmas } = useTurmasComMembros()
  if (!turmas || turmas.length === 0) return null

  const escolhidas = new Set(destinos.turmaIds)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-extrabold tracking-wide text-neutral-400 uppercase">Turmas</span>
      {turmas.map((t) => {
        const escolhida = escolhidas.has(t.id)
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => destinos.alternarTurma(t.id)}
            title={
              escolhida
                ? `Não enviar para ${t.nome}`
                : `Enviar para ${t.nome} — todos da turma recebem, inclusive quem entrar depois`
            }
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              escolhida ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-800 hover:bg-violet-100'
            }`}
          >
            {escolhida ? <Check className="h-3.5 w-3.5" /> : <UsersRound className="h-3.5 w-3.5" />}
            {t.nome}
            <span className={escolhida ? 'text-violet-200' : 'text-violet-400'}>{t.alunoIds.length}</span>
          </button>
        )
      })}
    </div>
  )
}
