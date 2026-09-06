import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Aluno, Turma } from '@/types/db'

/**
 * Turmas — a aula em grupo (migration 0015).
 *
 * A lista de alunos da turma não é só organização de tela: é o CONTROLE DE
 * ACESSO da sala. Quem chega pelo link sem conta se identifica por e-mail, e
 * `sala-entrar` procura esse e-mail exatamente entre estes alunos. Tirar
 * alguém da turma tira o acesso dele à sala — e é bom que os dois gestos sejam
 * o mesmo, para não existir "removi da turma mas continua entrando".
 *
 * Tudo aqui vai por RLS, com o cliente do professor.
 */

export const chavesTurmas = {
  todas: ['turmas'] as const,
  uma: (id: string) => ['turmas', id] as const,
  alunos: (id: string) => ['turmas', id, 'alunos'] as const,
}

export type TurmaComContagem = Turma & { alunos: number }

export function useTurmas() {
  return useQuery({
    queryKey: chavesTurmas.todas,
    queryFn: async (): Promise<TurmaComContagem[]> => {
      const { data, error } = await supabase
        .from('turmas')
        .select('*')
        .order('criada_em', { ascending: false })
      if (error) throw error

      // Contagem em UMA consulta a mais, e não uma por turma: a tela mostra
      // "3 alunos" em cada cartão, e um professor com vinte turmas faria vinte
      // requisições para preencher vinte números.
      const { data: vinculos, error: erroVinculos } = await supabase
        .from('turmas_alunos')
        .select('turma_id')
      if (erroVinculos) throw erroVinculos

      const porTurma = new Map<string, number>()
      for (const v of vinculos) porTurma.set(v.turma_id, (porTurma.get(v.turma_id) ?? 0) + 1)

      return data.map((t) => ({ ...t, alunos: porTurma.get(t.id) ?? 0 }))
    },
  })
}

export function useTurma(id: string | undefined) {
  return useQuery({
    queryKey: chavesTurmas.uma(id!),
    enabled: Boolean(id),
    queryFn: async (): Promise<Turma | null> => {
      const { data, error } = await supabase.from('turmas').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Quem é esperado na turma — a mesma lista que a porta da sala consulta. */
export function useAlunosDaTurma(turmaId: string | undefined) {
  return useQuery({
    queryKey: chavesTurmas.alunos(turmaId!),
    enabled: Boolean(turmaId),
    queryFn: async (): Promise<Aluno[]> => {
      const { data, error } = await supabase
        .from('turmas_alunos')
        .select('aluno_id')
        .eq('turma_id', turmaId!)
      if (error) throw error
      const ids = data.map((v) => v.aluno_id)
      if (ids.length === 0) return []

      const { data: alunos, error: erroAlunos } = await supabase
        .from('alunos')
        .select('*')
        .in('id', ids)
        .order('nome')
      if (erroAlunos) throw erroAlunos
      return alunos
    },
  })
}

export function useCriarTurma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nome: string): Promise<Turma> => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')

      const { data, error } = await supabase
        .from('turmas')
        .insert({ professor_id: sessao.user.id, nome: nome.trim() })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTurmas.todas }),
  })
}

export function useRenomearTurma(turmaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from('turmas').update({ nome: nome.trim() }).eq('id', turmaId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chavesTurmas.todas })
      qc.invalidateQueries({ queryKey: chavesTurmas.uma(turmaId) })
    },
  })
}

/**
 * Apagar a turma leva a sala junto (`on delete cascade` em 0015) — e isso é
 * intencional: uma sala de turma sem turma seria um link que abre uma porta
 * para lista de convidados nenhuma.
 */
export function useExcluirTurma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (turmaId: string) => {
      const { error } = await supabase.from('turmas').delete().eq('id', turmaId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTurmas.todas }),
  })
}

export function useMudarAlunoDaTurma(turmaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ alunoId, dentro }: { alunoId: string; dentro: boolean }) => {
      if (dentro) {
        const { error } = await supabase
          .from('turmas_alunos')
          .insert({ turma_id: turmaId, aluno_id: alunoId })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('turmas_alunos')
          .delete()
          .eq('turma_id', turmaId)
          .eq('aluno_id', alunoId)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chavesTurmas.alunos(turmaId) })
      qc.invalidateQueries({ queryKey: chavesTurmas.todas })
    },
  })
}
