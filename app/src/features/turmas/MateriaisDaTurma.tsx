import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Library, Loader2, Users } from 'lucide-react'
import { BotaoApagar } from '@/components/BotaoApagar'
import { DisponibilizarATodos } from '@/features/materiais/DisponibilizarATodos'
import { EscolherDoAcervo } from '@/features/materiais/EscolherDoAcervo'
import { QuemTem } from '@/features/materiais/QuemTem'
import { EtiquetaDePasta } from '@/features/materiais/EtiquetaDePasta'
import { SoltarArquivos } from '@/features/materiais/SoltarArquivos'
import { VISUAL_TIPO } from '@/features/materiais/visual'
import { useSubirAoAcervo, useTirarDeVarios } from '@/features/materiais/api'
import { darMateriaisParaTurmas, desligarDaTurma, invalidarConteudos, useMateriaisDaTurma } from './conteudos'

/**
 * Os materiais DA turma, na aba de turmas.
 *
 * A lista é o que foi dado para a turma (0020) — não a união das fichas dos
 * membros. Um PDF que alguém ganhou por fora continua na ficha dele e não
 * aparece aqui; o que está aqui vai para todo membro, inclusive quem entrar
 * depois.
 *
 * Diferença em relação ao seletor do palco: ali só entram PDF e imagem, porque
 * o palco precisa desenhar o arquivo. Aqui entra tudo — áudio e DOCX são
 * material de estudo como qualquer outro, só não sobem à tela.
 */
export function MateriaisDaTurma({
  turmaId,
  alunos,
}: {
  turmaId: string
  alunos: { id: string; nome: string }[]
}) {
  const alunoIds = alunos.map((a) => a.id)
  const { data: materiais, isLoading } = useMateriaisDaTurma(turmaId, alunoIds)
  const subir = useSubirAoAcervo()
  const qc = useQueryClient()
  const [acervoAberto, setAcervoAberto] = useState(false)

  const tirarDosAlunos = useTirarDeVarios()
  // Tirar da turma é desfazer o "dar para a turma": sai de quem está nela e
  // deixa de ser dela — senão voltaria para cada um que entrasse depois.
  const tirar = useMutation({
    mutationFn: async (materialId: string) => {
      await tirarDosAlunos.mutateAsync({ materialId, alunoIds })
      await desligarDaTurma(turmaId, { materialId })
    },
    onSuccess: () => invalidarConteudos(qc),
  })

  // Para o acervo, "já tem" é "já é da turma".
  const jaTem = new Map((materiais ?? []).map((m) => [m.id, m.donos]))

  return (
    <div className="rounded-3xl bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold text-neutral-900">
          Materiais da turma{' '}
          {materiais ? <span className="text-neutral-400">· {materiais.length}</span> : null}
        </h2>
        <button
          onClick={() => setAcervoAberto(true)}
          className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200"
        >
          <Library className="h-3.5 w-3.5" /> Do acervo
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
        </div>
      )}

      {materiais && materiais.length === 0 && (
        <p className="mt-3 rounded-2xl bg-neutral-50 px-4 py-5 text-center text-xs text-neutral-500">
          A turma ainda não tem material. Pegue do acervo ou arraste um arquivo abaixo — vai para
          todos da turma, e para quem entrar depois.
        </p>
      )}

      {materiais && materiais.length > 0 && (
        <ul className="mt-2 divide-y divide-neutral-100">
          {materiais.map((material) => {
            const { Icone, cor } = VISUAL_TIPO[material.tipo]
            return (
              // `group/linha`: é a LINHA que dispara a expansão do "Disponibilizar para todos",
              // e não o próprio botão — ver o cabeçalho de `DisponibilizarATodos`.
              <li key={material.id} className="group/linha flex items-center gap-3 py-2.5">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${cor}`}>
                  <Icone className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900">
                    {material.nome}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <EtiquetaDePasta pastaId={material.pasta_id} />
                    {alunos.length > 0 && <QuemTem alunos={alunos} donos={material.donos} />}
                  </span>
                </span>
                {/* Só aparece se um envio automático falhou para alguém. */}
                <DisponibilizarATodos
                  materialId={material.id}
                  faltam={alunoIds.filter((id) => !material.donos.includes(id))}
                />

                {/*
                  Tirar aqui é da TURMA, não do acervo: o arquivo continua seu e
                  continua com quem não é desta turma. Por isso o `title` diz
                  isso com todas as letras — sem ele, o professor evita a
                  lixeira achando que vai apagar o arquivo.
                */}
                <BotaoApagar
                  titulo="Tirar da turma — o arquivo continua no seu acervo"
                  confirmacao="Tirar da turma?"
                  pendente={tirar.isPending && tirar.variables === material.id}
                  aoConfirmar={() => tirar.mutate(material.id)}
                />
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-4">
        <SoltarArquivos
          compacto
          aoReceber={async (arquivo) => {
            const materialId = await subir.mutateAsync({ tipo: 'arquivo', arquivo })
            await darMateriaisParaTurmas([turmaId], [materialId])
            invalidarConteudos(qc)
          }}
          rotulo="Arraste um arquivo — vai para a turma inteira"
        />
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-neutral-400">
          <Users className="h-3 w-3" />O arquivo sobe uma vez e fica disponível para a turma inteira,
          inclusive para quem entrar depois.
        </p>
      </div>

      {acervoAberto && (
        <EscolherDoAcervo
          alunoIds={alunoIds}
          paraQuem="para a turma"
          turmaId={turmaId}
          jaTem={jaTem}
          aoFechar={() => setAcervoAberto(false)}
        />
      )}
    </div>
  )
}
