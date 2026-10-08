import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

export function clienteCadastro() {
  return createClient<Database>(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export async function autenticarOuCadastrarAluno(email: string, senha: string, nome?: string) {
  const cliente = clienteCadastro()
  const existente = await cliente.auth.signInWithPassword({ email, password: senha })
  if (existente.data.session) return existente
  return cliente.auth.signUp({ email, password: senha, options: { data: { perfil: 'aluno', nome } } })
}
