import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabaseAluno } from '@/lib/supabase-aluno'

interface AlunoAuthContexto {
  session: Session | null
  carregando: boolean
  sair: () => Promise<void>
}

const Contexto = createContext<AlunoAuthContexto | null>(null)

export function AlunoAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabaseAluno.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCarregando(false)
    })

    const { data: sub } = supabaseAluno.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const sair = async () => {
    await supabaseAluno.auth.signOut()
  }

  return <Contexto value={{ session, carregando, sair }}>{children}</Contexto>
}

export function useAlunoAuth() {
  const contexto = use(Contexto)
  if (!contexto) throw new Error('useAlunoAuth precisa estar dentro de <AlunoAuthProvider>')
  return contexto
}

/** Igual a useAlunoAuth, mas devolve null fora do provider — usado por TarefaPage, que também roda em /t/:token sem nenhum contexto de aluno. */
export function useAlunoAuthOpcional() {
  return use(Contexto)
}
