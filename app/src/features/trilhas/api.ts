import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gerarTokenDeAcesso } from '@/lib/token'
import type { Aluno, NivelCefr, Trilha, TrilhaAluno, TrilhaAlunoStatus, TrilhaEtapa } from '@/types/db'

export const chavesTrilhas = {
  todas: ['trilhas'] as const,
  lista: ['trilhas', 'lista'] as const,
  uma: (id: string) => ['trilhas', id] as const,
  etapas: (id: string) => ['trilhas', id, 'etapas'] as const,
  alunos: (id: string) => ['trilhas', id, 'alunos'] as const,
  doAluno: (alunoId: string) => ['trilhas', 'aluno', alunoId] as const,
  doAlunoNaTrilha: (trilhaId: string, alunoId: string) =>
    ['trilhas', trilhaId, 'aluno', alunoId] as const,
}

export const ROTULO_STATUS_TRILHA: Record<TrilhaAlunoStatus, string> = {
  ativa: 'Ativa',
  pausada: 'Pausada',
  concluida: 'Concluída',
}

export type ProgressoAluno = {
  alunoId: string
  alunoNome: string
  status: TrilhaAlunoStatus
  concluidas: number
  total: number
}

export type TrilhaComProgresso = Trilha & {
  etapas: number
  /** Soma das questões de todas as etapas — vira o "~48 min no total" do card. */
  questoes: number
  progresso: ProgressoAluno[]
}

/**
 * Progresso é sempre derivado, nunca guardado (regra-chave 3 do PRD §8):
 * conta as atribuições daquele aluno que apontam para etapas desta trilha e
 * já têm `concluida_em`. Não existe coluna de "etapa atual" para desincronizar.
 */
function montarProgresso(
  etapaIdsPorTrilha: Map<string, string[]>,
  vinculos: TrilhaAluno[],
  nomePorAluno: Map<string, string>,
  concluidasPorAlunoEEtapa: Set<string>,
): Map<string, ProgressoAluno[]> {
  const porTrilha = new Map<string, ProgressoAluno[]>()
  for (const v of vinculos) {
    const etapaIds = etapaIdsPorTrilha.get(v.trilha_id) ?? []
    const lista = porTrilha.get(v.trilha_id) ?? []
    lista.push({
      alunoId: v.aluno_id,
      alunoNome: nomePorAluno.get(v.aluno_id) ?? 'Aluno',
      status: v.status,
      concluidas: etapaIds.filter((e) => concluidasPorAlunoEEtapa.has(`${v.aluno_id}|${e}`)).length,
      total: etapaIds.length,
    })
    porTrilha.set(v.trilha_id, lista)
  }
  return porTrilha
}

export function useTrilhas() {
  return useQuery({
    queryKey: chavesTrilhas.lista,
    queryFn: async (): Promise<TrilhaComProgresso[]> => {
      const { data: trilhas, error } = await supabase
        .from('trilhas')
        .select('*')
        .order('criada_em', { ascending: false })
      if (error) throw error
      if (trilhas.length === 0) return []

      const ids = trilhas.map((t) => t.id)
      const [{ data: etapas, error: erroEtapas }, { data: vinculos, error: erroVinculos }] =
        await Promise.all([
          supabase.from('trilha_etapas').select('id, trilha_id, atividade_id').in('trilha_id', ids),
          supabase.from('trilha_alunos').select('*').in('trilha_id', ids),
        ])
      if (erroEtapas) throw erroEtapas
      if (erroVinculos) throw erroVinculos

      const etapaIdsPorTrilha = new Map<string, string[]>()
      for (const e of etapas) {
        etapaIdsPorTrilha.set(e.trilha_id, [...(etapaIdsPorTrilha.get(e.trilha_id) ?? []), e.id])
      }

      const [nomePorAluno, concluidas, { data: questoes }] = await Promise.all([
        buscarNomes([...new Set(vinculos.map((v) => v.aluno_id))]),
        buscarConcluidas(etapas.map((e) => e.id)),
        etapas.length > 0
          ? supabase
              .from('questoes')
              .select('id, atividade_id')
              .in('atividade_id', [...new Set(etapas.map((e) => e.atividade_id))])
          : Promise.resolve({ data: [] as { id: string; atividade_id: string }[] }),
      ])

      const questoesPorAtividade = new Map<string, number>()
      for (const q of questoes ?? []) {
        questoesPorAtividade.set(q.atividade_id, (questoesPorAtividade.get(q.atividade_id) ?? 0) + 1)
      }
      const questoesPorTrilha = new Map<string, number>()
      for (const e of etapas) {
        questoesPorTrilha.set(
          e.trilha_id,
          (questoesPorTrilha.get(e.trilha_id) ?? 0) + (questoesPorAtividade.get(e.atividade_id) ?? 0),
        )
      }

      const progressoPorTrilha = montarProgresso(etapaIdsPorTrilha, vinculos, nomePorAluno, concluidas)

      return trilhas.map((t) => ({
        ...t,
        etapas: (etapaIdsPorTrilha.get(t.id) ?? []).length,
        questoes: questoesPorTrilha.get(t.id) ?? 0,
        progresso: progressoPorTrilha.get(t.id) ?? [],
      }))
    },
  })
}

async function buscarNomes(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('alunos').select('id, nome').in('id', ids)
  if (error) throw error
  return new Map(data.map((a) => [a.id, a.nome]))
}

/**
 * Chaves `alunoId|etapaId` das etapas concluídas.
 *
 * Conta só a tentativa MAIS RECENTE de cada etapa: reenviar a trilha como
 * reforço (RF-122/127) cria uma tentativa nova, e a etapa volta a ser uma
 * pendência de verdade. Contar "qualquer tentativa já concluída" faria o
 * professor ver a etapa como pronta enquanto o aluno vê "Continuar" no painel.
 */
async function buscarConcluidas(etapaIds: string[]): Promise<Set<string>> {
  if (etapaIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('atribuicoes')
    .select('aluno_id, trilha_etapa_id, concluida_em, enviada_em')
    .in('trilha_etapa_id', etapaIds)
    .order('enviada_em', { ascending: false })
  if (error) throw error

  const maisRecentePorPar = new Map<string, string | null>()
  for (const a of data) {
    const chave = `${a.aluno_id}|${a.trilha_etapa_id}`
    if (!maisRecentePorPar.has(chave)) maisRecentePorPar.set(chave, a.concluida_em)
  }

  return new Set([...maisRecentePorPar.entries()].filter(([, em]) => em !== null).map(([chave]) => chave))
}

export function useTrilha(id: string | undefined) {
  return useQuery({
    queryKey: chavesTrilhas.uma(id!),
    enabled: Boolean(id),
    queryFn: async (): Promise<Trilha> => {
      const { data, error } = await supabase.from('trilhas').select('*').eq('id', id!).single()
      if (error) throw error
      return data
    },
  })
}

export type EtapaComAtividade = TrilhaEtapa & {
  atividadeTitulo: string
  atividadeNivel: NivelCefr
  questoes: number
}

export function useEtapasDaTrilha(trilhaId: string | undefined) {
  return useQuery({
    queryKey: chavesTrilhas.etapas(trilhaId!),
    enabled: Boolean(trilhaId),
    queryFn: async (): Promise<EtapaComAtividade[]> => {
      const { data: etapas, error } = await supabase
        .from('trilha_etapas')
        .select('*')
        .eq('trilha_id', trilhaId!)
        .order('ordem')
      if (error) throw error
      if (etapas.length === 0) return []

      const idsAtividades = [...new Set(etapas.map((e) => e.atividade_id))]
      const [{ data: atividades, error: erroAtividades }, { data: questoes, error: erroQuestoes }] =
        await Promise.all([
          supabase.from('atividades').select('id, titulo, nivel').in('id', idsAtividades),
          supabase.from('questoes').select('id, atividade_id').in('atividade_id', idsAtividades),
        ])
      if (erroAtividades) throw erroAtividades
      if (erroQuestoes) throw erroQuestoes

      const atividadePorId = new Map(atividades.map((a) => [a.id, a]))
      const questoesPorAtividade = new Map<string, number>()
      for (const q of questoes) {
        questoesPorAtividade.set(q.atividade_id, (questoesPorAtividade.get(q.atividade_id) ?? 0) + 1)
      }

      return etapas.map((e) => ({
        ...e,
        atividadeTitulo: atividadePorId.get(e.atividade_id)?.titulo ?? 'Atividade removida',
        atividadeNivel: atividadePorId.get(e.atividade_id)?.nivel ?? 'A1',
        questoes: questoesPorAtividade.get(e.atividade_id) ?? 0,
      }))
    },
  })
}

export function useAlunosDaTrilha(trilhaId: string | undefined) {
  return useQuery({
    queryKey: chavesTrilhas.alunos(trilhaId!),
    enabled: Boolean(trilhaId),
    queryFn: async (): Promise<ProgressoAluno[]> => {
      const [{ data: vinculos, error }, { data: etapas, error: erroEtapas }] = await Promise.all([
        supabase.from('trilha_alunos').select('*').eq('trilha_id', trilhaId!),
        supabase.from('trilha_etapas').select('id').eq('trilha_id', trilhaId!),
      ])
      if (error) throw error
      if (erroEtapas) throw erroEtapas
      if (vinculos.length === 0) return []

      const etapaIds = etapas.map((e) => e.id)
      const [nomePorAluno, concluidas] = await Promise.all([
        buscarNomes(vinculos.map((v) => v.aluno_id)),
        buscarConcluidas(etapaIds),
      ])

      return montarProgresso(new Map([[trilhaId!, etapaIds]]), vinculos, nomePorAluno, concluidas).get(
        trilhaId!,
      )!
    },
  })
}

export type TrilhaNaFicha = {
  trilhaId: string
  nome: string
  nivel: NivelCefr
  status: TrilhaAlunoStatus
  concluidas: number
  total: number
}

/** As trilhas em que este aluno está — porta de entrada para a tela P13. */
export function useTrilhasDoAluno(alunoId: string | undefined) {
  return useQuery({
    queryKey: chavesTrilhas.doAluno(alunoId!),
    enabled: Boolean(alunoId),
    queryFn: async (): Promise<TrilhaNaFicha[]> => {
      const { data: vinculos, error } = await supabase
        .from('trilha_alunos')
        .select('trilha_id, status')
        .eq('aluno_id', alunoId!)
      if (error) throw error
      if (vinculos.length === 0) return []

      const ids = vinculos.map((v) => v.trilha_id)
      const [{ data: trilhas }, { data: etapas }] = await Promise.all([
        supabase.from('trilhas').select('id, nome, nivel').in('id', ids),
        supabase.from('trilha_etapas').select('id, trilha_id').in('trilha_id', ids),
      ])

      const trilhaPorId = new Map((trilhas ?? []).map((t) => [t.id, t]))
      const etapasPorTrilha = new Map<string, string[]>()
      for (const e of etapas ?? []) {
        etapasPorTrilha.set(e.trilha_id, [...(etapasPorTrilha.get(e.trilha_id) ?? []), e.id])
      }
      const concluidas = await buscarConcluidas((etapas ?? []).map((e) => e.id))

      return vinculos.flatMap((v) => {
        const trilha = trilhaPorId.get(v.trilha_id)
        if (!trilha) return []
        const daTrilha = etapasPorTrilha.get(v.trilha_id) ?? []
        return [
          {
            trilhaId: trilha.id,
            nome: trilha.nome,
            nivel: trilha.nivel,
            status: v.status,
            concluidas: daTrilha.filter((e) => concluidas.has(`${alunoId}|${e}`)).length,
            total: daTrilha.length,
          },
        ]
      })
    },
  })
}

export type EtapaDoAluno = {
  etapaId: string
  ordem: number
  atividadeId: string
  titulo: string
  nivel: NivelCefr
  questoes: number
  /** null quando a etapa nunca foi atribuída a este aluno. */
  atribuicaoId: string | null
  enviadaEm: string | null
  iniciadaEm: string | null
  concluidaEm: string | null
  acertos: number | null
  total: number | null
  tempoMs: number | null
}

export type TrilhaDoAluno = {
  trilha: Trilha
  alunoNome: string
  alunoTelefone: string | null
  status: TrilhaAlunoStatus
  iniciadaEm: string
  etapas: EtapaDoAluno[]
  concluidas: number
  /** Média de acerto entre as etapas já concluídas; null se nenhuma foi. */
  mediaPercentual: number | null
  /** Dias entre envio e conclusão nas etapas já fechadas — o ritmo do aluno. */
  diasTipicosParaResponder: number | null
  /** Habilidade com mais erros dentro desta trilha. Proxy de "tema" (ver RF-94). */
  pontoFraco: string | null
}

/**
 * P13 — a trilha vista pelo professor, para UM aluno. Junta em memória o que
 * está espalhado em 5 tabelas; como é uma tela por vez, e não uma listagem,
 * o custo de algumas consultas planas é aceitável.
 */
export function useTrilhaDoAluno(trilhaId: string | undefined, alunoId: string | undefined) {
  return useQuery({
    queryKey: chavesTrilhas.doAlunoNaTrilha(trilhaId!, alunoId!),
    enabled: Boolean(trilhaId && alunoId),
    queryFn: async (): Promise<TrilhaDoAluno> => {
      const [{ data: trilha, error: erroTrilha }, { data: vinculo }, { data: aluno }] = await Promise.all([
        supabase.from('trilhas').select('*').eq('id', trilhaId!).single(),
        supabase
          .from('trilha_alunos')
          .select('status, iniciada_em')
          .eq('trilha_id', trilhaId!)
          .eq('aluno_id', alunoId!)
          .maybeSingle(),
        supabase.from('alunos').select('nome, telefone').eq('id', alunoId!).maybeSingle(),
      ])
      if (erroTrilha) throw erroTrilha

      const { data: etapas, error: erroEtapas } = await supabase
        .from('trilha_etapas')
        .select('*')
        .eq('trilha_id', trilhaId!)
        .order('ordem')
      if (erroEtapas) throw erroEtapas

      const idsAtividades = [...new Set(etapas.map((e) => e.atividade_id))]
      const [{ data: atividades }, { data: questoes }, { data: atribuicoes }] = await Promise.all([
        supabase.from('atividades').select('id, titulo, nivel, habilidades').in('id', idsAtividades),
        supabase.from('questoes').select('id, atividade_id').in('atividade_id', idsAtividades),
        etapas.length > 0
          ? supabase
              .from('atribuicoes')
              .select('id, trilha_etapa_id, enviada_em, iniciada_em, concluida_em')
              .eq('aluno_id', alunoId!)
              .in(
                'trilha_etapa_id',
                etapas.map((e) => e.id),
              )
              .order('enviada_em', { ascending: false })
          : Promise.resolve({ data: [] as never[] }),
      ])

      const atividadePorId = new Map((atividades ?? []).map((a) => [a.id, a]))
      const questoesPorAtividade = new Map<string, number>()
      for (const q of questoes ?? []) {
        questoesPorAtividade.set(q.atividade_id, (questoesPorAtividade.get(q.atividade_id) ?? 0) + 1)
      }

      // Sempre a tentativa mais recente de cada etapa (ver PRD, decisão de
      // 26/07/2026): reatribuir a trilha reabre a etapa.
      type AtribuicaoDaEtapa = {
        id: string
        trilha_etapa_id: string | null
        enviada_em: string
        iniciada_em: string | null
        concluida_em: string | null
      }
      const atribuicaoPorEtapa = new Map<string, AtribuicaoDaEtapa>()
      for (const a of (atribuicoes ?? []) as AtribuicaoDaEtapa[]) {
        if (a.trilha_etapa_id && !atribuicaoPorEtapa.has(a.trilha_etapa_id)) {
          atribuicaoPorEtapa.set(a.trilha_etapa_id, a)
        }
      }

      const idsConcluidas = [...atribuicaoPorEtapa.values()].filter((a) => a.concluida_em).map((a) => a.id)
      const placarPorAtribuicao = new Map<string, { acertos: number; total: number; tempoMs: number }>()
      const errosPorQuestao = new Map<string, number>()
      if (idsConcluidas.length > 0) {
        const { data: respostas } = await supabase
          .from('respostas')
          .select('atribuicao_id, questao_id, correta, tempo_ms')
          .in('atribuicao_id', idsConcluidas)
        for (const r of respostas ?? []) {
          const atual = placarPorAtribuicao.get(r.atribuicao_id) ?? { acertos: 0, total: 0, tempoMs: 0 }
          atual.total += 1
          atual.tempoMs += r.tempo_ms ?? 0
          if (r.correta) atual.acertos += 1
          else errosPorQuestao.set(r.questao_id, (errosPorQuestao.get(r.questao_id) ?? 0) + 1)
          placarPorAtribuicao.set(r.atribuicao_id, atual)
        }
      }

      const saida: EtapaDoAluno[] = etapas.map((e) => {
        const atribuicao = atribuicaoPorEtapa.get(e.id)
        const placar = atribuicao ? placarPorAtribuicao.get(atribuicao.id) : undefined
        const atividade = atividadePorId.get(e.atividade_id)
        return {
          etapaId: e.id,
          ordem: e.ordem,
          atividadeId: e.atividade_id,
          titulo: atividade?.titulo ?? 'Atividade removida',
          nivel: atividade?.nivel ?? 'A1',
          questoes: questoesPorAtividade.get(e.atividade_id) ?? 0,
          atribuicaoId: atribuicao?.id ?? null,
          enviadaEm: atribuicao?.enviada_em ?? null,
          iniciadaEm: atribuicao?.iniciada_em ?? null,
          concluidaEm: atribuicao?.concluida_em ?? null,
          acertos: placar?.acertos ?? null,
          total: placar?.total ?? null,
          tempoMs: placar?.tempoMs ?? null,
        }
      })

      const concluidas = saida.filter((e) => e.concluidaEm)
      const mediaPercentual =
        concluidas.length > 0
          ? Math.round(
              (concluidas.reduce((s, e) => s + (e.total ? (e.acertos ?? 0) / e.total : 0), 0) /
                concluidas.length) *
                100,
            )
          : null

      const diasParaResponder = concluidas
        .filter((e) => e.enviadaEm && e.concluidaEm)
        .map((e) => (new Date(e.concluidaEm!).getTime() - new Date(e.enviadaEm!).getTime()) / 86_400_000)
      const diasTipicosParaResponder =
        diasParaResponder.length > 0
          ? Math.round(diasParaResponder.reduce((s, d) => s + d, 0) / diasParaResponder.length)
          : null

      // Ponto fraco: o schema não tem tema por questão, então agrupamos pelas
      // habilidades da atividade a que a questão errada pertence — mesmo proxy
      // usado em "erros recorrentes" na ficha do aluno.
      const atividadePorQuestao = new Map((questoes ?? []).map((q) => [q.id, q.atividade_id]))
      const errosPorHabilidade = new Map<string, number>()
      for (const [questaoId, erros] of errosPorQuestao) {
        const atividade = atividadePorId.get(atividadePorQuestao.get(questaoId) ?? '')
        for (const h of atividade?.habilidades ?? []) {
          errosPorHabilidade.set(h, (errosPorHabilidade.get(h) ?? 0) + erros)
        }
      }
      const pontoFraco = [...errosPorHabilidade.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

      return {
        trilha,
        alunoNome: aluno?.nome ?? 'Aluno',
        alunoTelefone: aluno?.telefone ?? null,
        status: vinculo?.status ?? 'ativa',
        iniciadaEm: vinculo?.iniciada_em ?? trilha.criada_em,
        etapas: saida,
        concluidas: concluidas.length,
        mediaPercentual,
        diasTipicosParaResponder,
        pontoFraco,
      }
    },
  })
}

/**
 * RF-122: reenviar UMA etapa como reforço, sem remexer na trilha inteira.
 * Cria uma tentativa nova daquela atividade (RF-127) ligada à mesma etapa, e
 * devolve o link — necessário para aluno sem conta.
 */
export function useReenviarEtapa(trilhaId: string, alunoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (etapa: { etapaId: string; atividadeId: string }): Promise<string> => {
      const { count } = await supabase
        .from('atribuicoes')
        .select('*', { count: 'exact', head: true })
        .eq('atividade_id', etapa.atividadeId)
        .eq('aluno_id', alunoId)

      const { token, hash } = await gerarTokenDeAcesso()
      const { error } = await supabase.from('atribuicoes').insert({
        atividade_id: etapa.atividadeId,
        aluno_id: alunoId,
        trilha_etapa_id: etapa.etapaId,
        token_hash: hash,
        tentativa: (count ?? 0) + 1,
      })
      if (error) throw error
      return `${window.location.origin}/t/${token}`
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chavesTrilhas.doAlunoNaTrilha(trilhaId, alunoId) })
      qc.invalidateQueries({ queryKey: chavesTrilhas.doAluno(alunoId) })
      qc.invalidateQueries({ queryKey: chavesTrilhas.lista })
    },
  })
}

export function useCriarTrilha() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entrada: { nome: string; nivel: NivelCefr; descricao?: string }) => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')

      const { data, error } = await supabase
        .from('trilhas')
        .insert({
          professor_id: sessao.user.id,
          nome: entrada.nome.trim(),
          nivel: entrada.nivel,
          descricao: entrada.descricao?.trim() || null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.todas }),
  })
}

export function useAtualizarTrilha(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (campos: Partial<Pick<Trilha, 'nome' | 'nivel' | 'descricao'>>) => {
      const { error } = await supabase.from('trilhas').update(campos).eq('id', trilhaId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.todas }),
  })
}

export function useExcluirTrilha() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (trilhaId: string) => {
      const { error } = await supabase.from('trilhas').delete().eq('id', trilhaId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.todas }),
  })
}

/** Entra sempre no fim da sequência; reordenar é ação separada. */
export function useAdicionarEtapa(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (atividadeId: string) => {
      const { data: existentes, error: erroExistentes } = await supabase
        .from('trilha_etapas')
        .select('ordem')
        .eq('trilha_id', trilhaId)
        .order('ordem', { ascending: false })
        .limit(1)
      if (erroExistentes) throw erroExistentes

      const proxima = (existentes[0]?.ordem ?? 0) + 1
      const { error } = await supabase
        .from('trilha_etapas')
        .insert({ trilha_id: trilhaId, atividade_id: atividadeId, ordem: proxima })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.todas }),
  })
}

/**
 * Renumera o que sobrou depois de remover. Se a renumeração falhar, fica um
 * buraco na sequência (1,2,4) — inofensivo, porque a ordem é lida por
 * `order('ordem')` e não pela contiguidade dos números.
 */
export function useRemoverEtapa(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (etapaId: string) => {
      const { error } = await supabase.from('trilha_etapas').delete().eq('id', etapaId)
      if (error) throw error

      const { data: restantes, error: erroRestantes } = await supabase
        .from('trilha_etapas')
        .select('*')
        .eq('trilha_id', trilhaId)
        .order('ordem')
      if (erroRestantes) throw erroRestantes

      await salvarOrdem(restantes)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.todas }),
  })
}

/**
 * Grava a ordem de todas as etapas numa requisição só. É de propósito: a
 * `unique(trilha_id, ordem)` é DEFERRABLE INITIALLY DEFERRED, então ela só é
 * verificada no COMMIT — e uma requisição PostgREST é uma transação. Fazer
 * update etapa por etapa violaria a unicidade no meio do caminho.
 */
async function salvarOrdem(etapas: TrilhaEtapa[]) {
  if (etapas.length === 0) return
  // Monta as colunas uma a uma de propósito: quem chama passa
  // `EtapaComAtividade`, que carrega título/nível/questões calculados no
  // cliente. Um spread mandaria esses campos para o PostgREST, que rejeita
  // coluna inexistente com 400 (PGRST204).
  const linhas = etapas.map((e, i) => ({
    id: e.id,
    trilha_id: e.trilha_id,
    atividade_id: e.atividade_id,
    ordem: i + 1,
  }))
  const { error } = await supabase.from('trilha_etapas').upsert(linhas)
  if (error) throw error
}

export function useReordenarEtapas(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (etapasNaNovaOrdem: TrilhaEtapa[]) => {
      await salvarOrdem(etapasNaNovaOrdem)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.etapas(trilhaId) }),
  })
}

export type LinkDaEtapa = {
  alunoId: string
  alunoNome: string
  ordem: number
  atividadeTitulo: string
  link: string
}

/**
 * RF-134 + regra-chave 3: atribuir cria de uma vez as atribuições de TODAS as
 * etapas, cada uma com seu token. Nada de "liberar etapa" depois — o aluno
 * pode emendar a trilha inteira numa sentada (RF-132).
 *
 * Uma consulta descobre as tentativas já existentes e um insert em lote grava
 * tudo; atribuir 6 etapas a 3 alunos são 2 idas ao banco, não 36.
 */
export function useAtribuirTrilha(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (alunos: Aluno[]): Promise<LinkDaEtapa[]> => {
      if (alunos.length === 0) return []

      const { data: etapas, error: erroEtapas } = await supabase
        .from('trilha_etapas')
        .select('*')
        .eq('trilha_id', trilhaId)
        .order('ordem')
      if (erroEtapas) throw erroEtapas
      if (etapas.length === 0) throw new Error('Adicione ao menos uma etapa antes de atribuir a trilha.')

      const idsAtividades = [...new Set(etapas.map((e) => e.atividade_id))]
      const idsAlunos = alunos.map((a) => a.id)

      const [{ data: anteriores, error: erroAnteriores }, { data: atividades, error: erroAtividades }] =
        await Promise.all([
          supabase
            .from('atribuicoes')
            .select('atividade_id, aluno_id')
            .in('atividade_id', idsAtividades)
            .in('aluno_id', idsAlunos),
          supabase.from('atividades').select('id, titulo').in('id', idsAtividades),
        ])
      if (erroAnteriores) throw erroAnteriores
      if (erroAtividades) throw erroAtividades

      const tituloPorAtividade = new Map(atividades.map((a) => [a.id, a.titulo]))
      // Reenviar a mesma atividade ao mesmo aluno vira nova tentativa (RF-127),
      // então a numeração continua de onde parou em vez de colidir no unique.
      const tentativaPorPar = new Map<string, number>()
      for (const a of anteriores) {
        const chave = `${a.atividade_id}|${a.aluno_id}`
        tentativaPorPar.set(chave, (tentativaPorPar.get(chave) ?? 0) + 1)
      }

      const links: LinkDaEtapa[] = []
      const linhas = []
      for (const aluno of alunos) {
        for (const etapa of etapas) {
          const chave = `${etapa.atividade_id}|${aluno.id}`
          const tentativa = (tentativaPorPar.get(chave) ?? 0) + 1
          tentativaPorPar.set(chave, tentativa)

          const { token, hash } = await gerarTokenDeAcesso()
          linhas.push({
            atividade_id: etapa.atividade_id,
            aluno_id: aluno.id,
            trilha_etapa_id: etapa.id,
            token_hash: hash,
            tentativa,
          })
          links.push({
            alunoId: aluno.id,
            alunoNome: aluno.nome,
            ordem: etapa.ordem,
            atividadeTitulo: tituloPorAtividade.get(etapa.atividade_id) ?? 'Atividade',
            link: `${window.location.origin}/t/${token}`,
          })
        }
      }

      const { error: erroInsert } = await supabase.from('atribuicoes').insert(linhas)
      if (erroInsert) throw erroInsert

      // ignoreDuplicates: reatribuir a um aluno que já estava na trilha manda
      // as etapas de novo (nova tentativa) sem estourar o unique do vínculo.
      const { error: erroVinculo } = await supabase
        .from('trilha_alunos')
        .upsert(
          alunos.map((a) => ({ trilha_id: trilhaId, aluno_id: a.id })),
          { onConflict: 'trilha_id,aluno_id', ignoreDuplicates: true },
        )
      if (erroVinculo) throw erroVinculo

      return links
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.todas }),
  })
}

/** RF-140: pausar não apaga nada — as atribuições e o histórico continuam de pé. */
export function useAlterarStatusNaTrilha(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ alunoId, status }: { alunoId: string; status: TrilhaAlunoStatus }) => {
      const { error } = await supabase
        .from('trilha_alunos')
        .update({ status })
        .eq('trilha_id', trilhaId)
        .eq('aluno_id', alunoId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.todas }),
  })
}

/**
 * Remove o aluno da trilha mantendo o histórico (RF-140): as atribuições
 * continuam existindo, só perdem o vínculo com a etapa — as tarefas que ele já
 * respondeu seguem na ficha dele, com nota e tudo.
 */
export function useRemoverAlunoDaTrilha(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (alunoId: string) => {
      const { data: etapas, error: erroEtapas } = await supabase
        .from('trilha_etapas')
        .select('id')
        .eq('trilha_id', trilhaId)
      if (erroEtapas) throw erroEtapas

      if (etapas.length > 0) {
        const { error: erroSoltar } = await supabase
          .from('atribuicoes')
          .update({ trilha_etapa_id: null })
          .eq('aluno_id', alunoId)
          .in(
            'trilha_etapa_id',
            etapas.map((e) => e.id),
          )
        if (erroSoltar) throw erroSoltar
      }

      const { error } = await supabase
        .from('trilha_alunos')
        .delete()
        .eq('trilha_id', trilhaId)
        .eq('aluno_id', alunoId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.todas }),
  })
}

/** RF-141: copia trilha e sequência; alunos não vêm junto. */
export function useDuplicarTrilha() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (trilha: Trilha) => {
      const { data: nova, error } = await supabase
        .from('trilhas')
        .insert({
          professor_id: trilha.professor_id,
          nome: `${trilha.nome} (cópia)`,
          nivel: trilha.nivel,
          descricao: trilha.descricao,
        })
        .select('*')
        .single()
      if (error) throw error

      const { data: etapas, error: erroEtapas } = await supabase
        .from('trilha_etapas')
        .select('*')
        .eq('trilha_id', trilha.id)
        .order('ordem')
      if (erroEtapas) throw erroEtapas

      if (etapas.length > 0) {
        const { error: erroCopia } = await supabase.from('trilha_etapas').insert(
          etapas.map((e) => ({ trilha_id: nova.id, atividade_id: e.atividade_id, ordem: e.ordem })),
        )
        if (erroCopia) throw erroCopia
      }

      return nova
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.todas }),
  })
}
