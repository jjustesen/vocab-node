import { ArrowUpDown } from 'lucide-react'
import { ROTULO_ORDEM, type Ordem } from '@/lib/ordenar'

/**
 * O "Ordenar por" das listas do professor. `<select>` nativo de propósito:
 * teclado, leitor de tela e o seletor do celular vêm prontos, e são quatro
 * opções — um menu próprio não compraria nada.
 */
export function SeletorDeOrdem({
  ordem,
  aoMudar,
  opcoes = ['nome', 'nome-desc', 'recentes', 'antigos'],
}: {
  ordem: Ordem
  aoMudar: (ordem: Ordem) => void
  opcoes?: Ordem[]
}) {
  return (
    <label className="relative flex shrink-0 items-center rounded-full bg-white text-sm font-bold text-neutral-700 focus-within:ring-2 focus-within:ring-neutral-900">
      <ArrowUpDown className="pointer-events-none absolute left-3.5 h-4 w-4 text-neutral-400" />
      <span className="sr-only">Ordenar por</span>
      <select
        value={ordem}
        onChange={(e) => aoMudar(e.target.value as Ordem)}
        title="Ordenar por"
        className="cursor-pointer appearance-none rounded-full bg-transparent py-2.5 pl-10 pr-4 outline-none"
      >
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {ROTULO_ORDEM[o]}
          </option>
        ))}
      </select>
    </label>
  )
}
