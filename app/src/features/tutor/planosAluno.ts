import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { reaisDeCentavos } from '@/lib/custo-ia'
import type { PlanoAluno } from '@/types/db'

/**
 * Os planos que o professor monta para vender o tutor aos alunos (migration
 * 0031, docs/TUTOR-TRILHAS.md §5). Nesta fase o plano é montado e conferido;
 * a venda (link, Stripe Connect, assinatura) é a F3.
 *
 * Escrita só pela RPC `salvar_plano_aluno`: ela confere o preço mínimo no
 * servidor com as trilhas e as práticas que estão sendo salvas.
 */

export const chavesPlanosAluno = {
  todos: ['planos-aluno'] as const,
  lista: ['planos-aluno', 'lista'] as const,
  custoMedio: (trilhas: string[]) => ['planos-aluno', 'custo-medio', trilhas] as const,
}

export type PlanoComTrilhas = PlanoAluno & { trilhaIds: string[] }

export function usePlanosAluno() {
  return useQuery({
    queryKey: chavesPlanosAluno.lista,
    queryFn: async (): Promise<PlanoComTrilhas[]> => {
      const [{ data: planos, error }, { data: vinculos, error: erroVinculos }] = await Promise.all([
        supabase.from('planos_aluno').select('*').order('criado_em'),
        supabase.from('planos_aluno_trilhas').select('*'),
      ])
      if (error) throw error
      if (erroVinculos) throw erroVinculos
      return (planos ?? []).map((p) => ({
        ...p,
        trilhaIds: (vinculos ?? []).filter((v) => v.plano_id === p.id).map((v) => v.trilha_id),
      }))
    },
  })
}

/** Custo médio de uma prática nas lições do tutor destas trilhas, em dólar (0 sem lição do tutor). */
export function useCustoMedioPorPratica(trilhaIds: string[]) {
  const chave = [...trilhaIds].sort()
  return useQuery({
    queryKey: chavesPlanosAluno.custoMedio(chave),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<number> => {
      if (chave.length === 0) return 0
      const { data, error } = await supabase.rpc('custo_medio_por_pratica_usd', { p_trilhas: chave })
      if (error) throw error
      return Number(data ?? 0)
    },
  })
}

export type PlanoParaSalvar = {
  id: string | null
  nome: string
  descricao: string
  precoCentavos: number
  praticasMes: number
  aceitando: boolean
  trilhaIds: string[]
}

export function useSalvarPlanoAluno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: PlanoParaSalvar): Promise<string> => {
      const { data, error } = await supabase.rpc('salvar_plano_aluno', {
        p_id: p.id,
        p_nome: p.nome,
        p_descricao: p.descricao,
        p_preco_centavos: p.precoCentavos,
        p_praticas_mes: p.praticasMes,
        p_aceitando: p.aceitando,
        p_trilhas: p.trilhaIds,
      })
      if (error) {
        if (error.message.includes('preco_abaixo_do_minimo')) {
          throw new Error(
            `O preço mínimo agora é ${reaisDeCentavos(Number(error.details))}: o custo das lições mudou desde que a tela abriu.`,
          )
        }
        throw new Error('Não consegui salvar o plano. Tente de novo.')
      }
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesPlanosAluno.todos }),
  })
}

export function useExcluirPlanoAluno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('planos_aluno').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesPlanosAluno.todos }),
  })
}
