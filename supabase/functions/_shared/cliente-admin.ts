import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Cliente com service_role — ignora RLS de propósito.
 *
 * Só existe dentro de Edge Functions, nunca no navegador. A autorização aqui
 * não vem de RLS nem de sessão: vem da posse do token, validado por hash em
 * cada função antes de qualquer leitura ou escrita. Ver o cabeçalho de
 * supabase/migrations/0001_init.sql para o porquê dessa divisão.
 */
export function clienteAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}
