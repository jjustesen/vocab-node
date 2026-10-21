import { useQuery } from '@tanstack/react-query'
import { FunctionRegion } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'

/** Os serviços de voz que a função `tutor-comparar-vozes` sabe chamar. */
export type ProvedorDeVoz = {
  id: string
  nome: string
  /** Tem a chave nos segredos do Supabase. Sem ela, a coluna só avisa. */
  configurado: boolean
  segredo: string
  /** A chave existe, mas a lista de vozes falhou (chave inválida, sem vozes na conta…). */
  erro?: string
  preco: string
  modelos: { id: string; nome: string }[]
  vozes: { id: string; nome: string }[]
}

export type FalaGerada = { base64: string; mimeType: string; ms: number; custoUsd: number }

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tutor-comparar-vozes', { body: corpo, region: FunctionRegion.SaEast1 })
  if (error) throw new Error(await extrairMensagemDeErro(error))
  return data as T
}

export function useProvedoresDeVoz(ligado: boolean) {
  return useQuery({
    queryKey: ['tutor', 'vozes', 'provedores'],
    enabled: ligado,
    staleTime: Infinity,
    queryFn: () => chamar<ProvedorDeVoz[]>({ acao: 'provedores' }),
  })
}

export function falarNoProvedor(pedido: { provedor: string; modelo: string; voz: string; texto: string }): Promise<FalaGerada> {
  return chamar({ acao: 'falar', ...pedido })
}
