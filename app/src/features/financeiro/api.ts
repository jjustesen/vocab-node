import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Pagamento, PagamentoStatus } from '@/types/db'

/** `referencia_mes` é sempre dia 1 do mês (comentário na migration). */
export function mesReferenciaISO(data: Date = new Date()): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-01`
}

export type StatusPagamentoMes = {
  alunoId: string
  alunoNome: string
  valorMensal: number
  pagamentoId: string | null
  status: PagamentoStatus
  pagoEm: string | null
}

/**
 * RF-101/102: pendências do mês. Só alunos com `valor_mensal` definido
 * entram na lista — sem valor, não há o que cobrar. Um aluno sem linha em
 * `pagamentos` para o mês é tratado como "pendente" implícito: a linha só é
 * criada de fato quando o professor mexe no status pela primeira vez.
 */
export function usePagamentosDoMes(mesReferencia: string) {
  return useQuery({
    queryKey: ['pagamentos', 'mes', mesReferencia],
    queryFn: async (): Promise<StatusPagamentoMes[]> => {
      const { data: alunos, error } = await supabase
        .from('alunos')
        .select('id, nome, valor_mensal')
        .eq('status', 'ativo')
        .order('nome')
      if (error) throw error

      const comValor = alunos.filter((a): a is typeof a & { valor_mensal: number } => a.valor_mensal !== null)
      if (comValor.length === 0) return []

      const { data: pagamentos, error: erroPag } = await supabase
        .from('pagamentos')
        .select('*')
        .eq('referencia_mes', mesReferencia)
        .in(
          'aluno_id',
          comValor.map((a) => a.id),
        )
      if (erroPag) throw erroPag
      const pagamentoPorAluno = new Map(pagamentos.map((p) => [p.aluno_id, p]))

      return comValor.map((a) => {
        const p = pagamentoPorAluno.get(a.id)
        return {
          alunoId: a.id,
          alunoNome: a.nome,
          valorMensal: a.valor_mensal,
          pagamentoId: p?.id ?? null,
          status: p?.status ?? 'pendente',
          pagoEm: p?.pago_em ?? null,
        }
      })
    },
  })
}

export function usePagamentosDoAluno(alunoId: string | undefined) {
  return useQuery({
    queryKey: ['pagamentos', 'aluno', alunoId],
    enabled: Boolean(alunoId),
    queryFn: async (): Promise<Pagamento[]> => {
      const { data, error } = await supabase
        .from('pagamentos')
        .select('*')
        .eq('aluno_id', alunoId!)
        .order('referencia_mes', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Cria a linha na primeira vez que o mês é mexido; depois só faz update. */
export function useAlternarPagamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      alunoId,
      pagamentoId,
      mesReferencia,
      valor,
      novoStatus,
    }: {
      alunoId: string
      pagamentoId: string | null
      mesReferencia: string
      valor: number
      novoStatus: PagamentoStatus
    }) => {
      const pagoEm = novoStatus === 'pago' ? new Date().toISOString() : null

      if (pagamentoId) {
        const { error } = await supabase
          .from('pagamentos')
          .update({ status: novoStatus, pago_em: pagoEm })
          .eq('id', pagamentoId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('pagamentos')
          .insert({ aluno_id: alunoId, referencia_mes: mesReferencia, valor, status: novoStatus, pago_em: pagoEm })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pagamentos'] }),
  })
}
