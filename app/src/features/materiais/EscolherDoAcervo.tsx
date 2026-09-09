import { useMemo, useState } from 'react'
import { Check, Folder, FolderInput, Loader2, Search } from 'lucide-react'
import { VISUAL_TIPO } from './visual'
import { SEM_PASTA, useAcervo, useDisponibilizar, useDisponibilizarPasta, usePastas } from './api'

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
  const { data: pastas } = usePastas()
  const disponibilizar = useDisponibilizar()
  const disponibilizarPasta = useDisponibilizarPasta()
  const [busca, setBusca] = useState('')
  const [pasta, setPasta] = useState<'todas' | string>('todas')
  const [enviando, setEnviando] = useState<string | null>(null)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (acervo ?? [])
      .filter((m) =>
        pasta === 'todas' ? true : pasta === SEM_PASTA ? m.pasta_id === null : m.pasta_id === pasta,
      )
      .filter((m) => !termo || m.nome.toLowerCase().includes(termo))
  }, [acervo, busca, pasta])

  /**
   * Só aparece quando há prateleira para escolher. Num acervo sem pastas o
   * seletor seria um controle com uma opção só — ruído numa janela pequena.
   */
  const temPastas = (pastas ?? []).length > 0

  const pastaCorrente = (pastas ?? []).find((p) => p.id === pasta) ?? null

  /**
   * O que a pasta inteira ainda tem a acrescentar.
   *
   * Conta MATERIAIS que faltam a alguém, não pares: "faltam 4" quer dizer
   * quatro arquivos que pelo menos um dos destinatários não tem. É a conta que
   * responde à pergunta do professor; o número de vínculos a criar é detalhe
   * de banco.
   *
   * A busca digitada NÃO entra nesta conta de propósito: "dar a pasta inteira"
   * tem que querer dizer a pasta inteira. Dar só o que casou com o texto
   * buscado seria uma pasta parcial com nome de pasta inteira — e o professor
   * descobriria o que faltou na aula seguinte.
   */
  const daPasta = useMemo(
    () => (pastaCorrente ? (acervo ?? []).filter((m) => m.pasta_id === pastaCorrente.id) : []),
    [acervo, pastaCorrente],
  )
  const faltandoNaPasta = useMemo(
    () =>
      daPasta.filter((m) => {
        const donos = jaTem.get(m.id) ?? []
        return alunoIds.some((id) => !donos.includes(id))
      }),
    [daPasta, jaTem, alunoIds],
  )

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

        <div className="mt-4 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-neutral-100 px-4 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar no acervo…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
            />
          </div>

          {/*
            O recorte por pasta é o que salva esta janela num acervo grande: o
            professor pensa "o áudio do Livro 2", não o nome do arquivo, e
            digitar a busca certa exige lembrar como ele nomeou o PDF meses
            atrás. A busca continua varrendo o recorte escolhido.
          */}
          {temPastas && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-2.5">
              <Folder className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              <select
                value={pasta}
                onChange={(e) => setPasta(e.target.value)}
                className="max-w-28 bg-transparent text-xs font-bold text-neutral-600 outline-none"
              >
                <option value="todas">Todas</option>
                {(pastas ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
                <option value={SEM_PASTA}>Sem pasta</option>
              </select>
            </div>
          )}
        </div>

        {/*
          A ação da pasta fica ACIMA da lista e some quando não há nada a
          acrescentar: um botão "dar a pasta inteira" que não faz nada, porque
          todos já têm tudo, ensina a pessoa a desconfiar do botão.
        */}
        {pastaCorrente && faltandoNaPasta.length > 0 && (
          <button
            onClick={() =>
              disponibilizarPasta.mutate({
                materialIds: faltandoNaPasta.map((m) => m.id),
                alunoIds,
              })
            }
            disabled={disponibilizarPasta.isPending}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 py-3 text-xs font-extrabold text-white transition disabled:opacity-60"
          >
            {disponibilizarPasta.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderInput className="h-4 w-4" />
            )}
            Dar "{pastaCorrente.nome}" inteira · {faltandoNaPasta.length}{' '}
            {faltandoNaPasta.length === 1 ? 'material' : 'materiais'}
          </button>
        )}

        {pastaCorrente && daPasta.length > 0 && faltandoNaPasta.length === 0 && (
          <p className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            {alunoIds.length === 1 ? 'Já tem' : 'Todos já têm'} a pasta inteira
          </p>
        )}

        {disponibilizarPasta.error && (
          <p className="mt-2 text-xs font-medium text-rose-700">
            Não consegui dar a pasta inteira. Tente de novo.
          </p>
        )}

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
                : busca.trim()
                  ? `Nenhum material para “${busca}”.`
                  : 'Nada nesta pasta.'}
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
