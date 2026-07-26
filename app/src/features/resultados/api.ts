import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { NivelCefr, Par, QuestaoTipo } from '@/types/db'

export type QuestaoResultado = {
  id: string
  ordem: number
  tipo: QuestaoTipo
  enunciado: string
  opcoes: string[] | null
  pares: Par[] | null
  respostaCorreta: string
  explicacao: string
  respondida: boolean
  respostaDada: string | null
  correta: boolean | null
  tempoMs: number | null
}

/** Tarefa anterior do mesmo aluno, para o card de padrão de erro (RF-92/93). */
export type TarefaAnterior = {
  atribuicaoId: string
  atividadeTitulo: string
  acertos: number
  total: number
  habilidadesEmComum: string[]
}

export type ResultadoAtribuicao = {
  atribuicaoId: string
  atividadeId: string
  atividadeTitulo: string
  nivel: NivelCefr
  habilidades: string[]
  alunoId: string
  alunoNome: string
  tentativa: number
  enviadaEm: string
  concluidaEm: string | null
  acertos: number
  total: number
  tempoTotalMs: number | null
  questoes: QuestaoResultado[]
  anterior: TarefaAnterior | null
}

/**
 * A tarefa concluída imediatamente antes desta, pelo mesmo aluno. Serve só
 * para o card de padrão de erro dizer "mesma habilidade da anterior"; se não
 * houver, o card ainda funciona, só sem a comparação.
 */
async function buscarAnterior(
  alunoId: string,
  atribuicaoIdAtual: string,
  concluidaEmAtual: string | null,
  habilidadesAtuais: string[],
): Promise<TarefaAnterior | null> {
  let consulta = supabase
    .from('atribuicoes')
    .select('id, atividade_id, concluida_em')
    .eq('aluno_id', alunoId)
    .not('concluida_em', 'is', null)
    .neq('id', atribuicaoIdAtual)
    .order('concluida_em', { ascending: false })
    .limit(1)
  if (concluidaEmAtual) consulta = consulta.lt('concluida_em', concluidaEmAtual)

  const { data, error } = await consulta.maybeSingle()
  if (error) throw error
  if (!data) return null

  const [{ data: atividade }, { data: respostas }] = await Promise.all([
    supabase.from('atividades').select('titulo, habilidades').eq('id', data.atividade_id).single(),
    supabase.from('respostas').select('correta').eq('atribuicao_id', data.id),
  ])
  if (!atividade || !respostas) return null

  return {
    atribuicaoId: data.id,
    atividadeTitulo: atividade.titulo,
    acertos: respostas.filter((r) => r.correta).length,
    total: respostas.length,
    habilidadesEmComum: atividade.habilidades.filter((h) => habilidadesAtuais.includes(h)),
  }
}

/**
 * Visão do PROFESSOR sobre uma tentativa já respondida — RLS já libera
 * direto (prof_owns_via_atribuicao/via_atividade), sem precisar de Edge
 * Function: quem lê aqui é o professor autenticado, dono do aluno e da
 * atividade, não o aluno sem sessão (esse caminho é o de tarefa-obter).
 */
export function useResultadoAtribuicao(atribuicaoId: string | undefined) {
  return useQuery({
    queryKey: ['resultados', atribuicaoId],
    enabled: Boolean(atribuicaoId),
    queryFn: async (): Promise<ResultadoAtribuicao> => {
      const { data: atribuicao, error: erroAtribuicao } = await supabase
        .from('atribuicoes')
        .select('id, atividade_id, aluno_id, tentativa, enviada_em, concluida_em')
        .eq('id', atribuicaoId!)
        .single()
      if (erroAtribuicao) throw erroAtribuicao

      const [
        { data: atividade, error: erroAtividade },
        { data: aluno, error: erroAluno },
        { data: questoesRaw, error: erroQuestoes },
        { data: respostas, error: erroRespostas },
      ] = await Promise.all([
        supabase
          .from('atividades')
          .select('titulo, nivel, habilidades')
          .eq('id', atribuicao.atividade_id)
          .single(),
        supabase.from('alunos').select('nome').eq('id', atribuicao.aluno_id).single(),
        supabase
          .from('questoes')
          .select('id, ordem, tipo, enunciado, opcoes, pares, resposta_correta, explicacao')
          .eq('atividade_id', atribuicao.atividade_id)
          .order('ordem'),
        supabase.from('respostas').select('questao_id, valor, correta, tempo_ms').eq('atribuicao_id', atribuicao.id),
      ])
      if (erroAtividade) throw erroAtividade
      if (erroAluno) throw erroAluno
      if (erroQuestoes) throw erroQuestoes
      if (erroRespostas) throw erroRespostas

      const respostaPorQuestao = new Map(respostas.map((r) => [r.questao_id, r]))
      const questoes: QuestaoResultado[] = questoesRaw.map((q) => {
        const r = respostaPorQuestao.get(q.id)
        return {
          id: q.id,
          ordem: q.ordem,
          tipo: q.tipo,
          enunciado: q.enunciado,
          opcoes: q.opcoes,
          pares: q.pares,
          respostaCorreta: q.resposta_correta,
          explicacao: q.explicacao,
          respondida: Boolean(r),
          respostaDada: r?.valor ?? null,
          correta: r?.correta ?? null,
          tempoMs: r?.tempo_ms ?? null,
        }
      })

      const acertos = questoes.filter((q) => q.correta).length
      const tempoTotalMs =
        respostas.length > 0 ? respostas.reduce((soma, r) => soma + (r.tempo_ms ?? 0), 0) : null

      const anterior = await buscarAnterior(
        atribuicao.aluno_id,
        atribuicao.id,
        atribuicao.concluida_em,
        atividade.habilidades,
      )

      return {
        atribuicaoId: atribuicao.id,
        atividadeId: atribuicao.atividade_id,
        atividadeTitulo: atividade.titulo,
        nivel: atividade.nivel,
        habilidades: atividade.habilidades,
        alunoId: atribuicao.aluno_id,
        alunoNome: aluno.nome,
        tentativa: atribuicao.tentativa,
        enviadaEm: atribuicao.enviada_em,
        concluidaEm: atribuicao.concluida_em,
        acertos,
        total: questoes.length,
        tempoTotalMs,
        questoes,
        anterior,
      }
    },
  })
}
