import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Chave } from '@/components/Interruptor'
import { useAlunos } from '@/features/alunos/api'
import { corDoAvatar, inicial } from '@/lib/avatar'
import type { TutorAcesso } from '@/types/db'
import { formatarCusto, useAlternarTutor, useLiberacoesTutor, useSessoesDoMes } from './api'

/**
 * Quem tem o tutor: todos os alunos ativos, cada um com a chave. O limite do
 * beta é o trigger `conferir_tutor_do_aluno` quem segura; aqui a chave só fica
 * desligada quando não cabe mais ninguém.
 */
export function AbaAlunosDoTutor({ acesso }: { acesso: TutorAcesso }) {
  const { data: alunos, isLoading } = useAlunos('ativo')
  const { data: liberacoes } = useLiberacoesTutor()
  const { data: sessoes } = useSessoesDoMes()
  const alternar = useAlternarTutor()

  const comTutor = (alunos ?? []).filter((a) => a.tutor_ativo).length
  const porAluno = new Map<string, { sessoes: number; custo: number }>()
  for (const s of sessoes ?? []) {
    if (!s.aluno_id) continue
    const atual = porAluno.get(s.aluno_id) ?? { sessoes: 0, custo: 0 }
    porAluno.set(s.aluno_id, { sessoes: atual.sessoes + 1, custo: atual.custo + s.custo_usd })
  }

  return (
    <>
      <h2 className="mt-8 text-xs font-extrabold uppercase tracking-wide text-neutral-500">
        Alunos com tutor{' '}
        <span className="text-neutral-400">
          · {comTutor} de {acesso.max_alunos} no beta
        </span>
      </h2>

      {alternar.isError && (
        <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{alternar.error.message}</p>
      )}

      {isLoading ? (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : !alunos?.length ? (
        <div className="mt-3 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-10 text-center">
          <p className="font-bold text-neutral-700">Nenhum aluno ativo ainda</p>
          <p className="mt-1 text-sm text-neutral-500">Cadastre um aluno em Alunos para ligar o tutor para ele.</p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {alunos.map((aluno) => {
            const nLicoes = liberacoes?.get(aluno.id)?.size ?? 0
            const uso = porAluno.get(aluno.id)
            const cheio = !aluno.tutor_ativo && comTutor >= acesso.max_alunos
            return (
              <li key={aluno.id} className="flex items-center gap-3 px-5 py-3.5">
                {/* A chave fica FORA do link: clicar nela liga o tutor, não abre a ficha. */}
                <Link to={`/alunos/${aluno.id}?aba=tutor`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${corDoAvatar(aluno.id)}`}
                  >
                    {inicial(aluno.nome)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{aluno.nome}</span>
                    <span className="block text-xs text-neutral-500">
                      {aluno.tutor_ativo
                        ? `${nLicoes} ${nLicoes === 1 ? 'lição' : 'lições'} · ${uso?.sessoes ?? 0} ${
                            uso?.sessoes === 1 ? 'sessão' : 'sessões'
                          } no mês${uso?.custo ? ` · ${formatarCusto(uso.custo)}` : ''}`
                        : 'tutor desligado'}
                    </span>
                  </span>
                </Link>
                <Chave
                  rotulo={`Tutor de ${aluno.nome}`}
                  ligado={aluno.tutor_ativo}
                  desabilitado={cheio}
                  aoMudar={(ligado) => alternar.mutate({ alunoId: aluno.id, ligado })}
                />
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-2 text-xs text-neutral-500">Quais lições cada aluno pratica você escolhe na ficha dele, aba Tutor.</p>
    </>
  )
}
