import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Aula, AulaStatus } from '@/types/db'

export const ROTULO_STATUS_AULA: Record<AulaStatus, string> = {
  agendada: 'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  falta: 'Falta',
}

export const chavesAulas = {
  todas: ['aulas'] as const,
  doAluno: (alunoId: string) => ['aulas', 'aluno', alunoId] as const,
  entre: (inicioISO: string, fimISO: string) => ['aulas', 'entre', inicioISO, fimISO] as const,
}

export function useAulasDoAluno(alunoId: string | undefined) {
  return useQuery({
    queryKey: chavesAulas.doAluno(alunoId!),
    enabled: Boolean(alunoId),
    queryFn: async (): Promise<Aula[]> => {
      const { data, error } = await supabase
        .from('aulas')
        .select('*')
        .eq('aluno_id', alunoId!)
        .order('data_hora', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export type AulaComAluno = Aula & { alunoNome: string }

/**
 * Aulas de todos os alunos num intervalo — usado pela Agenda (semana) e pelo
 * painel "Aulas de hoje". RLS (`prof_owns_via_aluno`) já restringe às aulas
 * dos alunos do professor; não há coluna `professor_id` em `aulas`.
 */
export function useAulasEntre(inicioISO: string, fimISO: string) {
  return useQuery({
    queryKey: chavesAulas.entre(inicioISO, fimISO),
    queryFn: async (): Promise<AulaComAluno[]> => {
      const { data: aulas, error } = await supabase
        .from('aulas')
        .select('*')
        .gte('data_hora', inicioISO)
        .lt('data_hora', fimISO)
        .order('data_hora')
      if (error) throw error
      if (aulas.length === 0) return []

      const idsAlunos = [...new Set(aulas.map((a) => a.aluno_id))]
      const { data: alunos, error: erroAlunos } = await supabase
        .from('alunos')
        .select('id, nome')
        .in('id', idsAlunos)
      if (erroAlunos) throw erroAlunos
      const nomePorId = new Map(alunos.map((a) => [a.id, a.nome]))

      return aulas.map((a) => ({ ...a, alunoNome: nomePorId.get(a.aluno_id) ?? 'Aluno' }))
    },
  })
}

export type NovaAulaEntrada = {
  alunoId: string
  dataHoraISO: string
  duracaoMin: number
  status: AulaStatus
  anotacao?: string
  /** RF-42: quantas semanas a mais repetir no mesmo dia/horário (0 = só esta aula). */
  repetirSemanas?: number
}

export function useCriarAula() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entrada: NovaAulaEntrada) => {
      const base = new Date(entrada.dataHoraISO)
      const repeticoes = entrada.repetirSemanas ?? 0
      const datas = [entrada.dataHoraISO]
      for (let i = 1; i <= repeticoes; i++) {
        const d = new Date(base)
        d.setDate(d.getDate() + 7 * i)
        datas.push(d.toISOString())
      }

      const linhas = datas.map((data_hora) => ({
        aluno_id: entrada.alunoId,
        data_hora,
        duracao_min: entrada.duracaoMin,
        status: entrada.status,
        anotacao: entrada.anotacao?.trim() || null,
      }))
      const { error } = await supabase.from('aulas').insert(linhas)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAulas.todas }),
  })
}

export function useAtualizarAula() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      campos,
    }: {
      id: string
      campos: Partial<Pick<Aula, 'status' | 'anotacao' | 'data_hora' | 'duracao_min'>>
    }) => {
      const { error } = await supabase.from('aulas').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAulas.todas }),
  })
}

export function useExcluirAula() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('aulas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAulas.todas }),
  })
}
