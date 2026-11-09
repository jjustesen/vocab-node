import { Link } from 'react-router-dom'
import { ChevronRight, Loader2 } from 'lucide-react'
import { useAlunos } from '@/features/alunos/api'
import { corDoAvatar, inicial } from '@/lib/avatar'
import { formatarCusto, useLiberacoesTutor, useSessoesDoMes } from './api'

/**
 * Quem tem o tutor: os alunos com pelo menos uma lição liberada, com o uso do
 * mês. Só leitura — liberar e tirar é pela lição (Liberar) ou pela ficha.
 * Não há limite de alunos (0028): o que segura o uso são as sessões por mês.
 */
export function AbaAlunosDoTutor() {
  const { data: alunos, isLoading } = useAlunos('ativo')
  const { data: liberacoes } = useLiberacoesTutor()
  const { data: sessoes } = useSessoesDoMes()
  const lista = [...(alunos ?? [])].sort(
    (a, b) => (liberacoes?.get(b.id)?.size ?? 0) - (liberacoes?.get(a.id)?.size ?? 0) || a.nome.localeCompare(b.nome),
  )
  const comTutor = (alunos ?? []).filter((a) => (liberacoes?.get(a.id)?.size ?? 0) > 0).length
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
        <span className="text-neutral-400">· {comTutor}</span>
      </h2>

      {isLoading ? (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : !alunos?.length ? (
        <div className="mt-3 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-10 text-center">
          <p className="font-bold text-neutral-700">Nenhum aluno ativo ainda</p>
          <p className="mt-1 text-sm text-neutral-500">Cadastre um aluno em Alunos para liberar lições do tutor para ele.</p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {lista.map((aluno) => {
            const nLicoes = liberacoes?.get(aluno.id)?.size ?? 0
            const uso = porAluno.get(aluno.id)
            return (
              <li key={aluno.id}>
                <Link
                  to={`/alunos/${aluno.id}?aba=tutor`}
                  className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-neutral-50"
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${corDoAvatar(aluno.id)}`}
                  >
                    {inicial(aluno.nome)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{aluno.nome}</span>
                    <span className="block text-xs text-neutral-500">
                      {nLicoes > 0
                        ? `${nLicoes} ${nLicoes === 1 ? 'lição' : 'lições'} · ${uso?.sessoes ?? 0} ${
                            uso?.sessoes === 1 ? 'sessão' : 'sessões'
                          } no mês${uso?.custo ? ` · ${formatarCusto(uso.custo)}` : ''}`
                        : 'nenhuma lição'}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-2 text-xs text-neutral-500">Para liberar, use o botão Liberar na lição (turma ou alunos) ou a ficha do aluno, aba Tutor.</p>
    </>
  )
}
