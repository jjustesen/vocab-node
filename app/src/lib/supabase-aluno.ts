import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. Copie .env.example para .env.local e preencha.',
  )
}

/**
 * Cliente do ALUNO logado (RF-28) — sessão própria, com `storageKey`
 * diferente do cliente do professor (@/lib/supabase.ts). Mesmo projeto
 * Supabase, mesmo navegador às vezes (professor testando) — sem isso as
 * duas sessões brigariam pela mesma chave no localStorage.
 *
 * Só serve pra login/cadastro (signUp/signInWithPassword/getSession). Nenhuma
 * tabela é lida direto por aqui: RLS deste banco serve só ao professor (ver
 * cabeçalho de supabase/migrations/0001_init.sql) — o painel do aluno passa
 * pela Edge Function painel-aluno-obter, não por select direto.
 */
export const supabaseAluno = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'sb-aluno-auth-token',
  },
})
