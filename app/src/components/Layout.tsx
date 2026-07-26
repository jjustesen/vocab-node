import { NavLink, Outlet } from 'react-router-dom'
import {
  Calendar,
  GraduationCap,
  LogOut,
  Pencil,
  Sun,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'

// Trilhas não é item de menu: vive como aba dentro de Atividades (mockup P11),
// porque uma trilha é uma sequência de atividades que já existem.
const ITENS: { para: string; rotulo: string; Icone: LucideIcon }[] = [
  { para: '/hoje', rotulo: 'Hoje', Icone: Sun },
  { para: '/alunos', rotulo: 'Alunos', Icone: Users },
  { para: '/atividades', rotulo: 'Atividades', Icone: Pencil },
  { para: '/agenda', rotulo: 'Agenda', Icone: Calendar },
  { para: '/financeiro', rotulo: 'Financeiro', Icone: Wallet },
]

export function Layout() {
  const { session, sair } = useAuth()
  const nome = (session?.user.user_metadata.nome as string | undefined) ?? 'Professor'
  const inicial = nome.charAt(0).toUpperCase()

  return (
    // O cromo escuro sangra até as bordas da janela; a moldura fica por dentro,
    // envolvendo o painel creme. Sem margem externa — a janela já é a moldura.
    <div className="flex min-h-dvh flex-col bg-neutral-950">
      {/* Mesma ideia do painel creme: a barra escura sangra até as bordas, mas o
          conteúdo dela para em 1440px. O respiro lateral fica no <header> (e não
          na camada de 1440px) para o logo alinhar com o conteúdo das páginas. */}
      <header className="sticky top-0 z-40 bg-neutral-950 px-4 text-white sm:px-6">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-2xl bg-violet-300 text-neutral-900">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="hidden font-extrabold sm:inline">Vocab Node</span>
          </div>

          <nav className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto">
            {ITENS.map(({ para, rotulo, Icone }) => (
              <NavLink
                key={para}
                to={para}
                className={({ isActive }) =>
                  [
                    'flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition',
                    isActive ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <Icone className="h-4 w-4" />
                    <span className={isActive ? 'inline' : 'hidden lg:inline'}>{rotulo}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span
              title={nome}
              className="grid h-8 w-8 place-items-center rounded-full bg-pink-300 text-sm font-extrabold text-neutral-900"
            >
              {inicial}
            </span>
            <button
              onClick={sair}
              title="Sair"
              className="rounded-full p-2 text-neutral-400 transition hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col px-2 pb-2 sm:px-3 sm:pb-3">
        {/* O painel creme sangra até a moldura (que segue fininha); quem trava
            em 1440px é a camada de dentro, para o conteúdo não esticar demais
            em telas largas. */}
        <div className="flex-1 rounded-3xl bg-areia p-5 sm:rounded-[2rem] sm:p-8">
          <div className="mx-auto w-full max-w-[1440px]">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
