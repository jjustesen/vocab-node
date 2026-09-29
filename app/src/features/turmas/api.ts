import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Aluno, Turma } from '@/types/db'
import { invalidarConteudos, sincronizarTurma, type ResultadoDaSincronizacao } from './conteudos'

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

export type TurmaComMembros = { id: string; nome: string; alunoIds: string[] }

/**
 * Todas as turmas com quem está em cada uma — o atalho "marcar a turma
 * inteira" das listas de escolha de aluno (materiais, atividades, trilhas).
 *
 * Mora sob a chave `['turmas', ...]` de propósito: toda mutação de turma já
 * invalida `chavesTurmas.todas`, que é prefixo desta — entrar ou sair da
 * turma atualiza o atalho sem ninguém lembrar de invalidá-lo.
 */
export function useTurmasComMembros() {
  return useQuery({
    queryKey: ['turmas', 'membros'] as const,
    queryFn: async (): Promise<TurmaComMembros[]> => {
      const [{ data: turmas, error }, { data: vinculos, error: erroVinculos }] = await Promise.all([
        supabase.from('turmas').select('id, nome').order('nome'),
        supabase.from('turmas_alunos').select('turma_id, aluno_id'),
      ])
      if (error) throw error
      if (erroVinculos) throw erroVinculos

      const porTurma = new Map<string, string[]>()
      for (const v of vinculos) porTurma.set(v.turma_id, [...(porTurma.get(v.turma_id) ?? []), v.aluno_id])
      return turmas.map((t) => ({ id: t.id, nome: t.nome, alunoIds: porTurma.get(t.id) ?? [] }))
    },
  })
}

export type TarefaDaTurma = {
  atividadeId: string
  titulo: string
  /** Quando a atividade foi enviada PARA A TURMA — é a data que ordena a lista. */
  enviadaEm: string
  prazo: string | null
  /** Quantos membros ATUAIS têm a atividade e quantos concluíram. */
  receberam: number
  concluiram: number
}

/**
 * As atividades DA turma (0020): o que foi enviado para ela, não o que os
 * membros têm por fora. Quem entrou depois já recebe ao entrar; "não recebeu"
 * só aparece se um envio automático falhou no meio.
 *
 * A contagem é sobre os membros de AGORA e só conta o envio avulso — etapa de
 * trilha está na seção de trilhas.
 */
export function useTarefasDaTurma(turmaId: string, alunoIds: string[]) {
  return useQuery({
    queryKey: ['turmas', turmaId, 'tarefas', [...alunoIds].sort().join(',')] as const,
    queryFn: async (): Promise<TarefaDaTurma[]> => {
      const { data: vinculos, error } = await supabase
        .from('turmas_conteudos')
        .select('atividade_id, criado_em')
        .eq('turma_id', turmaId)
        .not('atividade_id', 'is', null)
        .order('criado_em', { ascending: false })
      if (error) throw error
      const ids = vinculos.flatMap((v) => (v.atividade_id ? [v.atividade_id] : []))
      if (ids.length === 0) return []

      const [{ data: atividades, error: erroAtividades }, { data: atribuicoes, error: erroAtribuicoes }] =
        await Promise.all([
          supabase.from('atividades').select('id, titulo').in('id', ids),
          alunoIds.length > 0
            ? supabase
                .from('atribuicoes')
                .select('atividade_id, aluno_id, concluida_em, prazo, enviada_em')
                .in('atividade_id', ids)
                .in('aluno_id', alunoIds)
                .is('trilha_etapa_id', null)
                .is('revogada_em', null)
                .order('enviada_em', { ascending: false })
            : Promise.resolve({
                data: [] as {
                  atividade_id: string
                  aluno_id: string
                  concluida_em: string | null
                  prazo: string | null
                  enviada_em: string
                }[],
                error: null,
              }),
        ])
      if (erroAtividades) throw erroAtividades
      if (erroAtribuicoes) throw erroAtribuicoes
      const tituloPorId = new Map(atividades.map((a) => [a.id, a.titulo]))

      return vinculos.flatMap((v) => {
        if (!v.atividade_id) return []
        const daAtividade = atribuicoes.filter((a) => a.atividade_id === v.atividade_id)
        // Um aluno pode ter a mesma atividade mais de uma vez (tentativas):
        // conta a pessoa uma vez só, concluída se QUALQUER envio dela foi.
        const receberam = new Set(daAtividade.map((a) => a.aluno_id))
        const concluiram = new Set(daAtividade.filter((a) => a.concluida_em).map((a) => a.aluno_id))
        return [
          {
            atividadeId: v.atividade_id,
            titulo: tituloPorId.get(v.atividade_id) ?? 'Atividade apagada',
            enviadaEm: v.criado_em,
            prazo: daAtividade[0]?.prazo ?? null,
            receberam: receberam.size,
            concluiram: concluiram.size,
          },
        ]
      })
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

/**
 * Põe vários na turma de uma vez — o "ver todos" da tela da turma. Um upsert
 * só: quem já estava continua como estava, sem erro de chave repetida.
 *
 * Entrar na turma é receber o que é dela: no mesmo gesto, cada um ganha as
 * trilhas, atividades e materiais da turma que ainda não tinha.
 */
export function useAdicionarAlunosNaTurma(turmaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (alunoIds: string[]): Promise<ResultadoDaSincronizacao | null> => {
      if (alunoIds.length === 0) return null
      const { error } = await supabase
        .from('turmas_alunos')
        .upsert(
          alunoIds.map((aluno_id) => ({ turma_id: turmaId, aluno_id })),
          { onConflict: 'turma_id,aluno_id', ignoreDuplicates: true },
        )
      if (error) throw error
      return sincronizarTurma(turmaId, alunoIds)
    },
    // Invalida mesmo se o envio falhar no meio: a pessoa já entrou, e o que
    // chegou até ali já é dela.
    onSettled: () => invalidarConteudos(qc),
  })
}

export function useMudarAlunoDaTurma(turmaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      alunoId,
      dentro,
    }: {
      alunoId: string
      dentro: boolean
    }): Promise<ResultadoDaSincronizacao | null> => {
      if (dentro) {
        const { error } = await supabase
          .from('turmas_alunos')
          .insert({ turma_id: turmaId, aluno_id: alunoId })
        if (error) throw error
        // Mesma regra do adicionar em lote: entrar é receber o que é da turma.
        return sincronizarTurma(turmaId, [alunoId])
      } else {
        const { error } = await supabase
          .from('turmas_alunos')
          .delete()
          .eq('turma_id', turmaId)
          .eq('aluno_id', alunoId)
        if (error) throw error
        // Sair da turma não tira nada: o que a pessoa já recebeu, e as
        // respostas dela, continuam dela.
        return null
      }
    },
    onSettled: () => invalidarConteudos(qc),
  })
}
