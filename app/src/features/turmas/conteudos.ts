import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { apagarPendentesDaAtividade, enviarAtividade, type EnvioResultado } from '@/features/atividades/api'
import { vincular } from '@/features/materiais/api'
import { atribuirTrilha, removerAlunosDaTrilha, type LinkDaEtapa } from '@/features/trilhas/api'
import type { Aluno, Material } from '@/types/db'

/**
 * O que é da turma (0020) — e a regra que isso sustenta: a turma é uma
 * entidade própria que ALIMENTA os alunos. O que é dela, todos os membros têm.
 *
 * A direção importa: nada aqui olha o que os alunos têm para decidir o que é
 * da turma. O conteúdo da turma é só o que foi enviado PARA ELA.
 *
 *  - `...ParaTurmas`: envia para a turma — grava o item como dela e entrega a
 *    cada membro que ainda não tem.
 *  - `sincronizarTurma`: quem está na turma e não tem algo dela, recebe. É o
 *    que roda quando alguém entra — automático, no mesmo gesto de adicionar.
 *
 * Arquivo próprio porque depende do envio de trilha, atividade e material —
 * o resto de `api.ts` é só a turma e seus membros.
 */

export type ItemDaTurma = { trilhaId: string } | { atividadeId: string } | { materialId: string }

function colunas(item: ItemDaTurma) {
  if ('trilhaId' in item) return { coluna: 'trilha_id' as const, id: item.trilhaId }
  if ('atividadeId' in item) return { coluna: 'atividade_id' as const, id: item.atividadeId }
  return { coluna: 'material_id' as const, id: item.materialId }
}

/** Grava o item como da turma. Repetir não é erro. */
async function ligarNaTurma(turmaIds: string[], item: ItemDaTurma) {
  if (turmaIds.length === 0) return
  const { coluna, id } = colunas(item)
  const { error } = await supabase
    .from('turmas_conteudos')
    .upsert(
      turmaIds.map((turma_id) => ({
        turma_id,
        trilha_id: coluna === 'trilha_id' ? id : null,
        atividade_id: coluna === 'atividade_id' ? id : null,
        material_id: coluna === 'material_id' ? id : null,
      })),
      { onConflict: `turma_id,${coluna}`, ignoreDuplicates: true },
    )
  if (error) throw error
}

/** "Tirar da turma": o item deixa de ser dela. Quem já tinha, continua tendo. */
export async function desligarDaTurma(turmaId: string, item: ItemDaTurma) {
  const { coluna, id } = colunas(item)
  const { error } = await supabase.from('turmas_conteudos').delete().eq('turma_id', turmaId).eq(coluna, id)
  if (error) throw error
}

/**
 * Tira a trilha ou a atividade da turma — o par de `atribuirTrilhaParaTurmas`
 * e `enviarAtividadeParaTurmas`, como `MateriaisDaTurma` faz com material.
 *
 * Sai dos membros de agora e deixa de ser da turma (senão voltaria para cada
 * um que entrasse depois). O que alguém já CONCLUIU fica: a resposta e a nota
 * são dele — na trilha, as etapas feitas viram tarefas soltas na ficha, como
 * no "remover da trilha" (RF-140). Só o pendente sai.
 */
export async function tirarDaTurma(turmaId: string, item: { trilhaId: string } | { atividadeId: string }) {
  const membros = (await membrosDe([turmaId])).map((a) => a.id)
  if ('trilhaId' in item) {
    await removerAlunosDaTrilha(item.trilhaId, membros)
  } else if (membros.length > 0) {
    await apagarPendentesDaAtividade(item.atividadeId, membros)
  }
  await desligarDaTurma(turmaId, item)
}

/** Os membros de uma ou mais turmas, sem repetir quem está em duas. */
async function membrosDe(turmaIds: string[]): Promise<Aluno[]> {
  if (turmaIds.length === 0) return []
  const { data: vinculos, error } = await supabase
    .from('turmas_alunos')
    .select('aluno_id')
    .in('turma_id', turmaIds)
  if (error) throw error
  const ids = [...new Set(vinculos.map((v) => v.aluno_id))]
  if (ids.length === 0) return []
  const { data: alunos, error: erroAlunos } = await supabase.from('alunos').select('*').in('id', ids)
  if (erroAlunos) throw erroAlunos
  return alunos
}

/**
 * Quem, entre `alunoIds`, já tem o item.
 *
 * É o que impede a turma de duplicar: reatribuir uma trilha a quem já está
 * nela abriria uma tentativa nova de todas as etapas (RF-127), e o aluno
 * perderia o lugar onde parou. Atividade conta só o envio avulso — etapa de
 * trilha é da trilha.
 */
async function quemJaTem(item: ItemDaTurma, alunoIds: string[]): Promise<Set<string>> {
  if (alunoIds.length === 0) return new Set()
  if ('trilhaId' in item) {
    const { data, error } = await supabase
      .from('trilha_alunos')
      .select('aluno_id')
      .eq('trilha_id', item.trilhaId)
      .in('aluno_id', alunoIds)
    if (error) throw error
    return new Set(data.map((v) => v.aluno_id))
  }
  if ('atividadeId' in item) {
    const { data, error } = await supabase
      .from('atribuicoes')
      .select('aluno_id')
      .eq('atividade_id', item.atividadeId)
      .in('aluno_id', alunoIds)
      .is('trilha_etapa_id', null)
      .is('revogada_em', null)
    if (error) throw error
    return new Set(data.map((a) => a.aluno_id))
  }
  const { data, error } = await supabase
    .from('materiais_alunos')
    .select('aluno_id')
    .eq('material_id', item.materialId)
    .in('aluno_id', alunoIds)
  if (error) throw error
  return new Set(data.map((v) => v.aluno_id))
}

async function faltamReceber(item: ItemDaTurma, alunos: Aluno[]): Promise<Aluno[]> {
  const tem = await quemJaTem(
    item,
    alunos.map((a) => a.id),
  )
  return alunos.filter((a) => !tem.has(a.id))
}

/** Envia a trilha PARA AS TURMAS. Devolve os links de quem recebeu agora. */
export async function atribuirTrilhaParaTurmas(turmaIds: string[], trilhaId: string): Promise<LinkDaEtapa[]> {
  await ligarNaTurma(turmaIds, { trilhaId })
  const faltam = await faltamReceber({ trilhaId }, await membrosDe(turmaIds))
  return faltam.length > 0 ? atribuirTrilha(trilhaId, faltam) : []
}

/** Envia a atividade PARA AS TURMAS. Devolve os links de quem recebeu agora. */
export async function enviarAtividadeParaTurmas(
  turmaIds: string[],
  atividadeId: string,
  prazo?: string,
): Promise<EnvioResultado[]> {
  await ligarNaTurma(turmaIds, { atividadeId })
  const faltam = await faltamReceber({ atividadeId }, await membrosDe(turmaIds))
  return faltam.length > 0 ? enviarAtividade(atividadeId, faltam, prazo) : []
}

/** Dá os materiais PARA AS TURMAS. Material é upsert: quem já tem fica como está. */
export async function darMateriaisParaTurmas(turmaIds: string[], materialIds: string[]) {
  const membros = (await membrosDe(turmaIds)).map((a) => a.id)
  for (const materialId of materialIds) {
    await ligarNaTurma(turmaIds, { materialId })
    if (membros.length > 0) await vincular(materialId, membros)
  }
}

export type ResultadoDaSincronizacao = {
  trilhas: number
  atividades: number
  materiais: number
  /** Trilhas que não puderam ir (ex.: ficaram sem etapas). */
  falhas: string[]
}

/**
 * Dá a cada aluno tudo o que é da turma e ele ainda não tem.
 *
 * @param alunoIds quem sincronizar; sem isso, a turma inteira.
 */
export async function sincronizarTurma(turmaId: string, alunoIds?: string[]): Promise<ResultadoDaSincronizacao> {
  const resultado: ResultadoDaSincronizacao = { trilhas: 0, atividades: 0, materiais: 0, falhas: [] }

  let alunos = await membrosDe([turmaId])
  if (alunoIds) alunos = alunos.filter((a) => alunoIds.includes(a.id))
  if (alunos.length === 0) return resultado

  const { data: itens, error } = await supabase
    .from('turmas_conteudos')
    .select('trilha_id, atividade_id, material_id')
    .eq('turma_id', turmaId)
  if (error) throw error

  // Um item por vez: trilha e atividade numeram tentativas lendo o que já
  // existe, e dois envios em paralelo para o mesmo aluno poderiam colidir.
  for (const i of itens) {
    if (i.trilha_id) {
      const faltam = await faltamReceber({ trilhaId: i.trilha_id }, alunos)
      if (faltam.length === 0) continue
      try {
        await atribuirTrilha(i.trilha_id, faltam)
        resultado.trilhas += 1
      } catch (e) {
        // Uma trilha sem etapas não pode travar a entrada na turma nem o
        // resto do que a pessoa tem a receber.
        resultado.falhas.push((e as Error).message)
      }
    } else if (i.atividade_id) {
      const faltam = await faltamReceber({ atividadeId: i.atividade_id }, alunos)
      if (faltam.length === 0) continue
      await enviarAtividade(i.atividade_id, faltam)
      resultado.atividades += 1
    } else if (i.material_id) {
      const faltam = await faltamReceber({ materialId: i.material_id }, alunos)
      if (faltam.length === 0) continue
      await vincular(
        i.material_id,
        faltam.map((a) => a.id),
      )
      resultado.materiais += 1
    }
  }

  return resultado
}

export type ConteudosDaTurma = { trilhaIds: string[]; atividadeIds: string[]; materialIds: string[] }

/** Só o que foi enviado PARA a turma — nunca o que os membros têm por fora. */
export function useConteudosDaTurma(turmaId: string) {
  return useQuery({
    queryKey: ['turmas', turmaId, 'conteudos'] as const,
    queryFn: async (): Promise<ConteudosDaTurma> => {
      const { data, error } = await supabase
        .from('turmas_conteudos')
        .select('trilha_id, atividade_id, material_id')
        .eq('turma_id', turmaId)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return {
        trilhaIds: data.flatMap((c) => (c.trilha_id ? [c.trilha_id] : [])),
        atividadeIds: data.flatMap((c) => (c.atividade_id ? [c.atividade_id] : [])),
        materialIds: data.flatMap((c) => (c.material_id ? [c.material_id] : [])),
      }
    },
  })
}

export type MaterialDaTurma = Material & { donos: string[] }

/**
 * Os materiais DA turma, com quem dos membros atuais já os tem. Um PDF que um
 * membro ganhou por fora não aparece aqui — não é da turma.
 */
export function useMateriaisDaTurma(turmaId: string, alunoIds: string[]) {
  return useQuery({
    queryKey: ['turmas', turmaId, 'materiais', [...alunoIds].sort().join(',')] as const,
    queryFn: async (): Promise<MaterialDaTurma[]> => {
      const { data: vinculos, error } = await supabase
        .from('turmas_conteudos')
        .select('material_id')
        .eq('turma_id', turmaId)
        .not('material_id', 'is', null)
        .order('criado_em', { ascending: false })
      if (error) throw error
      const ids = vinculos.flatMap((v) => (v.material_id ? [v.material_id] : []))
      if (ids.length === 0) return []

      const [{ data: materiais, error: erroMateriais }, { data: donos, error: erroDonos }] = await Promise.all([
        supabase.from('materiais').select('*').in('id', ids),
        alunoIds.length > 0
          ? supabase.from('materiais_alunos').select('material_id, aluno_id').in('material_id', ids).in('aluno_id', alunoIds)
          : Promise.resolve({ data: [] as { material_id: string; aluno_id: string }[], error: null }),
      ])
      if (erroMateriais) throw erroMateriais
      if (erroDonos) throw erroDonos

      // Na ordem em que entraram na turma, o mais novo primeiro.
      const porId = new Map(materiais.map((m) => [m.id, m]))
      return ids.flatMap((id) => {
        const m = porId.get(id)
        if (!m) return []
        return [{ ...m, donos: donos.filter((d) => d.material_id === id).map((d) => d.aluno_id) }]
      })
    },
  })
}

/** Tudo o que um envio mexe — turma, e as listas de cada tipo de conteúdo. */
export function invalidarConteudos(qc: ReturnType<typeof useQueryClient>) {
  for (const prefixo of ['turmas', 'trilhas', 'atividades', 'materiais', 'alunos']) {
    qc.invalidateQueries({ queryKey: [prefixo] })
  }
}

/** A lixeira das listas de tarefas e trilhas da turma. */
export function useTirarDaTurma(turmaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (item: { trilhaId: string } | { atividadeId: string }) => tirarDaTurma(turmaId, item),
    // Mesmo com falha no meio: o que já saiu de alguém, saiu.
    onSettled: () => invalidarConteudos(qc),
  })
}

/**
 * "Enviar para quem falta": completa a turma. Só aparece se algo da turma
 * não chegou a alguém — por exemplo, um envio automático que falhou no meio.
 */
export function useCompletarNaTurma(turmaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const resultado = await sincronizarTurma(turmaId)
      if (resultado.falhas.length > 0) throw new Error(resultado.falhas[0])
    },
    onSuccess: () => invalidarConteudos(qc),
  })
}
