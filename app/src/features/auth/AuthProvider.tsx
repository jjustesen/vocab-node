import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContexto {
  session: Session | null
  carregando: boolean
  sair: () => Promise<void>
}

const Contexto = createContext<AuthContexto | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCarregando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const sair = async () => {
    await supabase.auth.signOut()
  }

  return <Contexto value={{ session, carregando, sair }}>{children}</Contexto>
}

export function useAuth() {
  const contexto = use(Contexto)
  if (!contexto) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return contexto
}
