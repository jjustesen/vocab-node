import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, FileText, Folder, Headphones, Image as ImageIcon, Loader2, Type } from 'lucide-react'
import { useMateriaisAluno, type MaterialDoAluno } from './api'
import { NavAluno } from './NavAluno'
import type { MaterialTipo } from '@/types/db'
import type { LucideIcon } from 'lucide-react'

const VISUAL_TIPO: Record<MaterialTipo, { Icone: LucideIcon; cor: string }> = {
  pdf: { Icone: FileText, cor: 'bg-rose-100 text-rose-700' },
  docx: { Icone: FileText, cor: 'bg-sky-100 text-sky-700' },
  imagem: { Icone: ImageIcon, cor: 'bg-violet-100 text-violet-700' },
  audio: { Icone: Headphones, cor: 'bg-amber-100 text-amber-700' },
  texto: { Icone: Type, cor: 'bg-neutral-100 text-neutral-600' },
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * /painel/materiais — o mesmo material que o professor guarda na ficha do
 * aluno (RF-50/51/52), agora visível para quem vai estudar. Só leitura: quem
 * envia e apaga é o professor, na aba dele.
 */
export function MateriaisAlunoPage() {
  const { data: materiais, isLoading, error } = useMateriaisAluno()

  /**
   * Agrupado pela pasta do professor (0017), na ordem em que os materiais
   * chegaram.
   *
   * O aluno não escolhe pasta nem navega entre elas — ele recebe o mesmo
   * agrupamento que o professor usa quando fala em aula ("abre o do Livro 1").
   * Uma lista lisa de nomes de arquivo obriga a criança a lembrar qual PDF era
   * de qual livro, que é o problema que as pastas existem para resolver, e não
   * há motivo para resolvê-lo só de um lado.
   *
   * A ordem das seções segue a PRIMEIRA aparição, e não o alfabeto: a lista já
   * vem do mais recente para o mais antigo, então o que o professor mandou
   * ontem fica no topo — que é onde o aluno vai procurar.
   */
  const grupos = useMemo(() => {
    const mapa = new Map<string | null, MaterialDoAluno[]>()
    for (const m of materiais ?? []) {
      const lista = mapa.get(m.pasta) ?? []
      lista.push(m)
      mapa.set(m.pasta, lista)
    }
    return [...mapa.entries()]
  }, [materiais])

  /** Sem pasta nenhuma, a lista continua sendo uma lista — sem cabeçalho inútil. */
  const agrupar = grupos.length > 1 || (grupos.length === 1 && grupos[0][0] !== null)

  return (
    <div className="min-h-dvh bg-areia px-5 pb-24 pt-6">
      <div className="mx-auto max-w-sm">
        <h1 className="text-lg font-extrabold text-neutral-900">Materiais</h1>
        <p className="text-xs font-medium text-neutral-500">O que seu professor deixou para você.</p>

        {isLoading && (
          <div className="mt-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        )}

        {error && (
          <p className="mt-6 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
            Não consegui carregar seus materiais.
          </p>
        )}

        {materiais && materiais.length === 0 && (
          <div className="mt-6 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-12 text-center">
            <p className="font-bold text-neutral-700">Nenhum material ainda</p>
            <p className="mt-1 text-sm text-neutral-500">
              Quando seu professor guardar um PDF, áudio ou texto da aula, ele aparece aqui.
            </p>
          </div>
        )}

        {materiais && materiais.length > 0 && !agrupar && (
          <div className="mt-5 space-y-2">
            {materiais.map((m) => (
              <CartaoMaterial key={m.id} material={m} />
            ))}
          </div>
        )}

        {materiais && materiais.length > 0 && agrupar && (
          <div className="mt-5 space-y-5">
            {grupos.map(([pasta, itens]) => (
              <section key={pasta ?? 'sem-pasta'}>
                <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-extrabold text-neutral-500">
                  <Folder className="h-3.5 w-3.5" />
                  {/* "Outros" e não "Sem pasta": o aluno não sabe que existe um
                      acervo com pastas do outro lado, e o nome do balde não
                      pode denunciar uma estrutura que não é dele. */}
                  {pasta ?? 'Outros'}
                  <span className="font-bold text-neutral-300">{itens.length}</span>
                </h2>
                <div className="space-y-2">
                  {itens.map((m) => (
                    <CartaoMaterial key={m.id} material={m} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <NavAluno />
    </div>
  )
}

/**
 * O cartão inteiro abre o leitor (/painel/materiais/:id), que mostra o
 * arquivo dentro do app em qualquer navegador. Baixar o original fica lá,
 * no topo do leitor.
 */
function CartaoMaterial({ material }: { material: MaterialDoAluno }) {
  const visual = VISUAL_TIPO[material.tipo]

  return (
    <Link
      to={`/painel/materiais/${material.id}`}
      className="flex items-center gap-3 rounded-2xl bg-white p-4 transition hover:bg-neutral-50 active:scale-[0.99]"
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${visual.cor}`}>
        <visual.Icone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-neutral-800">{material.nome}</p>
        <p className="text-xs text-neutral-400">
          {ROTULO_TIPO[material.tipo]} · {formatarData(material.criadoEm)}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
    </Link>
  )
}

const ROTULO_TIPO: Record<MaterialTipo, string> = {
  pdf: 'PDF',
  docx: 'Word',
  imagem: 'Imagem',
  audio: 'Áudio',
  texto: 'Texto',
}
