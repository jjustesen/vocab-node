import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gerarTokenDeAcesso } from '@/lib/token'
import { lembrarToken } from '@/lib/links-lembrados'
import {
  tipoDoPasso,
  type Aluno,
  type NivelCefr,
  type PassoConcluido,
  type TipoDePasso,
  type Trilha,
  type TrilhaAluno,
  type TrilhaAlunoStatus,
  type TrilhaEtapa,
  type TrilhaModulo,
} from '@/types/db'

export const chavesTrilhas = {
  todas: ['trilhas'] as const,
  lista: ['trilhas', 'lista'] as const,
  uma: (id: string) => ['trilhas', id] as const,
  etapas: (id: string) => ['trilhas', id, 'etapas'] as const,
  modulos: (id: string) => ['trilhas', id, 'modulos'] as const,
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

      const idsAtividades = [...new Set(etapas.flatMap((e) => (e.atividade_id ? [e.atividade_id] : [])))]
      const [nomePorAluno, concluidas, { data: questoes }] = await Promise.all([
        buscarNomes([...new Set(vinculos.map((v) => v.aluno_id))]),
        buscarConcluidas(etapas.map((e) => e.id)),
        idsAtividades.length > 0
          ? supabase.from('questoes').select('id, atividade_id').in('atividade_id', idsAtividades)
          : Promise.resolve({ data: [] as { id: string; atividade_id: string }[] }),
      ])

      const questoesPorAtividade = new Map<string, number>()
      for (const q of questoes ?? []) {
        questoesPorAtividade.set(q.atividade_id, (questoesPorAtividade.get(q.atividade_id) ?? 0) + 1)
      }
      const questoesPorTrilha = new Map<string, number>()
      for (const e of etapas) {
        if (!e.atividade_id) continue
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
 * Os passos concluídos, de qualquer tipo, lidos da view da 0030: atividade
 * pela tentativa MAIS RECENTE (reenviar como reforço reabre o passo,
 * RF-122/127) e com a nota mínima da trilha, material pelo "Li este
 * material", lição pela sessão do tutor terminada.
 */
async function lerPassosConcluidos(etapaIds: string[], alunoId?: string): Promise<PassoConcluido[]> {
  if (etapaIds.length === 0) return []
  let consulta = supabase
    .from('trilha_passos_concluidos')
    .select('aluno_id, etapa_id, trilha_id, concluida_em, percentual')
    .in('etapa_id', etapaIds)
  if (alunoId) consulta = consulta.eq('aluno_id', alunoId)
  const { data, error } = await consulta
  if (error) throw error
  return (data ?? []) as unknown as PassoConcluido[]
}

/** Chaves `alunoId|etapaId` dos passos concluídos. */
async function buscarConcluidas(etapaIds: string[]): Promise<Set<string>> {
  const passos = await lerPassosConcluidos(etapaIds)
  return new Set(passos.map((p) => `${p.aluno_id}|${p.etapa_id}`))
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

/** Um passo com o que a tela precisa mostrar dele, qualquer que seja o tipo. */
export type PassoDaTrilha = TrilhaEtapa & {
  tipo: TipoDePasso
  titulo: string
  /** "8 questões", "PDF", "Lição do tutor"… */
  detalhe: string
  nivel: NivelCefr | null
  questoes: number
}

/** @deprecated nome de antes dos três tipos de passo; use `PassoDaTrilha`. */
export type EtapaComAtividade = PassoDaTrilha

const ROTULO_MATERIAL: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word',
  imagem: 'Imagem',
  audio: 'Áudio',
  texto: 'Texto',
}

/**
 * Os passos de uma ou mais trilhas, com título e detalhe de cada tipo,
 * ordenados como o aluno vê: pelo módulo e, dentro dele, pela ordem.
 */
async function carregarPassos(trilhaIds: string[]): Promise<PassoDaTrilha[]> {
  if (trilhaIds.length === 0) return []
  const [{ data: etapas, error }, { data: modulos, error: erroModulos }] = await Promise.all([
    supabase.from('trilha_etapas').select('*').in('trilha_id', trilhaIds),
    supabase.from('trilha_modulos').select('id, ordem').in('trilha_id', trilhaIds),
  ])
  if (error) throw error
  if (erroModulos) throw erroModulos
  if (etapas.length === 0) return []

  const ids = (campo: 'atividade_id' | 'material_id' | 'licao_tutor_id') => [
    ...new Set(etapas.flatMap((e) => (e[campo] ? [e[campo] as string] : []))),
  ]
  const idsAtividades = ids('atividade_id')
  const idsMateriais = ids('material_id')
  const idsLicoes = ids('licao_tutor_id')
  const vazio = Promise.resolve({ data: [], error: null })

  const [atividades, questoes, materiais, licoes] = await Promise.all([
    idsAtividades.length ? supabase.from('atividades').select('id, titulo, nivel').in('id', idsAtividades) : vazio,
    idsAtividades.length ? supabase.from('questoes').select('id, atividade_id').in('atividade_id', idsAtividades) : vazio,
    idsMateriais.length ? supabase.from('materiais').select('id, nome, tipo').in('id', idsMateriais) : vazio,
    idsLicoes.length ? supabase.from('tutor_licoes').select('id, titulo, nivel_cefr').in('id', idsLicoes) : vazio,
  ])
  for (const r of [atividades, questoes, materiais, licoes]) if (r.error) throw r.error

  const atividadePorId = new Map(
    ((atividades.data ?? []) as { id: string; titulo: string; nivel: NivelCefr }[]).map((a) => [a.id, a]),
  )
  const materialPorId = new Map(
    ((materiais.data ?? []) as { id: string; nome: string; tipo: string }[]).map((m) => [m.id, m]),
  )
  const licaoPorId = new Map(
    ((licoes.data ?? []) as { id: string; titulo: string; nivel_cefr: NivelCefr | null }[]).map((l) => [l.id, l]),
  )
  const questoesPorAtividade = new Map<string, number>()
  for (const q of (questoes.data ?? []) as { atividade_id: string }[]) {
    questoesPorAtividade.set(q.atividade_id, (questoesPorAtividade.get(q.atividade_id) ?? 0) + 1)
  }
  const ordemDoModulo = new Map(modulos.map((m) => [m.id, m.ordem]))

  return etapas
    .map((e): PassoDaTrilha => {
      const tipo = tipoDoPasso(e)
      if (tipo === 'atividade') {
        const a = atividadePorId.get(e.atividade_id!)
        const n = questoesPorAtividade.get(e.atividade_id!) ?? 0
        return {
          ...e,
          tipo,
          titulo: a?.titulo ?? 'Atividade removida',
          detalhe: `${n} ${n === 1 ? 'questão' : 'questões'}`,
          nivel: a?.nivel ?? null,
          questoes: n,
        }
      }
      if (tipo === 'material') {
        const m = materialPorId.get(e.material_id!)
        return {
          ...e,
          tipo,
          titulo: m?.nome ?? 'Material removido',
          detalhe: m ? (ROTULO_MATERIAL[m.tipo] ?? 'Material') : 'Material',
          nivel: null,
          questoes: 0,
        }
      }
      const l = licaoPorId.get(e.licao_tutor_id!)
      return {
        ...e,
        tipo,
        titulo: l?.titulo ?? 'Lição removida',
        detalhe: 'Lição do tutor',
        nivel: l?.nivel_cefr ?? null,
        questoes: 0,
      }
    })
    .sort(
      (a, b) =>
        (ordemDoModulo.get(a.modulo_id) ?? 0) - (ordemDoModulo.get(b.modulo_id) ?? 0) || a.ordem - b.ordem,
    )
}

export function useEtapasDaTrilha(trilhaId: string | undefined) {
  return useQuery({
    queryKey: chavesTrilhas.etapas(trilhaId!),
    enabled: Boolean(trilhaId),
    queryFn: () => carregarPassos([trilhaId!]),
  })
}

// ---------------------------------------------------------------------------
// Módulos (0030)
// ---------------------------------------------------------------------------

export function useModulos(trilhaId: string | undefined) {
  return useQuery({
    queryKey: chavesTrilhas.modulos(trilhaId!),
    enabled: Boolean(trilhaId),
    queryFn: async (): Promise<TrilhaModulo[]> => {
      const { data, error } = await supabase
        .from('trilha_modulos')
        .select('*')
        .eq('trilha_id', trilhaId!)
        .order('ordem')
      if (error) throw error
      return data
    },
  })
}

export function useCriarModulo(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (titulo: string) => {
      const { data: ultimo, error: erroUltimo } = await supabase
        .from('trilha_modulos')
        .select('ordem')
        .eq('trilha_id', trilhaId)
        .order('ordem', { ascending: false })
        .limit(1)
      if (erroUltimo) throw erroUltimo
      const { error } = await supabase
        .from('trilha_modulos')
        .insert({ trilha_id: trilhaId, ordem: (ultimo[0]?.ordem ?? 0) + 1, titulo: titulo.trim() || 'Novo módulo' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.uma(trilhaId) }),
  })
}

export function useRenomearModulo(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, titulo }: { id: string; titulo: string }) => {
      const { error } = await supabase.from('trilha_modulos').update({ titulo: titulo.trim() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.modulos(trilhaId) }),
  })
}

/** Apaga o módulo e os passos dele. A trilha nunca fica sem módulo. */
export function useExcluirModulo(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (moduloId: string) => {
      const { count } = await supabase
        .from('trilha_modulos')
        .select('*', { count: 'exact', head: true })
        .eq('trilha_id', trilhaId)
      if ((count ?? 0) <= 1) throw new Error('A trilha precisa de pelo menos um módulo.')
      const { error } = await supabase.from('trilha_modulos').delete().eq('id', moduloId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.todas }),
  })
}

/**
 * Troca dois módulos de lugar. Numa requisição só: a unique(trilha_id, ordem)
 * é DEFERRABLE, verificada no commit (mesmo motivo de `salvarOrdem`).
 */
export function useTrocarModulos(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ([a, b]: [TrilhaModulo, TrilhaModulo]) => {
      const { error } = await supabase.from('trilha_modulos').upsert([
        { id: a.id, trilha_id: a.trilha_id, titulo: a.titulo, ordem: b.ordem },
        { id: b.id, trilha_id: b.trilha_id, titulo: b.titulo, ordem: a.ordem },
      ])
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.uma(trilhaId) }),
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
  moduloId: string
  tipo: TipoDePasso
  opcional: boolean
  /** Só nos passos de atividade. */
  atividadeId: string | null
  titulo: string
  /** "PDF", "Lição do tutor", "8 questões"… */
  detalhe: string
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

      const etapas = await carregarPassos([trilhaId!])
      const passosConcluidos = await lerPassosConcluidos(
        etapas.map((e) => e.id),
        alunoId!,
      )
      const conclusaoPorEtapa = new Map(passosConcluidos.map((p) => [p.etapa_id, p.concluida_em]))

      const idsAtividades = [...new Set(etapas.flatMap((e) => (e.atividade_id ? [e.atividade_id] : [])))]
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
        const atividade = e.atividade_id ? atividadePorId.get(e.atividade_id) : undefined
        return {
          etapaId: e.id,
          ordem: e.ordem,
          moduloId: e.modulo_id,
          tipo: e.tipo,
          opcional: e.opcional,
          atividadeId: e.atividade_id,
          titulo: atividade?.titulo ?? e.titulo,
          detalhe: e.detalhe,
          nivel: atividade?.nivel ?? e.nivel ?? 'A1',
          questoes: e.atividade_id ? (questoesPorAtividade.get(e.atividade_id) ?? 0) : 0,
          atribuicaoId: atribuicao?.id ?? null,
          enviadaEm: atribuicao?.enviada_em ?? null,
          iniciadaEm: atribuicao?.iniciada_em ?? null,
          // A conclusão vem da view: com nota mínima, terminar a atividade
          // abaixo da nota não conclui o passo.
          concluidaEm: conclusaoPorEtapa.get(e.id) ?? null,
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
      // Maior tentativa, não contagem: a numeração pode ter buracos.
      const { data: ultima, error: erroUltima } = await supabase
        .from('atribuicoes')
        .select('tentativa')
        .eq('atividade_id', etapa.atividadeId)
        .eq('aluno_id', alunoId)
        .order('tentativa', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (erroUltima) throw erroUltima

      const { token, hash } = await gerarTokenDeAcesso()
      const { data: criada, error } = await supabase
        .from('atribuicoes')
        .insert({
          atividade_id: etapa.atividadeId,
          aluno_id: alunoId,
          trilha_etapa_id: etapa.etapaId,
          token_hash: hash,
          tentativa: (ultima?.tentativa ?? 0) + 1,
        })
        .select('id')
        .single()
      if (error) throw error
      lembrarToken(criada.id, token)
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
    mutationFn: async (
      campos: Partial<
        Pick<
          Trilha,
          'nome' | 'nivel' | 'descricao' | 'navegacao' | 'permite_abas' | 'liberacao' | 'liberacao_dias' | 'nota_minima'
        >
      >,
    ) => {
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

export type NovoPasso = {
  tipo: TipoDePasso
  /** id da atividade, do material ou da lição do tutor. */
  itemId: string
  /** Sem módulo, entra no último. */
  moduloId?: string
}

/**
 * Entra sempre no fim do módulo; reordenar é ação separada. A ordem é única
 * na trilha inteira, e quem mostra agrupa por módulo — então "fim do módulo"
 * é simplesmente o maior número da trilha mais um.
 *
 * Material e lição chegam a quem já está na trilha pelo trigger da 0030;
 * atividade precisa de token, então vai por aqui.
 */
export function useAdicionarEtapa(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (passo: NovoPasso | string) => {
      const novo: NovoPasso = typeof passo === 'string' ? { tipo: 'atividade', itemId: passo } : passo
      const { data: existentes, error: erroExistentes } = await supabase
        .from('trilha_etapas')
        .select('ordem')
        .eq('trilha_id', trilhaId)
        .order('ordem', { ascending: false })
        .limit(1)
      if (erroExistentes) throw erroExistentes

      const proxima = (existentes[0]?.ordem ?? 0) + 1
      const { data: etapa, error } = await supabase
        .from('trilha_etapas')
        .insert({
          trilha_id: trilhaId,
          ordem: proxima,
          ...(novo.moduloId ? { modulo_id: novo.moduloId } : {}),
          atividade_id: novo.tipo === 'atividade' ? novo.itemId : null,
          material_id: novo.tipo === 'material' ? novo.itemId : null,
          licao_tutor_id: novo.tipo === 'tutor' ? novo.itemId : null,
        })
        .select('id, atividade_id')
        .single()
      if (error) throw error

      if (etapa.atividade_id) await enviarEtapaAQuemJaEstaNaTrilha(trilhaId, { id: etapa.id, atividade_id: etapa.atividade_id })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chavesTrilhas.todas })
      void qc.invalidateQueries({ queryKey: ['alunos'] })
    },
  })
}

/**
 * A etapa nova vai também para quem JÁ recebeu a trilha. `atribuirTrilha` só
 * cria as atribuições das etapas que existem no momento do envio; sem isto, a
 * lição adicionada depois aparecia no painel do aluno sem atribuição — com
 * "0 questões" e um "Fazer" que não abria nada.
 */
async function enviarEtapaAQuemJaEstaNaTrilha(trilhaId: string, etapa: { id: string; atividade_id: string }) {
  const { data: vinculos, error: erroVinculos } = await supabase
    .from('trilha_alunos')
    .select('aluno_id')
    .eq('trilha_id', trilhaId)
  if (erroVinculos) throw erroVinculos
  if (vinculos.length === 0) return

  const idsAlunos = vinculos.map((v) => v.aluno_id)
  // A mesma atividade pode já ter ido a esse aluno avulsa ou em outra trilha:
  // a numeração da tentativa continua de onde parou (unique da tabela, RF-127).
  const { data: anteriores, error: erroAnteriores } = await supabase
    .from('atribuicoes')
    .select('aluno_id, tentativa')
    .eq('atividade_id', etapa.atividade_id)
    .in('aluno_id', idsAlunos)
  if (erroAnteriores) throw erroAnteriores

  const ultimaTentativa = new Map<string, number>()
  for (const a of anteriores) ultimaTentativa.set(a.aluno_id, Math.max(ultimaTentativa.get(a.aluno_id) ?? 0, a.tentativa))

  const tokenPorAluno = new Map<string, string>()
  const linhas = []
  for (const alunoId of idsAlunos) {
    const { token, hash } = await gerarTokenDeAcesso()
    tokenPorAluno.set(alunoId, token)
    linhas.push({
      atividade_id: etapa.atividade_id,
      aluno_id: alunoId,
      trilha_etapa_id: etapa.id,
      token_hash: hash,
      tentativa: (ultimaTentativa.get(alunoId) ?? 0) + 1,
    })
  }

  const { data: criadas, error } = await supabase.from('atribuicoes').insert(linhas).select('id, aluno_id')
  if (error) throw error
  for (const c of criadas ?? []) {
    const token = tokenPorAluno.get(c.aluno_id)
    if (token) lembrarToken(c.id, token)
  }
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
  //
  // Todas as colunas obrigatórias e as três de tipo vão junto: o upsert é um
  // INSERT … ON CONFLICT, e o Postgres confere o check `etapa_de_um_tipo`
  // na linha proposta antes de cair no UPDATE.
  const linhas = etapas.map((e, i) => ({
    id: e.id,
    trilha_id: e.trilha_id,
    modulo_id: e.modulo_id,
    atividade_id: e.atividade_id,
    material_id: e.material_id,
    licao_tutor_id: e.licao_tutor_id,
    opcional: e.opcional,
    ordem: i + 1,
  }))
  const { error } = await supabase.from('trilha_etapas').upsert(linhas)
  if (error) throw error
}

/**
 * Troca dois passos de lugar dentro do módulo: cada um fica com o número do
 * outro, e o resto da trilha não muda. Numa requisição só, pelo mesmo motivo
 * de `salvarOrdem` (a unique é verificada no commit).
 */
export function useTrocarPassos(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ([a, b]: [TrilhaEtapa, TrilhaEtapa]) => {
      const linha = (e: TrilhaEtapa, ordem: number) => ({
        id: e.id,
        trilha_id: e.trilha_id,
        modulo_id: e.modulo_id,
        atividade_id: e.atividade_id,
        material_id: e.material_id,
        licao_tutor_id: e.licao_tutor_id,
        opcional: e.opcional,
        ordem,
      })
      const { error } = await supabase.from('trilha_etapas').upsert([linha(a, b.ordem), linha(b, a.ordem)])
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.etapas(trilhaId) }),
  })
}

/** Liga e desliga "opcional": passo opcional aparece, mas não segura o avanço. */
export function useAlternarOpcional(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ etapaId, opcional }: { etapaId: string; opcional: boolean }) => {
      const { error } = await supabase.from('trilha_etapas').update({ opcional }).eq('id', etapaId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.etapas(trilhaId) }),
  })
}

/** Leva o passo para outro módulo, no fim dele. */
export function useMoverPassoDeModulo(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ etapaId, moduloId }: { etapaId: string; moduloId: string }) => {
      const { data: ultimo, error: erroUltimo } = await supabase
        .from('trilha_etapas')
        .select('ordem')
        .eq('trilha_id', trilhaId)
        .order('ordem', { ascending: false })
        .limit(1)
      if (erroUltimo) throw erroUltimo
      const { error } = await supabase
        .from('trilha_etapas')
        .update({ modulo_id: moduloId, ordem: (ultimo[0]?.ordem ?? 0) + 1 })
        .eq('id', etapaId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.etapas(trilhaId) }),
  })
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
export async function atribuirTrilha(trilhaId: string, alunos: Aluno[]): Promise<LinkDaEtapa[]> {
  if (alunos.length === 0) return []

  const passos = await carregarPassos([trilhaId])
  if (passos.length === 0) throw new Error('Adicione ao menos um passo antes de atribuir a trilha.')
  // Só atividade vira atribuição (com token e link). Material e lição chegam
  // ao aluno pelo trigger da 0030, quando ele entra em `trilha_alunos` abaixo.
  const etapas = passos.filter(
    (e): e is PassoDaTrilha & { atividade_id: string } => e.atividade_id !== null,
  )

  const idsAtividades = [...new Set(etapas.map((e) => e.atividade_id))]
  const idsAlunos = alunos.map((a) => a.id)

  const [{ data: anteriores, error: erroAnteriores }, { data: atividades, error: erroAtividades }] =
    await Promise.all([
      supabase
        .from('atribuicoes')
        .select('atividade_id, aluno_id, tentativa')
        .in('atividade_id', idsAtividades)
        .in('aluno_id', idsAlunos),
      supabase.from('atividades').select('id, titulo').in('id', idsAtividades),
    ])
  if (erroAnteriores) throw erroAnteriores
  if (erroAtividades) throw erroAtividades

  const tituloPorAtividade = new Map(atividades.map((a) => [a.id, a.titulo]))
  // Reenviar a mesma atividade ao mesmo aluno vira nova tentativa (RF-127),
  // então a numeração continua de onde parou em vez de colidir no unique.
  // Pelo MAIOR número, não pela contagem: tirar o aluno da trilha apaga as
  // etapas pendentes e deixa buraco (1, 3), e contar dava 3 de novo.
  const tentativaPorPar = new Map<string, number>()
  for (const a of anteriores) {
    const chave = `${a.atividade_id}|${a.aluno_id}`
    tentativaPorPar.set(chave, Math.max(tentativaPorPar.get(chave) ?? 0, a.tentativa))
  }

  const links: LinkDaEtapa[] = []
  const linhas = []
  const tokenPorChave = new Map<string, string>()
  for (const aluno of alunos) {
    for (const etapa of etapas) {
      const chave = `${etapa.atividade_id}|${aluno.id}`
      const tentativa = (tentativaPorPar.get(chave) ?? 0) + 1
      tentativaPorPar.set(chave, tentativa)

      const { token, hash } = await gerarTokenDeAcesso()
      // O insert é em lote, então os ids só aparecem depois. Guardamos o
      // token pela chave única da tabela (atividade+aluno+tentativa) para
      // casar com as linhas devolvidas — sem depender da ordem do retorno.
      tokenPorChave.set(`${etapa.atividade_id}|${aluno.id}|${tentativa}`, token)
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

  // Trilha só de material e lição: não há atribuição a criar.
  const { data: criadas, error: erroInsert } =
    linhas.length > 0
      ? await supabase.from('atribuicoes').insert(linhas).select('id, atividade_id, aluno_id, tentativa')
      : { data: [], error: null }
  if (erroInsert) throw erroInsert

  for (const c of criadas ?? []) {
    const token = tokenPorChave.get(`${c.atividade_id}|${c.aluno_id}|${c.tentativa}`)
    if (token) lembrarToken(c.id, token)
  }

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
 * Remove o aluno da trilha mantendo o histórico (RF-140): as tarefas que ele
 * já CONCLUIU continuam existindo, só perdem o vínculo com a etapa — seguem na
 * ficha dele, com nota e tudo.
 *
 * As etapas que ele ainda não concluiu saem junto. Deixá-las seria manter
 * tarefas soltas, com link vivo e "pendente" na ficha e no painel do aluno, de
 * uma trilha da qual ele já não faz parte — e o professor teria de caçá-las
 * uma a uma para terminar de remover o que pediu para remover.
 */
export function useRemoverAlunoDaTrilha(trilhaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (alunoId: string) => removerAlunosDaTrilha(trilhaId, [alunoId]),
    onSuccess: (_, alunoId) => {
      void qc.invalidateQueries({ queryKey: chavesTrilhas.todas })
      // As pendentes que saíram somem também da lista de tarefas da ficha.
      void qc.invalidateQueries({ queryKey: ['alunos', alunoId] })
    },
  })
}

/**
 * O miolo de `useRemoverAlunoDaTrilha`, para vários de uma vez — é o que o
 * "tirar da turma" usa para tirar a trilha de todos os membros.
 */
export async function removerAlunosDaTrilha(trilhaId: string, alunoIds: string[]) {
  if (alunoIds.length === 0) return
  const { data: etapas, error: erroEtapas } = await supabase
    .from('trilha_etapas')
    .select('id')
    .eq('trilha_id', trilhaId)
  if (erroEtapas) throw erroEtapas

  if (etapas.length > 0) {
    const etapaIds = etapas.map((e) => e.id)
    const { error: erroPendentes } = await supabase
      .from('atribuicoes')
      .delete()
      .in('aluno_id', alunoIds)
      .is('concluida_em', null)
      .in('trilha_etapa_id', etapaIds)
    if (erroPendentes) throw erroPendentes

    const { error: erroSoltar } = await supabase
      .from('atribuicoes')
      .update({ trilha_etapa_id: null })
      .in('aluno_id', alunoIds)
      .in('trilha_etapa_id', etapaIds)
    if (erroSoltar) throw erroSoltar
  }

  const { error } = await supabase
    .from('trilha_alunos')
    .delete()
    .eq('trilha_id', trilhaId)
    .in('aluno_id', alunoIds)
  if (error) throw error
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
          navegacao: trilha.navegacao,
          permite_abas: trilha.permite_abas,
          liberacao: trilha.liberacao,
          liberacao_dias: trilha.liberacao_dias,
          nota_minima: trilha.nota_minima,
        })
        .select('*')
        .single()
      if (error) throw error

      const [{ data: modulos, error: erroModulos }, { data: etapas, error: erroEtapas }, { data: primeiro }] =
        await Promise.all([
          supabase.from('trilha_modulos').select('*').eq('trilha_id', trilha.id).order('ordem'),
          supabase.from('trilha_etapas').select('*').eq('trilha_id', trilha.id).order('ordem'),
          // A trilha nova já nasceu com um "Módulo 1" (trigger da 0030).
          supabase.from('trilha_modulos').select('id').eq('trilha_id', nova.id).order('ordem').limit(1),
        ])
      if (erroModulos) throw erroModulos
      if (erroEtapas) throw erroEtapas

      // Módulos: o primeiro reaproveita o que já existe; os outros são criados.
      const novoPorAntigo = new Map<string, string>()
      for (const [i, m] of modulos.entries()) {
        if (i === 0 && primeiro?.[0]) {
          await supabase.from('trilha_modulos').update({ titulo: m.titulo }).eq('id', primeiro[0].id)
          novoPorAntigo.set(m.id, primeiro[0].id)
          continue
        }
        const { data: criado, error: erroCriado } = await supabase
          .from('trilha_modulos')
          .insert({ trilha_id: nova.id, ordem: m.ordem, titulo: m.titulo })
          .select('id')
          .single()
        if (erroCriado) throw erroCriado
        novoPorAntigo.set(m.id, criado.id)
      }

      if (etapas.length > 0) {
        const { error: erroCopia } = await supabase.from('trilha_etapas').insert(
          etapas.map((e) => ({
            trilha_id: nova.id,
            modulo_id: novoPorAntigo.get(e.modulo_id),
            atividade_id: e.atividade_id,
            material_id: e.material_id,
            licao_tutor_id: e.licao_tutor_id,
            opcional: e.opcional,
            ordem: e.ordem,
          })),
        )
        if (erroCopia) throw erroCopia
      }

      return nova
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTrilhas.todas }),
  })
}
