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
  serie: (serieId: string) => ['aulas', 'serie', serieId] as const,
}

/**
 * A que uma edição se aplica quando a aula veio de "repetir semanalmente".
 * Mesmos três escopos do Google Calendar, porque é o modelo que o professor
 * já conhece de outras agendas.
 */
export type EscopoSerie = 'uma' | 'futuras' | 'todas'

/**
 * "toda qua., 22:29" — o padrão semanal lido da própria ocorrência, já que a
 * recorrência não é gravada como regra (ver 0007_aulas_serie.sql).
 */
export function rotuloRecorrencia(dataHoraISO: string): string {
  const d = new Date(dataHoraISO)
  const fimDeSemana = d.getDay() === 0 || d.getDay() === 6
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${fimDeSemana ? 'todo' : 'toda'} ${dia}., ${hora}`
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

      // O carimbo só existe se houver repetição: aula avulsa com `serie_id`
      // faria a UI oferecer "esta e as próximas" sem haver próximas.
      const serieId = repeticoes > 0 ? crypto.randomUUID() : null

      const linhas = datas.map((data_hora) => ({
        aluno_id: entrada.alunoId,
        data_hora,
        duracao_min: entrada.duracaoMin,
        status: entrada.status,
        anotacao: entrada.anotacao?.trim() || null,
        serie_id: serieId,
      }))
      const { error } = await supabase.from('aulas').insert(linhas)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAulas.todas }),
  })
}

/** As outras ocorrências da mesma série — usado para dizer quantas aulas um escopo afeta. */
export function useAulasDaSerie(serieId: string | null | undefined) {
  return useQuery({
    queryKey: chavesAulas.serie(serieId!),
    enabled: Boolean(serieId),
    queryFn: async (): Promise<Pick<Aula, 'id' | 'data_hora'>[]> => {
      const { data, error } = await supabase
        .from('aulas')
        .select('id, data_hora')
        .eq('serie_id', serieId!)
        .order('data_hora')
      if (error) throw error
      return data
    },
  })
}

/**
 * Horário e duração respeitam o escopo; status e anotação NUNCA propagam —
 * são o registro do que aconteceu naquela aula, e marcar uma como realizada
 * não pode marcar as futuras.
 *
 * A mudança de horário viaja como DELTA, não como valor absoluto: mover a
 * aula de quarta 22:29 para segunda 19:00 desloca as seguintes pelos mesmos
 * -2 dias -3h29, preservando a cadência semanal em vez de empilhar a série
 * toda no mesmo instante.
 */
export function useAtualizarAula() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      aula,
      campos,
      escopo = 'uma',
    }: {
      aula: Aula
      campos: Partial<Pick<Aula, 'status' | 'anotacao' | 'data_hora' | 'duracao_min'>>
      escopo?: EscopoSerie
    }) => {
      const emSerie = Boolean(aula.serie_id) && escopo !== 'uma'
      const { data_hora, duracao_min, ...soDestaAula } = campos

      if (emSerie) {
        const deltaSegundos = data_hora
          ? (new Date(data_hora).getTime() - new Date(aula.data_hora).getTime()) / 1000
          : 0
        const { error } = await supabase.rpc('mover_aulas_da_serie', {
          p_serie_id: aula.serie_id!,
          // O corte usa o horário ANTIGO — a própria aula editada entra no
          // deslocamento, então ela não pode ser movida antes da chamada.
          p_a_partir_de: escopo === 'futuras' ? aula.data_hora : null,
          p_delta_segundos: deltaSegundos,
          p_duracao_min: duracao_min ?? null,
        })
        if (error) throw error
      }

      const camposDestaAula = emSerie ? soDestaAula : campos
      if (Object.keys(camposDestaAula).length > 0) {
        const { error } = await supabase.from('aulas').update(camposDestaAula).eq('id', aula.id)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAulas.todas }),
  })
}

export function useExcluirAula() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ aula, escopo = 'uma' }: { aula: Aula; escopo?: EscopoSerie }) => {
      if (aula.serie_id && escopo !== 'uma') {
        let consulta = supabase.from('aulas').delete().eq('serie_id', aula.serie_id)
        if (escopo === 'futuras') consulta = consulta.gte('data_hora', aula.data_hora)
        const { error } = await consulta
        if (error) throw error
        return
      }
      const { error } = await supabase.from('aulas').delete().eq('id', aula.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAulas.todas }),
  })
}
