import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. Copie .env.example para .env.local e preencha.',
  )
}

/**
 * Cliente do professor autenticado. Toda leitura e escrita daqui passa pelo
 * RLS definido em supabase/migrations/0001_init.sql.
 *
 * O aluno NÃO usa este cliente — o acesso dele é por Edge Function, que valida
 * o token do link e projeta os campos permitidos. Ver o cabeçalho da migration.
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
