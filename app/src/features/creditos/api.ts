import { useMutation, useQuery } from '@tanstack/react-query'
import { FunctionRegion } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'
import type { CreditoMovimento } from '@/types/db'

/**
 * Créditos do professor (migration 0031, docs/TUTOR-TRILHAS.md §5.3): o saldo,
 * o extrato e a compra. Quem soma a compra é o webhook do Stripe; aqui só se
 * abre o pagamento e se lê.
 */

export const chavesCreditos = {
  todos: ['creditos'] as const,
  saldo: ['creditos', 'saldo'] as const,
  extrato: ['creditos', 'extrato'] as const,
}

/** O saldo do professor logado. Acerta antes as sessões que já terminaram (meus_creditos). */
export function useSaldoDeCreditos() {
  return useQuery({
    queryKey: chavesCreditos.saldo,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('meus_creditos')
      if (error) throw error
      return Number(data ?? 0)
    },
  })
}

/** Os últimos movimentos, do mais novo para o mais velho. */
export function useExtratoDeCreditos() {
  return useQuery({
    queryKey: chavesCreditos.extrato,
    queryFn: async (): Promise<CreditoMovimento[]> => {
      const { data, error } = await supabase
        .from('creditos_movimentos')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).map((m) => ({
        ...m,
        valor: Number(m.valor),
        saldo_depois: Number(m.saldo_depois),
        reservado: m.reservado === null ? null : Number(m.reservado),
      }))
    },
  })
}

/** Abre o Checkout do Stripe (cartão ou Pix) e leva o professor para lá. */
export function useComprarCreditos() {
  return useMutation({
    mutationFn: async (valor: number) => {
      const { data, error } = await supabase.functions.invoke('creditos-comprar', {
        body: { valor },
        region: FunctionRegion.SaEast1,
      })
      if (error) throw new Error(await extrairMensagemDeErro(error))
      return data as { url: string }
    },
    onSuccess: ({ url }) => window.location.assign(url),
  })
}
