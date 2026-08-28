import { NavLink } from 'react-router-dom'
import { FolderOpen, House } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ITENS: { para: string; rotulo: string; Icone: LucideIcon }[] = [
  { para: '/painel', rotulo: 'Tarefas', Icone: House },
  { para: '/painel/materiais', rotulo: 'Materiais', Icone: FolderOpen },
]

/**
 * Navegação da área do aluno. Fica fixa no rodapé porque o painel é usado no
 * celular, à noite, em sessões curtas (RNF-06): o alvo de toque precisa estar
 * na metade de baixo da tela, e alto o bastante (>=44px).
 *
 * As telas que usam esta barra reservam o espaço dela com `pb-24` — sem isso o
 * último cartão da lista fica escondido atrás da barra.
 */
export function NavAluno() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200/70 bg-areia/95 backdrop-blur">
      <div className="mx-auto flex max-w-sm">
        {ITENS.map(({ para, rotulo, Icone }) => (
          <NavLink
            key={para}
            to={para}
            end
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-extrabold transition ${
                isActive ? 'text-neutral-900' : 'text-neutral-400'
              }`
            }
          >
            <Icone className="h-5 w-5" />
            {rotulo}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
