import { useState } from 'react'
import {
  FileText,
  Image as ImageIcon,
  Library,
  Loader2,
  Monitor,
  Presentation,
  Square,
  X,
} from 'lucide-react'
import {
  urlAssinada,
  useEnviarMaterial,
  useMateriaisDeVarios,
} from '@/features/materiais/api'
import { EscolherDoAcervo } from '@/features/materiais/EscolherDoAcervo'
import { SoltarArquivos } from '@/features/materiais/SoltarArquivos'
import { DisponibilizarATodos } from '@/features/materiais/DisponibilizarATodos'
import { QuemTem } from '@/features/materiais/QuemTem'
import { EtiquetaDePasta } from '@/features/materiais/EtiquetaDePasta'
import { carregarPdfjs } from '@/lib/arquivo'
import type { Material } from '@/types/db'
import type { Palco } from './estado-palco'

/**
 * O que o professor coloca no palco.
 *
 * Só ele abre esta tela, e a lista de materiais vem por RLS com o cliente
 * dele. `alunoId` pode ser null numa turma sem ninguém selecionado no painel —
 * aí sobram lousa e vídeo, que não dependem de acervo.
 */
export function SeletorDeConteudo({
  alunos,
  aoEscolher,
  aoFechar,
}: {
  /**
   * Quem está do outro lado: um aluno no 1:1, a turma inteira em grupo.
   *
   * A lista de materiais é a UNIÃO das fichas de todos eles, sem repetir —
   * concatenar mostraria o mesmo PDF três vezes numa turma de três. E cada
   * item diz quem já tem, que é a pergunta real do professor na hora de
   * decidir se precisa distribuir.
   */
  alunos: { id: string; nome: string }[]
  aoEscolher: (palco: Palco) => void
  aoFechar: () => void
}) {
  const alunoIds = alunos.map((a) => a.id)
  const { data: materiais, isLoading } = useMateriaisDeVarios(alunoIds)
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [acervoAberto, setAcervoAberto] = useState(false)

  const enviar = useEnviarMaterial(alunoIds)
  const emTurma = alunos.length > 1

  // Só o que dá para pôr numa tela. Áudio e docx continuam na ficha do aluno:
  // um player no palco não é anotável, e docx precisaria de conversão no
  // servidor — nenhum dos dois cabe nesta entrega.
  const exibiveis = materiais?.filter((m) => m.tipo === 'pdf' || m.tipo === 'imagem') ?? []
  const jaTem = new Map((materiais ?? []).map((m) => [m.id, m.donos]))

  async function escolherMaterial(material: Material) {
    setAbrindo(material.id)
    setErro(null)
    try {
      aoEscolher(await montarMaterial(material))
      aoFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui abrir este material.')
    } finally {
      setAbrindo(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-neutral-950/70 p-3 sm:place-items-center">
      <div className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 text-neutral-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold">Colocar no palco</h2>
          <button
            onClick={aoFechar}
            title="Fechar"
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/*
          Sem "Documento" desde que a lousa e o material cobrem a aula: o
          documento compartilhado era o único conteúdo do palco em que NÃO se
          anotava por cima (ver `Palco.tsx`), e virou a opção que a pessoa
          abria por engano procurando o PDF. O tipo continua no protocolo
          (`estado-palco.ts`) para não quebrar uma sala aberta durante o
          deploy; só a porta de entrada saiu.
        */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Opcao Icone={Monitor} rotulo="Só vídeo" aoClicar={() => { aoEscolher({ tipo: 'nenhum' }); aoFechar() }} />
          <Opcao Icone={Square} rotulo="Lousa" aoClicar={() => { aoEscolher({ tipo: 'branco' }); aoFechar() }} />
        </div>

        {alunos.length > 0 && (
          <>
            <div className="mt-6 flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-neutral-500">
                {emTurma ? 'Materiais da turma' : 'Materiais deste aluno'}
              </p>
              <button
                onClick={() => setAcervoAberto(true)}
                className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-[11px] font-bold text-neutral-700 transition hover:bg-neutral-200"
              >
                <Library className="h-3 w-3" /> Do acervo
              </button>
            </div>

            {isLoading && (
              <div className="mt-4 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
              </div>
            )}

            {!isLoading && exibiveis.length === 0 && (
              <p className="mt-3 rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
                Nenhum PDF ou imagem por aqui. Pegue do acervo ou arraste um arquivo abaixo.
              </p>
            )}

            <div className="mt-3 space-y-1">
              {exibiveis.map((material) => (
                // A linha deixou de ser UM botão: "colocar no palco" e "dar a
                // todos" são duas ações, e botão dentro de botão é HTML
                // inválido. O `div` carrega o `group/linha` que expande o
                // segundo no hover.
                <div
                  key={material.id}
                  className="group/linha flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 transition hover:bg-neutral-100"
                >
                  <button
                    onClick={() => escolherMaterial(material)}
                    disabled={abrindo !== null}
                    title="Colocar no palco"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-600">
                      {abrindo === material.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : material.tipo === 'pdf' ? (
                        <FileText className="h-4 w-4" />
                      ) : (
                        <ImageIcon className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{material.nome}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <EtiquetaDePasta pastaId={material.pasta_id} />
                        {emTurma && <QuemTem alunos={alunos} donos={material.donos} />}
                      </span>
                    </span>
                  </button>

                  {emTurma && (
                    <DisponibilizarATodos
                      materialId={material.id}
                      faltam={alunoIds.filter((id) => !material.donos.includes(id))}
                    />
                  )}

                  <Presentation className="h-4 w-4 shrink-0 text-neutral-300" />
                </div>
              ))}
            </div>

            {erro && <p className="mt-3 text-xs font-medium text-rose-600">{erro}</p>}

            <div className="mt-3">
              <SoltarArquivos
                compacto
                aoReceber={(arquivo) => enviar.mutateAsync({ tipo: 'arquivo', arquivo })}
                rotulo={
                  emTurma
                    ? `Arraste um arquivo — vai para os ${alunos.length} alunos`
                    : 'Arraste um arquivo aqui'
                }
              />
              <p className="mt-2 text-[11px] text-neutral-400">
                {emTurma
                  ? 'O arquivo sobe uma vez e fica disponível para a turma inteira.'
                  : 'Áudio e DOCX ficam guardados na ficha do aluno; no palco entram PDF e imagem.'}
              </p>
            </div>
          </>
        )}
      </div>

      {acervoAberto && (
        <EscolherDoAcervo
          alunoIds={alunoIds}
          paraQuem={emTurma ? 'para a turma' : `para ${alunos[0]?.nome.split(' ')[0] ?? 'o aluno'}`}
          jaTem={jaTem}
          aoFechar={() => setAcervoAberto(false)}
        />
      )}
    </div>
  )
}

function Opcao({
  Icone,
  rotulo,
  aoClicar,
}: {
  Icone: typeof Monitor
  rotulo: string
  aoClicar: () => void
}) {
  return (
    <button
      onClick={aoClicar}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-neutral-200 px-2 py-3 text-xs font-bold text-neutral-700 transition hover:border-neutral-900 hover:bg-neutral-50"
    >
      <Icone className="h-4 w-4" />
      {rotulo}
    </button>
  )
}

/**
 * O material vira estado do palco — e a medida acontece AQUI, de um lado só.
 *
 * Quem sobe o arquivo mede a proporção e conta as páginas, e manda os dois
 * junto na mensagem. O outro lado não remede: se cada ponta medisse sozinha, a
 * caixa do aluno teria a forma errada até o arquivo dele terminar de carregar,
 * e qualquer traço feito nesse meio-tempo cairia deslocado (ver o cabeçalho de
 * `estado-palco.ts`).
 *
 * A URL assinada viaja junto pelo mesmo motivo que o resto: o aluno sem conta
 * não tem sessão de Postgres para pedir a própria. Vale 1h — mais que a aula.
 */
async function montarMaterial(material: Material): Promise<Palco> {
  if (!material.storage_path) throw new Error('Este material não tem arquivo para exibir.')
  const url = await urlAssinada(material.storage_path)

  const base = { tipo: 'material' as const, materialId: material.id, nome: material.nome, url, pagina: 1 }

  if (material.tipo === 'imagem') {
    const { largura, altura } = await medirImagem(url)
    return { ...base, formato: 'imagem', paginas: 1, proporcao: largura / altura }
  }

  const pdfjs = await carregarPdfjs()
  const tarefa = pdfjs.getDocument({ url })
  const documento = await tarefa.promise
  try {
    // A proporção sai da PRIMEIRA página e vale para o arquivo inteiro. Um PDF
    // com páginas de tamanhos diferentes é raro em material didático, e a
    // alternativa — remedir a cada virada — faria a caixa pular no meio da
    // explicação, junto com todo rabisco em cima dela.
    const primeira = await documento.getPage(1)
    const { width, height } = primeira.getViewport({ scale: 1 })
    return { ...base, formato: 'pdf', paginas: documento.numPages, proporcao: width / height }
  } finally {
    await tarefa.destroy() // libera o worker
  }
}

function medirImagem(url: string): Promise<{ largura: number; altura: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ largura: img.naturalWidth, altura: img.naturalHeight })
    img.onerror = () => reject(new Error('Não consegui abrir esta imagem.'))
    img.src = url
  })
}
