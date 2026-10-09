import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { chegouPeloLinkDeRecuperacao, supabase } from '@/lib/supabase'

interface AuthContexto {
  session: Session | null
  carregando: boolean
  sair: () => Promise<void>
}

const Contexto = createContext<AuthContexto | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const navegar = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCarregando(false)
      if (chegouPeloLinkDeRecuperacao && data.session) navegar('/redefinir-senha', { replace: true })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((evento, novaSessao) => {
      setSession(novaSessao)
      // O link do e-mail pode cair em qualquer página — se o Supabase não
      // aceitar o `redirectTo`, ele manda para a Site URL. Seja onde for, o
      // destino é a tela de nova senha, e não o painel.
      if (evento === 'PASSWORD_RECOVERY') navegar('/redefinir-senha', { replace: true })
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
