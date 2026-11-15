import { useMutation, useQuery } from '@tanstack/react-query'
import { FunctionRegion } from '@supabase/supabase-js'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'

/**
 * A página de venda de um plano (/p/:slug, docs/TUTOR-TRILHAS.md §6). Fala com
 * `plano-venda` pelo cliente do ALUNO: logado, o JWT dele vai junto e a
 * compra entra na conta dele; sem login, vai a chave anon e a compra cria a conta.
 */

export type PlanoAVenda = {
  plano: { nome: string; descricao: string | null; precoCentavos: number; praticasMes: number; aceitando: boolean }
  professorNome: string
  trilhas: { nome: string; nivel: string; descricao: string | null; materiais: number; atividades: number; licoes: number }[]
  usuario: { nome: string; email: string } | null
  jaAssina: boolean
}

export type Volta =
  | { estado: 'pendente' | 'processando' }
  | { estado: 'pronto'; email: string; planoNome: string; tokenHash?: string; entrar?: boolean }

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAluno.functions.invoke('plano-venda', { body: corpo, region: FunctionRegion.SaEast1 })
  if (error) throw new Error(await extrairMensagemDeErro(error))
  return data as T
}

export function usePlanoAVenda(slug: string | undefined, logado: boolean) {
  return useQuery({
    // O login muda a resposta ("Assinando como…"), então entra na chave.
    queryKey: ['plano-a-venda', slug, logado],
    enabled: Boolean(slug),
    retry: false,
    queryFn: () => chamar<PlanoAVenda>({ acao: 'obter', slug }),
  })
}

export function useAbrirCheckout() {
  return useMutation({
    mutationFn: (pedido: { slug: string; nome?: string; email?: string }) =>
      chamar<{ url: string }>({ acao: 'checkout', ...pedido }),
    onSuccess: ({ url }) => window.location.assign(url),
  })
}

export function consultarVolta(sessionId: string) {
  return chamar<Volta>({ acao: 'pronto', sessionId })
}

export function reais(centavos: number) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
