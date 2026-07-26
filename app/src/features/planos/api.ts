import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { limiteAlunos as limiteAlunosPorPlano, limiteGeracoes as limiteGeracoesPorPlano } from '@/lib/planos'
import type { Professor } from '@/types/db'

export function useProfessor() {
  return useQuery({
    queryKey: ['professor'],
    queryFn: async (): Promise<Professor> => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')
      const { data, error } = await supabase.from('professores').select('*').eq('id', sessao.user.id).single()
      if (error) throw error
      return data
    },
  })
}

export type UsoDoMes = {
  plano: Professor['plano']
  alunosAtivos: number
  limiteAlunos: number | null
  geracoesDoMes: number
  limiteGeracoes: number
}

/** RF-110/111/112: uso atual contra o limite do plano. */
export function useUsoDoMes() {
  const { data: professor } = useProfessor()
  return useQuery({
    queryKey: ['uso-do-mes', professor?.id],
    enabled: Boolean(professor),
    queryFn: async (): Promise<UsoDoMes> => {
      const inicioMes = new Date()
      inicioMes.setDate(1)
      inicioMes.setHours(0, 0, 0, 0)

      const [{ count: alunosAtivos }, { count: geracoesDoMes }] = await Promise.all([
        supabase.from('alunos').select('*', { count: 'exact', head: true }).eq('status', 'ativo'),
        supabase
          .from('geracoes_ia')
          .select('*', { count: 'exact', head: true })
          .eq('sucesso', true)
          .gte('criada_em', inicioMes.toISOString()),
      ])

      return {
        plano: professor!.plano,
        alunosAtivos: alunosAtivos ?? 0,
        limiteAlunos: limiteAlunosPorPlano(professor!.plano),
        geracoesDoMes: geracoesDoMes ?? 0,
        limiteGeracoes: limiteGeracoesPorPlano(professor!.plano),
      }
    },
  })
}
