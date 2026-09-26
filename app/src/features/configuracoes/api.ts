import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Professor } from '@/types/db'

/** O que o professor pode ajustar na plataforma — hoje, só as aulas ao vivo. */
export type Configuracoes = Pick<Professor, 'sala_de_espera'>

/**
 * Grava uma configuração na linha do próprio professor (RLS `prof_self`).
 *
 * Otimista: um interruptor que demora a virar parece quebrado. Se o banco
 * recusar, volta ao que era e a tela mostra o erro.
 */
export function useSalvarConfiguracoes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (mudanca: Partial<Configuracoes>) => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')
      const { error } = await supabase.from('professores').update(mudanca).eq('id', sessao.user.id)
      if (error) throw error
    },
    onMutate: async (mudanca) => {
      await qc.cancelQueries({ queryKey: ['professor'] })
      const anterior = qc.getQueryData<Professor>(['professor'])
      if (anterior) qc.setQueryData<Professor>(['professor'], { ...anterior, ...mudanca })
      return { anterior }
    },
    onError: (_erro, _mudanca, contexto) => {
      if (contexto?.anterior) qc.setQueryData(['professor'], contexto.anterior)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['professor'] }),
  })
}
