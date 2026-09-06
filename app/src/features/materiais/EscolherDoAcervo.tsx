import { useMemo, useState } from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import { VISUAL_TIPO } from './visual'
import { useAcervo, useDisponibilizar } from './api'

/**
 * Pegar do acervo em vez de subir de novo.
 *
 * É o outro lado de `EscolherAlunos`: lá o professor parte do material e
 * escolhe pessoas; aqui parte das pessoas e escolhe o material. As duas telas
 * escrevem na mesma tabela de vínculo (0016).
 *
 * O que já está com TODOS os destinatários aparece marcado e desligado. Não
 * some da lista pelo mesmo motivo de sempre: o professor precisa distinguir
 * "já mandei" de "esqueci".
 */
export function EscolherDoAcervo({
  alunoIds,
  paraQuem,
  jaTem,
  aoFechar,
}: {
  /** Quem vai receber. Um na ficha do aluno; a turma inteira na sala de turma. */
  alunoIds: string[]
  /** Texto do cabeçalho: "para Lais" ou "para a turma". */
  paraQuem: string
  /** material_id → alunos que já o têm, entre os `alunoIds` desta operação. */
  jaTem: Map<string, string[]>
  aoFechar: () => void
}) {
  const { data: acervo, isLoading } = useAcervo()
  const disponibilizar = useDisponibilizar()
  const [busca, setBusca] = useState('')
  const [enviando, setEnviando] = useState<string | null>(null)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (acervo ?? []).filter((m) => !termo || m.nome.toLowerCase().includes(termo))
  }, [acervo, busca])

  function dar(materialId: string, faltam: string[]) {
    setEnviando(materialId)
    disponibilizar.mutate(
      { materialId, alunoIds: faltam },
      { onSettled: () => setEnviando(null) },
    )
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar()
      }}
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/50 p-4"
    >
      <div className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-3xl bg-white p-5">
        <h2 className="text-sm font-extrabold text-neutral-900">Escolher do acervo</h2>
        <p className="mt-0.5 text-xs text-neutral-500">Disponibilizar {paraQuem}.</p>

        <div className="mt-4 flex items-center gap-2 rounded-full bg-neutral-100 px-4 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar no acervo…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
            </div>
          )}

          {!isLoading && filtrados.length === 0 && (
            <p className="py-6 text-center text-xs text-neutral-500">
              {acervo?.length === 0
                ? 'Seu acervo está vazio. Suba arquivos em Materiais.'
                : `Nenhum material para “${busca}”.`}
            </p>
          )}

          <ul className="divide-y divide-neutral-100">
            {filtrados.map((material) => {
              const donos = jaTem.get(material.id) ?? []
              const faltam = alunoIds.filter((id) => !donos.includes(id))
              const { Icone, cor } = VISUAL_TIPO[material.tipo]
              const completo = faltam.length === 0

              return (
                <li key={material.id}>
                  <button
                    onClick={() => !completo && dar(material.id, faltam)}
                    disabled={completo || enviando !== null}
                    className="flex w-full items-center gap-3 py-2.5 text-left transition disabled:opacity-60"
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${cor}`}>
                      <Icone className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-900">
                        {material.nome}
                      </span>
                      {completo ? (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                          <Check className="h-3 w-3" />
                          {alunoIds.length === 1 ? 'já tem' : 'todos já têm'}
                        </span>
                      ) : (
                        <span className="block text-[11px] text-neutral-400">
                          {alunoIds.length === 1
                            ? 'disponibilizar'
                            : `falta para ${faltam.length} de ${alunoIds.length}`}
                        </span>
                      )}
                    </span>
                    {enviando === material.id && (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-400" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <button
          onClick={aoFechar}
          className="mt-4 rounded-full bg-neutral-100 px-4 py-3 text-sm font-bold text-neutral-700"
        >
          Fechar
        </button>
      </div>
    </div>
  )
}
