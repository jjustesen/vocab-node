// Deno Edge Function — chamada pelo ALUNO logado (JWT próprio, cliente
// separado em lib/supabase-aluno.ts). Mesmo com sessão real do Supabase
// Auth, o aluno não lê `atribuicoes`/`atividades`/`respostas` via RLS — RLS
// deste banco serve só ao professor (ver cabeçalho de 0001_init.sql). Este
// endpoint resolve a identidade pelo JWT e faz as leituras via service_role,
// igual ao padrão de tarefa-obter.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return respostaErro('Não autenticado.', 401)

  const dbAluno = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data: sessao, error: erroSessao } = await dbAluno.auth.getUser()
  if (erroSessao || !sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)

  const db = clienteAdmin()

  const { data: conta } = await db
    .from('contas_aluno')
    .select('aluno_id, professor_id')
    .eq('user_id', sessao.user.id)
    .maybeSingle()
  if (!conta) return respostaErro('Conta não encontrada.', 404)

  await db.from('contas_aluno').update({ ultimo_login: new Date().toISOString() }).eq('user_id', sessao.user.id)

  const [{ data: aluno }, { data: professor }] = await Promise.all([
    db.from('alunos').select('nome').eq('id', conta.aluno_id).single(),
    db.from('professores').select('nome').eq('id', conta.professor_id).single(),
  ])

  const { data: atribuicoes } = await db
    .from('atribuicoes')
    .select('id, atividade_id, trilha_etapa_id, tentativa, prazo, enviada_em, concluida_em, revogada_em')
    .eq('aluno_id', conta.aluno_id)
    .is('revogada_em', null)
    .order('enviada_em', { ascending: false })

  const lista = atribuicoes ?? []
  if (lista.length === 0) {
    return respostaJson({
      alunoNome: aluno?.nome ?? 'aluno',
      professorNome: professor?.nome ?? 'seu professor',
      trilhas: [],
      pendentes: [],
      concluidas: [],
    })
  }

  const idsAtividades = [...new Set(lista.map((a) => a.atividade_id))]
  const [{ data: atividades }, { data: questoes }] = await Promise.all([
    db.from('atividades').select('id, titulo, nivel').in('id', idsAtividades),
    db.from('questoes').select('atividade_id').in('atividade_id', idsAtividades),
  ])

  const atividadePorId = new Map((atividades ?? []).map((a) => [a.id, a]))
  const totalQuestoesPorAtividade = new Map<string, number>()
  for (const q of questoes ?? []) {
    totalQuestoesPorAtividade.set(q.atividade_id, (totalQuestoesPorAtividade.get(q.atividade_id) ?? 0) + 1)
  }

  const idsConcluidas = lista.filter((a) => a.concluida_em).map((a) => a.id)
  const contagemPorAtribuicao = new Map<string, { acertos: number; total: number }>()
  if (idsConcluidas.length > 0) {
    const { data: respostas } = await db
      .from('respostas')
      .select('atribuicao_id, correta')
      .in('atribuicao_id', idsConcluidas)
    for (const r of respostas ?? []) {
      const atual = contagemPorAtribuicao.get(r.atribuicao_id) ?? { acertos: 0, total: 0 }
      atual.total += 1
      if (r.correta) atual.acertos += 1
      contagemPorAtribuicao.set(r.atribuicao_id, atual)
    }
  }

  // ---------------------------------------------------------------------------
  // RF-138: as etapas de trilha saem das listas soltas e aparecem só dentro da
  // trilha — senão o aluno veria a mesma tarefa duas vezes na tela.
  // ---------------------------------------------------------------------------
  const { data: vinculos } = await db
    .from('trilha_alunos')
    .select('trilha_id, status')
    .eq('aluno_id', conta.aluno_id)

  const trilhas: unknown[] = []
  const idsEtapasMostradas = new Set<string>()

  if (vinculos && vinculos.length > 0) {
    const idsTrilhas = vinculos.map((v) => v.trilha_id)
    const [{ data: dadosTrilhas }, { data: etapas }] = await Promise.all([
      db.from('trilhas').select('id, nome, nivel, descricao').in('id', idsTrilhas),
      db.from('trilha_etapas').select('id, trilha_id, atividade_id, ordem').in('trilha_id', idsTrilhas),
    ])

    const trilhaPorId = new Map((dadosTrilhas ?? []).map((t) => [t.id, t]))

    // Reatribuir a trilha cria uma tentativa nova por etapa (RF-127), então a
    // mesma etapa pode ter várias atribuições. Vale a MAIS RECENTE: `lista` já
    // vem por `enviada_em` decrescente, então só gravamos a primeira que
    // aparecer de cada etapa. As antigas continuam no histórico do professor.
    const atribuicaoPorEtapa = new Map<string, (typeof lista)[number]>()
    for (const a of lista) {
      if (!a.trilha_etapa_id) continue
      if (!atribuicaoPorEtapa.has(a.trilha_etapa_id)) {
        atribuicaoPorEtapa.set(a.trilha_etapa_id, a)
      }
      // Toda atribuição de etapa sai das listas soltas — inclusive as
      // tentativas antigas, que senão reapareceriam como tarefa avulsa.
      idsEtapasMostradas.add(a.id)
    }

    // Etapas de atividades que ainda não estavam no lote inicial de títulos.
    const idsExtras = [...new Set((etapas ?? []).map((e) => e.atividade_id))].filter(
      (id) => !atividadePorId.has(id),
    )
    if (idsExtras.length > 0) {
      const { data: extras } = await db.from('atividades').select('id, titulo, nivel').in('id', idsExtras)
      for (const a of extras ?? []) atividadePorId.set(a.id, a)
    }

    for (const vinculo of vinculos) {
      const trilha = trilhaPorId.get(vinculo.trilha_id)
      if (!trilha) continue

      const daTrilha = (etapas ?? [])
        .filter((e) => e.trilha_id === vinculo.trilha_id)
        .sort((a, b) => a.ordem - b.ordem)

      const etapasSaida = daTrilha.map((e) => {
        const atribuicao = atribuicaoPorEtapa.get(e.id)
        if (atribuicao) idsEtapasMostradas.add(atribuicao.id)
        const atividade = atividadePorId.get(e.atividade_id)
        const contagem = atribuicao ? contagemPorAtribuicao.get(atribuicao.id) : undefined
        return {
          ordem: e.ordem,
          titulo: atividade?.titulo ?? 'Atividade',
          nivel: atividade?.nivel ?? 'A1',
          totalQuestoes: totalQuestoesPorAtividade.get(e.atividade_id) ?? 0,
          atribuicaoId: atribuicao?.id ?? null,
          concluidaEm: atribuicao?.concluida_em ?? null,
          acertos: contagem?.acertos ?? null,
          total: contagem?.total ?? null,
        }
      })

      trilhas.push({
        id: trilha.id,
        nome: trilha.nome,
        nivel: trilha.nivel,
        descricao: trilha.descricao,
        status: vinculo.status,
        etapas: etapasSaida,
        concluidas: etapasSaida.filter((e) => e.concluidaEm).length,
      })
    }
  }

  const pendentes = lista
    .filter((a) => !a.concluida_em && !idsEtapasMostradas.has(a.id))
    .map((a) => {
      const atividade = atividadePorId.get(a.atividade_id)
      return {
        atribuicaoId: a.id,
        titulo: atividade?.titulo ?? 'Atividade',
        nivel: atividade?.nivel ?? 'A1',
        totalQuestoes: totalQuestoesPorAtividade.get(a.atividade_id) ?? 0,
        prazo: a.prazo,
      }
    })

  const concluidas = lista
    .filter((a) => a.concluida_em && !idsEtapasMostradas.has(a.id))
    .map((a) => {
      const atividade = atividadePorId.get(a.atividade_id)
      const contagem = contagemPorAtribuicao.get(a.id)
      return {
        atribuicaoId: a.id,
        titulo: atividade?.titulo ?? 'Atividade',
        nivel: atividade?.nivel ?? 'A1',
        acertos: contagem?.acertos ?? 0,
        total: contagem?.total ?? 0,
        concluidaEm: a.concluida_em,
      }
    })

  return respostaJson({
    alunoNome: aluno?.nome ?? 'aluno',
    professorNome: professor?.nome ?? 'seu professor',
    trilhas,
    pendentes,
    concluidas,
  })
})
