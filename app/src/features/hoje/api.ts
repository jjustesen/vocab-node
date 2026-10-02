import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const chavesHoje = {
  todas: ['hoje'] as const,
  pendentes: ['hoje', 'pendentes'] as const,
  concluidas: (limite: number) => ['hoje', 'concluidas', limite] as const,
  todasConcluidas: (alunoId: string | null) => ['hoje', 'todas-concluidas', alunoId ?? 'todos'] as const,
  concluidasHoje: (diaISO: string) => ['hoje', 'concluidas-hoje', diaISO] as const,
}

export type AtribuicaoPendente = {
  atribuicaoId: string
  alunoId: string
  alunoNome: string
  alunoTelefone: string | null
  atividadeTitulo: string
  enviadaEm: string
}

export type AtribuicaoConcluida = {
  atribuicaoId: string
  alunoId: string
  alunoNome: string
  atividadeTitulo: string
  concluidaEm: string
  acertos: number
  total: number
}

/**
 * Nomes dos alunos citados por um conjunto de atribuições, em uma consulta só.
 * O padrão de 2 consultas planas + Map (em vez de select aninhado) é o mesmo
 * de useHistoricoDoAluno: `Relationships` está vazio em types/db.ts, então o
 * postgrest-js não infere o join embutido.
 */
async function buscarAlunos(ids: string[]) {
  const { data, error } = await supabase.from('alunos').select('id, nome, telefone').in('id', ids)
  if (error) throw error
  return new Map(data.map((a) => [a.id, a]))
}

async function buscarTitulos(ids: string[]) {
  const { data, error } = await supabase.from('atividades').select('id, titulo').in('id', ids)
  if (error) throw error
  return new Map(data.map((a) => [a.id, a.titulo]))
}

/**
 * RF-95: o que foi enviado e ainda não voltou. "Pendente" não é uma coluna —
 * é a ausência de `concluida_em` somada à ausência de `revogada_em` (RF-30).
 * Ordenado do mais antigo para o mais novo: quem está esperando há mais tempo
 * é justamente quem o professor precisa cobrar primeiro.
 */
export function useAtribuicoesPendentes() {
  return useQuery({
    queryKey: chavesHoje.pendentes,
    queryFn: async (): Promise<AtribuicaoPendente[]> => {
      const { data: atribuicoes, error } = await supabase
        .from('atribuicoes')
        .select('id, aluno_id, atividade_id, enviada_em')
        .is('concluida_em', null)
        .is('revogada_em', null)
        .order('enviada_em')
      if (error) throw error
      if (atribuicoes.length === 0) return []

      const [alunoPorId, tituloPorId] = await Promise.all([
        buscarAlunos([...new Set(atribuicoes.map((a) => a.aluno_id))]),
        buscarTitulos([...new Set(atribuicoes.map((a) => a.atividade_id))]),
      ])

      return atribuicoes.map((a) => ({
        atribuicaoId: a.id,
        alunoId: a.aluno_id,
        alunoNome: alunoPorId.get(a.aluno_id)?.nome ?? 'Aluno',
        alunoTelefone: alunoPorId.get(a.aluno_id)?.telefone ?? null,
        atividadeTitulo: tituloPorId.get(a.atividade_id) ?? 'Atividade removida',
        enviadaEm: a.enviada_em,
      }))
    },
  })
}

/**
 * Uma página de tarefas entregues, da mais recente para a mais antiga, com o
 * placar já somado a partir de `respostas`. `alunoId` restringe a um aluno.
 */
async function buscarConcluidas({
  inicio,
  limite,
  alunoId = null,
}: {
  inicio: number
  limite: number
  alunoId?: string | null
}): Promise<AtribuicaoConcluida[]> {
  let consulta = supabase
    .from('atribuicoes')
    .select('id, aluno_id, atividade_id, concluida_em')
    .not('concluida_em', 'is', null)
    .order('concluida_em', { ascending: false })
    // Desempate estável: duas entregas no mesmo instante não podem trocar de
    // página entre uma consulta e a seguinte.
    .order('id', { ascending: false })
    .range(inicio, inicio + limite - 1)
  if (alunoId) consulta = consulta.eq('aluno_id', alunoId)
  const { data: atribuicoes, error } = await consulta
  if (error) throw error
  if (atribuicoes.length === 0) return []

  const [alunoPorId, tituloPorId, respostas] = await Promise.all([
    buscarAlunos([...new Set(atribuicoes.map((a) => a.aluno_id))]),
    buscarTitulos([...new Set(atribuicoes.map((a) => a.atividade_id))]),
    supabase
      .from('respostas')
      .select('atribuicao_id, correta')
      .in('atribuicao_id', atribuicoes.map((a) => a.id)),
  ])
  if (respostas.error) throw respostas.error

  const placarPorAtribuicao = new Map<string, { acertos: number; total: number }>()
  for (const r of respostas.data) {
    const atual = placarPorAtribuicao.get(r.atribuicao_id) ?? { acertos: 0, total: 0 }
    atual.total += 1
    if (r.correta) atual.acertos += 1
    placarPorAtribuicao.set(r.atribuicao_id, atual)
  }

  return atribuicoes.map((a) => {
    const placar = placarPorAtribuicao.get(a.id) ?? { acertos: 0, total: 0 }
    return {
      atribuicaoId: a.id,
      alunoId: a.aluno_id,
      alunoNome: alunoPorId.get(a.aluno_id)?.nome ?? 'Aluno',
      atividadeTitulo: tituloPorId.get(a.atividade_id) ?? 'Atividade removida',
      concluidaEm: a.concluida_em!,
      acertos: placar.acertos,
      total: placar.total,
    }
  })
}

/** RF-95: as últimas entregas, para o cartão "Concluídas" da tela Hoje. */
export function useConcluidasRecentes(limite = 6) {
  return useQuery({
    queryKey: chavesHoje.concluidas(limite),
    queryFn: () => buscarConcluidas({ inicio: 0, limite }),
  })
}

/** Quantas entregas cada "carregar mais" traz. */
export const CONCLUIDAS_POR_PAGINA = 30

/**
 * TODAS as entregas, aos poucos — o "ver todos" do cartão "Concluídas".
 *
 * Paginado porque o histórico só cresce: um professor com dez alunos e duas
 * tarefas por semana passa de mil entregas no primeiro ano, e cada uma puxa as
 * respostas para somar o placar. Trinta por vez cobre o que se olha de
 * verdade (a última semana, o último mês) sem carregar o ano inteiro.
 */
export function useTodasConcluidas(alunoId: string | null) {
  return useInfiniteQuery({
    queryKey: chavesHoje.todasConcluidas(alunoId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => buscarConcluidas({ inicio: pageParam, limite: CONCLUIDAS_POR_PAGINA, alunoId }),
    // Página incompleta = acabou. Uma página cheia que por acaso era a última
    // custa só um "carregar mais" que volta vazio.
    getNextPageParam: (ultima, todas) =>
      ultima.length === CONCLUIDAS_POR_PAGINA ? todas.length * CONCLUIDAS_POR_PAGINA : undefined,
  })
}

/**
 * Contador "concluídas hoje" — consulta própria (só `count`) em vez de filtrar
 * a lista de recentes, que é limitada e passaria a contar errado num dia com
 * muitas entregas.
 */
export function useContagemConcluidasHoje(inicioISO: string, fimISO: string) {
  return useQuery({
    queryKey: chavesHoje.concluidasHoje(inicioISO),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('atribuicoes')
        .select('id', { count: 'exact', head: true })
        .gte('concluida_em', inicioISO)
        .lt('concluida_em', fimISO)
      if (error) throw error
      return count ?? 0
    },
  })
}
