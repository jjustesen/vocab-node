import { useMemo, useState } from 'react'
import { Check, Loader2, Search, Users } from 'lucide-react'
import { useAlunos } from '@/features/alunos/api'
import { corDoAvatar, inicial } from '@/lib/avatar'
import type { Material } from '@/types/db'
import { useDisponibilizar } from './api'

/**
 * "Para quem vai este material?" — a metade nova do modelo de 0016.
 *
 * Quem JÁ TEM aparece marcado e desligado, e não some da lista: o professor
 * precisa ver que a pessoa já recebeu, senão fica sem saber se esqueceu de
 * mandar ou se já mandou. Um nome ausente responderia a pergunta errada.
 */
export function EscolherAlunos({
  material,
  jaTem,
  aoFechar,
}: {
  material: Material
  jaTem: string[]
  aoFechar: () => void
}) {
  const { data: alunos, isLoading } = useAlunos('ativo')
  const disponibilizar = useDisponibilizar()
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())

  const tem = useMemo(() => new Set(jaTem), [jaTem])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (alunos ?? []).filter(
      (a) => !termo || a.nome.toLowerCase().includes(termo) || (a.email ?? '').toLowerCase().includes(termo),
    )
  }, [alunos, busca])

  const faltando = (alunos ?? []).filter((a) => !tem.has(a.id))

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
        <h2 className="text-sm font-extrabold text-neutral-900">Disponibilizar material</h2>
        <p className="mt-0.5 truncate text-xs text-neutral-500">{material.nome}</p>

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

        {faltando.length > 1 && (
          <button
            onClick={() => setMarcados(new Set(faltando.map((a) => a.id)))}
            className="mt-2 self-start text-xs font-bold text-violet-700 hover:underline"
          >
            Marcar os {faltando.length} que ainda não têm
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
              const possui = tem.has(aluno.id)
              return (
                <li key={aluno.id}>
                  <label
                    className={`flex items-center gap-3 py-2.5 ${
                      possui ? 'opacity-60' : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={possui}
                      checked={possui || marcados.has(aluno.id)}
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
                      <span className="block truncate text-sm font-medium text-neutral-900">
                        {aluno.nome}
                      </span>
                      {possui && (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                          <Check className="h-3 w-3" /> já tem
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          {!isLoading && filtrados.length === 0 && (
            <p className="py-6 text-center text-xs text-neutral-500">Nenhum aluno para “{busca}”.</p>
          )}
        </div>

        {disponibilizar.isError && (
          <p className="mt-2 text-xs font-medium text-rose-600">
            {disponibilizar.error instanceof Error
              ? disponibilizar.error.message
              : 'Não consegui disponibilizar.'}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={aoFechar}
            className="flex-1 rounded-full bg-neutral-100 px-4 py-3 text-sm font-bold text-neutral-700"
          >
            Cancelar
          </button>
          <button
            onClick={() =>
              disponibilizar.mutate(
                { materialId: material.id, alunoIds: [...marcados] },
                { onSuccess: aoFechar },
              )
            }
            disabled={marcados.size === 0 || disponibilizar.isPending}
            className="flex flex-[2] items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40"
          >
            {disponibilizar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Users className="h-4 w-4" />
            )}
            {marcados.size === 0
              ? 'Escolha quem recebe'
              : `Disponibilizar para ${marcados.size}`}
          </button>
        </div>
      </div>
    </div>
  )
}
