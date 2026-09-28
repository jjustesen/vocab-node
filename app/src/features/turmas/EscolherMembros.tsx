import { useMemo, useState } from 'react'
import { Check, Loader2, Search, UserPlus } from 'lucide-react'
import { useAlunos } from '@/features/alunos/api'
import { corDoAvatar, inicial } from '@/lib/avatar'
import { useAdicionarAlunosNaTurma } from './api'

/**
 * Todos os alunos, para montar a turma de uma vez — o mesmo desenho do
 * "Disponibilizar material" (EscolherAlunos), de propósito: é o mesmo gesto,
 * "escolher várias pessoas de uma lista", e a tela certa para ele já existia.
 *
 * A busca da tela da turma continua sendo o caminho rápido para UM nome; isto
 * é para quando a turma nasce e são oito de uma vez.
 *
 * Quem já está na turma aparece marcado e desligado, sem sumir — mesma regra
 * do material: ver que a pessoa já está responde se falta alguém.
 */
export function EscolherMembros({
  turmaId,
  turmaNome,
  jaEstao,
  aoFechar,
}: {
  turmaId: string
  turmaNome: string
  jaEstao: Set<string>
  aoFechar: () => void
}) {
  const { data: alunos, isLoading } = useAlunos('ativo')
  const adicionar = useAdicionarAlunosNaTurma(turmaId)
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (alunos ?? []).filter(
      (a) => !termo || a.nome.toLowerCase().includes(termo) || (a.email ?? '').toLowerCase().includes(termo),
    )
  }, [alunos, busca])

  const fora = (alunos ?? []).filter((a) => !jaEstao.has(a.id))

  function alternar(id: string) {
    setMarcados((atuais) => {
      const novo = new Set(atuais)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar()
      }}
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/50 p-4"
    >
      <div className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-3xl bg-white p-5">
        <h2 className="text-sm font-extrabold text-neutral-900">Adicionar à turma</h2>
        <p className="mt-0.5 truncate text-xs text-neutral-500">{turmaNome}</p>

        <div className="mt-4 flex items-center gap-2 rounded-full bg-neutral-100 px-4 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aluno…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
        </div>

        {fora.length > 1 && (
          <button
            onClick={() =>
              setMarcados(marcados.size === fora.length ? new Set() : new Set(fora.map((a) => a.id)))
            }
            className="mt-2 self-start text-xs font-bold text-violet-700 hover:underline"
          >
            {marcados.size === fora.length ? 'Desmarcar todos' : `Marcar os ${fora.length} que não estão na turma`}
          </button>
        )}

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
            </div>
          )}

          <ul className="divide-y divide-neutral-100">
            {filtrados.map((aluno) => {
              const esta = jaEstao.has(aluno.id)
              return (
                <li key={aluno.id}>
                  <label className={`flex items-center gap-3 py-2.5 ${esta ? 'opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      disabled={esta}
                      checked={esta || marcados.has(aluno.id)}
                      onChange={() => alternar(aluno.id)}
                      className="h-4 w-4 shrink-0 accent-violet-500"
                    />
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold ${corDoAvatar(
                        aluno.id,
                      )}`}
                    >
                      {inicial(aluno.nome)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-900">{aluno.nome}</span>
                      {esta && (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                          <Check className="h-3 w-3" /> já está na turma
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          {!isLoading && filtrados.length === 0 && (
            <p className="py-6 text-center text-xs text-neutral-500">
              {busca ? `Nenhum aluno para “${busca}”.` : 'Nenhum aluno cadastrado ainda.'}
            </p>
          )}
        </div>

        {adicionar.isError && (
          <p className="mt-2 text-xs font-medium text-rose-600">Não consegui adicionar. Tente de novo.</p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={aoFechar}
            className="flex-1 rounded-full bg-neutral-100 px-4 py-3 text-sm font-bold text-neutral-700"
          >
            Cancelar
          </button>
          <button
            onClick={() => adicionar.mutate([...marcados], { onSuccess: aoFechar })}
            disabled={marcados.size === 0 || adicionar.isPending}
            className="flex flex-[2] items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40"
          >
            {adicionar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {marcados.size === 0 ? 'Escolha quem entra' : `Adicionar ${marcados.size}`}
          </button>
        </div>
      </div>
    </div>
  )
}
