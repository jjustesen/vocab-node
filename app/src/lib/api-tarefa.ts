import axios from 'axios'

/**
 * Cliente do ALUNO — nunca usa o cliente Supabase (@/lib/supabase), porque o
 * aluno não tem sessão. Fala só com as Edge Functions em supabase/functions/
 * tarefa-*, que validam o token por hash e projetam campo a campo. Ver o
 * cabeçalho de supabase/migrations/0001_init.sql para o porquê dessa divisão.
 */
export const apiTarefa = axios.create({
  baseURL: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`,
  headers: { 'Content-Type': 'application/json' },
})

export function mensagemDeErro(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const corpo = e.response?.data as { erro?: string } | undefined
    return corpo?.erro ?? e.message
  }
  return e instanceof Error ? e.message : String(e)
}
