import { Folder } from 'lucide-react'
import { usePastas } from './api'

/**
 * O nome da pasta ao lado de um material, onde quer que ele apareça.
 *
 * Existe para que a prateleira criada no acervo (0017) signifique a mesma
 * coisa em todas as telas. Sem isto, "Livro 1" seria uma organização privada
 * da página de materiais: na ficha do aluno, na sala e na turma o professor
 * veria de novo uma lista lisa de nomes de arquivo, e teria que lembrar de
 * cabeça qual PDF é de qual livro — que é exatamente o problema que as pastas
 * resolvem.
 *
 * Só o professor vê este componente. O aluno também recebe o agrupamento por
 * pasta, mas no painel dele e por seções (ver `MateriaisAlunoPage`), porque
 * ali a lista é o conteúdo inteiro da tela e não uma coluna dentro de outra.
 *
 * A consulta é a mesma para todas as instâncias — react-query dedupe pela
 * chave, então uma lista de trinta materiais não faz trinta requisições.
 */
export function EtiquetaDePasta({ pastaId }: { pastaId: string | null }) {
  const { data: pastas } = usePastas()
  if (!pastaId) return null

  const pasta = pastas?.find((p) => p.id === pastaId)
  // Enquanto as pastas carregam — ou se a pasta sumiu debaixo de uma aba já
  // aberta — não inventa espaço: o material aparece sem etiqueta, como antes.
  if (!pasta) return null

  return (
    <span className="inline-flex max-w-40 items-center gap-1 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] font-bold text-neutral-600">
      <Folder className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{pasta.nome}</span>
    </span>
  )
}
