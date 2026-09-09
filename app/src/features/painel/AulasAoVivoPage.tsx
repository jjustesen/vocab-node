import { Link } from 'react-router-dom'
import { ChevronRight, Loader2, User, Users, Video } from 'lucide-react'
import { useSalasDoAluno, type SalaDoAluno } from './api'
import { NavAluno } from './NavAluno'

/**
 * /painel/sala — as aulas ao vivo deste aluno.
 *
 * Uma lista, e não uma sala: o aluno pode ter a sala individual dele E uma
 * sala por turma em que está (0015). Enquanto esta rota abria "a" sala direto,
 * ela mandava `{}` para `sala-entrar`, que só sabe achar a 1:1 — quem estuda
 * só em turma recebia "Sala não encontrada" e não tinha caminho nenhum para a
 * aula dele a não ser o link do WhatsApp.
 *
 * Cada item leva a uma rota que ESPELHA a do professor (`/sala/:alunoId` e
 * `/sala/turma/:turmaId`), e as duas pontas resolvem a mesma linha de `salas`
 * — é isso, e não o nome da tela, que garante que os dois caiam na mesma
 * conversa do LiveKit.
 */
export function AulasAoVivoPage() {
  const { data: salas, isLoading, error } = useSalasDoAluno()

  return (
    <div className="min-h-dvh bg-areia px-5 pb-24 pt-6">
      <div className="mx-auto max-w-sm">
        <h1 className="text-lg font-extrabold text-neutral-900">Aula ao vivo</h1>
        <p className="text-xs font-medium text-neutral-500">
          Entre na hora combinada — o professor abre a sala do outro lado.
        </p>

        {isLoading && (
          <div className="mt-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        )}

        {error && (
          <p className="mt-6 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
            Não consegui carregar suas aulas ao vivo.
          </p>
        )}

        {salas && salas.length === 0 && (
          <div className="mt-6 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-12 text-center">
            <p className="font-bold text-neutral-700">Nenhuma sala ainda</p>
            <p className="mt-1 text-sm text-neutral-500">
              Quando seu professor abrir a sala da sua aula, ela aparece aqui.
            </p>
          </div>
        )}

        {salas && salas.length > 0 && (
          <div className="mt-5 space-y-2">
            {salas.map((sala) => (
              <CartaoDaSala key={sala.tipo === 'turma' ? sala.turmaId : 'individual'} sala={sala} />
            ))}
          </div>
        )}
      </div>

      <NavAluno />
    </div>
  )
}

function CartaoDaSala({ sala }: { sala: SalaDoAluno }) {
  const ehTurma = sala.tipo === 'turma'
  const para = ehTurma ? `/painel/sala/turma/${sala.turmaId}` : '/painel/sala/individual'
  const Icone = ehTurma ? Users : User

  return (
    <Link
      to={para}
      className="flex items-center gap-3 rounded-2xl bg-white p-4 transition hover:bg-neutral-50"
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
          ehTurma ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700'
        }`}
      >
        <Icone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-neutral-800">{sala.nome}</p>
        <p className="flex items-center gap-1 text-xs text-neutral-400">
          <Video className="h-3 w-3" />
          {ehTurma ? 'aula em grupo' : 'aula individual'}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
    </Link>
  )
}
