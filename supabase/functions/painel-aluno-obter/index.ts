// Deno Edge Function — chamada pelo ALUNO logado (JWT próprio, cliente
// separado em lib/supabase-aluno.ts). Mesmo com sessão real do Supabase
// Auth, o aluno não lê `atribuicoes`/`atividades`/`respostas` via RLS — RLS
// deste banco serve só ao professor (ver cabeçalho de 0001_init.sql). Este
// endpoint resolve a identidade pelo JWT e faz as leituras via service_role,
// igual ao padrão de tarefa-obter.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { calcularLiberacoes } from '../_shared/trilha-liberacao.ts'

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

  const [{ data: aluno }, { data: professor }, { data: acessoTutor }] = await Promise.all([
    db.from('alunos').select('nome, tutor_ativo').eq('id', conta.aluno_id).single(),
    db.from('professores').select('nome').eq('id', conta.professor_id).single(),
    db.from('tutor_acesso').select('professor_id').eq('professor_id', conta.professor_id).maybeSingle(),
  ])
  // O menu Tutor do aluno: a chave dele E o professor liberado no beta (0024).
  const tutorAtivo = Boolean(aluno?.tutor_ativo && acessoTutor)

  const { data: atribuicoes } = await db
    .from('atribuicoes')
    .select('id, atividade_id, trilha_etapa_id, tentativa, prazo, enviada_em, concluida_em, revogada_em')
    .eq('aluno_id', conta.aluno_id)
    .is('revogada_em', null)
    .order('enviada_em', { ascending: false })

  const lista = atribuicoes ?? []

  const idsAtividades = [...new Set(lista.map((a) => a.atividade_id))]
  const [{ data: atividades }, { data: questoes }] = idsAtividades.length
    ? await Promise.all([
        db.from('atividades').select('id, titulo, nivel').in('id', idsAtividades),
        db.from('questoes').select('atividade_id').in('atividade_id', idsAtividades),
      ])
    : [{ data: [] as { id: string; titulo: string; nivel: string }[] }, { data: [] as { atividade_id: string }[] }]

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
    .select('trilha_id, status, iniciada_em')
    .eq('aluno_id', conta.aluno_id)

  const trilhas: unknown[] = []
  const idsEtapasMostradas = new Set<string>()

  // Toda atribuição de etapa sai das listas soltas — inclusive as tentativas
  // antigas, que senão reapareceriam como tarefa avulsa.
  for (const a of lista) if (a.trilha_etapa_id) idsEtapasMostradas.add(a.id)

  if (vinculos && vinculos.length > 0) {
    const idsTrilhas = vinculos.map((v) => v.trilha_id)
    const [{ data: dadosTrilhas }, { data: etapas }, { data: modulos }, { data: concluidos }] = await Promise.all([
      db
        .from('trilhas')
        .select('id, nome, nivel, descricao, navegacao, permite_abas, liberacao, liberacao_dias, nota_minima')
        .in('id', idsTrilhas),
      db
        .from('trilha_etapas')
        .select('id, trilha_id, modulo_id, atividade_id, material_id, licao_tutor_id, opcional, ordem')
        .in('trilha_id', idsTrilhas),
      db.from('trilha_modulos').select('id, trilha_id, ordem, titulo').in('trilha_id', idsTrilhas),
      // Conclusão de qualquer tipo de passo, com a nota mínima já aplicada (0030).
      db.from('trilha_passos_concluidos').select('etapa_id, concluida_em').eq('aluno_id', conta.aluno_id).in('trilha_id', idsTrilhas),
    ])

    const trilhaPorId = new Map((dadosTrilhas ?? []).map((t) => [t.id, t]))
    const conclusaoPorEtapa = new Map((concluidos ?? []).map((c) => [c.etapa_id, c.concluida_em as string]))

    // Reatribuir a trilha cria uma tentativa nova por etapa (RF-127). Vale a
    // MAIS RECENTE: `lista` já vem por `enviada_em` decrescente.
    const atribuicaoPorEtapa = new Map<string, (typeof lista)[number]>()
    for (const a of lista) {
      if (a.trilha_etapa_id && !atribuicaoPorEtapa.has(a.trilha_etapa_id)) atribuicaoPorEtapa.set(a.trilha_etapa_id, a)
    }

    // Títulos do que não veio no lote das atribuições: atividades ainda sem
    // atribuição, materiais e lições.
    const todas = etapas ?? []
    const idsExtras = [...new Set(todas.flatMap((e) => (e.atividade_id ? [e.atividade_id] : [])))].filter(
      (id) => !atividadePorId.has(id),
    )
    const idsMateriais = [...new Set(todas.flatMap((e) => (e.material_id ? [e.material_id] : [])))]
    const idsLicoes = [...new Set(todas.flatMap((e) => (e.licao_tutor_id ? [e.licao_tutor_id] : [])))]
    const [{ data: extras }, { data: questoesExtras }, { data: materiais }, { data: licoes }] = await Promise.all([
      idsExtras.length ? db.from('atividades').select('id, titulo, nivel').in('id', idsExtras) : { data: [] },
      idsExtras.length ? db.from('questoes').select('atividade_id').in('atividade_id', idsExtras) : { data: [] },
      idsMateriais.length ? db.from('materiais').select('id, nome, tipo').in('id', idsMateriais) : { data: [] },
      idsLicoes.length ? db.from('tutor_licoes').select('id, titulo, nivel_cefr').in('id', idsLicoes) : { data: [] },
    ])
    for (const a of (extras ?? []) as { id: string; titulo: string; nivel: string }[]) atividadePorId.set(a.id, a)
    for (const q of (questoesExtras ?? []) as { atividade_id: string }[]) {
      totalQuestoesPorAtividade.set(q.atividade_id, (totalQuestoesPorAtividade.get(q.atividade_id) ?? 0) + 1)
    }
    const materialPorId = new Map(((materiais ?? []) as { id: string; nome: string; tipo: string }[]).map((m) => [m.id, m]))
    const licaoPorId = new Map(
      ((licoes ?? []) as { id: string; titulo: string; nivel_cefr: string | null }[]).map((l) => [l.id, l]),
    )
    const agora = new Date()

    for (const vinculo of vinculos) {
      const trilha = trilhaPorId.get(vinculo.trilha_id)
      if (!trilha) continue

      const modulosDaTrilha = (modulos ?? []).filter((m) => m.trilha_id === trilha.id).sort((a, b) => a.ordem - b.ordem)
      const ordemDoModulo = new Map(modulosDaTrilha.map((m) => [m.id, m.ordem]))
      const daTrilha = todas
        .filter((e) => e.trilha_id === trilha.id)
        .sort((a, b) => (ordemDoModulo.get(a.modulo_id) ?? 0) - (ordemDoModulo.get(b.modulo_id) ?? 0) || a.ordem - b.ordem)

      const liberacoes = calcularLiberacoes(
        {
          navegacao: trilha.navegacao,
          liberacao: trilha.liberacao,
          liberacaoDias: trilha.liberacao_dias,
          iniciadaEm: vinculo.iniciada_em,
          agora,
        },
        modulosDaTrilha,
        daTrilha.map((e) => ({
          id: e.id,
          moduloId: e.modulo_id,
          ordem: e.ordem,
          opcional: e.opcional,
          concluido: conclusaoPorEtapa.has(e.id),
        })),
      )

      const etapasSaida = daTrilha.map((e, i) => {
        const atribuicao = atribuicaoPorEtapa.get(e.id)
        const contagem = atribuicao ? contagemPorAtribuicao.get(atribuicao.id) : undefined
        const base = {
          etapaId: e.id,
          ordem: i + 1,
          moduloId: e.modulo_id,
          opcional: e.opcional,
          estado: liberacoes.estadoPorPasso.get(e.id) ?? 'aberto',
          concluidaEm: conclusaoPorEtapa.get(e.id) ?? null,
        }
        if (e.atividade_id) {
          const atividade = atividadePorId.get(e.atividade_id)
          return {
            ...base,
            tipo: 'atividade',
            titulo: atividade?.titulo ?? 'Atividade',
            nivel: atividade?.nivel ?? 'A1',
            totalQuestoes: totalQuestoesPorAtividade.get(e.atividade_id) ?? 0,
            atribuicaoId: atribuicao?.id ?? null,
            materialId: null,
            licaoId: null,
            detalhe: null,
            acertos: contagem?.acertos ?? null,
            total: contagem?.total ?? null,
          }
        }
        const material = e.material_id ? materialPorId.get(e.material_id) : undefined
        const licao = e.licao_tutor_id ? licaoPorId.get(e.licao_tutor_id) : undefined
        return {
          ...base,
          tipo: e.material_id ? 'material' : 'tutor',
          titulo: material?.nome ?? licao?.titulo ?? (e.material_id ? 'Material' : 'Lição do tutor'),
          nivel: licao?.nivel_cefr ?? null,
          totalQuestoes: 0,
          atribuicaoId: null,
          materialId: e.material_id,
          licaoId: e.licao_tutor_id,
          detalhe: material ? material.tipo : null,
          acertos: null,
          total: null,
        }
      })

      trilhas.push({
        id: trilha.id,
        nome: trilha.nome,
        nivel: trilha.nivel,
        descricao: trilha.descricao,
        status: vinculo.status,
        navegacao: trilha.navegacao,
        permiteAbas: trilha.permite_abas,
        modulos: liberacoes.modulos,
        atualId: liberacoes.atualId,
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
    tutorAtivo,
    trilhas,
    pendentes,
    concluidas,
  })
})
